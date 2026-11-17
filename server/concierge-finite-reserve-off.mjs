import {createHash,createHmac} from 'node:crypto';
import {sharedCreditKey} from './concierge-shared-credit-candidate.mjs';
import {promotionalGrantManifest,lockCanonicalCreditIdentities} from './concierge-promotional-credit-sql.mjs';
export const FINITE_RESERVE_SHIPPING=false;
const int=n=>Number.isSafeInteger(n)&&n>=0;
const hex=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const text=s=>typeof s==='string'&&s.trim().length>0;
const period=at=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(at);
const parse=x=>{try{return typeof x==='string'?JSON.parse(x):x;}catch{return null;}};
const select='SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE';
const update='UPDATE crewcheck_telegram_state SET payload=?,updated_at=NOW(3) WHERE state_key=?';
export function finiteReservePolicy(input){
 const p=structuredClone(input),t=p?.observedTariff,b=p?.observedBudget;
 if(p?.v!==1||p.basis!=='explicit-risk-reserve'||p.residualRiskAccepted!==true||p.riskDisclosureVersion!=='provisional-provider-cost-v1'||!text(p.approvalId)||!text(p.evidenceReference)||!text(p.programId)||!hex(p.ownerAccountKey)||!hex(p.grantManifest)||!/^\d{8,15}$/.test(p.sender||'')||!/^\d{8,15}$/.test(p.recipient||'')||!int(p.approvedAt)||!int(p.validFrom)||!int(p.validUntil)||p.approvedAt>p.validFrom||p.validUntil<=p.validFrom||p.validUntil-p.validFrom>7*86400000||period(p.validFrom)!==period(p.validUntil-1)||!int(p.maxAttempts)||p.maxAttempts<1||p.maxAttempts>10000||!int(p.perAttemptMicroUsd)||p.perAttemptMicroUsd<1||!int(p.totalMicroUsd)||p.totalMicroUsd<p.perAttemptMicroUsd||!int(p.maxAttempts*p.perAttemptMicroUsd)||p.maxAttempts*p.perAttemptMicroUsd>p.totalMicroUsd||!int(p.monthlyBudgetMicroUsd)||p.monthlyBudgetMicroUsd<1||p.monthlyBudgetMicroUsd>20000000||p.totalMicroUsd>p.monthlyBudgetMicroUsd||!hex(t?.evidenceSha256)||!int(t?.observedAt)||t.observedAt>p.approvedAt||!int(t?.validUntil)||t.validUntil<=t.observedAt||!int(t?.observedUnitMicroUsd)||t.observedUnitMicroUsd<1||p.perAttemptMicroUsd<t.observedUnitMicroUsd||!hex(b?.evidenceSha256)||!int(b?.observedAt)||b.observedAt>p.approvedAt||!int(b?.knownSpentMicroUsd)||!int(b?.outsideConsumersReserveMicroUsd))throw Error('FINITE_RESERVE_POLICY');
 return p;
}
export const finiteReserveManifest=input=>createHash('sha256').update(JSON.stringify(finiteReservePolicy(input))).digest('hex');
export function finiteReserveAmount(p,context,a,g,j,at){
 const e=g?.finiteReserve,q=context?.quote;
 if(!int(at)||at<p.validFrom||at>=p.validUntil||period(at)!==period(p.validFrom)||j?.channel!=='whatsapp'||j.sender!==p.sender||j.recipient!==p.recipient||j.accountKey!==p.ownerAccountKey||context.accountKey!==p.ownerAccountKey||!int(j.receivedAt)||j.receivedAt>at||at-j.receivedAt>900000||!int(q?.sessionUntil)||at>=q.sessionUntil||q.validUntil!==p.observedTariff.validUntil||at>=q.validUntil||q.currency!=='USD'||q.category!=='service-text'||q.country!=='BR'||q.sender!==p.sender||q.evidenceSha256!==p.observedTariff.evidenceSha256||q.verifiedAt!==p.observedTariff.observedAt||q.unitMicroUsd!==p.observedTariff.observedUnitMicroUsd||a?.grantManifest!==p.grantManifest||e?.v!==1||e.kind!=='finite-risk-reserve'||e.status!=='reserved'||e.manifest!==finiteReserveManifest(p)||e.accountKey!==p.ownerAccountKey||e.totalMicroUsd!==p.totalMicroUsd||e.outsideReserveMicroUsd!==p.observedBudget.outsideConsumersReserveMicroUsd||!int(e.usedMicroUsd)||!int(e.attempts)||e.attempts>=p.maxAttempts||e.usedMicroUsd>p.totalMicroUsd-p.perAttemptMicroUsd||g.period!==period(at)||g.budgetMicroUsd!==p.monthlyBudgetMicroUsd||!int(g.reservedMicroUsd)||g.reservedMicroUsd<p.totalMicroUsd+p.observedBudget.outsideConsumersReserveMicroUsd||!int(g.knownSpentMicroUsd)||g.knownSpentMicroUsd+g.reservedMicroUsd>p.monthlyBudgetMicroUsd)return null;
 return p.perAttemptMicroUsd;
}
// Caller owns the existing transaction and canonical account/profile locks.
// All validity checks (authority window, tariff validUntil, observation age)
// use the same injected application clock as the canonical resolver and the
// shared-credit candidate. Database NOW(3) only stamps updated_at; mixing it
// in would create two disagreeing deadlines inside one ledger transaction.
// This allocates exposure only; it does not grant user credit or send anything.
export function createFiniteReservePrefunder(input,{enabled=false,now=Date.now}={}){
 if(!enabled)return async()=>({status:'disabled'});
 const p=finiteReservePolicy(input),manifest=finiteReserveManifest(p);
 return async c=>{
  const started=now(),atValid=()=>int(now())&&now()>=started&&now()>=p.validFrom&&now()<p.validUntil&&!c.signal?.aborted;
  if(!atValid())return {status:'denied'};
  const read=async k=>{const [r]=await c.query(select,[k]);return r.length===1?parse(r[0].payload):null;};
  const globalKey=sharedCreditKey('global',[p.programId,period(p.validFrom)]),accountKey=sharedCreditKey('account',[p.programId,p.ownerAccountKey]);
  // Same order as canonical resolver + reservation: account, tariff, global,
  // finite authority. Never hold global while waiting on the tariff lock.
  const a=await read(accountKey);
  const tariff=await read(sharedCreditKey('tariff',[p.programId,p.sender,'BR','service-text']));
  const g=await read(globalKey);
  const authority=await read(sharedCreditKey('finite-reserve-authorization',[p.approvalId]));
  if(authority?.v!==1||authority.kind!=='finite-reserve-authorization'||authority.status!=='approved'||authority.manifest!==manifest||authority.evidenceReference!==p.evidenceReference||authority.approvedAt!==p.approvedAt)return {status:'denied'};
  if(!atValid()||a?.v!==1||a.kind!=='account-credit'||a.accountKey!==p.ownerAccountKey||a.grantManifest!==p.grantManifest||g?.v!==1||g.kind!=='global-credit'||g.budgetMicroUsd!==p.monthlyBudgetMicroUsd||g.period!==period(p.validFrom))return {status:'denied'};
  if(tariff?.v!==1||tariff.kind!=='verified-tariff'||tariff.currency!=='USD'||tariff.country!=='BR'||tariff.sender!==p.sender||tariff.category!=='service-text'||tariff.evidenceSha256!==p.observedTariff.evidenceSha256||tariff.verifiedAt!==p.observedTariff.observedAt||tariff.unitMicroUsd!==p.observedTariff.observedUnitMicroUsd||tariff.validUntil!==p.observedTariff.validUntil||g.billingEvidenceSha256!==p.observedBudget.evidenceSha256)return {status:'denied'};
  if(g.finiteReserve)return {status:g.finiteReserve.manifest===manifest?'already-reserved':'denied'};
  // Initial funding requires a genuinely fresh baseline. Later spending uses the
  // explicitly approved finite envelope, not a fabricated fresh observation.
  // Tariff validity is its own deadline, independent of observation freshness.
  // It is rechecked after the real UPDATE, so expiry during SQL waits rolls back.
  const fresh=()=>atValid()&&now()<tariff.validUntil&&g.reconciled===true&&g.reconciledAt===p.observedBudget.observedAt&&now()>=g.reconciledAt&&now()-g.reconciledAt<=900000&&now()>=p.observedTariff.observedAt&&now()-p.observedTariff.observedAt<=900000;
  if(!fresh()||g.knownSpentMicroUsd!==p.observedBudget.knownSpentMicroUsd||!int(g.reservedMicroUsd)||g.knownSpentMicroUsd+g.reservedMicroUsd+p.totalMicroUsd+p.observedBudget.outsideConsumersReserveMicroUsd>p.monthlyBudgetMicroUsd)return {status:'denied'};
  const value={...g,reservedMicroUsd:g.reservedMicroUsd+p.totalMicroUsd+p.observedBudget.outsideConsumersReserveMicroUsd,finiteReserve:{v:1,kind:'finite-risk-reserve',status:'reserved',manifest,accountKey:p.ownerAccountKey,totalMicroUsd:p.totalMicroUsd,outsideReserveMicroUsd:p.observedBudget.outsideConsumersReserveMicroUsd,usedMicroUsd:0,attempts:0,allocatedAt:started,observedTariffAt:p.observedTariff.observedAt,observedBudgetAt:p.observedBudget.observedAt}};
  const [result]=await c.query(update,[JSON.stringify(value),globalKey]);if(result.affectedRows!==1)throw Error('FINITE_RESERVE_WRITE');if(!fresh())throw Error('FINITE_RESERVE_EXPIRED');return {status:'reserved'};
 };
}

