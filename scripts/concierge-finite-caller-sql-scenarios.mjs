import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {Readable} from 'node:stream';
import {createPromotionalGrantWriter,promotionalGrantManifest,createPromotionalCreditSqlResolver} from '../server/concierge-promotional-credit-sql.mjs';
import {createFiniteReservePrefunder,finiteReserveManifest} from '../server/concierge-finite-reserve-off.mjs';
import {createFiniteCreditSqlResolver} from '../server/concierge-finite-credit-sql.mjs';
import {createInfobipWhatsAppProduction} from '../server/infobip-whatsapp-production.mjs';
import {configureWhatsAppConcierge} from '../server/whatsapp.mjs';
import {CONCIERGE_GLOBAL_BUDGET_PROGRAM as programId} from '../server/infobip-whatsapp-promotional-beta.mjs';
import {sharedCreditKey as key} from '../server/concierge-shared-credit-candidate.mjs';

// Called only by the existing owned socket-only disposable MySQL runner.
// This scenario reuses runner-owned tables/pool; the runner creates its own
// disposable schema. Only synthetic fixture DML is performed by this scenario.
export async function runFiniteCallerSqlScenarios({db,transaction,mode,epoch}){
 const hash=s=>createHash('sha256').update(s).digest('hex'),owner='SYNTHETIC-FINITE-CALLER-OWNER',ownerKey=hash(owner),email='finite-caller@synthetic.invalid';
 const sender='12025550300',recipient='12025550301',salt='synthetic-finite-caller-link-key-000000',phoneHash=createHmac('sha256',salt).update(recipient).digest('hex');
 const grant={version:1,approvalId:'synthetic-finite-caller-original-grant',programId,ownerAccountKey:ownerKey,amountMicroUsd:60000,validFrom:epoch,validUntil:epoch+86400000,monthlyBudgetMicroUsd:20000000};
 const finiteReserve={v:1,basis:'explicit-risk-reserve',residualRiskAccepted:true,riskDisclosureVersion:'provisional-provider-cost-v1',approvalId:'synthetic-finite-caller-risk-approval',evidenceReference:'synthetic-finite-caller-risk-reference',programId,ownerAccountKey:ownerKey,grantManifest:promotionalGrantManifest(grant),sender,recipient,
  approvedAt:epoch,validFrom:epoch,validUntil:epoch+6*3600000,maxAttempts:4,perAttemptMicroUsd:15000,totalMicroUsd:60000,monthlyBudgetMicroUsd:20000000,
  observedTariff:{evidenceSha256:'1'.repeat(64),observedAt:epoch,validUntil:epoch+4*3600000,observedUnitMicroUsd:9000,sourceId:'synthetic-finite-caller-original-price',setupMicroUsd:1000,markupMicroUsd:2000},
  observedBudget:{evidenceSha256:'2'.repeat(64),observedAt:epoch,knownSpentMicroUsd:0,outsideConsumersReserveMicroUsd:1000000}};
 const globalKey=key('global',[programId,'2032-10']),accountKey=key('account',[programId,ownerKey]),grantAuthKey=key('grant-authorization',[grant.approvalId]),finiteAuthKey=key('finite-reserve-authorization',[finiteReserve.approvalId]);
 const tariffKey=key('tariff',[programId,sender,'BR','service-text']);
 const read=async k=>{const [rows]=await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?',[k]);return rows.length?(typeof rows[0].payload==='string'?JSON.parse(rows[0].payload):rows[0].payload):null;};
 const write=(k,v)=>db.query('INSERT INTO crewcheck_telegram_state(state_key,payload,updated_at) VALUES(?,?,NOW(3)) ON DUPLICATE KEY UPDATE payload=VALUES(payload)',[k,JSON.stringify(v)]);
 const grantAuthority={v:1,kind:'promotional-grant-authorization',status:'approved',manifest:promotionalGrantManifest(grant),approvedAt:epoch,evidenceReference:'synthetic-finite-caller-grant-reference'};
 let clock=epoch,engines=0,sends=0,revokeInEngine=false,loseFinalAck=false;
 const secrets={apiKey:'synthetic-finite-no-provider-0001',encryptionKey:Buffer.alloc(32,9),linkHashKey:salt,webhookSecret:'synthetic-finite-hmac-no-provider-0001'};
 const baseUrl='https://synthetic.api.infobip.com',publicOrigin='https://crewcheck.example.invalid';
 const configuration={finiteBeta:true,sender,baseUrl,allowedSenders:[sender],allowedBaseUrls:[baseUrl],authentication:'hmac-sha256',credentialReferences:{apiKey:'fixture/api',encryptionKey:'fixture/content',linkHashKey:'fixture/link',webhookSecret:'fixture/hmac'},deploymentBinding:{profileId:'synthetic-finite-profile',subscriptionIds:['synthetic-finite-subscription'],sender,baseUrl,publicOrigin,linkHashKeyReference:'fixture/link'}};
 const eventKey=id=>hash(JSON.stringify(['infobip-inbound-v1',sender,id])),requestKey=id=>key('request',[programId,eventKey(id)]);
 const ackDb={async getConnection(){const c=await db.getConnection();return {query:c.query.bind(c),beginTransaction:c.beginTransaction.bind(c),rollback:c.rollback.bind(c),release:c.release.bind(c),destroy:c.destroy.bind(c),async commit(){await c.commit();if(loseFinalAck&&sends>=2){loseFinalAck=false;throw Error('SYNTHETIC_FINITE_FINAL_ACK_LOST_AFTER_REAL_COMMIT');}}};}};
 configureWhatsAppConcierge(async()=>{engines++;if(revokeInEngine){revokeInEngine=false;await write(grantAuthKey,{...grantAuthority,status:'revoked'});}return 'SYNTHETIC FINITE SAVED SCHEDULE';});
 const options={enabled:true,configuration,admission:{enabled:true,grant,finiteReserve},db:ackDb,now:()=>clock,ingress:{mode:'direct-tls',publicOrigin},credentials:{resolve:async(_ref,{purpose})=>secrets[purpose]},scheduler:{set:()=>1,clear(){}},
  request:async(_url,{body})=>{sends++;const m=JSON.parse(body);assert.equal(m.to,recipient);assert.equal((await read(accountKey)).reservedMicroUsd>=15000,true);return new Response(JSON.stringify({to:m.to,messageId:m.messageId,status:{groupId:1,groupName:'PENDING',id:26,name:'PENDING_ACCEPTED'}}));}};
 async function route(runtime,id){
  const rawBody=Buffer.from(JSON.stringify({results:[{from:recipient,to:sender,integrationType:'WHATSAPP',receivedAt:new Date(clock).toISOString(),messageId:id,message:{type:'TEXT',text:'qual minha próxima jornada?'}}]}));
  const req=Readable.from([rawBody]);Object.assign(req,{method:'POST',rawHeaders:['x-hub-signature','SHA256='+createHmac('sha256',secrets.webhookSecret).update(rawBody).digest('hex')],headers:{host:'crewcheck.example.invalid','content-type':'application/json'},socket:{encrypted:true}});
  const res={writeHead(status){this.status=status;},end(){this.writableEnded=true;}};await runtime.handleRoute(req,res,new URL('/api/infobip/whatsapp/webhook',publicOrigin));assert.equal(res.status,200);
 }
 const checkRetained=async(attempts,id,state='send-authorized')=>{
  const a=await read(accountKey),g=await read(globalKey);assert.equal(a.availableMicroUsd,60000-attempts*15000);assert.equal(a.reservedMicroUsd,attempts*15000);
  assert.equal(g.reservedMicroUsd,1084000,'existing ordinary24000 hold plus finite60000/outside1000000 is retained');assert.equal(g.finiteReserve.attempts,attempts);assert.equal(g.finiteReserve.usedMicroUsd,attempts*15000);
  assert.equal((await read(requestKey(id))).state,state);assert.equal((await read(tariffKey)).verifiedAt,epoch);assert.equal(g.reconciledAt,epoch);
 };
 if(mode==='restart'){
  clock=epoch+3600000;
  assert.equal((await transaction(c=>createPromotionalGrantWriter({...grant,enabled:true},{now:()=>clock})(c,{ownerPublicId:owner}))).status,'already-granted');
  assert.equal((await transaction(createFiniteReservePrefunder(finiteReserve,{enabled:true,now:()=>clock}))).status,'already-reserved');
  const runtime=await createInfobipWhatsAppProduction(options);
  try{
   await runtime.dispatch(eventKey('finite-sql-first'));await runtime.dispatch(eventKey('finite-sql-unknown'));assert.equal(sends,0);
   await route(runtime,'finite-sql-last');assert.equal((await runtime.dispatch(eventKey('finite-sql-last'))).status,'accepted_unconfirmed');
   await route(runtime,'finite-sql-exhausted');await runtime.dispatch(eventKey('finite-sql-exhausted'));assert.equal(sends,1);assert.equal(engines,1);await checkRetained(4,'finite-sql-last');
  }finally{await runtime.dispose();}
  console.log(JSON.stringify({suite:'Finite production caller actual MySQL restart',stubProviderCalls:sends,realProviderCalls:0,externalCalls:0}));
  return ['finite production caller retains grant/reserve/send markers across actual MySQL restart and spends only remaining attempt'];
 }
 assert.equal(mode,'suite');
 // Reuse the prior canonical fixture's real tables and fixed shared program.
 // Preserve prior consumer exposure instead of resetting/replacing its budget.
 const global=await read(globalKey);assert.equal(global.reservedMicroUsd,24000);assert.equal(global.knownSpentMicroUsd,0);assert.equal(global.budgetMicroUsd,20000000);
 await write(globalKey,{...global,billingEvidenceSha256:finiteReserve.observedBudget.evidenceSha256});
 await db.query('INSERT INTO crewcheck_platform_profiles VALUES(?,?)',[email,owner]);
 await db.query("INSERT INTO crewcheck_whatsapp_links(phone_hash,email,consent_concierge,revoked_at,linked_at,updated_at) VALUES(?,?,1,NULL,'2032-10-24 12:00:00.000','2032-10-24 12:00:00.000')",[phoneHash,email]);
 await write(grantAuthKey,grantAuthority);
 await write(finiteAuthKey,{v:1,kind:'finite-reserve-authorization',status:'approved',manifest:finiteReserveManifest(finiteReserve),approvedAt:epoch,evidenceReference:finiteReserve.evidenceReference});
 await write(tariffKey,{v:1,kind:'verified-tariff',channel:'whatsapp',currency:'USD',country:'BR',sender,recipientHash:phoneHash,category:'service-text',sourceId:finiteReserve.observedTariff.sourceId,evidenceSha256:finiteReserve.observedTariff.evidenceSha256,verifiedAt:epoch,validUntil:finiteReserve.observedTariff.validUntil,unitMicroUsd:9000,setupMicroUsd:1000,markupMicroUsd:2000});
 const granted=await Promise.all(Array.from({length:12},()=>transaction(c=>createPromotionalGrantWriter({...grant,enabled:true},{now:()=>clock})(c,{ownerPublicId:owner}))));assert.equal(granted.filter(x=>x.status==='granted').length,1);
 const prefunded=await Promise.all(Array.from({length:12},()=>transaction(createFiniteReservePrefunder(finiteReserve,{enabled:true,now:()=>clock}))));assert.equal(prefunded.filter(x=>x.status==='reserved').length,1);
 clock=epoch+3600000;
 const [[link]]=await db.query('SELECT linked_at,updated_at FROM crewcheck_whatsapp_links WHERE phone_hash=?',[phoneHash]);
 const job={provider:'infobip',sender,recipient,eventKey:eventKey('finite-sql-context'),receivedAt:clock,bindingStamp:JSON.stringify([owner,JSON.stringify([String(link.linked_at),String(link.updated_at)]),'infobip',sender,recipient])};
 const finite=createFiniteCreditSqlResolver({finiteReserve,grant,linkHashKey:salt,now:()=>clock});assert(await transaction(c=>finite(c,job)));
 const ordinary=createPromotionalCreditSqlResolver({programId,approvalId:grant.approvalId,ownerAccountKey:ownerKey,sender,recipient,linkHashKey:salt,expectedGrantManifest:promotionalGrantManifest(grant),expectedValidFrom:grant.validFrom,expectedValidUntil:grant.validUntil,now:()=>clock});
 assert.equal(await transaction(c=>ordinary(c,job)),null,'ordinary freshness unchanged after real grant/prefund');
 // Isolate tariff validity: the original grant and finite period remain live,
 // and this message is only5ms old when the tariff expires after its SQL read.
 clock=finiteReserve.observedTariff.validUntil-5;const deadlineJob={...job,receivedAt:clock};
 assert.equal(await transaction(c=>finite({...c,query:async(sql,args)=>{const result=await c.query(sql,args);if(sql.startsWith('SELECT payload')&&args[0]===tariffKey)clock=finiteReserve.observedTariff.validUntil;return result;}},deadlineJob)),null,'finite tariff deadline rechecked after actual SQL wait');clock=epoch+3600000;
 const originalFiniteAuthority=await read(finiteAuthKey),originalAccount=await read(accountKey),originalTariff=await read(tariffKey);
 await write(finiteAuthKey,{...originalFiniteAuthority,status:'revoked'});assert.equal(await transaction(c=>finite(c,job)),null);await write(finiteAuthKey,originalFiniteAuthority);
 await write(accountKey,{...originalAccount,grantApprovalId:finiteReserve.approvalId});assert.equal(await transaction(c=>finite(c,job)),null);await write(accountKey,originalAccount);
 await write(tariffKey,{...originalTariff,markupMicroUsd:0});assert.equal(await transaction(c=>finite(c,job)),null);await write(tariffKey,originalTariff);
 assert.deepEqual(await read(accountKey),originalAccount,'read-only denied authority/fee checks never create a debit');
 const runtime=await createInfobipWhatsAppProduction(options);
 try{
  await route(runtime,'finite-sql-first');await Promise.all([
   ...Array.from({length:12},()=>runtime.dispatch(eventKey('finite-sql-first'))),
   ...Array.from({length:12},()=>transaction(createFiniteReservePrefunder(finiteReserve,{enabled:true,now:()=>clock})).then(result=>assert.equal(result.status,'already-reserved'))),
  ]);assert.equal(sends,1);assert.equal(engines,1);await checkRetained(1,'finite-sql-first');
  revokeInEngine=true;await route(runtime,'finite-sql-revoked');await runtime.dispatch(eventKey('finite-sql-revoked'));assert.equal(sends,1);await checkRetained(2,'finite-sql-revoked','reserved');await write(grantAuthKey,grantAuthority);
  loseFinalAck=true;await route(runtime,'finite-sql-unknown');assert.equal((await runtime.dispatch(eventKey('finite-sql-unknown'))).status,'uncertain');assert.equal(sends,2);await checkRetained(3,'finite-sql-unknown');
  await runtime.dispatch(eventKey('finite-sql-unknown'));assert.equal(sends,2);
 }finally{await runtime.dispose();}
 console.log(JSON.stringify({suite:'Finite production caller actual MySQL grant/prefund/dispatch',stubProviderCalls:sends,realProviderCalls:0,externalCalls:0}));
 return ['12 real-SQL concurrent grants and prefundings each allocate once without resetting existing ordinary exposure','finite resolver uses actual canonical/grant/authority/tariff rows while ordinary freshness still denies','real production HMAC dispatch sends once among12 duplicate attempts, revocation blocks final send and real COMMIT ACK loss never retries'];
}
