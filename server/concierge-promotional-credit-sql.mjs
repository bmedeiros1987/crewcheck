import {createHash,createHmac} from 'node:crypto';
import {sharedCreditKey} from './concierge-shared-credit-candidate.mjs';
export const CONCIERGE_PROMOTIONAL_CREDIT_SQL_SHIPPING=false;
const hash=value=>createHash('sha256').update(value).digest('hex');
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const int=value=>Number.isSafeInteger(value)&&value>=0;
const parse=value=>{try{return typeof value==='string'?JSON.parse(value):value;}catch{return null;}};
const lock=async(c,k)=>{const [rows]=await c.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE',[k]);return rows.length===1?parse(rows[0].payload):null;};
const insert=(c,k,v)=>c.query('INSERT INTO crewcheck_telegram_state (state_key,payload,updated_at) VALUES(?,?,NOW(3)) ON DUPLICATE KEY UPDATE state_key=state_key',[k,JSON.stringify(v)]);
const save=async(c,k,v)=>{const [r]=await c.query('UPDATE crewcheck_telegram_state SET payload=?,updated_at=NOW(3) WHERE state_key=?',[JSON.stringify(v),k]);if(r.affectedRows!==1)throw Error('PROMOTIONAL_CREDIT_WRITE');};
const periodAt=at=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(at);
export function promotionalGrantManifest(p){
 if(p?.version!==1||typeof p.approvalId!=='string'||!p.approvalId||p.approvalId.length>100||typeof p.programId!=='string'||!p.programId||p.programId.length>80||!hex(p.ownerAccountKey)||!int(p.amountMicroUsd)||p.amountMicroUsd<1||!int(p.validFrom)||!int(p.validUntil)||p.validUntil<=p.validFrom||p.validUntil-p.validFrom>31*86400000||!int(p.monthlyBudgetMicroUsd)||p.monthlyBudgetMicroUsd<1||p.monthlyBudgetMicroUsd>20000000)throw Error('PROMOTIONAL_GRANT_CONFIGURATION');
 return hash(JSON.stringify([p.version,p.approvalId,p.programId,p.ownerAccountKey,p.amountMicroUsd,p.validFrom,p.validUntil,p.monthlyBudgetMicroUsd]));
}
// Caller owns the bounded transaction. No authority/global row or real grant is
// initialized here: both must have been explicitly approved and provisioned.
export function createPromotionalGrantWriter(options={}, {now=Date.now}={}){
 if(options.enabled!==true)return async()=>({status:'disabled'});
 const p=structuredClone(options),manifest=promotionalGrantManifest(p);
 if(typeof now!=='function')throw Error('PROMOTIONAL_GRANT_CONFIGURATION');
 const atValid=at=>int(at)&&at>=p.validFrom&&at<p.validUntil;
 return async(c,{ownerPublicId}={})=>{
  const at=now();if(!atValid(at)||typeof ownerPublicId!=='string'||hash(ownerPublicId)!==p.ownerAccountKey)return {status:'denied'};
  const [profiles]=await c.query('SELECT public_id FROM crewcheck_platform_profiles WHERE BINARY public_id=BINARY ? FOR UPDATE',[ownerPublicId]);
  if(profiles.length!==1||profiles[0].public_id!==ownerPublicId)return {status:'denied'};
  const authority=await lock(c,sharedCreditKey('grant-authorization',[p.approvalId]));
  if(authority?.v!==1||authority.kind!=='promotional-grant-authorization'||authority.status!=='approved'||authority.manifest!==manifest||!int(authority.approvedAt)||authority.approvedAt>at||typeof authority.evidenceReference!=='string'||!authority.evidenceReference)return {status:'denied'};
  const receiptKey=sharedCreditKey('grant-receipt',[p.approvalId]);await insert(c,receiptKey,{v:1,kind:'promotional-grant-receipt',manifest,state:'empty'});
  const receipt=await lock(c,receiptKey);
  if(receipt?.v!==1||receipt.kind!=='promotional-grant-receipt'||receipt.manifest!==manifest)return {status:'denied'};
  if(receipt.state==='granted')return {status:'already-granted'};
  if(receipt.state!=='empty')return {status:'denied'};
  const accountKey=sharedCreditKey('account',[p.programId,p.ownerAccountKey]),globalKey=sharedCreditKey('global',[p.programId,periodAt(at)]);
  // An existing balance is never overwritten, even for a different approval.
  await insert(c,accountKey,{v:1,kind:'unfunded-promotional-account',accountKey:p.ownerAccountKey});
  const records=new Map();for(const k of [accountKey,globalKey].sort())records.set(k,await lock(c,k));
  const a=records.get(accountKey),g=records.get(globalKey),allocated=g?.promotionalAllocatedMicroUsd??0;
  const fresh=()=>{const current=now();return atValid(current)&&current>=at&&periodAt(current)===g?.period&&int(g.reconciledAt)&&current>=g.reconciledAt&&current-g.reconciledAt<=15*60000&&!c.signal?.aborted;};
  if(a?.v!==1||a.kind!=='unfunded-promotional-account'||a.accountKey!==p.ownerAccountKey||g?.v!==1||g.kind!=='global-credit'||g.period!==periodAt(at)||g.budgetMicroUsd!==p.monthlyBudgetMicroUsd||g.reconciled!==true||!int(g.reconciledAt)||g.reconciledAt>at||at-g.reconciledAt>15*60000||!int(g.knownSpentMicroUsd)||!int(g.reservedMicroUsd)||!int(allocated)||allocated+g.knownSpentMicroUsd+g.reservedMicroUsd+p.amountMicroUsd>g.budgetMicroUsd||!Number.isSafeInteger(allocated+p.amountMicroUsd))return {status:'denied'};
  if(!fresh())throw Error('PROMOTIONAL_GRANT_EXPIRED');
  await save(c,accountKey,{v:1,kind:'account-credit',accountKey:p.ownerAccountKey,availableMicroUsd:p.amountMicroUsd,reservedMicroUsd:0,grantApprovalId:p.approvalId,grantManifest:manifest,validFrom:p.validFrom,expiresAt:p.validUntil});
  await save(c,globalKey,{...g,promotionalAllocatedMicroUsd:allocated+p.amountMicroUsd});
  await save(c,receiptKey,{...receipt,state:'granted',grantedAt:at,amountMicroUsd:p.amountMicroUsd});
  if(!fresh())throw Error('PROMOTIONAL_GRANT_EXPIRED');
  return {status:'granted'};
 };
}
// Real SQL resolver, intentionally no provider API, refresh or metadata writer.
// Recorded verification timestamps are evidence supplied by a trusted process,
// not proof generated by this function. Missing/stale evidence denies.
export function createPromotionalCreditSqlResolver({programId,approvalId,ownerAccountKey,sender,recipient,linkHashKey,expectedGrantManifest,expectedValidFrom,expectedValidUntil,now=Date.now}={}){
 if(typeof programId!=='string'||!programId||typeof approvalId!=='string'||!approvalId||!hex(ownerAccountKey)||!/^\d{8,15}$/.test(sender||'')||!/^\d{8,15}$/.test(recipient||'')||typeof linkHashKey!=='string'||linkHashKey.length<32||typeof now!=='function')throw Error('PROMOTIONAL_RESOLVER_CONFIGURATION');
 const phoneHash=createHmac('sha256',linkHashKey).update(recipient).digest('hex');
 return async(c,j)=>{
  const at=now();if(!int(at)||j?.sender!==sender||j.recipient!==recipient||!int(j.receivedAt)||j.receivedAt>at||at-j.receivedAt>15*60000)return null;
  const [links]=await c.query('SELECT email,consent_concierge,revoked_at,linked_at,updated_at FROM crewcheck_whatsapp_links WHERE phone_hash=? FOR UPDATE',[phoneHash]);const link=links[0];
  if(links.length!==1||Number(link.consent_concierge)!==1||link.revoked_at!==null||!link.linked_at||!link.updated_at)return null;
  const [profiles]=await c.query('SELECT public_id FROM crewcheck_platform_profiles WHERE BINARY email=BINARY ? FOR UPDATE',[link.email]);
  if(profiles.length!==1||typeof profiles[0].public_id!=='string'||hash(profiles[0].public_id)!==ownerAccountKey)return null;
  const [unique]=await c.query('SELECT public_id FROM crewcheck_platform_profiles WHERE BINARY public_id=BINARY ? FOR UPDATE',[profiles[0].public_id]);if(unique.length!==1)return null;
  const bindingStamp=JSON.stringify([profiles[0].public_id,JSON.stringify([String(link.linked_at),String(link.updated_at)]),'infobip',sender,recipient]);
  if(bindingStamp!==j.bindingStamp)return null;
  const account=await lock(c,sharedCreditKey('account',[programId,ownerAccountKey]));
  if(expectedGrantManifest!==undefined&&(!hex(expectedGrantManifest)||account?.grantManifest!==expectedGrantManifest||account.validFrom!==expectedValidFrom||account.expiresAt!==expectedValidUntil))return null;
  if(account?.grantApprovalId!==approvalId||account.accountKey!==ownerAccountKey||!int(account.validFrom)||account.validFrom>at||!int(account.expiresAt)||account.expiresAt<=at)return null;
  const recorded=await lock(c,sharedCreditKey('tariff',[programId,sender,'BR','service-text']));
  const current=now();if(!int(current)||current<at||current<account.validFrom||current>=account.expiresAt||current-j.receivedAt>15*60000)return null;
  if(recorded?.v!==1||recorded.kind!=='verified-tariff'||recorded.currency!=='USD'||recorded.recipientHash!==phoneHash||recorded.sender!==sender||recorded.country!=='BR'||recorded.category!=='service-text'||!hex(recorded.evidenceSha256)||typeof recorded.sourceId!=='string'||!recorded.sourceId||!int(recorded.verifiedAt)||recorded.verifiedAt>current||current-recorded.verifiedAt>15*60000||!int(recorded.validUntil)||recorded.validUntil<=current)return null;
  return {accountKey:ownerAccountKey,linked:true,consent:true,bindingStamp,sender,recipient,quote:{...recorded,channel:'whatsapp',sessionUntil:j.receivedAt+24*3600000}};
 };
}
