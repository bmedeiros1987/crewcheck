import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {Readable} from 'node:stream';
import {cohortPolicy,createCohortIngressReceiver,epoch,ownerId,ownerEmail,secrets,sender,programId} from './fixtures/infobip-cohort-sql.mjs';
import {createPromotionalGrantWriter,promotionalGrantManifest} from '../server/concierge-promotional-credit-sql.mjs';
import {finiteCohortPolicy,finiteCohortManifest,finiteCohortMemberId,finiteCohortTariffKey,finiteCohortState,createFiniteCohortPrefunder} from '../server/concierge-finite-reserve-off.mjs';
import {createFiniteCohortSqlResolver} from '../server/concierge-finite-credit-sql.mjs';
import {createSharedCreditCandidate,sharedCreditKey as key} from '../server/concierge-shared-credit-candidate.mjs';
import {createInfobipWhatsAppProduction} from '../server/infobip-whatsapp-production.mjs';
import {configureWhatsAppConcierge} from '../server/whatsapp.mjs';
import {createInfobipSqlStore} from '../server/infobip-whatsapp-store.mjs';
import {installWhatsAppLifecycle,eraseWhatsAppAccountState} from '../server/whatsapp-lifecycle.mjs';
import {mysqlAdapter} from '../server/mysql-platform-adapter.mjs';
import {createInfobipSqlBudget} from '../server/infobip-whatsapp-sql-budget.mjs';

