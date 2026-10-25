import {createHash} from 'node:crypto';
import {sharedCreditKey} from './concierge-shared-credit-candidate.mjs';
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
 if(p?.v!==1||p.basis!=='explicit-risk-reserve'||p.residualRiskAccepted!==true||p.riskDisclosureVersion!=='provisional-provider-cost-v1'||!text(p.approvalId)||!text(p.evidenceReference)||!text(p.programId)||!hex(p.ownerAccountKey)||!hex(p.grantManifest)||!/^\d{8,15}$/.test(p.sender||'')||!/^\d{8,15}$/.test(p.recipient||'')||!int(p.approvedAt)||!int(p.validFrom)||!int(p.validUntil)||p.approvedAt>p.validFrom||p.validUntil<=p.validFrom||p.validUntil-p.validFrom>7*86400000||period(p.validFrom)!==period(p.validUntil-1)||!int(p.maxAttempts)||p.maxAttempts<1||p.maxAttempts>10000||!int(p.perAttemptMicroUsd)||p.perAttemptMicroUsd<1||!int(p.totalMicroUsd)||p.totalMicroUsd<p.perAttemptMicroUsd||!int(p.maxAttempts*p.perAttemptMicroUsd)||p.maxAttempts*p.perAttemptMicroUsd>p.totalMicroUsd||!int(p.monthlyBudgetMicroUsd)||p.monthlyBudgetMicroUsd<1||p.monthlyBudgetMicroUsd>20000000||p.totalMicroUsd>p.monthlyBudgetMicroUsd||!hex(t?.evidenceSha256)||!int(t?.observedAt)||t.observedAt>p.approvedAt||!int(t?.observedUnitMicroUsd)||t.observedUnitMicroUsd<1||p.perAttemptMicroUsd<t.observedUnitMicroUsd||!hex(b?.evidenceSha256)||!int(b?.observedAt)||b.observedAt>p.approvedAt||!int(b?.knownSpentMicroUsd)||!int(b?.outsideConsumersReserveMicroUsd))throw Error('FINITE_RESERVE_POLICY');
 return p;
}
export const finiteReserveManifest=input=>createHash('sha256').update(JSON.stringify(finiteReservePolicy(input))).digest('hex');
export function finiteReserveAmount(p,context,a,g,j,at){
 const e=g?.finiteReserve,q=context?.quote;
 if(!int(at)||at<p.validFrom||at>=p.validUntil||period(at)!==period(p.validFrom)||j?.channel!=='whatsapp'||j.sender!==p.sender||j.recipient!==p.recipient||j.accountKey!==p.ownerAccountKey||context.accountKey!==p.ownerAccountKey||!int(j.receivedAt)||j.receivedAt>at||at-j.receivedAt>900000||!int(q?.sessionUntil)||at>=q.sessionUntil||q.currency!=='USD'||q.category!=='service-text'||q.country!=='BR'||q.sender!==p.sender||q.evidenceSha256!==p.observedTariff.evidenceSha256||q.verifiedAt!==p.observedTariff.observedAt||q.unitMicroUsd!==p.observedTariff.observedUnitMicroUsd||a?.grantManifest!==p.grantManifest||e?.v!==1||e.kind!=='finite-risk-reserve'||e.status!=='reserved'||e.manifest!==finiteReserveManifest(p)||e.accountKey!==p.ownerAccountKey||e.totalMicroUsd!==p.totalMicroUsd||!int(e.usedMicroUsd)||!int(e.attempts)||e.attempts>=p.maxAttempts||e.usedMicroUsd>p.totalMicroUsd-p.perAttemptMicroUsd||g.period!==period(at)||g.budgetMicroUsd!==p.monthlyBudgetMicroUsd||!int(g.reservedMicroUsd)||g.reservedMicroUsd<p.totalMicroUsd||!int(g.knownSpentMicroUsd)||g.knownSpentMicroUsd+g.reservedMicroUsd+p.observedBudget.outsideConsumersReserveMicroUsd>p.monthlyBudgetMicroUsd)return null;
 return p.perAttemptMicroUsd;
}
// Caller owns the existing transaction and canonical account/profile locks.
// This allocates exposure only; it does not grant user credit or send anything.
export function createFiniteReservePrefunder(input,{enabled=false,now=Date.now}={}){
 if(!enabled)return async()=>({status:'disabled'});
 const p=finiteReservePolicy(input),manifest=finiteReserveManifest(p);
 return async c=>{
  const started=now(),atValid=()=>int(now())&&now()>=started&&now()>=p.validFrom&&now()<p.validUntil&&!c.signal?.aborted;
  if(!atValid())return {status:'denied'};
  const read=async k=>{const [r]=await c.query(select,[k]);return r.length===1?parse(r[0].payload):null;};
  const authority=await read(sharedCreditKey('finite-reserve-authorization',[p.approvalId]));
  if(authority?.v!==1||authority.kind!=='finite-reserve-authorization'||authority.status!=='approved'||authority.manifest!==manifest||authority.evidenceReference!==p.evidenceReference||authority.approvedAt!==p.approvedAt)return {status:'denied'};
  const globalKey=sharedCreditKey('global',[p.programId,period(p.validFrom)]),accountKey=sharedCreditKey('account',[p.programId,p.ownerAccountKey]);
  const rows=new Map();for(const k of [globalKey,accountKey].sort())rows.set(k,await read(k));const g=rows.get(globalKey),a=rows.get(accountKey);
  if(!atValid()||a?.v!==1||a.kind!=='account-credit'||a.accountKey!==p.ownerAccountKey||a.grantManifest!==p.grantManifest||g?.v!==1||g.kind!=='global-credit'||g.budgetMicroUsd!==p.monthlyBudgetMicroUsd||g.period!==period(p.validFrom))return {status:'denied'};
  if(g.finiteReserve)return {status:g.finiteReserve.manifest===manifest?'already-reserved':'denied'};
  // Initial funding requires a genuinely fresh baseline. Later spending uses the
  // explicitly approved finite envelope, not a fabricated fresh observation.
  const fresh=()=>atValid()&&g.reconciled===true&&g.reconciledAt===p.observedBudget.observedAt&&now()>=g.reconciledAt&&now()-g.reconciledAt<=900000&&now()>=p.observedTariff.observedAt&&now()-p.observedTariff.observedAt<=900000;
  if(!fresh()||g.knownSpentMicroUsd!==p.observedBudget.knownSpentMicroUsd||!int(g.reservedMicroUsd)||g.knownSpentMicroUsd+g.reservedMicroUsd+p.totalMicroUsd+p.observedBudget.outsideConsumersReserveMicroUsd>p.monthlyBudgetMicroUsd)return {status:'denied'};
  const value={...g,reservedMicroUsd:g.reservedMicroUsd+p.totalMicroUsd,finiteReserve:{v:1,kind:'finite-risk-reserve',status:'reserved',manifest,accountKey:p.ownerAccountKey,totalMicroUsd:p.totalMicroUsd,usedMicroUsd:0,attempts:0,allocatedAt:started,observedTariffAt:p.observedTariff.observedAt,observedBudgetAt:p.observedBudget.observedAt}};
  const [result]=await c.query(update,[JSON.stringify(value),globalKey]);if(result.affectedRows!==1)throw Error('FINITE_RESERVE_WRITE');if(!fresh())throw Error('FINITE_RESERVE_EXPIRED');return {status:'reserved'};
 };
}
