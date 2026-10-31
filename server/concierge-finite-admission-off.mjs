import {createHash} from 'node:crypto';
import {createSharedCreditCandidate} from './concierge-shared-credit-candidate.mjs';
import {finiteReservePolicy,createFiniteReserveSendGate,finiteCohortPolicy,finiteCohortMemberId,createFiniteCohortSendGate} from './concierge-finite-reserve-off.mjs';
import {paidEntitlementValid} from './concierge-paid-entitlement.mjs';

// Unmounted composition boundary only. No resolver, funding, policy mode,
// transport, environment discovery or authority provisioning is supplied here.
export const FINITE_ADMISSION_SHIPPING=false;
const int=value=>Number.isSafeInteger(value)&&value>=0;
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const owner=(job,p)=>{
 try {
  const stamp=JSON.parse(job?.bindingStamp);
  return Array.isArray(stamp)&&stamp.length===5&&typeof stamp[0]==='string'&&stamp[0]&&
   typeof stamp[1]==='string'&&stamp[1]&&stamp[2]==='infobip'&&stamp[3]===p.sender&&stamp[4]===p.recipient
   ?createHash('sha256').update(stamp[0]).digest('hex'):null;
 } catch {return null;}
};

// The caller owns the existing store transaction and canonical row locks. The
// injected resolver is a trust boundary, NOT derived from the incoming job.
// It must independently validate current identity, consent, grant/revocation
// and recorded financial evidence, without refreshing observed timestamps.
export function createFiniteReserveAdmission(input,{enabled=false,now=Date.now,resolveTrustedContext}={}){
 if(enabled!==true)return Object.freeze({allows:()=>false,reserve:async()=>false,checkSend:async()=>false});
 if(typeof now!=='function'||typeof resolveTrustedContext!=='function')throw Error('FINITE_ADMISSION_CONFIGURATION');
 const p=finiteReservePolicy(input);
 // Share the exact clock and resolver with both phases. The existing finite
 // ledger already counts attempts, so no parallel quantity counter is added.
 const dependencies={now,resolveTrustedContext};
 const credit=createSharedCreditCandidate({enabled:true,budgetApproved:true,programId:p.programId,
  monthlyBudgetMicroUsd:p.monthlyBudgetMicroUsd,allowedChannels:['whatsapp'],finiteReserve:p},dependencies);
 const gate=createFiniteReserveSendGate(p,{...dependencies,enabled:true});
 function allows(job){
  const at=now();
  return int(at)&&at>=p.validFrom&&at<p.validUntil&&at<p.observedTariff.validUntil&&
   job?.provider==='infobip'&&job.kind!=='link_confirmation'&&job.sender===p.sender&&job.recipient===p.recipient&&
   owner(job,p)===p.ownerAccountKey&&hex(job.eventKey)&&int(job.receivedAt)&&job.receivedAt>=p.validFrom&&
   job.receivedAt<=at&&at-job.receivedAt<=900000;
 }
 async function reserve(c,job){
  if(!allows(job)||c?.signal?.aborted)return false;
  if(!await credit.reserve(c,{...job,accountKey:p.ownerAccountKey,channel:'whatsapp'}))return false;
  // Returning false after a successful reservation would commit its writes in
  // dispatchAttempt. Throw instead, retaining the existing rollback contract.
  if(!allows(job)||c.signal?.aborted)throw Error('FINITE_ADMISSION_EXPIRED');
  return true;
 }
 // Must only run behind dispatchAttempt's committed no-retry marker. A final
 // gate denial/uncertain provider result never refunds the reserved attempt.
 return Object.freeze({allows,reserve,checkSend:gate.checkSend});
}

export function createFiniteCohortAdmission(input,{enabled=false,now=Date.now,resolveMemberContext,readMemberEntitlement}={}){
 if(enabled!==true)return Object.freeze({allows:()=>false,reserve:async()=>false,checkSend:async()=>false});
 if(typeof now!=='function'||typeof resolveMemberContext!=='function'||typeof readMemberEntitlement!=='function')throw Error('FINITE_COHORT_ADMISSION');
 const p=finiteCohortPolicy(input),members=new Map(p.members.map(m=>[m.recipient,m]));
 const capabilities=new Map(p.members.map(m=>{
  const id=finiteCohortMemberId(p,m),contexts=new WeakMap(),dependencies={enabled:true,now,resolveTrustedContext:async(c,j)=>{
   const context=await resolveMemberContext(c,j,id);contexts.set(c,context);return context;
  }};
  return [id,{contexts,credit:createSharedCreditCandidate({enabled:true,budgetApproved:true,programId:p.programId,
   monthlyBudgetMicroUsd:p.monthlyBudgetMicroUsd,allowedChannels:['whatsapp'],finiteCohort:p,cohortMemberId:id},dependencies),
   gate:createFiniteCohortSendGate(p,id,dependencies)}];
 }));
 function selected(job){
  const m=members.get(job?.recipient),at=now();
  return m&&int(at)&&at>=p.validFrom&&at<p.validUntil&&at<m.observedTariff.validUntil&&
   job?.provider==='infobip'&&job.kind!=='link_confirmation'&&job.sender===p.sender&&
   owner(job,{...p,recipient:m.recipient})===m.ownerAccountKey&&hex(job.eventKey)&&int(job.receivedAt)&&
   job.receivedAt>=p.validFrom&&job.receivedAt<=at&&at-job.receivedAt<=900000?m:null;
 }
 const afterReserve=(c,job)=>{
  const m=selected(job),context=m&&capabilities.get(finiteCohortMemberId(p,m)).contexts.get(c);
  return Boolean(context)&&paidEntitlementValid(c,context.paidProof,context);
 };
 return Object.freeze({requiresPaidEntitlement:true,allows:job=>Boolean(selected(job)),afterReserve,async reserve(c,job){
  const m=selected(job);if(!m||c?.signal?.aborted)return false;
  const capability=capabilities.get(finiteCohortMemberId(p,m));
  if(!await capability.credit.reserve(c,{...job,accountKey:m.ownerAccountKey,channel:'whatsapp'}))return false;
  if(!afterReserve(c,job)||c.signal?.aborted)throw Error('FINITE_COHORT_EXPIRED');
  return true;
 },async checkSend(c,job,attemptId){
  const m=selected(job);return Boolean(m)&&capabilities.get(finiteCohortMemberId(p,m)).gate.checkSend(c,job,attemptId);
 },async prepareEngine(c,job){
  const m=selected(job);if(!m)return null;
  const context=await readMemberEntitlement(c,job,finiteCohortMemberId(p,m));
  if(!context)return null;
  return Object.freeze({ready:()=>Boolean(selected(job))&&paidEntitlementValid(c,context.paidProof,context)});
 },requestFence(c,job,attemptId,signals,timeoutMs){
  const m=selected(job);return m?capabilities.get(finiteCohortMemberId(p,m)).gate.requestFence(c,job,attemptId,signals,timeoutMs):null;
 }});
}
