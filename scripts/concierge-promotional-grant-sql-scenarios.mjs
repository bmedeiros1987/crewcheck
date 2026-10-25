import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {createPromotionalGrantWriter,promotionalGrantManifest,createPromotionalCreditSqlResolver,CONCIERGE_PROMOTIONAL_CREDIT_SQL_SHIPPING} from '../server/concierge-promotional-credit-sql.mjs';
import {createSharedCreditCandidate,sharedCreditKey as key} from '../server/concierge-shared-credit-candidate.mjs';
export async function runPromotionalGrantSqlScenarios({db,transaction,mode,epoch}){
 const hash=s=>createHash('sha256').update(s).digest('hex'),owner='SYNTHETIC-PROMOTIONAL-OWNER',account=hash(owner),sender='12025550100',recipient='12025550101',salt='synthetic-canonical-link-hash-only-000000',phoneHash=createHmac('sha256',salt).update(recipient).digest('hex');
 const p={enabled:true,version:1,approvalId:'synthetic-grant-approval',programId:'synthetic-funded-program',ownerAccountKey:account,amountMicroUsd:24000,validFrom:epoch-1000,validUntil:epoch+86400000,monthlyBudgetMicroUsd:50000};
 const write=(k,v)=>db.query('INSERT INTO crewcheck_telegram_state VALUES(?,?,NOW(3)) ON DUPLICATE KEY UPDATE payload=VALUES(payload)',[k,JSON.stringify(v)]);
 const read=async k=>{const [r]=await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?',[k]);return r.length?(typeof r[0].payload==='string'?JSON.parse(r[0].payload):r[0].payload):null;};
 const grant=(policy=p,clock=()=>epoch)=>createPromotionalGrantWriter(policy,{now:clock});
 const fund=policy=>transaction(c=>grant(policy)(c,{ownerPublicId:owner}));
 const seed=async(policy,{spent=0}={})=>{
  await write(key('grant-authorization',[policy.approvalId]),{v:1,kind:'promotional-grant-authorization',status:'approved',manifest:promotionalGrantManifest(policy),approvedAt:epoch-2000,evidenceReference:'synthetic-human-approval-fixture'});
  await write(key('global',[policy.programId,'2032-10']),{v:1,kind:'global-credit',period:'2032-10',budgetMicroUsd:50000,knownSpentMicroUsd:spent,reservedMicroUsd:0,reconciled:true,reconciledAt:epoch});
 };
 assert.equal(CONCIERGE_PROMOTIONAL_CREDIT_SQL_SHIPPING,false);
 if(mode==='restart'){
  assert.equal((await fund()).status,'already-granted');assert.equal((await read(key('account',[p.programId,account]))).availableMicroUsd,12000);
  return ['grant receipt survives actual MySQL restart without resetting consumed balance'];
 }
 await db.query('CREATE TABLE crewcheck_platform_profiles(email VARCHAR(160) PRIMARY KEY,public_id VARCHAR(80) NOT NULL,INDEX(public_id)) ENGINE=InnoDB');
 await db.query('CREATE TABLE crewcheck_whatsapp_links(phone_hash CHAR(64) PRIMARY KEY,email VARCHAR(160) NOT NULL,consent_concierge TINYINT NOT NULL,revoked_at DATETIME(3),linked_at DATETIME(3) NOT NULL,updated_at DATETIME(3) NOT NULL) ENGINE=InnoDB');
 await db.query('INSERT INTO crewcheck_platform_profiles VALUES(?,?)',['grant-owner@synthetic.invalid',owner]);
 await db.query("INSERT INTO crewcheck_whatsapp_links VALUES(?,?,1,NULL,'2032-10-24 12:00:00.000','2032-10-24 12:00:00.000')",[phoneHash,'grant-owner@synthetic.invalid']);
 assert.equal((await createPromotionalGrantWriter()()).status,'disabled');
 assert.equal((await fund()).status,'denied');assert.equal(await read(key('account',[p.programId,account])),null);
 await seed(p);const grants=await Promise.all(Array.from({length:20},()=>fund()));assert.equal(grants.filter(x=>x.status==='granted').length,1);assert.equal(grants.filter(x=>x.status==='already-granted').length,19);
 assert.equal((await read(key('account',[p.programId,account]))).availableMicroUsd,24000);assert.equal((await read(key('global',[p.programId,'2032-10']))).promotionalAllocatedMicroUsd,24000);
 assert.equal((await fund({...p,amountMicroUsd:25000})).status,'denied');assert.equal((await transaction(c=>grant()(c,{ownerPublicId:'SYNTHETIC-OTHER'}))).status,'denied');
 let clock=epoch;const tariffKey=key('tariff',[p.programId,sender,'BR','service-text']);
 const tariff={v:1,kind:'verified-tariff',currency:'USD',country:'BR',sender,recipientHash:phoneHash,category:'service-text',sourceId:'synthetic-account-price-evidence',evidenceSha256:'a'.repeat(64),verifiedAt:epoch-100,validUntil:epoch+86400000,unitMicroUsd:12000,setupMicroUsd:0,markupMicroUsd:0};
 await write(tariffKey,tariff);
 const resolver=createPromotionalCreditSqlResolver({programId:p.programId,approvalId:p.approvalId,ownerAccountKey:account,sender,recipient,linkHashKey:salt,now:()=>clock});
 const [[link]]=await db.query('SELECT linked_at,updated_at FROM crewcheck_whatsapp_links WHERE phone_hash=?',[phoneHash]);
 const j={accountKey:account,provider:'infobip',sender,recipient,eventKey:'f'.repeat(64),receivedAt:epoch,bindingStamp:JSON.stringify([owner,JSON.stringify([String(link.linked_at),String(link.updated_at)]),'infobip',sender,recipient]),channel:'whatsapp'};
 const ctx=await transaction(c=>resolver(c,j));assert.equal(ctx.quote.verifiedAt,tariff.verifiedAt,'stored verification date is never stamped now');
 const authKey=key('grant-authorization',[p.approvalId]),auth=await read(authKey);await write(authKey,{...auth,status:'revoked'});assert.equal(await transaction(c=>resolver(c,j)),null,'revoked promotional approval denies despite remaining balance');await write(authKey,auth);
 const credit=createSharedCreditCandidate({enabled:true,budgetApproved:true,programId:p.programId,monthlyBudgetMicroUsd:50000,allowedChannels:['whatsapp']},{now:()=>clock,resolveTrustedContext:resolver});
 const fundingKeys=[key('account',[p.programId,account]),key('grant-authorization',[p.approvalId]),key('grant-receipt',[p.approvalId])],funding=await Promise.all(fundingKeys.map(read));
 const malformed=[r=>{for(const x of r)delete x.grantManifest;delete r[1].manifest;delete r[2].manifest;},r=>delete r[0].grantManifest,r=>r[0].grantManifest='not-hex',r=>delete r[0].v,r=>delete r[1].manifest,r=>delete r[2].manifest,r=>delete r[1].v,r=>r[2].v=2,r=>delete r[1].evidenceReference,r=>r[1].evidenceReference='   ',r=>r[1].manifest='c'.repeat(64),r=>r[2].manifest='not-hex'];
 for(let n=0;n<malformed.length;n++){const rows=structuredClone(funding);malformed[n](rows);for(let i=0;i<rows.length;i++)await write(fundingKeys[i],rows[i]);assert.equal(await transaction(c=>resolver(c,j)),null,'malformed funding proof denies at SQL resolver');assert.equal(await transaction(c=>credit.reserve(c,{...j,eventKey:hash('malformed-proof-'+n)})),false,'malformed proof cannot debit credit');for(let i=0;i<rows.length;i++)await write(fundingKeys[i],funding[i]);}
 assert.equal(await transaction(c=>credit.reserve(c,j)),true);
 assert.equal((await fund()).status,'already-granted');assert.equal((await read(key('account',[p.programId,account]))).availableMicroUsd,12000,'grant replay does not reset spent credits');
 clock=epoch+900001;assert.equal(await transaction(c=>resolver(c,{...j,receivedAt:clock})),null);clock=epoch;
 await write(tariffKey,{...tariff,verifiedAt:epoch+1});assert.equal(await transaction(c=>resolver(c,j)),null);await write(tariffKey,{...tariff,recipientHash:'b'.repeat(64)});assert.equal(await transaction(c=>resolver(c,j)),null);await write(tariffKey,tariff);
 assert.equal(await transaction(c=>resolver({...c,query:async(sql,args)=>{const r=await c.query(sql,args);if(args?.[0]===tariffKey)clock=epoch+900001;return r;}},j)),null,'tariff expiring during SQL lookup denies');clock=epoch;
 await write(tariffKey,{...tariff,validUntil:epoch+2});const beforeExpiry=await read(key('account',[p.programId,account]));
 for(const phase of ['global-read','last-update']){
  let updates=0;const expiryJob={...j,eventKey:hash('tariff-expiry-'+phase)};
  const run=()=>transaction(c=>credit.reserve({...c,query:async(sql,args)=>{const result=await c.query(sql,args);if(phase==='global-read'&&sql.startsWith('SELECT payload')&&args[0]===key('global',[p.programId,'2032-10']))clock=epoch+2;if(phase==='last-update'&&sql.startsWith('UPDATE crewcheck_telegram_state')&&++updates===3)clock=epoch+2;return result;}},expiryJob));
  if(phase==='global-read')assert.equal(await run(),false);else await assert.rejects(run());clock=epoch;
  assert.deepEqual(await read(key('account',[p.programId,account])),beforeExpiry);assert.equal(await read(key('request',[p.programId,expiryJob.eventKey])),null);
 }
 await write(tariffKey,tariff);
 await db.query('UPDATE crewcheck_whatsapp_links SET consent_concierge=0 WHERE phone_hash=?',[phoneHash]);assert.equal(await transaction(c=>resolver(c,j)),null);await db.query('UPDATE crewcheck_whatsapp_links SET consent_concierge=1 WHERE phone_hash=?',[phoneHash]);
 const rollback={...p,approvalId:'synthetic-rollback-grant',programId:'synthetic-rollback-grant',validUntil:epoch+10};await seed(rollback);let updates=0;
 await assert.rejects(transaction(c=>grant(rollback,()=>clock)({...c,query:async(sql,args)=>{const r=await c.query(sql,args);if(sql.startsWith('UPDATE crewcheck_telegram_state')&&++updates===3)clock=epoch+10;return r;}},{ownerPublicId:owner})));clock=epoch;
 assert.equal(await read(key('account',[rollback.programId,account])),null);assert.equal(await read(key('grant-receipt',[rollback.approvalId])),null);assert.equal((await read(key('global',[rollback.programId,'2032-10']))).promotionalAllocatedMicroUsd,undefined);
 const insufficient={...p,approvalId:'synthetic-low-budget',programId:'synthetic-low-budget'};await seed(insufficient,{spent:45000});assert.equal((await fund(insufficient)).status,'denied');assert.notEqual((await read(key('account',[insufficient.programId,account])))?.kind,'account-credit');
 return ['20 concurrent grants create exactly one balance and receipt','grant replay after consumption never resets credit','grant scope/account/budget mismatch denies','real canonical SQL resolver rejects12 malformed proof/version/manifest/source vectors and preserves tariff dates','expiry after last grant UPDATE rolls back balance, allocation and receipt'];
}