// Final send gate for the finite basis, OFF by default and wired nowhere. It has
// the shape the production store already calls inside its last transaction,
// right before provider I/O: admission.checkSend(c,job). Every check is redone
// under row locks there and the event's request marker is consumed, so a second
// check denies. Only use it behind the store's committed no-retry 'dispatching'
// marker: that marker, not this one, guarantees a single provider send (if the
// transaction rolls back after a real send, this marker returns to 'reserved',
// which therefore never proves a message was not sent nor allows a refund).
// A denial releases nothing: the reserved credit and attempt stay used.
const finiteJobOwner=(j,p)=>{try{const s=JSON.parse(j?.bindingStamp);return Array.isArray(s)&&s.length===5&&typeof s[0]==='string'&&s[0]&&typeof s[1]==='string'&&s[1]&&s[2]==='infobip'&&s[3]===p.sender&&s[4]===p.recipient?createHash('sha256').update(s[0]).digest('hex'):null;}catch{return null;}};
export function createFiniteReserveSendGate(input,{enabled=false,now=Date.now,resolveTrustedContext}={}){
 if(enabled!==true)return Object.freeze({checkSend:async()=>false});
 const p=finiteReservePolicy(input),manifest=finiteReserveManifest(p);
 if(typeof now!=='function'||typeof resolveTrustedContext!=='function')throw Error('FINITE_SEND_GATE');
 const accountKey=sharedCreditKey('account',[p.programId,p.ownerAccountKey]),tariffKey=sharedCreditKey('tariff',[p.programId,p.sender,'BR','service-text']);
 const authorityKey=sharedCreditKey('finite-reserve-authorization',[p.approvalId]),globalKey=sharedCreditKey('global',[p.programId,period(p.validFrom)]);
 // Deadlines: authority window, message age, service session and approved tariff validity.
 const timely=(at,j,q,since=at)=>int(at)&&at>=since&&at>=p.validFrom&&at<p.validUntil&&period(at)===period(p.validFrom)&&j.receivedAt<=at&&at-j.receivedAt<=900000&&at<q.sessionUntil&&at<p.observedTariff.validUntil;
 return Object.freeze({async checkSend(c,j){
  const started=now();if(!int(started))return false;
  if(c?.signal?.aborted||j?.provider!=='infobip'||j.kind==='link_confirmation'||j.sender!==p.sender||j.recipient!==p.recipient||!hex(j.eventKey)||!int(j.receivedAt)||j.receivedAt<p.validFrom||finiteJobOwner(j,p)!==p.ownerAccountKey)return false;
  const job={...j,accountKey:p.ownerAccountKey,channel:'whatsapp'};
  // Canonical identity: current link, consent and binding, under their own locks.
  const context=await resolveTrustedContext(c,job),q=context?.quote;
  if(context?.linked!==true||context.consent!==true||context.accountKey!==p.ownerAccountKey||context.bindingStamp!==j.bindingStamp||context.sender!==p.sender||context.recipient!==p.recipient
   ||q?.channel!=='whatsapp'||q.currency!=='USD'||q.country!=='BR'||q.category!=='service-text'||q.sender!==p.sender||!int(q.sessionUntil)||q.verifiedAt!==p.observedTariff.observedAt||q.evidenceSha256!==p.observedTariff.evidenceSha256||q.unitMicroUsd!==p.observedTariff.observedUnitMicroUsd||q.validUntil!==p.observedTariff.validUntil||!timely(started,j,q))return false;
  const read=async k=>{const [r]=await c.query(select,[k]);return r.length===1?parse(r[0].payload):null;};
  const requestKey=sharedCreditKey('request',[p.programId,j.eventKey]);
  // Same order as resolver, reservation and prefunding: account, tariff, global, authority, request.
  const a=await read(accountKey),tariff=await read(tariffKey),g=await read(globalKey),authority=await read(authorityKey),r=await read(requestKey),e=g?.finiteReserve,at=now();
  if(!timely(at,j,q,started)||c.signal?.aborted
   ||authority?.v!==1||authority.kind!=='finite-reserve-authorization'||authority.status!=='approved'||authority.manifest!==manifest||authority.evidenceReference!==p.evidenceReference||authority.approvedAt!==p.approvedAt
   ||a?.v!==1||a.kind!=='account-credit'||a.accountKey!==p.ownerAccountKey||a.grantManifest!==p.grantManifest||!int(a.reservedMicroUsd)||a.reservedMicroUsd<p.perAttemptMicroUsd
   ||!(a.validFrom===undefined&&a.expiresAt===undefined||int(a.validFrom)&&int(a.expiresAt)&&at>=a.validFrom&&at<a.expiresAt)
   ||tariff?.v!==1||tariff.kind!=='verified-tariff'||tariff.currency!=='USD'||tariff.country!=='BR'||tariff.category!=='service-text'||tariff.sender!==p.sender||tariff.verifiedAt!==p.observedTariff.observedAt||tariff.evidenceSha256!==p.observedTariff.evidenceSha256||tariff.unitMicroUsd!==p.observedTariff.observedUnitMicroUsd||tariff.validUntil!==p.observedTariff.validUntil
   ||g?.v!==1||g.kind!=='global-credit'||g.reconciled!==true||g.billingEvidenceSha256!==p.observedBudget.evidenceSha256||g.period!==period(at)||g.budgetMicroUsd!==p.monthlyBudgetMicroUsd||!int(g.knownSpentMicroUsd)||!int(g.reservedMicroUsd)||g.reservedMicroUsd<p.totalMicroUsd+p.observedBudget.outsideConsumersReserveMicroUsd||g.knownSpentMicroUsd+g.reservedMicroUsd>p.monthlyBudgetMicroUsd
   ||e?.v!==1||e.kind!=='finite-risk-reserve'||e.status!=='reserved'||e.manifest!==manifest||e.accountKey!==p.ownerAccountKey||e.totalMicroUsd!==p.totalMicroUsd||e.outsideReserveMicroUsd!==p.observedBudget.outsideConsumersReserveMicroUsd||!int(e.attempts)||e.attempts<1||e.attempts>p.maxAttempts||e.usedMicroUsd!==e.attempts*p.perAttemptMicroUsd||e.usedMicroUsd>p.totalMicroUsd
   ||r?.v!==1||r.kind!=='credit-request'||r.state!=='reserved'||r.period!==period(at)||r.accountKey!==p.ownerAccountKey||r.channel!=='whatsapp'||r.amountMicroUsd!==p.perAttemptMicroUsd||r.reservationBasis!=='explicit-risk-reserve'||r.finiteManifest!==manifest)return false;
  // Consume the reservation for this event: a second check (retry, replay or
  // concurrent dispatch) finds it no longer 'reserved' and denies.
  const [result]=await c.query(update,[JSON.stringify({...r,state:'send-authorized',sendAuthorizedAt:at}),requestKey]);
  if(result.affectedRows!==1)throw Error('FINITE_SEND_WRITE');
  // Writes exist now: expiry must roll the transaction back, never return false.
  // Every deadline checked before the write is checked again, account grant included.
  const after=now();
  if(!timely(after,j,q,at)||(a.expiresAt!==undefined&&after>=a.expiresAt)||c.signal?.aborted)throw Error('FINITE_SEND_EXPIRED');
  return true;
 }});
}

