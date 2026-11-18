import {createHash} from 'node:crypto';
import {createSharedCreditCandidate,sharedCreditKey} from './concierge-shared-credit-candidate.mjs';

// Explicit capability only; no production imports, env discovery or grants.
export const CONCIERGE_PROMOTIONAL_BETA_SHIPPING=false;
const hash=value=>createHash('sha256').update(value).digest('hex');
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const phone=value=>typeof value==='string'&&/^[1-9]\d{7,14}$/.test(value);
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const parse=value=>{try{return typeof value==='string'?JSON.parse(value):value;}catch{return null;}};
export function createPromotionalConciergeAdmission(options={},dependencies={}){
 if(options.enabled!==true)return Object.freeze({allows:()=>false,reserve:async()=>false});
 const p=structuredClone(options),now=dependencies.now??Date.now;
 if(p.version!==1||typeof p.approvalId!=='string'||!p.approvalId||p.approvalId.length>100||
  typeof p.programId!=='string'||!p.programId||p.programId.length>80||!hex(p.ownerAccountKey)||!phone(p.sender)||!phone(p.recipient)||
  !integer(p.validFrom)||!integer(p.validUntil)||p.validUntil<=p.validFrom||p.validUntil-p.validFrom>31*86400000||
  !integer(p.maxReplies)||p.maxReplies<1||p.maxReplies>10000||
  !integer(p.monthlyBudgetMicroUsd)||p.monthlyBudgetMicroUsd<1||p.monthlyBudgetMicroUsd>20000000||
  typeof dependencies.resolveTrustedContext!=='function'||typeof now!=='function')throw Error('PROMOTIONAL_ADMISSION_CONFIGURATION');
 const manifest=hash(JSON.stringify([p.version,p.approvalId,p.programId,p.ownerAccountKey,p.sender,p.recipient,p.validFrom,p.validUntil,p.maxReplies,p.monthlyBudgetMicroUsd]));
 const stateKey=sharedCreditKey('promotional-admission',[p.approvalId]);
 const credit=createSharedCreditCandidate({enabled:true,budgetApproved:true,programId:p.programId,monthlyBudgetMicroUsd:p.monthlyBudgetMicroUsd,allowedChannels:['whatsapp']},dependencies);
 const owner=j=>{const stamp=parse(j?.bindingStamp);return Array.isArray(stamp)&&stamp.length===5&&typeof stamp[0]==='string'&&stamp[0]&&typeof stamp[1]==='string'&&stamp[1]&&stamp[2]==='infobip'&&stamp[3]===p.sender&&stamp[4]===p.recipient?hash(stamp[0]):null;};
 function allows(j){const at=now();return integer(at)&&at>=p.validFrom&&at<p.validUntil&&j?.provider==='infobip'&&j.sender===p.sender&&j.recipient===p.recipient&&owner(j)===p.ownerAccountKey&&hex(j.eventKey)&&j.kind!=='link_confirmation'&&integer(j.receivedAt)&&j.receivedAt>=p.validFrom&&j.receivedAt<=at&&at-j.receivedAt<=15*60000;}
 async function reserve(c,j){
  if(!allows(j)||c?.signal?.aborted)return false;
  await c.query('INSERT INTO crewcheck_telegram_state (state_key,payload,updated_at) VALUES(?,?,NOW(3)) ON DUPLICATE KEY UPDATE state_key=state_key',[stateKey,JSON.stringify({v:1,kind:'promotional-admission',manifest,used:0})]);
  const [rows]=await c.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE',[stateKey]);const state=parse(rows[0]?.payload);
  if(rows.length!==1||state?.v!==1||state.kind!=='promotional-admission'||state.manifest!==manifest||!integer(state.used)||state.used>=p.maxReplies)return false;
  // Scope is rechecked under the existing dispatch transaction; canonical link
  // and profile locks must already be held. No balance is granted here.
  if(!allows(j)||!await credit.reserve(c,{...j,accountKey:p.ownerAccountKey,channel:'whatsapp'}))return false;
  // Writes may already exist: a false return would commit them in the caller.
  if(!allows(j)||c.signal?.aborted)throw Error('PROMOTIONAL_ADMISSION_EXPIRED');
  const [result]=await c.query('UPDATE crewcheck_telegram_state SET payload=?,updated_at=NOW(3) WHERE state_key=?',[JSON.stringify({...state,used:state.used+1}),stateKey]);
  if(result.affectedRows!==1)throw Error('PROMOTIONAL_ADMISSION_WRITE');
  if(!allows(j)||c.signal?.aborted)throw Error('PROMOTIONAL_ADMISSION_EXPIRED');
  return true;
 }
 return Object.freeze({allows,reserve});
}