// Existing socket-only owned disposable MySQL runner ONLY. Same fixed program;
// a separate synthetic billing month avoids replacing the v1 October fixture.
// This is test isolation, never a program/month reset or operator procedure.
export async function runFiniteCohortSqlScenarios({db,transaction,mode}){
 const hash=value=>createHash('sha256').update(value).digest('hex'),hmac=value=>createHmac('sha256',secrets.linkHashKey).update(value).digest('hex');
 const p=cohortPolicy(8),period='2032-01',globalKey=key('global',[programId,period]);
 p.observedBudget.outsideConsumersReserveMicroUsd=20000000-p.observedBudget.knownSpentMicroUsd-p.observedBudget.initialReservedMicroUsd-p.totalMicroUsd-10000;
 const read=async k=>{const [rows]=await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?',[k]);return rows.length?(typeof rows[0].payload==='string'?JSON.parse(rows[0].payload):rows[0].payload):null;};
 const write=(k,v)=>db.query('INSERT INTO crewcheck_telegram_state(state_key,payload,updated_at) VALUES(?,?,NOW(3)) ON DUPLICATE KEY UPDATE payload=VALUES(payload)',[k,JSON.stringify(v)]);
 const accountKey=m=>key('account',[programId,m.ownerAccountKey]),grantKey=m=>key('grant-authorization',[m.grant.approvalId]);
 const authorityKey=key('finite-reserve-authorization',[p.approvalId]),eventKey=id=>hash(JSON.stringify(['infobip-inbound-v1',sender,id]));
 const requestKey=id=>key('request',[programId,eventKey(id)]);
 const october=await read(key('global',[programId,'2032-10']));assert.equal(october.finiteReserve.v,1,'v1 fixture remains independent and untouched');
 let clock=epoch,sends=0,engines=0,loseAck=false,revoke=false,connectionOrdinal=0;
 const dispatchSqlErrors=[],dispatchDestroyed=[];
 if(mode==='suite'){
  await write(globalKey,{v:1,kind:'global-credit',period,budgetMicroUsd:20000000,knownSpentMicroUsd:p.observedBudget.knownSpentMicroUsd,reservedMicroUsd:p.observedBudget.initialReservedMicroUsd,reconciled:true,reconciledAt:epoch,billingEvidenceSha256:p.observedBudget.evidenceSha256,promotionalAllocatedMicroUsd:0});
  for(const [i,m]of p.members.entries()){
   await db.query('INSERT INTO crewcheck_platform_profiles VALUES(?,?)',[ownerEmail(i),ownerId(i)]);
   await db.query("INSERT INTO crewcheck_whatsapp_links(phone_hash,email,consent_concierge,revoked_at,linked_at,updated_at) VALUES(?,?,1,NULL,'2032-01-01 12:00:00.000','2032-01-01 12:00:00.000')",[m.recipientHash,ownerEmail(i)]);
  }
 }
 // Bind the exact driver's representation of the already stored canonical
 // generation, not a freshly synthesized timestamp, in both process phases.
 for(const [i,m]of p.members.entries()){
  const [[link]]=await db.query('SELECT linked_at,updated_at FROM crewcheck_whatsapp_links WHERE phone_hash=?',[m.recipientHash]);
  m.bindingHash=hmac(JSON.stringify([ownerId(i),JSON.stringify([String(link.linked_at),String(link.updated_at)]),'infobip',sender,m.recipient]));
 }
 const prefund=createFiniteCohortPrefunder(p,{enabled:true,now:()=>clock,linkHashKey:secrets.linkHashKey});
 const check=async counts=>{
  const g=await read(globalKey),members=finiteCohortState(p,g,clock);assert(members);
  let used=0,attempts=0;
  for(const [i,m]of p.members.entries()){
   const row=members.get(finiteCohortMemberId(p,m)),a=await read(accountKey(m));
   assert.equal(row.attempts,counts[i]);assert.equal(row.usedMicroUsd,counts[i]*m.perAttemptMicroUsd);
   assert.equal(a.availableMicroUsd,m.totalMicroUsd-row.usedMicroUsd);assert.equal(a.reservedMicroUsd,row.usedMicroUsd);
   used+=row.usedMicroUsd;attempts+=row.attempts;
  }
  assert.equal(g.finiteReserve.usedMicroUsd,used);assert.equal(g.finiteReserve.attempts,attempts);
  assert.equal(g.reconciledAt,epoch);assert.deepEqual(await read(key('global',[programId,'2032-10'])),october);
 };
 const queryClass=value=>{
  const sql=typeof value==='string'?value:'';
  if(sql.startsWith('SELECT email,consent_concierge'))return 'canonical-link-lock';
  if(sql.startsWith('SELECT public_id'))return sql.includes('public_id=BINARY')?'canonical-public-id-lock':sql.includes('BINARY email')?'canonical-binary-email-lock':'canonical-email-lock';
  if(sql.startsWith('SELECT payload'))return 'state-read';
  if(sql.startsWith('INSERT INTO crewcheck_telegram_state'))return 'state-insert';
  if(sql.startsWith('UPDATE crewcheck_telegram_state'))return 'state-update';
  return 'other-sql';
 };
 // Capture-only diagnostic. Preserve the original race and strict assertions;
 // never replace a blocked result with success or retry a transaction. Do not
 // emit SQL text, parameters, identities, sealed content or provider credentials.
 const ackDb={async getConnection(){
  const c=await db.getConnection(),connection=++connectionOrdinal,acquired=performance.now();let operation=0,destroyed=false;
  const observe=async(method,args=[])=>{
   const ordinal=++operation,started=performance.now();
   try{return await c[method](...args);}
   catch(error){dispatchSqlErrors.push({connection,ordinal,method,queryClass:method==='query'?queryClass(args[0]):null,
    code:typeof error?.code==='string'&&/^[A-Z0-9_]{1,80}$/.test(error.code)?error.code:'UNCLASSIFIED_SQL',
    errno:Number.isInteger(error?.errno)?error.errno:null,sqlState:typeof error?.sqlState==='string'&&/^[A-Z0-9]{5}$/.test(error.sqlState)?error.sqlState:null,
    elapsedMs:Math.round(performance.now()-started),connectionElapsedMs:Math.round(performance.now()-acquired),destroyed});throw error;}
  };
  return {query:(...args)=>observe('query',args),beginTransaction:()=>observe('beginTransaction'),rollback:()=>observe('rollback'),release:c.release.bind(c),
   destroy(){destroyed=true;dispatchDestroyed.push({connection,afterOperation:operation,elapsedMs:Math.round(performance.now()-acquired)});c.destroy();},
   async commit(){await observe('commit');if(loseAck&&sends>=3){loseAck=false;throw Error('SYNTHETIC_COHORT_FINAL_ACK_LOST');}}
  };
 }};
 configureWhatsAppConcierge(async()=>{engines++;if(revoke){revoke=false;await write(grantKey(p.members[2]),{...await read(grantKey(p.members[2])),status:'revoked'});}return 'SYNTHETIC CANONICAL OWNER SCHEDULE';});
 const baseUrl='https://synthetic.api.infobip.com',publicOrigin='https://crewcheck.example.invalid';
 const configuration={finiteBeta:true,sender,baseUrl,allowedSenders:[sender],allowedBaseUrls:[baseUrl],authentication:'hmac-sha256',credentialReferences:{apiKey:'fixture/api',encryptionKey:'fixture/content',linkHashKey:'fixture/link',webhookSecret:'fixture/webhook'},deploymentBinding:{profileId:'synthetic-cohort-profile',subscriptionIds:['synthetic-cohort-subscription'],sender,baseUrl,publicOrigin,linkHashKeyReference:'fixture/link'}};
 const options={enabled:true,configuration,admission:{enabled:true,finiteCohort:p},db:ackDb,now:()=>clock,ingress:{mode:'direct-tls',publicOrigin},credentials:{resolve:async(_ref,{purpose})=>secrets[purpose]},scheduler:{set:()=>1,clear(){}},request:async(_url,{body})=>{
  sends++;const message=JSON.parse(body),m=p.members.find(m=>m.recipient===message.to);assert(m);assert((await read(accountKey(m))).reservedMicroUsd>=m.perAttemptMicroUsd);
  return new Response(JSON.stringify({to:message.to,messageId:message.messageId,status:{groupId:1,groupName:'PENDING',id:26,name:'PENDING_ACCEPTED'}}));
 }};
 const receiveStaged=createCohortIngressReceiver(options);
 async function stage(index,id){
  const member=p.members[index],before={global:await read(globalKey),account:await read(accountKey(member)),request:await read(requestKey(id)),sends,engines};
  const rawBody=Buffer.from(JSON.stringify({results:[{from:member.recipient,to:sender,integrationType:'WHATSAPP',receivedAt:new Date(clock).toISOString(),messageId:id,message:{type:'TEXT',text:'qual minha próxima jornada?'}}]}));
  const result=await receiveStaged({method:'POST',rawHeaders:['x-hub-signature','SHA256='+hmacWebhook(rawBody)],rawBody});
  assert.equal(result.status,200);assert.equal(result.accepted,1);assert.equal(result.duplicates,0);assert.equal(result.denied,0);
  const held=await read('crewcheck-infobip-inbound-v1:'+eventKey(id));assert.equal(held.v,1);assert.equal(held.status,'held');assert.equal(held.marker,null);assert(held.sealed);assert.equal(held.ownerHash,hmac(ownerId(index)));
  assert.deepEqual(await read(globalKey),before.global);assert.deepEqual(await read(accountKey(member)),before.account);
  assert.deepEqual(await read(requestKey(id)),before.request);assert.equal(sends,before.sends);assert.equal(engines,before.engines);
 }
 async function route(runtime,index,id){
  const rawBody=Buffer.from(JSON.stringify({results:[{from:p.members[index].recipient,to:sender,integrationType:'WHATSAPP',receivedAt:new Date(clock).toISOString(),messageId:id,message:{type:'TEXT',text:'qual minha próxima jornada?'}}]}));
  const req=Readable.from([rawBody]);Object.assign(req,{method:'POST',rawHeaders:['x-hub-signature','SHA256='+hmacWebhook(rawBody)],headers:{host:'crewcheck.example.invalid','content-type':'application/json'},socket:{encrypted:true}});
  const res={writeHead(status){this.status=status;},end(){this.writableEnded=true;}};await runtime.handleRoute(req,res,new URL('/api/infobip/whatsapp/webhook',publicOrigin));assert.equal(res.status,200);
 }
 const hmacWebhook=body=>createHmac('sha256',secrets.webhookSecret).update(body).digest('hex');
 if(mode==='restart'){
  clock=epoch+3600000;assert.equal((await transaction(prefund)).status,'already-reserved');await check([1,1,1,1,1,1,1,1]);
  const runtime=await createInfobipWhatsAppProduction(options);
  try{
   for(let i=0;i<8;i++)await runtime.dispatch(eventKey('cohort-first-'+i));await runtime.dispatch(eventKey('cohort-revoked'));await runtime.dispatch(eventKey('cohort-unknown'));assert.equal(sends,0);
   for(let i=0;i<7;i++){await stage(i,'cohort-last-'+i);assert.equal((await runtime.dispatch(eventKey('cohort-last-'+i))).status,'accepted_unconfirmed');}
   await route(runtime,7,'cohort-last-7');await runtime.maintain();assert.equal((await read('crewcheck-infobip-inbound-v1:'+eventKey('cohort-last-7'))).status,'accepted_unconfirmed');
   await stage(0,'cohort-exhausted');await runtime.dispatch(eventKey('cohort-exhausted'));assert.equal(sends,8);await check(Array(8).fill(2));
   assert.equal((await transaction(prefund)).status,'already-reserved');
  }finally{await runtime.dispose();}
  console.log(JSON.stringify({suite:'finite cohort actual MySQL restart',stubProviderCalls:sends,realProviderCalls:0,externalCalls:0}));
  return ['max8 cohort/account/request conservation survives actual MySQL restart, duplicates never send and only remaining attempts spend'];
 }
 assert.equal(mode,'suite');
 await runPrefundConcurrencyScenarios({db,transaction});
 for(const m of p.members){
  const t=m.observedTariff;
  await write(grantKey(m),{v:1,kind:'promotional-grant-authorization',status:'approved',manifest:m.grantManifest,approvedAt:epoch,evidenceReference:'synthetic-original-grant'});
  await write(finiteCohortTariffKey(p,m),{v:1,kind:'verified-tariff',currency:'USD',country:'BR',category:'service-text',sender,recipientHash:m.recipientHash,sourceId:t.sourceId,evidenceSha256:t.evidenceSha256,verifiedAt:t.observedAt,validUntil:t.validUntil,unitMicroUsd:t.observedUnitMicroUsd,setupMicroUsd:t.setupMicroUsd,markupMicroUsd:t.markupMicroUsd});
 }
 await write(authorityKey,{v:2,kind:'finite-reserve-authorization',status:'approved',manifest:finiteCohortManifest(p),approvedAt:p.approvedAt,evidenceReference:p.evidenceReference});
 // Separate completed original grants, never a grant-writer loop inside one
 // transaction after its global lock has been acquired.
 for(const [i,m]of p.members.entries())assert.equal((await transaction(c=>createPromotionalGrantWriter({...m.grant,enabled:true},{now:()=>clock})(c,{ownerPublicId:ownerId(i)}))).status,'granted');
 const before=await read(globalKey);
 for(const value of [null,false,0,'',[],{},'reserved']){
  const malformed={...before,finiteReserve:value};await write(globalKey,malformed);
  assert.equal((await transaction(prefund)).status,'denied');assert.deepEqual(await read(globalKey),malformed);
 }
 await write(globalKey,before);
 await db.query('UPDATE crewcheck_whatsapp_links SET consent_concierge=0 WHERE phone_hash=?',[p.members[7].recipientHash]);
 assert.equal((await transaction(prefund)).status,'denied');assert.deepEqual(await read(globalKey),before);
 await db.query('UPDATE crewcheck_whatsapp_links SET consent_concierge=1 WHERE phone_hash=?',[p.members[7].recipientHash]);
 // Real lock contention must exhaust the ORIGINAL 2s query budget, destroy the
 // owned waiting connection and leave zero partial hold. No enlarged timeout.
 const blocker=await db.getConnection();await blocker.beginTransaction();await blocker.query('SELECT phone_hash FROM crewcheck_whatsapp_links WHERE phone_hash=? FOR UPDATE',[p.members[7].recipientHash]);
 try{await assert.rejects(transaction(prefund));assert.deepEqual(await read(globalKey),before);}finally{await blocker.rollback();blocker.release();}
 // Existing lifecycle ordering is profile -> link while prefund is all links
 // -> all profiles. Force that conflict; one complete owned transaction aborts.
 const lifecycle=await db.getConnection();await lifecycle.beginTransaction();await lifecycle.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE',[ownerEmail(0)]);
 let signal;const profileRead=new Promise(resolve=>signal=resolve);
 const pending=transaction(c=>prefund({...c,query:async(sql,args)=>{if(sql.startsWith('SELECT public_id'))signal();return c.query(sql,args);}}));
 // Attach rejection immediately; a deadlock can abort either transaction.
 const observed=pending.then(value=>({value}),error=>({error}));await profileRead;
 try{await lifecycle.query('SELECT phone_hash FROM crewcheck_whatsapp_links WHERE phone_hash=? FOR UPDATE',[p.members[0].recipientHash]);}catch(error){assert.equal(error.code,'ER_LOCK_DEADLOCK');}finally{await lifecycle.rollback();lifecycle.release();}
 const outcome=await observed,g=await read(globalKey);
 if(outcome.error)assert.deepEqual(g,before);else{assert.equal(outcome.value.status,'reserved');await check(Array(8).fill(0));}
 // Explicit same-manifest operator replays, not an automatic runtime retry.
 const funded=await Promise.all(Array.from({length:12},()=>transaction(prefund)));
 assert(funded.every(x=>['reserved','already-reserved'].includes(x.status)));assert(funded.filter(x=>x.status==='reserved').length<=1);await check(Array(8).fill(0));
 const held=await read(globalKey);assert.equal(held.reservedMicroUsd,before.reservedMicroUsd+p.totalMicroUsd+p.observedBudget.outsideConsumersReserveMicroUsd);
 for(const mutate of [g=>g.finiteReserve.members.pop(),g=>g.finiteReserve.usedMicroUsd++,g=>g.finiteReserve.initialReservedMicroUsd=0]){
  const bad=structuredClone(held);mutate(bad);await write(globalKey,bad);assert.equal((await transaction(prefund)).status,'denied');assert.deepEqual(await read(globalKey),bad);await write(globalKey,held);
 }
 const ordinaryOwner=hash('synthetic-cohort-ordinary-owner');await write(key('account',[programId,ordinaryOwner]),{v:1,kind:'account-credit',accountKey:ordinaryOwner,availableMicroUsd:20000,reservedMicroUsd:0});
 const context={accountKey:ordinaryOwner,linked:true,consent:true,bindingStamp:'synthetic-ordinary-binding',sender,recipient:'12025559999',quote:{sourceId:'synthetic-fresh-voice',currency:'USD',channel:'voice',sender,country:'BR',verifiedAt:epoch,validUntil:epoch+900000,unitMicroUsd:10000,quantumSeconds:60,maxDurationSeconds:60,setupMicroUsd:0,markupMicroUsd:0}};
 const ordinary=createSharedCreditCandidate({enabled:true,budgetApproved:true,programId,monthlyBudgetMicroUsd:20000000,allowedChannels:['voice']},{now:()=>clock,resolveTrustedContext:async()=>context});
 const runtime=await createInfobipWhatsAppProduction(options);
 try{
  await stage(0,'cohort-first-0');await stage(1,'cohort-first-1');
  assert.equal(sends,0);assert.equal(engines,0);await check(Array(8).fill(0));
  const results=await Promise.all([runtime.dispatch(eventKey('cohort-first-0')),runtime.dispatch(eventKey('cohort-first-1')),transaction(c=>ordinary.reserve(c,{...context,eventKey:hash('cohort-ordinary'),channel:'voice'}))]);
  const boundaryGlobal=await read(globalKey);
  console.log(JSON.stringify({suite:'cohort explicit A/B boundary after authenticated staging; strict assertions unchanged',
   statuses:results.slice(0,2).map(result=>result.status),ordinaryReserved:results[2],sqlErrors:dispatchSqlErrors,destroyedConnections:dispatchDestroyed,
   stubProviderCalls:sends,realProviderCalls:0,globalReserved:boundaryGlobal.reservedMicroUsd,
   aggregateAttempts:boundaryGlobal.finiteReserve.attempts,aggregateUsed:boundaryGlobal.finiteReserve.usedMicroUsd,
   members:await Promise.all(p.members.slice(0,2).map(async(m,i)=>{
    const account=await read(accountKey(m)),request=await read(requestKey('cohort-first-'+i)),inbound=await read('crewcheck-infobip-inbound-v1:'+eventKey('cohort-first-'+i));
    return {available:account.availableMicroUsd,reserved:account.reservedMicroUsd,requestState:request?.state??null,inboundState:inbound?.status??null,engineActive:inbound?.engineActive??null};
   }))}));
  assert.equal(results[0].status,'accepted_unconfirmed');assert.equal(results[1].status,'accepted_unconfirmed');assert.equal(results[2],true);
  assert.equal((await read(globalKey)).reservedMicroUsd,20000000-p.observedBudget.knownSpentMicroUsd);
  assert.equal(await transaction(c=>ordinary.reserve(c,{...context,eventKey:hash('cohort-ordinary-extra'),channel:'voice'})),false);
  await Promise.all(Array.from({length:12},()=>runtime.dispatch(eventKey('cohort-first-0'))));assert.equal(sends,2);
  clock=epoch+3600000;revoke=true;await stage(2,'cohort-revoked');await runtime.dispatch(eventKey('cohort-revoked'));assert.equal(sends,2);
  await write(grantKey(p.members[2]),{...await read(grantKey(p.members[2])),status:'approved'});
  loseAck=true;await stage(3,'cohort-unknown');assert.equal((await runtime.dispatch(eventKey('cohort-unknown'))).status,'uncertain');assert.equal(sends,3);await runtime.dispatch(eventKey('cohort-unknown'));assert.equal(sends,3);
  for(let i=4;i<7;i++){await stage(i,'cohort-first-'+i);assert.equal((await runtime.dispatch(eventKey('cohort-first-'+i))).status,'accepted_unconfirmed');}
  // Full HTTP route separately exercises its automatic tick, never followed
  // by a competing explicit dispatch when asserting an accepted result.
  await route(runtime,7,'cohort-first-7');await runtime.maintain();assert.equal((await read('crewcheck-infobip-inbound-v1:'+eventKey('cohort-first-7'))).status,'accepted_unconfirmed');
  await check(Array(8).fill(1));assert.equal(sends,7);assert.equal(engines,8);
  assert.equal((await read(requestKey('cohort-revoked'))).state,'reserved');assert.equal((await read(requestKey('cohort-unknown'))).state,'send-authorized');
 }finally{await runtime.dispose();}
 console.log(JSON.stringify({suite:'finite cohort actual MySQL max8 all-or-nothing and dispatch',stubProviderCalls:sends,realProviderCalls:0,externalCalls:0}));
 return ['max8 canonical grants/prefund all-or-nothing; real lifecycle deadlock and bounded lock timeout leave no partial financial writes','same-manifest corrupt replay denies; different-cost A/B and ordinary voice share one unchanged global reserve','actual production final revocation/unknown COMMIT and duplicate markers retain member and aggregate exposure without fanout'];
}


// Independent synthetic billing months/owner sets, same fixed program.
// Never reset the already exercised January/October allocations to stage a race.
async function runPrefundConcurrencyScenarios({db,transaction}){
 const hash=value=>createHash('sha256').update(value).digest('hex');
 const hmac=value=>createHmac('sha256',secrets.linkHashKey).update(value).digest('hex');
 const read=async k=>{const [rows]=await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?',[k]);return rows.length?(typeof rows[0].payload==='string'?JSON.parse(rows[0].payload):rows[0].payload):null;};
 const write=(k,v)=>db.query('INSERT INTO crewcheck_telegram_state(state_key,payload,updated_at) VALUES(?,?,NOW(3))',[k,JSON.stringify(v)]);
 for(const [index,kind]of ['grant','spend','unlink','deletion','aggregate-cap'].entries()){
  const at=Date.parse(`2032-0${index+2}-01T12:00:00Z`),month=`2032-0${index+2}`,tag='synthetic-prefund-race-'+kind;
  const p=cohortPolicy(8),owners=[];p.approvalId=tag+'-risk';p.evidenceReference=tag+'-reference';p.approvedAt=p.validFrom=at;p.validUntil=at+6*3600000;
  Object.assign(p.observedBudget,{evidenceSha256:hash(tag+'-billing'),observedAt:at});
  if(kind==='aggregate-cap'){
   // Deliberately synthetic known one-micro-dollar tariff, not a claimed live
   // Infobip price. Exercise the10k bound without making10k provider calls.
   for(const m of p.members){m.perAttemptMicroUsd=1;m.maxAttempts=1250;m.totalMicroUsd=m.grant.amountMicroUsd=1250;Object.assign(m.observedTariff,{observedUnitMicroUsd:1,setupMicroUsd:0,markupMicroUsd:0});}
   p.totalMicroUsd=p.maxAttempts=10000;
  }
  for(const [i,m]of p.members.entries()){
   const publicId=tag+'-owner-'+i,email=tag+'-'+i+'@synthetic.invalid';owners.push({publicId,email});
   m.ownerAccountKey=hash(publicId);m.recipient=String(12025552000+index*100+i);m.recipientHash=hmac(m.recipient);
   Object.assign(m.grant,{approvalId:tag+'-grant-'+i,ownerAccountKey:m.ownerAccountKey,validFrom:at,validUntil:at+86400000});m.grantManifest=promotionalGrantManifest(m.grant);
   Object.assign(m.observedTariff,{evidenceSha256:hash(tag+'-tariff-'+i),observedAt:at,validUntil:p.validUntil,sourceId:tag+'-price-'+i});
   await db.query('INSERT INTO crewcheck_platform_profiles VALUES(?,?)',[email,publicId]);
   await db.query('INSERT INTO crewcheck_whatsapp_links(phone_hash,email,consent_concierge,revoked_at,linked_at,updated_at) VALUES(?,?,1,NULL,?,?)',[m.recipientHash,email,new Date(at),new Date(at)]);
   const [[link]]=await db.query('SELECT linked_at,updated_at FROM crewcheck_whatsapp_links WHERE phone_hash=?',[m.recipientHash]);
   m.bindingHash=hmac(JSON.stringify([publicId,JSON.stringify([String(link.linked_at),String(link.updated_at)]),'infobip',sender,m.recipient]));
  }
  p.observedBudget.outsideConsumersReserveMicroUsd=20000000-p.observedBudget.knownSpentMicroUsd-p.observedBudget.initialReservedMicroUsd-p.totalMicroUsd-10000;
  const globalKey=key('global',[programId,month]),initial={v:1,kind:'global-credit',period:month,budgetMicroUsd:20000000,knownSpentMicroUsd:p.observedBudget.knownSpentMicroUsd,reservedMicroUsd:p.observedBudget.initialReservedMicroUsd,reconciled:true,reconciledAt:at,billingEvidenceSha256:p.observedBudget.evidenceSha256,promotionalAllocatedMicroUsd:0};
  await write(globalKey,initial);
  for(const [i,m]of p.members.entries()){
   const t=m.observedTariff;
   await write(key('grant-authorization',[m.grant.approvalId]),{v:1,kind:'promotional-grant-authorization',status:'approved',manifest:m.grantManifest,approvedAt:at,evidenceReference:tag+'-original-reference'});
   await write(finiteCohortTariffKey(p,m),{v:1,kind:'verified-tariff',currency:'USD',country:'BR',category:'service-text',sender,recipientHash:m.recipientHash,sourceId:t.sourceId,evidenceSha256:t.evidenceSha256,verifiedAt:at,validUntil:t.validUntil,unitMicroUsd:t.observedUnitMicroUsd,setupMicroUsd:t.setupMicroUsd,markupMicroUsd:t.markupMicroUsd});
   assert.equal((await transaction(c=>createPromotionalGrantWriter({...m.grant,enabled:true},{now:()=>at})(c,{ownerPublicId:owners[i].publicId}))).status,'granted');
  }
  await write(key('finite-reserve-authorization',[p.approvalId]),{v:2,kind:'finite-reserve-authorization',status:'approved',manifest:finiteCohortManifest(p),approvedAt:at,evidenceReference:p.evidenceReference});
  const prefund=createFiniteCohortPrefunder(p,{enabled:true,now:()=>at,linkHashKey:secrets.linkHashKey});
  if(kind==='aggregate-cap'){
   assert.equal(p.members.length,8);assert.equal(p.maxAttempts,10000);
   assert.equal((await transaction(prefund)).status,'reserved');const held=await read(globalKey);assert(finiteCohortState(p,held,at));
   const bad=structuredClone(p);bad.maxAttempts++;bad.totalMicroUsd++;const changed=bad.members[0];changed.maxAttempts++;changed.totalMicroUsd++;changed.grant.amountMicroUsd++;changed.grantManifest=promotionalGrantManifest(changed.grant);
   assert.throws(()=>finiteCohortPolicy(bad),'10001 aggregate attempts are not admitted');
   // Seed a fully consumed synthetic boundary, not fabricated send evidence.
   // This checks rejection at the exact cap, not10000 successful deliveries.
   const full=structuredClone(held);full.finiteReserve.attempts=full.finiteReserve.usedMicroUsd=10000;
   for(const row of full.finiteReserve.members){row.attempts=row.maxAttempts;row.usedMicroUsd=row.totalMicroUsd;}
   for(const m of p.members){const accountKey=key('account',[programId,m.ownerAccountKey]),a=await read(accountKey);await db.query('UPDATE crewcheck_telegram_state SET payload=? WHERE state_key=?',[JSON.stringify({...a,availableMicroUsd:0,reservedMicroUsd:m.totalMicroUsd}),accountKey]);}
   await db.query('UPDATE crewcheck_telegram_state SET payload=? WHERE state_key=?',[JSON.stringify(full),globalKey]);
   assert.equal((await transaction(prefund)).status,'already-reserved');
   const m=p.members[0],memberId=finiteCohortMemberId(p,m),resolve=createFiniteCohortSqlResolver(p,memberId,{linkHashKey:secrets.linkHashKey,now:()=>at});
   const credit=createSharedCreditCandidate({enabled:true,budgetApproved:true,programId,monthlyBudgetMicroUsd:20000000,allowedChannels:['whatsapp'],finiteCohort:p,cohortMemberId:memberId},{now:()=>at,resolveTrustedContext:resolve});
   const [[link]]=await db.query('SELECT linked_at,updated_at FROM crewcheck_whatsapp_links WHERE phone_hash=?',[m.recipientHash]);
   const eventKey=hash(tag+'-extra-attempt'),job={provider:'infobip',sender,recipient:m.recipient,receivedAt:at,eventKey,channel:'whatsapp',accountKey:m.ownerAccountKey,bindingStamp:JSON.stringify([owners[0].publicId,JSON.stringify([String(link.linked_at),String(link.updated_at)]),'infobip',sender,m.recipient])};
   assert.equal(await transaction(c=>credit.reserve(c,job)),false);assert.equal(await read(key('request',[programId,eventKey])),null);assert.deepEqual(await read(globalKey),full);
   console.log(JSON.stringify({suite:'actual MySQL max8 aggregate10000 boundary; no10001 attempt',stubProviderCalls:0,realProviderCalls:0}));continue;
  }
  const other=tag+'-ordinary-owner',otherKey=hash(other),otherAccountKey=key('account',[programId,otherKey]);
  await db.query('INSERT INTO crewcheck_platform_profiles VALUES(?,?)',[tag+'-ordinary@synthetic.invalid',other]);
  const rawErrors=[],queryCounts={prefund:0,competitor:0};
  const observedPool=label=>({async getConnection(){
   const c=await db.getConnection();return {beginTransaction:c.beginTransaction.bind(c),commit:c.commit.bind(c),rollback:c.rollback.bind(c),release:c.release.bind(c),destroy:c.destroy.bind(c),
    async query(sql,args){queryCounts[label]++;try{return await c.query(sql,args);}catch(error){rawErrors.push({label,code:error.code});throw error;}}};
  }});
  const prefundTransaction=createInfobipSqlBudget(observedPool('prefund'));
  const competitorDb=observedPool('competitor'),competitorTransaction=createInfobipSqlBudget(competitorDb);
  let competitor,uninstall=()=>{};
  if(kind==='grant'){
   const grant={version:1,approvalId:tag+'-ordinary-grant',programId,ownerAccountKey:otherKey,amountMicroUsd:1000,validFrom:at,validUntil:at+86400000,monthlyBudgetMicroUsd:20000000};
   await write(key('grant-authorization',[grant.approvalId]),{v:1,kind:'promotional-grant-authorization',status:'approved',manifest:promotionalGrantManifest(grant),approvedAt:at,evidenceReference:tag+'-ordinary-authority'});
   competitor=()=>competitorTransaction(c=>createPromotionalGrantWriter({...grant,enabled:true},{now:()=>at})(c,{ownerPublicId:other}));
  }else if(kind==='spend'){
   await write(otherAccountKey,{v:1,kind:'account-credit',accountKey:otherKey,availableMicroUsd:1000,reservedMicroUsd:0});
   const context={accountKey:otherKey,linked:true,consent:true,bindingStamp:tag+'-ordinary-binding',sender,recipient:'12025559999',quote:{sourceId:tag+'-voice',currency:'USD',channel:'voice',sender,country:'BR',verifiedAt:at,validUntil:at+900000,unitMicroUsd:1000,quantumSeconds:60,maxDurationSeconds:60,setupMicroUsd:0,markupMicroUsd:0}};
   const ordinary=createSharedCreditCandidate({enabled:true,budgetApproved:true,programId,monthlyBudgetMicroUsd:20000000,allowedChannels:['voice']},{now:()=>at,resolveTrustedContext:async()=>context});
   competitor=()=>competitorTransaction(c=>ordinary.reserve(c,{...context,eventKey:hash(tag+'-event'),channel:'voice'}));
  }else{
   const store=createInfobipSqlStore({db:competitorDb,sender,encryptionKey:secrets.encryptionKey,linkHashKey:secrets.linkHashKey,now:()=>at});
   uninstall=installWhatsAppLifecycle((email,context)=>store.eraseAccount(email,context));
   const lifecycleOperation=async target=>{
    if(kind==='unlink')return eraseWhatsAppAccountState(target.email,{db:competitorDb,expectedPublicId:target.publicId});
    let owned;const deletionTransaction=createInfobipSqlBudget({async getConnection(){owned=await competitorDb.getConnection();return owned;}});
    return deletionTransaction(async c=>{
     const client=mysqlAdapter(c,null,()=>owned.destroy());
     await client.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=$1 FOR UPDATE',[target.email]);
     await eraseWhatsAppAccountState(target.email,{client,expectedPublicId:target.publicId});
     await client.query('DELETE FROM crewcheck_platform_profiles WHERE email=$1',[target.email]);
     return {status:'deleted'};
    });
   };
   // Prove the actual adapter/lifecycle can COMMIT without contention before
   // allowing a narrowly classified deadlock victim in the competing run.
   const control={email:tag+'-ordinary@synthetic.invalid',publicId:other};
   await db.query('INSERT INTO crewcheck_whatsapp_links(phone_hash,email,consent_concierge,revoked_at,linked_at,updated_at) VALUES(?,?,1,NULL,?,?)',[hmac(tag+'-control-target'),control.email,new Date(at),new Date(at)]);
   assert.equal((await lifecycleOperation(control)).status,kind==='unlink'?'erased':'deleted');
   const [[erased]]=await db.query('SELECT revoked_at,consent_concierge FROM crewcheck_whatsapp_links WHERE email=?',[control.email]);assert(erased.revoked_at);assert.equal(Number(erased.consent_concierge),0);
   if(kind==='deletion')assert.equal((await db.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=?',[control.email]))[0].length,0);
   competitor=()=>lifecycleOperation(owners[0]);
  }
  // Real independent connections contend on the SAME global row. Neither
  // operation retries automatically after deadlock/timeout or unknown COMMIT.
  rawErrors.length=0;queryCounts.prefund=queryCounts.competitor=0;
  let outcomes;try{outcomes=await Promise.allSettled([prefundTransaction(prefund),competitor()]);}finally{uninstall();}
  assert(queryCounts.prefund>0&&queryCounts.competitor>0,'both actual contenders must execute SQL');
  assert(outcomes.some(r=>r.status==='fulfilled'),'both failed is not meaningful race evidence');
  assert(rawErrors.every(e=>e.code==='ER_LOCK_DEADLOCK'),'unexpected SQL errors are failures, not accepted contention');
  for(const [i,result]of outcomes.entries())if(result.status==='rejected')assert(rawErrors.some(e=>e.label===(i===0?'prefund':'competitor')&&e.code==='ER_LOCK_DEADLOCK'),'generic budget/configuration/programming error is not a proven deadlock');
  const global=await read(globalKey),cohort=Object.hasOwn(global,'finiteReserve');
  if(cohort){assert(finiteCohortState(p,global,at));assert.equal(global.finiteReserve.attempts,0);}
  for(const m of p.members){const a=await read(key('account',[programId,m.ownerAccountKey]));assert.equal(a.availableMicroUsd,m.totalMicroUsd);assert.equal(a.reservedMicroUsd,0);}
  assert(global.knownSpentMicroUsd+global.reservedMicroUsd<=20000000);
  if(outcomes[0].status==='fulfilled')assert.equal(outcomes[0].value.status,cohort?'reserved':'denied');
  if(kind==='grant'){
   const otherAccount=await read(otherAccountKey),granted=otherAccount?.kind==='account-credit';
   assert.equal(global.promotionalAllocatedMicroUsd,p.totalMicroUsd+(granted?1000:0));
   assert.equal(global.reservedMicroUsd,p.observedBudget.initialReservedMicroUsd+(cohort?p.totalMicroUsd+p.observedBudget.outsideConsumersReserveMicroUsd:0));
   if(granted){assert.equal(otherAccount.availableMicroUsd,1000);assert.equal(otherAccount.reservedMicroUsd,0);}
   if(outcomes[1].status==='fulfilled')assert.equal(outcomes[1].value.status,granted?'granted':'denied');
  }else if(kind==='spend'){
   const otherAccount=await read(otherAccountKey),spent=otherAccount.reservedMicroUsd;
   assert([0,1000].includes(spent));assert.equal(otherAccount.availableMicroUsd,1000-spent);
   assert.equal(global.reservedMicroUsd,p.observedBudget.initialReservedMicroUsd+spent+(cohort?p.totalMicroUsd+p.observedBudget.outsideConsumersReserveMicroUsd:0));
   if(outcomes[1].status==='fulfilled')assert.equal(outcomes[1].value,spent===1000);
   // A spend winning before prefund changes R0: old approval must continue to
   // deny, not infer a new baseline or refresh its evidence.
   if(!cohort&&spent){assert.equal((await transaction(prefund)).status,'denied');assert.deepEqual(await read(globalKey),global);}
  }
  if(kind==='unlink'||kind==='deletion'){
   assert.equal(global.reservedMicroUsd,p.observedBudget.initialReservedMicroUsd+(cohort?p.totalMicroUsd+p.observedBudget.outsideConsumersReserveMicroUsd:0));
   if(outcomes[1].status==='fulfilled'){
    const [[link]]=await db.query('SELECT revoked_at,consent_concierge FROM crewcheck_whatsapp_links WHERE email=?',[owners[0].email]);assert(link.revoked_at);assert.equal(Number(link.consent_concierge),0);
    if(kind==='deletion')assert.equal((await db.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=?',[owners[0].email]))[0].length,0);
    assert.equal((await transaction(prefund)).status,'denied');assert.deepEqual(await read(globalKey),global);
   }
  }
  console.log(JSON.stringify({suite:'max8 cohort prefund versus actual '+kind,transactions:outcomes.map(r=>r.status),cohortHeld:cohort,realProviderCalls:0}));
 }
}