// Separate versioned cohort contract. No v1 interpretation, automatic funding,
// member enrollment, new ledger, retry or release of an existing reservation.
export const FINITE_COHORT_SHIPPING=false;
export const FINITE_COHORT_MAX_MEMBERS=8;
const cohortFail=()=>{throw Error('FINITE_COHORT_POLICY');};
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const safeSum=values=>values.reduce((sum,value)=>int(value)&&int(sum+value)?sum+value:NaN,0);
const cohortPhone=value=>typeof value==='string'&&/^[1-9]\d{7,14}$/.test(value);

export function finiteCohortPolicy(input){
 const p=structuredClone(input),b=p?.observedBudget;
 if(p?.v!==2||p.basis!=='explicit-risk-cohort'||p.residualRiskAccepted!==true||
  p.riskDisclosureVersion!=='provisional-provider-cost-v1'||!text(p.approvalId)||p.approvalId.length>100||
  !text(p.evidenceReference)||p.programId!=='crewcheck-concierge-shared-budget-v1'||!cohortPhone(p.sender)||
  p.monthlyBudgetMicroUsd!==20000000||!int(p.approvedAt)||!int(p.validFrom)||!int(p.validUntil)||
  p.approvedAt>p.validFrom||p.validUntil<=p.validFrom||p.validUntil-p.validFrom>7*86400000||
  period(p.validFrom)!==period(p.validUntil-1)||!int(p.totalMicroUsd)||p.totalMicroUsd<1||p.totalMicroUsd>20000000||
  !int(p.maxAttempts)||p.maxAttempts<1||p.maxAttempts>10000||!hex(b?.evidenceSha256)||
  !int(b?.observedAt)||b.observedAt>p.approvedAt||!int(b?.knownSpentMicroUsd)||
  !int(b?.initialReservedMicroUsd)||!int(b?.outsideConsumersReserveMicroUsd)||
  !Array.isArray(p.members)||p.members.length<1||p.members.length>FINITE_COHORT_MAX_MEMBERS)cohortFail();
 const owners=new Set(),phones=new Set(),indices=new Set(),grants=new Set();
 for(const m of p.members){
  const t=m?.observedTariff,g=m?.grant;
  if(!hex(m?.ownerAccountKey)||!cohortPhone(m?.recipient)||!hex(m?.recipientHash)||!hex(m?.bindingHash)||
   !hex(m?.grantManifest)||promotionalGrantManifest(g)!==m.grantManifest||
   g.programId!==p.programId||g.ownerAccountKey!==m.ownerAccountKey||g.monthlyBudgetMicroUsd!==p.monthlyBudgetMicroUsd||
   g.approvalId===p.approvalId||g.validFrom>p.validFrom||g.validUntil<p.validUntil||g.amountMicroUsd!==m.totalMicroUsd||
   !int(m.totalMicroUsd)||m.totalMicroUsd<1||!int(m.perAttemptMicroUsd)||m.perAttemptMicroUsd<1||
   !int(m.maxAttempts)||m.maxAttempts<1||!int(m.maxAttempts*m.perAttemptMicroUsd)||m.maxAttempts*m.perAttemptMicroUsd>m.totalMicroUsd||
   !hex(t?.evidenceSha256)||!text(t?.sourceId)||t.sourceId.length>160||!int(t.observedAt)||t.observedAt>p.approvedAt||
   !int(t.validUntil)||t.validUntil<=t.observedAt||t.validUntil<p.validUntil||
   !int(t.observedUnitMicroUsd)||t.observedUnitMicroUsd<1||!int(t.setupMicroUsd)||!int(t.markupMicroUsd)||
   !int(safeSum([t.observedUnitMicroUsd,t.setupMicroUsd,t.markupMicroUsd]))||
   safeSum([t.observedUnitMicroUsd,t.setupMicroUsd,t.markupMicroUsd])>m.perAttemptMicroUsd||
   owners.has(m.ownerAccountKey)||phones.has(m.recipient)||indices.has(m.recipientHash)||grants.has(g.approvalId))cohortFail();
  owners.add(m.ownerAccountKey);phones.add(m.recipient);indices.add(m.recipientHash);grants.add(g.approvalId);
 }
 if(safeSum(p.members.map(m=>m.totalMicroUsd))!==p.totalMicroUsd||safeSum(p.members.map(m=>m.maxAttempts))!==p.maxAttempts||
  safeSum([b.knownSpentMicroUsd,b.initialReservedMicroUsd,p.totalMicroUsd,b.outsideConsumersReserveMicroUsd])>20000000||
  !int(safeSum([b.knownSpentMicroUsd,b.initialReservedMicroUsd,p.totalMicroUsd,b.outsideConsumersReserveMicroUsd])))cohortFail();
 return p;
}
export const finiteCohortManifest=input=>digest(finiteCohortPolicy(input));
export const finiteCohortMemberId=(p,m)=>digest([p.programId,p.sender,m.ownerAccountKey,m.recipientHash,m.bindingHash,m.grantManifest,m.observedTariff,m.totalMicroUsd,m.perAttemptMicroUsd,m.maxAttempts]);
export const finiteCohortTariffKey=(p,m)=>sharedCreditKey('tariff',[p.programId,p.sender,'BR','service-text',m.recipientHash]);
const cohortTime=(p,at,since=at)=>int(at)&&at>=since&&at>=p.validFrom&&at<p.validUntil&&period(at)===period(p.validFrom);
export const finiteCohortAuthorityValid=(p,a)=>a?.v===2&&a.kind==='finite-reserve-authorization'&&a.status==='approved'&&
 a.manifest===finiteCohortManifest(p)&&a.approvedAt===p.approvedAt&&a.evidenceReference===p.evidenceReference;

