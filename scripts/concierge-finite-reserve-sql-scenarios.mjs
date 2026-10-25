import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createFiniteReservePrefunder,finiteReserveManifest} from '../server/concierge-finite-reserve-off.mjs';
import {createSharedCreditCandidate,sharedCreditKey as key} from '../server/concierge-shared-credit-candidate.mjs';
export async function runFiniteReserveSqlScenarios({db,transaction,mode,epoch}){
 const hash=s=>createHash('sha256').update(s).digest('hex'),account=hash('SYNTHETIC-PROMOTIONAL-OWNER'),programId='synthetic-finite-reserve',sender='12025550100',recipient='12025550101';let clock=epoch;
 const p={v:1,basis:'explicit-risk-reserve',residualRiskAccepted:true,riskDisclosureVersion:'provisional-provider-cost-v1',approvalId:'synthetic-finite-risk-approval',evidenceReference:'synthetic-specific-exposure-authority',programId,ownerAccountKey:account,grantManifest:'c'.repeat(64),sender,recipient,approvedAt:epoch,validFrom:epoch,validUntil:epoch+86400000,maxAttempts:4,perAttemptMicroUsd:15000,totalMicroUsd:60000,monthlyBudgetMicroUsd:20000000,observedTariff:{evidenceSha256:'d'.repeat(64),observedAt:epoch,observedUnitMicroUsd:9909},observedBudget:{evidenceSha256:'e'.repeat(64),observedAt:epoch,knownSpentMicroUsd:4000000,outsideConsumersReserveMicroUsd:1000000}};
 const globalKey=key('global',[programId,'2032-10']),accountKey=key('account',[programId,account]),authKey=key('finite-reserve-authorization',[p.approvalId]);
 const write=(k,v)=>db.query('INSERT INTO crewcheck_telegram_state VALUES(?,?,NOW(3)) ON DUPLICATE KEY UPDATE payload=VALUES(payload)',[k,JSON.stringify(v)]);
 const read=async k=>{const [r]=await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?',[k]);return r.length?(typeof r[0].payload==='string'?JSON.parse(r[0].payload):r[0].payload):null;};
 const context=async(c,j)=>{
  const [rows]=await c.query('SELECT public_id FROM crewcheck_platform_profiles WHERE BINARY public_id=BINARY ? FOR UPDATE',['SYNTHETIC-PROMOTIONAL-OWNER']);if(rows.length!==1||hash(rows[0].public_id)!==j.accountKey)return null;
  return {accountKey:account,linked:true,consent:true,bindingStamp:'synthetic-finite-binding',sender,recipient,quote:{channel:'whatsapp',currency:'USD',country:'BR',sender,sourceId:'synthetic-observed-price',evidenceSha256:p.observedTariff.evidenceSha256,verifiedAt:epoch,unitMicroUsd:9909,category:'service-text',sessionUntil:j.receivedAt+86400000}};
 };
 const candidate=()=>createSharedCreditCandidate({enabled:true,budgetApproved:true,monthlyBudgetMicroUsd:20000000,programId,allowedChannels:['whatsapp'],finiteReserve:p},{resolveTrustedContext:context,now:()=>clock});
 const job=n=>({accountKey:account,sender,recipient,bindingStamp:'synthetic-finite-binding',eventKey:hash('finite-risk-'+n),channel:'whatsapp',receivedAt:clock});
 const reserve=n=>transaction(c=>candidate().reserve(c,job(n))),prefund=createFiniteReservePrefunder(p,{enabled:true,now:()=>clock});
 if(mode==='restart'){
  clock=epoch+3600000;assert.equal((await transaction(prefund)).status,'already-reserved');assert.equal(await reserve(1),false);assert.equal(await reserve(3),false);assert.equal(await reserve(4),true);assert.equal(await reserve(5),false);const g=await read(globalKey);assert.equal(g.reservedMicroUsd,60000);assert.equal(g.finiteReserve.attempts,4);assert.equal(g.reconciledAt,epoch);assert.equal((await read(accountKey)).availableMicroUsd,0);
  return ['finite prefunded exposure and uncertain attempt survive actual MySQL restart without freshness rewrite or reset'];
 }
 await write(accountKey,{v:1,kind:'account-credit',accountKey:account,grantManifest:p.grantManifest,availableMicroUsd:60000,reservedMicroUsd:0});
 await write(globalKey,{v:1,kind:'global-credit',period:'2032-10',budgetMicroUsd:20000000,knownSpentMicroUsd:4000000,reservedMicroUsd:0,reconciled:true,reconciledAt:epoch});
 assert.equal((await transaction(prefund)).status,'denied');
 const authority={v:1,kind:'finite-reserve-authorization',status:'approved',manifest:finiteReserveManifest(p),approvedAt:epoch,evidenceReference:p.evidenceReference};await write(authKey,authority);
 clock=epoch+900001;assert.equal((await transaction(prefund)).status,'denied','stale initial observation cannot fund exposure');clock=epoch;
 const expensive={...p,observedBudget:{...p.observedBudget,outsideConsumersReserveMicroUsd:19000000}};await write(authKey,{...authority,manifest:finiteReserveManifest(expensive)});assert.equal((await transaction(createFiniteReservePrefunder(expensive,{enabled:true,now:()=>clock}))).status,'denied','outside consumer provision plus known spend cannot exceed global budget');await write(authKey,authority);
 const expiring={...p,validUntil:epoch+10};await write(authKey,{...authority,manifest:finiteReserveManifest(expiring)});const expiryPrefund=createFiniteReservePrefunder(expiring,{enabled:true,now:()=>clock});await assert.rejects(transaction(c=>expiryPrefund({...c,query:async(sql,args)=>{const r=await c.query(sql,args);if(sql.startsWith('UPDATE crewcheck_telegram_state'))clock=epoch+10;return r;}})));clock=epoch;assert.equal((await read(globalKey)).reservedMicroUsd,0,'allocation expiry after write rolls back global hold');await write(authKey,authority);
 const funded=await Promise.all(Array.from({length:20},()=>transaction(prefund)));assert.equal(funded.filter(x=>x.status==='reserved').length,1);assert.equal((await read(globalKey)).reservedMicroUsd,60000);
 clock=epoch+3600000;const duplicates=await Promise.all(Array.from({length:24},()=>reserve(1)));assert.equal(duplicates.filter(Boolean).length,1);assert.equal(await reserve(2),true);
 await write(authKey,{...authority,status:'revoked'});assert.equal(await reserve(6),false);await write(authKey,authority);
 // Throw after actual final UPDATE: transaction rollback restores account,
 // request marker and the allocation's used count together.
 const before=await read(accountKey),beforeGlobal=await read(globalKey);let writes=0;
 await assert.rejects(transaction(c=>candidate().reserve({...c,query:async(sql,args)=>{const r=await c.query(sql,args);if(sql.startsWith('UPDATE crewcheck_telegram_state')&&++writes===3)clock=p.validUntil;return r;}},job(7))));clock=epoch+3600000;assert.deepEqual(await read(accountKey),before);assert.deepEqual(await read(globalKey),beforeGlobal);assert.equal(await read(key('request',[programId,job(7).eventKey])),null);
 const c=await db.getConnection();try{await c.beginTransaction();assert.equal(await candidate().reserve(c,job(3)),true);await c.commit();/* lost acknowledgement: caller must not retry */}finally{c.release();}
 assert.equal(await reserve(3),false);assert.equal((await read(globalKey)).finiteReserve.attempts,3);assert.equal((await read(globalKey)).reconciledAt,epoch);assert.equal((await read(globalKey)).finiteReserve.observedTariffAt,epoch);
 return ['finite exposure upfront allocation concurrent20 reserves once;24 copies debit once; revoked authority denies; final UPDATE expiry rolls back; lost acknowledgement retains usage; no timestamp refresh'];
}
