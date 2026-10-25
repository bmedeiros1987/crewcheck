import {createHash} from 'node:crypto';
import {createFiniteReserveAdmission} from './concierge-finite-admission-off.mjs';
import {finiteCreditPolicy,createFiniteCreditSqlResolver} from './concierge-finite-credit-sql.mjs';
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
export function createInfobipFiniteBetaScope(configuration,admission,{now=Date.now}={}){
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
