import {createHash} from 'node:crypto';

// Unwired candidate only. Host assertions are not verification of prices,
// billing reconciliation, entitlement or permission to call a provider.
export const CONCIERGE_SHARED_CREDIT_SHIPPING = false;
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export const sharedCreditKey=(kind,parts)=>`cc-concierge-credit-v1:${kind}:${hash(parts)}`;
const int=x=>Number.isSafeInteger(x)&&x>=0;
const parse=value=>{try{return typeof value==='string'?JSON.parse(value):value;}catch{return null;}};
const periodAt=at=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(at);
const insert='INSERT INTO crewcheck_telegram_state (state_key,payload,updated_at) VALUES(?,?,NOW(3)) ON DUPLICATE KEY UPDATE state_key=state_key';
const select='SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE';
const update='UPDATE crewcheck_telegram_state SET payload=?,updated_at=NOW(3) WHERE state_key=?';

export function boundedQuoteReservation(quote,channel,at) {
 if(!quote||quote.currency!=='USD'||quote.channel!==channel||typeof quote.sourceId!=='string'||!quote.sourceId||
  !int(quote.verifiedAt)||at<quote.verifiedAt||at-quote.verifiedAt>15*60_000||
  !int(quote.markupMicroUsd)||!int(quote.setupMicroUsd))return null;
 let charge;
 if(channel==='whatsapp'){
  if(quote.category!=='service-text'||!int(quote.unitMicroUsd)||quote.unitMicroUsd<1||!int(quote.sessionUntil)||at>=quote.sessionUntil)return null;
  charge=quote.unitMicroUsd+quote.setupMicroUsd+quote.markupMicroUsd;
 } else if(channel==='voice'){
  if(!int(quote.unitMicroUsd)||quote.unitMicroUsd<1||!int(quote.quantumSeconds)||quote.quantumSeconds<1||
   !int(quote.maxDurationSeconds)||quote.maxDurationSeconds<1||quote.maxDurationSeconds>120)return null;
  charge=Math.ceil(quote.maxDurationSeconds/quote.quantumSeconds)*quote.unitMicroUsd+quote.setupMicroUsd+quote.markupMicroUsd;
 }else return null;
 return int(charge)&&charge>0?charge:null;
}

export function createSharedCreditCandidate(policy,{resolveTrustedContext,now=Date.now}={}) {
 if(!policy||typeof resolveTrustedContext!=='function'||typeof now!=='function')throw Error('CREDIT_CONFIGURATION');
 const enabled=policy.enabled===true&&policy.budgetApproved===true;
 const budget=policy.monthlyBudgetMicroUsd,programId=policy.programId;
 const channels=Object.freeze([...(Array.isArray(policy.allowedChannels)?policy.allowedChannels:[])]);
 if(enabled&&(!int(budget)||budget<1||typeof programId!=='string'||!programId||programId.length>80||
  !channels.length||channels.some(channel=>!['whatsapp','voice'].includes(channel))))throw Error('CREDIT_CONFIGURATION');
 async function reserve(c,job) {
  if(!enabled)return false;
  // Existing dispatch transaction must already hold canonical binding/profile
  // locks. This callback must read server-owned entitlement and price metadata.
  const resolved=await resolveTrustedContext(c,job),context=resolved?{...resolved,quote:resolved.quote?{...resolved.quote}:null}:null,at=now();
  if(!context||!/^[a-f0-9]{64}$/.test(context.accountKey||'')||context.accountKey!==job?.accountKey||context.linked!==true||context.consent!==true||
   context.bindingStamp!==job?.bindingStamp||context.sender!==job.sender||context.recipient!==job.recipient||
   !/^[a-f0-9]{64}$/.test(job.eventKey||'')||!Number.isSafeInteger(at)||
   !channels.includes(job.channel)||
   context.quote?.sender!==job.sender||context.quote?.country!=='BR')return false;
  const amount=boundedQuoteReservation(context.quote,job.channel,at);if(amount===null)return false;
  const period=periodAt(at),account=context.accountKey;
  const requestKey=sharedCreditKey('request',[programId,job.eventKey]);
  const accountKey=sharedCreditKey('account',[programId,account]);
  const globalKey=sharedCreditKey('global',[programId,period]);
  // No account/global row is minted here. A separate reviewed grant and billing
  // reconciliation path must provision them. Missing state denies, never resets.
  const states=new Map();
  for(const k of [accountKey,globalKey].sort()){
   const [rows]=await c.query(select,[k]);const value=parse(rows[0]?.payload);if(!value)return false;states.set(k,value);
  }
  const a=states.get(accountKey),g=states.get(globalKey);
  const fresh=()=>{const current=now();return Number.isSafeInteger(current)&&current>=at&&!c.signal?.aborted&&periodAt(current)===period&&(a.validFrom===undefined&&a.expiresAt===undefined||(int(a.validFrom)&&int(a.expiresAt)&&current>=a.validFrom&&current<a.expiresAt))&&boundedQuoteReservation(context.quote,job.channel,current)===amount&&int(g?.reconciledAt)&&current>=g.reconciledAt&&current-g.reconciledAt<=15*60_000;};
  if(a.v!==1||a.kind!=='account-credit'||a.accountKey!==account||!int(a.availableMicroUsd)||!int(a.reservedMicroUsd)||
   g.v!==1||g.kind!=='global-credit'||g.period!==period||g.budgetMicroUsd!==budget||
   !int(g.knownSpentMicroUsd)||!int(g.reservedMicroUsd)||g.reconciled!==true||
   !int(g.reconciledAt)||at<g.reconciledAt||at-g.reconciledAt>15*60_000||!fresh())return false;
  await c.query(insert,[requestKey,JSON.stringify({v:1,kind:'credit-request',state:'empty'})]);
  if(!fresh())throw Error('CREDIT_AUTHORIZATION_EXPIRED');
  const [rows]=await c.query(select,[requestKey]);
  if(!fresh())throw Error('CREDIT_AUTHORIZATION_EXPIRED');
  const r=parse(rows[0]?.payload);
  if(r?.v!==1||r.kind!=='credit-request'||r.state!=='empty')return false;
  if(a.availableMicroUsd<amount||g.knownSpentMicroUsd>budget||g.reservedMicroUsd>budget-g.knownSpentMicroUsd||
   amount>budget-g.knownSpentMicroUsd-g.reservedMicroUsd||!int(a.reservedMicroUsd+amount)||!int(g.reservedMicroUsd+amount))return false;
  // Reservation precedes engine/provider I/O, in the same transaction as the
  // preparing marker. No refund/retry method exists, even for failed/uncertain.
  for(const [k,value]of [
   [accountKey,{...a,availableMicroUsd:a.availableMicroUsd-amount,reservedMicroUsd:a.reservedMicroUsd+amount}],
   [globalKey,{...g,reservedMicroUsd:g.reservedMicroUsd+amount}],
   [requestKey,{v:1,kind:'credit-request',state:'reserved',period,accountKey:account,amountMicroUsd:amount,channel:job.channel,quoteSourceId:context.quote.sourceId}],
  ]){
   if(!fresh())throw Error('CREDIT_AUTHORIZATION_EXPIRED');
   const [result]=await c.query(update,[JSON.stringify(value),k]);if(result.affectedRows!==1)throw Error('CREDIT_WRITE');
   if(!fresh())throw Error('CREDIT_AUTHORIZATION_EXPIRED');
  }
  return true;
 }
 return Object.freeze({allows:()=>enabled,reserve});
}