export function finiteCohortTariffValid(p,m,q,at){
 const t=m.observedTariff;
 return q?.v===1&&q.kind==='verified-tariff'&&q.currency==='USD'&&q.country==='BR'&&q.category==='service-text'&&
  q.sender===p.sender&&q.recipientHash===m.recipientHash&&q.sourceId===t.sourceId&&q.evidenceSha256===t.evidenceSha256&&
  q.verifiedAt===t.observedAt&&q.validUntil===t.validUntil&&at>=q.verifiedAt&&at<q.validUntil&&
  q.unitMicroUsd===t.observedUnitMicroUsd&&q.setupMicroUsd===t.setupMicroUsd&&q.markupMicroUsd===t.markupMicroUsd;
}
export function finiteCohortAccountValid(m,a,used,at){
 return int(used)&&used<=m.totalMicroUsd&&a?.v===1&&a.kind==='account-credit'&&a.accountKey===m.ownerAccountKey&&
  a.grantApprovalId===m.grant.approvalId&&a.grantManifest===m.grantManifest&&
  a.validFrom===m.grant.validFrom&&a.expiresAt===m.grant.validUntil&&at>=a.validFrom&&at<a.expiresAt&&
  a.availableMicroUsd===m.totalMicroUsd-used&&a.reservedMicroUsd===used;
}
const memberRecord=(p,m)=>({id:finiteCohortMemberId(p,m),accountKey:m.ownerAccountKey,targetHash:m.recipientHash,bindingHash:m.bindingHash,
 grantManifest:m.grantManifest,tariffEvidenceSha256:m.observedTariff.evidenceSha256,totalMicroUsd:m.totalMicroUsd,
 perAttemptMicroUsd:m.perAttemptMicroUsd,maxAttempts:m.maxAttempts,usedMicroUsd:0,attempts:0});

