import {createHash} from 'node:crypto';
import {createFiniteReserveAdmission,createFiniteCohortAdmission} from './concierge-finite-admission-off.mjs';
import {finiteCreditPolicy,createFiniteCreditSqlResolver,createFiniteCohortSqlResolver,createFiniteCohortEntitlementReader} from './concierge-finite-credit-sql.mjs';
import {finiteCohortPolicy,finiteCohortMemberId} from './concierge-finite-reserve-off.mjs';
import {CONCIERGE_GLOBAL_BUDGET_PROGRAM,restrictedConciergeCommand} from './infobip-whatsapp-promotional-beta.mjs';

export const INFOBIP_FINITE_BETA_SHIPPING=false;
const fail=()=>{throw Error('INFOBIP_FINITE_POLICY');};
const hash=value=>createHash('sha256').update(value).digest('hex');
const int=value=>Number.isSafeInteger(value)&&value>=0;
const usdMicro=value=>{
 if(typeof value!=='string'||!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(value))fail();
 const [whole,fraction='']=value.split('.'),n=BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'));
 if(n<1n||n>20000000n)fail();return Number(n);
};

// Explicit finite mode only. No stale ordinary-policy fallback, grant writer,
// prefunder, credential discovery, timer or production activation here.
export function createInfobipFiniteBetaScope(configuration,admission,{now=Date.now,trustLegacyPremiumProfile=false}={}){
 if(admission?.finiteCohort!==undefined)return createInfobipFiniteCohortScope(configuration,admission,{now,trustLegacyPremiumProfile});
 if(configuration?.finiteBeta!==true||admission?.enabled!==true||typeof now!=='function'||configuration.operationalPilotRenewal!==undefined||
  [configuration.singleMessageTest,configuration.operationalPilot,configuration.promotionalBeta,
   configuration.canonicalLinkHandshake,configuration.canonicalLinkHandshakeOnly].some(value=>value!==undefined&&value!==false))fail();
 const {finiteReserve:p,grant}=finiteCreditPolicy(admission);
 if(configuration.sender!==p.sender||p.programId!==CONCIERGE_GLOBAL_BUDGET_PROGRAM||p.monthlyBudgetMicroUsd!==20000000)fail();
 const allowsOwner=id=>typeof id==='string'&&hash(id)===p.ownerAccountKey;
 return Object.freeze({allowsOwner,
  acceptEvent:event=>{
   const at=now();
   return int(at)&&at>=p.validFrom&&at<p.validUntil&&at<p.observedTariff.validUntil&&
    event?.sender===p.sender&&event.recipient===p.recipient&&int(event.receivedAt)&&event.receivedAt>=p.validFrom&&
    event.receivedAt<=at&&at-event.receivedAt<=900000&&typeof event.text==='string'&&event.text.length>0&&event.text.length<=600&&!/^\d{6}$/.test(event.text);
  },
  createAdmission:linkHashKey=>createFiniteReserveAdmission(p,{enabled:true,now,
   resolveTrustedContext:createFiniteCreditSqlResolver({finiteReserve:p,grant,linkHashKey,now})}),
  allowsProposal:proposal=>proposal?.sender===p.sender&&proposal.recipient===p.recipient&&typeof proposal.text==='string'&&proposal.text.length<=4000,
  command:restrictedConciergeCommand,
 });
}

export function validateInfobipFinitePolicy(policy){
 if(policy?.version!==1||policy.mode!=='finite-risk-beta-v1'||usdMicro(policy.maxCostUsd)!==policy.admission?.finiteReserve?.totalMicroUsd)fail();
 createInfobipFiniteBetaScope(policy.configuration,policy.admission);return policy;
}

export function createInfobipFiniteCohortScope(configuration,admission,{now=Date.now,trustLegacyPremiumProfile=false}={}){
 if(configuration?.finiteBeta!==true||admission?.enabled!==true||admission.finiteReserve!==undefined||admission.grant!==undefined||
  typeof now!=='function'||configuration.operationalPilotRenewal!==undefined||
  [configuration.singleMessageTest,configuration.operationalPilot,configuration.promotionalBeta,
   configuration.canonicalLinkHandshake,configuration.canonicalLinkHandshakeOnly].some(value=>value!==undefined&&value!==false))fail();
 const p=finiteCohortPolicy(admission.finiteCohort),members=new Map(p.members.map(m=>[m.recipient,m]));
 if(configuration.sender!==p.sender||p.programId!==CONCIERGE_GLOBAL_BUDGET_PROGRAM)fail();
 const owners=new Set(p.members.map(m=>m.ownerAccountKey));
 return Object.freeze({requiresPaidEntitlement:true,allowsOwner:id=>typeof id==='string'&&owners.has(hash(id)),
  acceptEvent:event=>{
   const m=members.get(event?.recipient),at=now();
   return Boolean(m)&&int(at)&&at>=p.validFrom&&at<p.validUntil&&at<m.observedTariff.validUntil&&
    event.sender===p.sender&&int(event.receivedAt)&&event.receivedAt>=p.validFrom&&event.receivedAt<=at&&
    at-event.receivedAt<=900000&&typeof event.text==='string'&&event.text.length>0&&event.text.length<=600&&!/^\d{6}$/.test(event.text);
  },
  createAdmission:linkHashKey=>{
   const dependencies={linkHashKey,now,trustLegacyPremiumProfile};
   const resolvers=new Map(p.members.map(m=>{const id=finiteCohortMemberId(p,m);return [id,createFiniteCohortSqlResolver(p,id,dependencies)];}));
   const readers=new Map(p.members.map(m=>{const id=finiteCohortMemberId(p,m);return [id,createFiniteCohortEntitlementReader(p,id,dependencies)];}));
   return createFiniteCohortAdmission(p,{enabled:true,now,resolveMemberContext:(c,j,id)=>resolvers.get(id)(c,j),readMemberEntitlement:(c,j,id)=>readers.get(id)(c,j)});
  },
  // Existing store builds the proposal from the one sealed inbound job. This
  // scope admits that recipient only; it never enumerates recipients to send.
  allowsProposal:proposal=>proposal?.sender===p.sender&&members.has(proposal.recipient)&&typeof proposal.text==='string'&&proposal.text.length<=4000,
  command:restrictedConciergeCommand,
 });
}
export function validateInfobipFiniteCohortPolicy(policy){
 if(policy?.version!==1||policy.mode!=='finite-risk-cohort-v1'||usdMicro(policy.maxCostUsd)!==policy.admission?.finiteCohort?.totalMicroUsd)fail();
 createInfobipFiniteCohortScope(policy.configuration,policy.admission);return policy;
}
