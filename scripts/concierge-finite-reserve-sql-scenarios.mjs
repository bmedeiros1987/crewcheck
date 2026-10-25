import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createFiniteReservePrefunder,createFiniteReserveSendGate,finiteReserveManifest,FINITE_RESERVE_SHIPPING} from '../server/concierge-finite-reserve-off.mjs';
import {createSharedCreditCandidate,sharedCreditKey as key} from '../server/concierge-shared-credit-candidate.mjs';
export async function runFiniteReserveSqlScenarios({db,transaction,mode,epoch}){
 const hash=s=>createHash('sha256').update(s).digest('hex'),account=hash('SYNTHETIC-PROMOTIONAL-OWNER'),programId='synthetic-finite-reserve',sender='12025550100',recipient='12025550101';const approvedTariffUntil=epoch+3600000+10;let clock=epoch,tariffValidUntil=approvedTariffUntil;
 const p={v:1,basis:'explicit-risk-reserve',residualRiskAccepted:true,riskDisclosureVersion:'provisional-provider-cost-v1',approvalId:'synthetic-finite-risk-approval',evidenceReference:'synthetic-specific-exposure-authority',programId,ownerAccountKey:account,grantManifest:'c'.repeat(64),sender,recipient,approvedAt:epoch,validFrom:epoch,validUntil:epoch+86400000,maxAttempts:4,perAttemptMicroUsd:15000,totalMicroUsd:60000,monthlyBudgetMicroUsd:20000000,observedTariff:{evidenceSha256:'d'.repeat(64),observedAt:epoch,validUntil:approvedTariffUntil,observedUnitMicroUsd:9909},observedBudget:{evidenceSha256:'e'.repeat(64),observedAt:epoch,knownSpentMicroUsd:4000000,outsideConsumersReserveMicroUsd:1000000}};
 const globalKey=key('global',[programId,'2032-10']),accountKey=key('account',[programId,account]),authKey=key('finite-reserve-authorization',[p.approvalId]);
 const write=(k,v)=>db.query('INSERT INTO crewcheck_telegram_state VALUES(?,?,NOW(3)) ON DUPLICATE KEY UPDATE payload=VALUES(payload)',[k,JSON.stringify(v)]);
 const read=async k=>{const [r]=await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?',[k]);return r.length?(typeof r[0].payload==='string'?JSON.parse(r[0].payload):r[0].payload):null;};
 const context=async(c,j)=>{
  const [rows]=await c.query('SELECT public_id FROM crewcheck_platform_profiles WHERE BINARY public_id=BINARY ? FOR UPDATE',['SYNTHETIC-PROMOTIONAL-OWNER']);if(rows.length!==1||hash(rows[0].public_id)!==j.accountKey)return null;
  return {accountKey:account,linked:true,consent:true,bindingStamp:'synthetic-finite-binding',sender,recipient,quote:{channel:'whatsapp',currency:'USD',country:'BR',sender,sourceId:'synthetic-observed-price',evidenceSha256:p.observedTariff.evidenceSha256,verifiedAt:epoch,unitMicroUsd:9909,category:'service-text',sessionUntil:j.receivedAt+86400000,...(tariffValidUntil===null?{}:{validUntil:tariffValidUntil})}};
 };
 const candidate=()=>createSharedCreditCandidate({enabled:true,budgetApproved:true,monthlyBudgetMicroUsd:20000000,programId,allowedChannels:['whatsapp'],finiteReserve:p},{resolveTrustedContext:context,now:()=>clock});
 const job=n=>({accountKey:account,sender,recipient,bindingStamp:'synthetic-finite-binding',eventKey:hash('finite-risk-'+n),channel:'whatsapp',receivedAt:clock});
 const reserve=n=>transaction(c=>candidate().reserve(c,job(n))),prefund=createFiniteReservePrefunder(p,{enabled:true,now:()=>clock});
 // Final send gate fixtures: store-shaped job and a test resolver that reads the
 // canonical link consent under its row lock before the finite context.
 const sendStamp=JSON.stringify(['SYNTHETIC-PROMOTIONAL-OWNER','synthetic-revision-1','infobip',sender,recipient]);
 const sendJob=(n,extra={})=>({provider:'infobip',kind:'text',sender,recipient,eventKey:hash('finite-risk-'+n),receivedAt:clock,bindingStamp:sendStamp,...extra});
 const gateContext=async(c,j)=>{const [links]=await c.query('SELECT consent_concierge,revoked_at FROM credit_qa_links WHERE BINARY phone_hash=BINARY ? FOR UPDATE',[hash(j.recipient)]);if(links.length!==1||Number(links[0].consent_concierge)!==1||links[0].revoked_at!==null)return null;const r=await context(c,j);return r&&{...r,bindingStamp:j.bindingStamp};};
 const gate=()=>createFiniteReserveSendGate(p,{enabled:true,now:()=>clock,resolveTrustedContext:gateContext});
 const send=(n,extra)=>transaction(c=>gate().checkSend(c,sendJob(n,extra)));
 const marker=async n=>(await read(key('request',[programId,hash('finite-risk-'+n)])))?.state;
 if(mode==='restart'){
  clock=epoch+3600000;assert.equal((await transaction(prefund)).status,'already-reserved');assert.equal(await reserve(1),false);assert.equal(await reserve(3),false);assert.equal(await reserve(4),true);assert.equal(await reserve(5),false);const g=await read(globalKey);assert.equal(g.reservedMicroUsd,1060000);assert.equal(g.finiteReserve.attempts,4);assert.equal(g.reconciledAt,epoch);assert.equal((await read(accountKey)).availableMicroUsd,0);
  assert.equal(await send(1),false,'send authorization survives restart: never a second send');assert.equal(await marker(1),'send-authorized');
  assert.equal(await send(4),true);assert.equal(await send(4),false);assert.equal(await marker(4),'send-authorized');
  return ['finite prefunded exposure and uncertain attempt survive actual MySQL restart without freshness rewrite or reset','final send authorization is single-use across actual MySQL restart'];
 }
 await write(accountKey,{v:1,kind:'account-credit',accountKey:account,grantManifest:p.grantManifest,availableMicroUsd:60000,reservedMicroUsd:0});
 await write(globalKey,{v:1,kind:'global-credit',period:'2032-10',budgetMicroUsd:20000000,knownSpentMicroUsd:4000000,reservedMicroUsd:0,reconciled:true,reconciledAt:epoch,billingEvidenceSha256:p.observedBudget.evidenceSha256});
 await write(key('tariff',[programId,sender,'BR','service-text']),{v:1,kind:'verified-tariff',currency:'USD',country:'BR',sender,category:'service-text',evidenceSha256:p.observedTariff.evidenceSha256,verifiedAt:epoch,unitMicroUsd:9909,validUntil:approvedTariffUntil});
 assert.equal((await transaction(prefund)).status,'denied');
 const authority={v:1,kind:'finite-reserve-authorization',status:'approved',manifest:finiteReserveManifest(p),approvedAt:epoch,evidenceReference:p.evidenceReference};await write(authKey,authority);
 clock=epoch+900001;assert.equal((await transaction(prefund)).status,'denied','stale initial observation cannot fund exposure');clock=epoch;
 const expensive={...p,observedBudget:{...p.observedBudget,outsideConsumersReserveMicroUsd:19000000}};await write(authKey,{...authority,manifest:finiteReserveManifest(expensive)});assert.equal((await transaction(createFiniteReservePrefunder(expensive,{enabled:true,now:()=>clock}))).status,'denied','outside consumer provision plus known spend cannot exceed global budget');await write(authKey,authority);
 const expiring={...p,validUntil:epoch+10};await write(authKey,{...authority,manifest:finiteReserveManifest(expiring)});const expiryPrefund=createFiniteReservePrefunder(expiring,{enabled:true,now:()=>clock});await assert.rejects(transaction(c=>expiryPrefund({...c,query:async(sql,args)=>{const r=await c.query(sql,args);if(sql.startsWith('UPDATE crewcheck_telegram_state'))clock=epoch+10;return r;}})));clock=epoch;assert.equal((await read(globalKey)).reservedMicroUsd,0,'allocation expiry after write rolls back global hold');await write(authKey,authority);
 // Tariff validity is separate from observation freshness and from the risk authority
 // window, and the approved manifest binds it: a rewritten later validUntil denies.
 const tariffKey=key('tariff',[programId,sender,'BR','service-text']),tariffRow=await read(tariffKey);
 const untouched=async label=>{const g=await read(globalKey);assert.equal(g.reservedMicroUsd,0,label);assert.equal(g.finiteReserve,undefined,label);};
 const short={...p,observedTariff:{...p.observedTariff,validUntil:epoch+10}},shortPrefund=createFiniteReservePrefunder(short,{enabled:true,now:()=>clock});
 await write(authKey,{...authority,manifest:finiteReserveManifest(short)});
 for(const [validUntil,label] of [[undefined,'missing'],[String(epoch+10),'non-integer'],[epoch+86400000,'later than approved']]){await write(tariffKey,{...tariffRow,validUntil});assert.equal((await transaction(shortPrefund)).status,'denied',`tariff validity ${label} cannot fund`);await untouched(`tariff validity ${label} leaves global unchanged`);}
 await write(tariffKey,{...tariffRow,validUntil:epoch+10});
 clock=epoch+10;assert.equal((await transaction(shortPrefund)).status,'denied','tariff already past validUntil cannot fund even with a fresh observation');clock=epoch;await untouched('expired tariff leaves global unchanged');
 assert.equal((await transaction(c=>shortPrefund({...c,query:async(sql,args)=>{const r=await c.query(sql,args);if(sql.startsWith('SELECT payload')&&args[0]===tariffKey)clock=epoch+10;return r;}}))).status,'denied','tariff expiring after its locked read denies before the write');clock=epoch;await untouched('expiry between locked read and write');
 // The SQL wrapper reports a generic failure; capture the in-transaction reason.
 let reason='';await assert.rejects(transaction(c=>shortPrefund({...c,query:async(sql,args)=>{const r=await c.query(sql,args);if(sql.startsWith('UPDATE crewcheck_telegram_state'))clock=epoch+10;return r;}}).catch(e=>{reason=e.message;throw e;})));assert.equal(reason,'FINITE_RESERVE_EXPIRED');clock=epoch;await untouched('tariff expiry after the real UPDATE rolls back the hold');
 await write(tariffKey,tariffRow);await write(authKey,authority);
 const funded=await Promise.all(Array.from({length:20},()=>transaction(prefund)));assert.equal(funded.filter(x=>x.status==='reserved').length,1);assert.equal((await read(globalKey)).reservedMicroUsd,1060000);
 clock=epoch+3600000;const [duplicates,replays]=await Promise.all([Promise.all(Array.from({length:24},()=>reserve(1))),Promise.all(Array.from({length:20},()=>transaction(prefund)))]);assert(replays.every(x=>x.status==='already-reserved'),'allocation replay and spending share locks without reset/deadlock');assert.equal(duplicates.filter(Boolean).length,1);assert.equal(await reserve(2),true);
 await write(authKey,{...authority,status:'revoked'});assert.equal(await reserve(6),false);await write(authKey,authority);
 // Per-attempt spending rechecks the resolved tariff's validUntil, also after real writes.
 {const before=await read(accountKey),beforeGlobal=await read(globalKey);
  for(const validUntil of [null,String(approvedTariffUntil),approvedTariffUntil+1]){tariffValidUntil=validUntil;assert.equal(await reserve(9),false,'missing, non-integer or rewritten tariff validity denies spending');}
  tariffValidUntil=approvedTariffUntil;let writes=0;
  let reason='';await assert.rejects(transaction(c=>candidate().reserve({...c,query:async(sql,args)=>{const r=await c.query(sql,args);if(sql.startsWith('UPDATE crewcheck_telegram_state')&&++writes===3)clock=tariffValidUntil;return r;}},job(9)).catch(e=>{reason=e.message;throw e;})));assert.equal(reason,'CREDIT_AUTHORIZATION_EXPIRED');
  clock=epoch+3600000;
  assert.deepEqual(await read(accountKey),before);assert.deepEqual(await read(globalKey),beforeGlobal);assert.equal(await read(key('request',[programId,job(9).eventKey])),null);}
 // Throw after actual final UPDATE: transaction rollback restores account,
 // request marker and the allocation's used count together.
 const before=await read(accountKey),beforeGlobal=await read(globalKey);let writes=0;
 await assert.rejects(transaction(c=>candidate().reserve({...c,query:async(sql,args)=>{const r=await c.query(sql,args);if(sql.startsWith('UPDATE crewcheck_telegram_state')&&++writes===3)clock=p.validUntil;return r;}},job(7))));clock=epoch+3600000;assert.deepEqual(await read(accountKey),before);assert.deepEqual(await read(globalKey),beforeGlobal);assert.equal(await read(key('request',[programId,job(7).eventKey])),null);
 await assert.rejects(async()=>{const c=await db.getConnection();try{await c.beginTransaction();assert.equal(await candidate().reserve(c,job(3)),true);await c.commit();throw Error('SYNTHETIC_ACK_LOST_AFTER_REAL_COMMIT');}finally{c.release();}},/ACK_LOST/);
 assert.equal(await reserve(3),false);assert.equal((await read(globalKey)).finiteReserve.attempts,3);assert.equal((await read(globalKey)).reconciledAt,epoch);assert.equal((await read(globalKey)).finiteReserve.observedTariffAt,epoch);
 // Final send gate (OFF by default): denies unless every condition holds; authorizes once.
 {
  const forbidden={query:()=>assert.fail('disabled gate must not touch SQL')};
  for(const options of [{},{enabled:'true'},{enabled:1}])assert.equal(await createFiniteReserveSendGate(p,{...options,now:()=>clock,resolveTrustedContext:gateContext}).checkSend(forbidden,sendJob(1)),false,'deny by default');
  assert.equal(FINITE_RESERVE_SHIPPING,false);assert.equal(await marker(1),'reserved');
  const denied=async(label,run)=>{assert.equal(await run(),false,label);assert.equal(await marker(3),'reserved',label+': reservation untouched');};
  await write(authKey,{...authority,status:'revoked'});await denied('revoked authorization',()=>send(3));await write(authKey,authority);
  await denied('other recipient',()=>send(3,{recipient:'12025550199'}));
  await denied('other owner binding',()=>send(3,{bindingStamp:JSON.stringify(['SYNTHETIC-OTHER','synthetic-revision-1','infobip',sender,recipient])}));
  await denied('link confirmation is not a reply',()=>send(3,{kind:'link_confirmation'}));
  await db.query('UPDATE credit_qa_links SET consent_concierge=0 WHERE phone_hash=?',[hash(recipient)]);await denied('consent withdrawn',()=>send(3));await db.query('UPDATE credit_qa_links SET consent_concierge=1 WHERE phone_hash=?',[hash(recipient)]);
  await db.query('UPDATE credit_qa_links SET revoked_at=NOW(3) WHERE phone_hash=?',[hash(recipient)]);await denied('link revoked',()=>send(3));await db.query('UPDATE credit_qa_links SET revoked_at=NULL WHERE phone_hash=?',[hash(recipient)]);
  // The gate does not rely on the resolver filtering: a reported lack of link, consent or binding denies too.
  for(const [label,change] of [['resolver reports no consent',{consent:false}],['resolver reports no link',{linked:false}],['resolver reports another binding',{bindingStamp:'other-binding'}]]){
   const reporting=createFiniteReserveSendGate(p,{enabled:true,now:()=>clock,resolveTrustedContext:async(c,j)=>{const r=await gateContext(c,j);return r&&{...r,...change};}});
   await denied(label,()=>transaction(c=>reporting.checkSend(c,sendJob(3))));
  }
  await denied('message older than 15 minutes',()=>send(3,{receivedAt:clock-900001}));
  clock=approvedTariffUntil;await denied('approved tariff validity elapsed',()=>send(3));clock=epoch+3600000;
  clock=p.validUntil;await denied('authorization window elapsed',()=>send(3));clock=epoch+3600000;
  tariffValidUntil=approvedTariffUntil+1;await denied('rewritten tariff validity',()=>send(3));tariffValidUntil=approvedTariffUntil;
  assert.equal(await send(50),false,'event without a reservation cannot send');assert.equal(await marker(50),undefined);
  const gBefore=await read(globalKey);await write(globalKey,{...gBefore,finiteReserve:{...gBefore.finiteReserve,status:'released'}});await denied('finite reserve no longer held',()=>send(3));await write(globalKey,gBefore);
  const aBefore=await read(accountKey);await write(accountKey,{...aBefore,reservedMicroUsd:0});await denied('account hold missing',()=>send(3));await write(accountKey,aBefore);
  // Any locked row that no longer matches the approved reservation denies.
  const tamper=async(label,k,change)=>{const before=await read(k);await write(k,change(before));await denied(label,()=>send(3));await write(k,before);};
  const request3=key('request',[programId,hash('finite-risk-3')]),tariffKey3=key('tariff',[programId,sender,'BR','service-text']);
  await tamper('marker amount differs',request3,r=>({...r,amountMicroUsd:r.amountMicroUsd+1}));
  await tamper('marker under another manifest',request3,r=>({...r,finiteManifest:'0'.repeat(64)}));
  await tamper('ordinary-basis marker',request3,({reservationBasis,finiteManifest,...r})=>r);
  await tamper('marker for another account',request3,r=>({...r,accountKey:'1'.repeat(64)}));
  await tamper('marker in another period',request3,r=>({...r,period:'2032-11'}));
  await tamper('authority under another manifest',authKey,x=>({...x,manifest:'2'.repeat(64)}));
  await tamper('global usage inconsistent with attempts',globalKey,x=>({...x,finiteReserve:{...x.finiteReserve,usedMicroUsd:x.finiteReserve.usedMicroUsd+1}}));
  await tamper('global not reconciled',globalKey,x=>({...x,reconciled:false}));
  await tamper('global billing evidence differs',globalKey,x=>({...x,billingEvidenceSha256:'3'.repeat(64)}));
  await tamper('tariff unit price differs',tariffKey3,x=>({...x,unitMicroUsd:x.unitMicroUsd+1}));
  await tamper('tariff observation differs',tariffKey3,x=>({...x,verifiedAt:x.verifiedAt+1}));
  await tamper('account grant expired',accountKey,x=>({...x,validFrom:epoch,expiresAt:clock}));
  const quoteGate=change=>createFiniteReserveSendGate(p,{enabled:true,now:()=>clock,resolveTrustedContext:async(c,j)=>{const r=await gateContext(c,j);return r&&{...r,quote:{...r.quote,...change}};}});
  await denied('service session expired',()=>transaction(c=>quoteGate({sessionUntil:clock}).checkSend(c,sendJob(3))));
  await denied('quote from another observation',()=>transaction(c=>quoteGate({verifiedAt:epoch+1}).checkSend(c,sendJob(3))));
  let ticks=[epoch+3600000,epoch+3599999];const backwards=createFiniteReserveSendGate(p,{enabled:true,now:()=>ticks.length>1?ticks.shift():ticks[0],resolveTrustedContext:gateContext});
  await denied('clock moving backwards',()=>transaction(c=>backwards.checkSend(c,sendJob(3))));
  // Expiry after the consuming write rolls back: the reservation stays usable.
  let reason='';await assert.rejects(transaction(c=>gate().checkSend({...c,query:async(sql,args)=>{const r=await c.query(sql,args);if(sql.startsWith('UPDATE crewcheck_telegram_state'))clock=approvedTariffUntil;return r;}},sendJob(3)).catch(e=>{reason=e.message;throw e;})));
  assert.equal(reason,'FINITE_SEND_EXPIRED');clock=epoch+3600000;assert.equal(await marker(3),'reserved','expiry after the write rolls back');
  // Authorize once: sequential replay and concurrent final checks.
  assert.equal(await send(1),true);assert.equal(await marker(1),'send-authorized');assert.equal(await send(1),false,'same event is never authorized twice');
  assert.equal((await Promise.all(Array.from({length:12},()=>send(2)))).filter(Boolean).length,1,'concurrent final checks authorize one send');assert.equal(await marker(2),'send-authorized');
 }
 // Mixed SQL order: another account holds the shared tariff lock before
 // requesting global; prefunding must wait for tariff without holding global.
 clock=epoch;const mixed={...p,programId:'synthetic-finite-mixed',approvalId:'synthetic-finite-mixed-approval'},mixGlobal=key('global',[mixed.programId,'2032-10']),mixTariff=key('tariff',[mixed.programId,sender,'BR','service-text']),otherAccount=hash('SYNTHETIC-OTHER-FINITE-ACCOUNT');
 await write(key('account',[mixed.programId,account]),{v:1,kind:'account-credit',accountKey:account,grantManifest:p.grantManifest,availableMicroUsd:60000,reservedMicroUsd:0});
 await write(key('account',[mixed.programId,otherAccount]),{v:1,kind:'account-credit',accountKey:otherAccount,availableMicroUsd:60000,reservedMicroUsd:0});
 await write(mixGlobal,{v:1,kind:'global-credit',period:'2032-10',budgetMicroUsd:20000000,knownSpentMicroUsd:4000000,reservedMicroUsd:0,reconciled:true,reconciledAt:epoch,billingEvidenceSha256:p.observedBudget.evidenceSha256});
 await write(mixTariff,{v:1,kind:'verified-tariff',currency:'USD',country:'BR',sender,category:'service-text',evidenceSha256:p.observedTariff.evidenceSha256,verifiedAt:epoch,unitMicroUsd:9909,validUntil:approvedTariffUntil});
 await write(key('finite-reserve-authorization',[mixed.approvalId]),{...authority,manifest:finiteReserveManifest(mixed)});
 let held,release;const tariffHeld=new Promise(r=>held=r),proceed=new Promise(r=>release=r);
 const ordinary=createSharedCreditCandidate({enabled:true,budgetApproved:true,programId:mixed.programId,monthlyBudgetMicroUsd:20000000,allowedChannels:['whatsapp']},{now:()=>clock,resolveTrustedContext:async(c,j)=>{await c.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE',[key('account',[mixed.programId,otherAccount])]);await c.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE',[mixTariff]);held();await proceed;return {accountKey:otherAccount,linked:true,consent:true,bindingStamp:j.bindingStamp,sender,recipient,quote:{channel:'whatsapp',currency:'USD',country:'BR',sender,sourceId:'synthetic-shared-tariff-order',verifiedAt:epoch,category:'service-text',sessionUntil:epoch+60000,unitMicroUsd:12000,setupMicroUsd:0,markupMicroUsd:0}};}});
 const normal=transaction(c=>ordinary.reserve(c,{...job(8),accountKey:otherAccount}));await tariffHeld;
 const funding=transaction(c=>createFiniteReservePrefunder(mixed,{enabled:true,now:()=>clock})({...c,query:async(sql,args)=>{if(sql.startsWith('SELECT payload')&&args[0]===mixTariff)release();return c.query(sql,args);}}));
 const [ordinaryResult,fundResult]=await Promise.all([normal,funding]);assert.equal(ordinaryResult,true);assert.equal(fundResult.status,'reserved');assert.equal((await read(mixGlobal)).reservedMicroUsd,1072000);
 return ['finite exposure upfront allocation concurrent20 reserves once;24 copies debit once; revoked authority denies; final UPDATE expiry rolls back; lost acknowledgement retains usage; no timestamp refresh; mixed-account ordinary tariff-before-global and prefunding complete without deadlock','tariff validUntil bound by the approval and enforced: expired/missing/non-integer/rewritten denies funding and spending; final send gate denies by default and on revoked authority, other recipient/owner, withdrawn consent or revoked link, stale message, elapsed tariff/authority, missing reservation, released reserve or missing account hold; expiry after its write rolls back; one send per event under 12 concurrent checks; expiry after locked read denies; expiry after real UPDATE rolls back hold, account, global and request marker'];
}