// Validate the entire cohort, not only one member. No missing counter defaults.
export function finiteCohortState(p,g,at){
 const e=g?.finiteReserve,b=p.observedBudget;
 if(!cohortTime(p,at)||g?.v!==1||g.kind!=='global-credit'||g.period!==period(p.validFrom)||g.budgetMicroUsd!==p.monthlyBudgetMicroUsd||
  g.reconciled!==true||g.reconciledAt!==b.observedAt||g.billingEvidenceSha256!==b.evidenceSha256||
  !int(g.knownSpentMicroUsd)||g.knownSpentMicroUsd<b.knownSpentMicroUsd||!int(g.reservedMicroUsd)||
  g.reservedMicroUsd<safeSum([b.initialReservedMicroUsd,p.totalMicroUsd,b.outsideConsumersReserveMicroUsd])||
  !int(g.knownSpentMicroUsd+g.reservedMicroUsd)||g.knownSpentMicroUsd+g.reservedMicroUsd>p.monthlyBudgetMicroUsd||
  e?.v!==2||e.kind!=='finite-risk-cohort'||e.status!=='reserved'||e.manifest!==finiteCohortManifest(p)||
  e.initialReservedMicroUsd!==b.initialReservedMicroUsd||e.totalMicroUsd!==p.totalMicroUsd||
  e.outsideReserveMicroUsd!==b.outsideConsumersReserveMicroUsd||e.maxAttempts!==p.maxAttempts||
  !int(e.allocatedAt)||e.allocatedAt<p.validFrom||e.allocatedAt>at||e.observedTariffAt!==undefined||
  e.observedBudgetAt!==b.observedAt||!Array.isArray(e.members)||e.members.length!==p.members.length||
  !int(e.usedMicroUsd)||!int(e.attempts)||e.usedMicroUsd>p.totalMicroUsd||e.attempts>p.maxAttempts)return null;
 const rows=new Map();
 for(const m of p.members){
  const expected=memberRecord(p,m),matches=e.members.filter(row=>row?.id===expected.id);
  if(matches.length!==1)return null;const row=matches[0];
  for(const field of Object.keys(expected).filter(key=>!['usedMicroUsd','attempts'].includes(key)))if(row[field]!==expected[field])return null;
  if(!int(row.attempts)||row.attempts>m.maxAttempts||!int(row.usedMicroUsd)||
   row.usedMicroUsd!==row.attempts*m.perAttemptMicroUsd||row.usedMicroUsd>m.totalMicroUsd)return null;
  rows.set(row.id,row);
 }
 if(safeSum([...rows.values()].map(r=>r.usedMicroUsd))!==e.usedMicroUsd||safeSum([...rows.values()].map(r=>r.attempts))!==e.attempts)return null;
 return rows;
}
export function finiteCohortAmount(p,m,context,a,g,j,at){
 const row=finiteCohortState(p,g,at)?.get(finiteCohortMemberId(p,m)),q=context?.quote;
 if(!row||!finiteCohortAccountValid(m,a,row.usedMicroUsd,at)||row.attempts>=m.maxAttempts||
  row.usedMicroUsd>m.totalMicroUsd-m.perAttemptMicroUsd||j?.provider!=='infobip'||j.channel!=='whatsapp'||
  j.sender!==p.sender||j.recipient!==m.recipient||j.accountKey!==m.ownerAccountKey||
  context?.accountKey!==m.ownerAccountKey||!int(j.receivedAt)||j.receivedAt<p.validFrom||j.receivedAt>at||at-j.receivedAt>900000||
  !int(q?.sessionUntil)||q.sessionUntil!==j.receivedAt+86400000||at>=q.sessionUntil||!finiteCohortTariffValid(p,m,q,at))return null;
 return m.perAttemptMicroUsd;
}

export function createFiniteCohortPrefunder(input,{enabled=false,now=Date.now,linkHashKey}={}){
 if(enabled!==true)return async()=>({status:'disabled'});
 const p=finiteCohortPolicy(input),manifest=finiteCohortManifest(p),b=p.observedBudget;
 if(typeof now!=='function'||typeof linkHashKey!=='string'||linkHashKey.length<32)cohortFail();
 for(const m of p.members)if(createHmac('sha256',linkHashKey).update(m.recipient).digest('hex')!==m.recipientHash)cohortFail();
 const members=p.members.map(m=>({...m,accountKey:sharedCreditKey('account',[p.programId,m.ownerAccountKey]),
  authorityKey:sharedCreditKey('grant-authorization',[m.grant.approvalId]),receiptKey:sharedCreditKey('grant-receipt',[m.grant.approvalId]),tariffKey:finiteCohortTariffKey(p,m)}));
 return async c=>{
  const started=now(),valid=()=>cohortTime(p,now(),started)&&!c.signal?.aborted;
  if(!valid())return {status:'denied'};
  // All canonical links/profiles precede any financial row, including all
  // members' original proofs. Grants must have committed separately first.
  const identities=await lockCanonicalCreditIdentities(c,members.map(m=>({ownerAccountKey:m.ownerAccountKey,sender:p.sender,recipient:m.recipient,phoneHash:m.recipientHash})));
  if(!identities||!valid())return {status:'denied'};
  if(members.some(m=>createHmac('sha256',linkHashKey).update(identities.get(m.ownerAccountKey).bindingStamp).digest('hex')!==m.bindingHash))return {status:'denied'};
  const records=new Map(),read=async key=>{const [rows]=await c.query(select,[key]);return rows.length===1?parse(rows[0].payload):null;};
  for(const field of ['accountKey','authorityKey','receiptKey','tariffKey']){
   for(const key of members.map(m=>m[field]).sort())records.set(key,await read(key));
   if(!valid())return {status:'denied'};
  }
  const globalKey=sharedCreditKey('global',[p.programId,period(p.validFrom)]),g=await read(globalKey);
  const authority=await read(sharedCreditKey('finite-reserve-authorization',[p.approvalId]));
  if(!valid()||!finiteCohortAuthorityValid(p,authority))return {status:'denied'};
  const hasPrevious=g!==null&&typeof g==='object'&&Object.hasOwn(g,'finiteReserve');
  const rows=hasPrevious?finiteCohortState(p,g,now()):null;
  // Present malformed allocations are conflicts, never an empty slot to fund.
  if(hasPrevious&&!rows)return {status:'denied'};
  const membersValid=()=>members.every(m=>{
   const a=records.get(m.accountKey),auth=records.get(m.authorityKey),receipt=records.get(m.receiptKey),at=now();
   return finiteCohortAccountValid(m,a,rows?.get(finiteCohortMemberId(p,m))?.usedMicroUsd??0,at)&&
    auth?.v===1&&auth.kind==='promotional-grant-authorization'&&auth.status==='approved'&&auth.manifest===m.grantManifest&&
    int(auth.approvedAt)&&auth.approvedAt<=at&&text(auth.evidenceReference)&&receipt?.v===1&&
    receipt.kind==='promotional-grant-receipt'&&receipt.state==='granted'&&receipt.manifest===m.grantManifest&&
    receipt.amountMicroUsd===m.totalMicroUsd&&finiteCohortTariffValid(p,m,records.get(m.tariffKey),at);
  });
  if(!membersValid()||!valid())return {status:'denied'};
  // Even identical replay must prove all current members and complete counters.
  // Revoked/expired/corrupt replay denies without repairing or releasing a hold.
  if(hasPrevious)return {status:'already-reserved'};
  const fresh=()=>valid()&&membersValid()&&now()>=b.observedAt&&now()-b.observedAt<=900000&&
   members.every(m=>now()>=m.observedTariff.observedAt&&now()-m.observedTariff.observedAt<=900000);
  if(g?.v!==1||g.kind!=='global-credit'||g.period!==period(p.validFrom)||g.budgetMicroUsd!==p.monthlyBudgetMicroUsd||
   g.reconciled!==true||g.reconciledAt!==b.observedAt||g.billingEvidenceSha256!==b.evidenceSha256||
   g.reservedMicroUsd!==b.initialReservedMicroUsd||g.knownSpentMicroUsd!==b.knownSpentMicroUsd||!fresh())return {status:'denied'};
  const value={...g,reservedMicroUsd:safeSum([g.reservedMicroUsd,p.totalMicroUsd,b.outsideConsumersReserveMicroUsd]),
   finiteReserve:{v:2,kind:'finite-risk-cohort',status:'reserved',manifest,totalMicroUsd:p.totalMicroUsd,
    initialReservedMicroUsd:b.initialReservedMicroUsd,outsideReserveMicroUsd:b.outsideConsumersReserveMicroUsd,
    maxAttempts:p.maxAttempts,usedMicroUsd:0,attempts:0,members:p.members.map(m=>memberRecord(p,m)),allocatedAt:started,observedBudgetAt:b.observedAt}};
  if(!finiteCohortState(p,value,now()))return {status:'denied'};
  const [result]=await c.query(update,[JSON.stringify(value),globalKey]);
  if(result.affectedRows!==1)throw Error('FINITE_COHORT_WRITE');
  if(!fresh())throw Error('FINITE_COHORT_EXPIRED');
  return {status:'reserved'};
 };
}

export function createFiniteCohortSendGate(input,memberId,{enabled=false,now=Date.now,resolveTrustedContext}={}){
 if(enabled!==true)return Object.freeze({checkSend:async()=>false});
 const p=finiteCohortPolicy(input),m=p.members.find(m=>finiteCohortMemberId(p,m)===memberId);
 if(!m||typeof now!=='function'||typeof resolveTrustedContext!=='function')cohortFail();
 const matches=(at,j,q,since=at)=>cohortTime(p,at,since)&&j?.provider==='infobip'&&j.kind!=='link_confirmation'&&
  j.sender===p.sender&&j.recipient===m.recipient&&hex(j.eventKey)&&int(j.receivedAt)&&j.receivedAt>=p.validFrom&&
  j.receivedAt<=at&&at-j.receivedAt<=900000&&q?.channel==='whatsapp'&&q.sessionUntil===j.receivedAt+86400000&&
  finiteCohortTariffValid(p,m,q,at);
 return Object.freeze({async checkSend(c,j){
  const started=now();if(!cohortTime(p,started)||c?.signal?.aborted)return false;
  const job={...j,accountKey:m.ownerAccountKey,channel:'whatsapp'},context=await resolveTrustedContext(c,job),q=context?.quote;
  if(context?.linked!==true||context.consent!==true||context.accountKey!==m.ownerAccountKey||context.bindingStamp!==j?.bindingStamp||
   context.sender!==p.sender||context.recipient!==m.recipient||!matches(started,j,q))return false;
  const read=async key=>{const [rows]=await c.query(select,[key]);return rows.length===1?parse(rows[0].payload):null;};
  const a=await read(sharedCreditKey('account',[p.programId,m.ownerAccountKey])),tariff=await read(finiteCohortTariffKey(p,m));
  const g=await read(sharedCreditKey('global',[p.programId,period(p.validFrom)]));
  const authority=await read(sharedCreditKey('finite-reserve-authorization',[p.approvalId]));
  const requestKey=sharedCreditKey('request',[p.programId,j.eventKey]),r=await read(requestKey),at=now();
  const row=finiteCohortState(p,g,at)?.get(memberId);
  if(!row||row.attempts<1||!finiteCohortAccountValid(m,a,row.usedMicroUsd,at)||!finiteCohortAuthorityValid(p,authority)||
   !finiteCohortTariffValid(p,m,tariff,at)||!matches(at,j,q,started)||c.signal?.aborted||
   r?.v!==1||r.kind!=='credit-request'||r.state!=='reserved'||r.reservationBasis!=='explicit-risk-cohort'||
   r.cohortManifest!==finiteCohortManifest(p)||r.memberId!==memberId||r.accountKey!==m.ownerAccountKey||
   r.targetHash!==m.recipientHash||r.tariffEvidenceSha256!==m.observedTariff.evidenceSha256||
   r.quoteSourceId!==m.observedTariff.sourceId||r.channel!=='whatsapp'||r.period!==period(at)||r.amountMicroUsd!==m.perAttemptMicroUsd)return false;
  const [result]=await c.query(update,[JSON.stringify({...r,state:'send-authorized',sendAuthorizedAt:at}),requestKey]);
  if(result.affectedRows!==1)throw Error('FINITE_COHORT_WRITE');
  const after=now();if(!matches(after,j,q,at)||!finiteCohortAccountValid(m,a,row.usedMicroUsd,after)||c.signal?.aborted)throw Error('FINITE_COHORT_EXPIRED');
  return true;
 }});
}
