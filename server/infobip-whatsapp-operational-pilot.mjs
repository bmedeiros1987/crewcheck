import {createHash} from 'node:crypto';

export const INFOBIP_OPERATIONAL_PILOT_APPROVAL='Sentinel_366aa9592b448191bea5d2f60bebb46a';
export const INFOBIP_OPERATIONAL_PILOT_RECIPIENT_SHA256='a95f7f4c078ba9a1b5d7a27cdd212beb571d1d496a19178d1c070932b09aa5b6';
export const INFOBIP_OPERATIONAL_PILOT_INPUTS=Object.freeze(['menu','qual minha próxima jornada?','q hrs a van me pega no hotel?']);
const commands=new Map([[INFOBIP_OPERATIONAL_PILOT_INPUTS[0],'/menu'],[INFOBIP_OPERATIONAL_PILOT_INPUTS[1],'/proximo'],[INFOBIP_OPERATIONAL_PILOT_INPUTS[2],INFOBIP_OPERATIONAL_PILOT_INPUTS[2]]]);
const fail=()=>{throw Error('INFOBIP_OPERATIONAL_PILOT_POLICY');};
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const phone=x=>typeof x==='string'&&/^[1-9]\d{7,14}$/.test(x);
export function operationalPilotCommand(text) {
 if(typeof text!=='string'||text.length>100)return null;
 return commands.get(text.normalize('NFC').trim().toLowerCase())??null;
}

// Lower-level explicitly injected production composition is also exercised with
// synthetic recipients. The published caller adds the approved recipient pin.
export function createOperationalPilotScope(configuration,admission,{now=Date.now}={}) {
 const pricing=configuration?.operationalPilotPricing,budget=configuration?.operationalPilotBudget;
 if(configuration?.operationalPilot!==true||!phone(configuration.sender)||configuration.singleMessageTest!==false||
  configuration.canonicalLinkHandshake!==false||configuration.canonicalLinkHandshakeOnly!==false||
  admission?.id!==INFOBIP_OPERATIONAL_PILOT_APPROVAL||admission.maxAttempts!==3||
  !Array.isArray(admission.recipients)||admission.recipients.length!==1||!phone(admission.recipients[0])||
  !integer(admission.validFrom)||!integer(admission.validUntil)||admission.validUntil<=admission.validFrom||admission.validUntil-admission.validFrom>900000||
  typeof now!=='function'||
  pricing?.currency!=='USD'||pricing.category!=='service-text'||pricing.country!=='BR'||pricing.sender!==configuration.sender||
  !integer(pricing.unitUpperMicroUsd)||pricing.unitUpperMicroUsd<1||pricing.unitUpperMicroUsd*3>50000||
  typeof pricing.sourceId!=='string'||!pricing.sourceId||pricing.sourceId.length>160||
  !integer(pricing.verifiedAt)||!integer(pricing.validUntil)||pricing.validUntil<admission.validUntil||
  budget?.currency!=='USD'||budget.monthlyLimitMicroUsd!==20000000||budget.allChannelsIncluded!==true||
  !integer(budget.remainingMicroUsd)||budget.remainingMicroUsd<50000||budget.remainingMicroUsd>20000000||
  !integer(budget.verifiedAt)||!integer(budget.validUntil)||budget.validUntil<admission.validUntil)fail();
 const scope=Object.freeze({recipient:admission.recipients[0],sender:configuration.sender,from:admission.validFrom,until:admission.validUntil,
  pricing:Object.freeze({...pricing}),budget:Object.freeze({...budget})});
 // Quote/budget fields are operator assertions, not proof of provider billing.
 // Stale/missing evidence denies. No provider I/O, env, grant/reset or DDL here.
 const active=()=>{const at=now();return integer(at)&&at>=scope.from&&at<scope.until&&
  at>=scope.pricing.verifiedAt&&at-scope.pricing.verifiedAt<=900000&&at<scope.pricing.validUntil&&
  at>=scope.budget.verifiedAt&&at-scope.budget.verifiedAt<=900000&&at<scope.budget.validUntil;};
 const allows=job=>active()&&job?.sender===scope.sender&&job.recipient===scope.recipient&&
   Number.isSafeInteger(job.receivedAt)&&job.receivedAt>=scope.from&&job.receivedAt<scope.until&&operationalPilotCommand(job.text)!==null,
  slotKey=job=>'crewcheck-infobip-pilot-v1:'+createHash('sha256').update(JSON.stringify([scope.sender,INFOBIP_OPERATIONAL_PILOT_APPROVAL,scope.recipient,operationalPilotCommand(job.text)])).digest('hex');
 return Object.freeze({
  allows,
  async reserve(c,job,reserveQuantity){
   if(!allows(job))return false;
   const key=slotKey(job);
   await c.query('INSERT INTO crewcheck_telegram_state (state_key,payload,updated_at) VALUES(?,?,NOW(3)) ON DUPLICATE KEY UPDATE state_key=state_key',[key,JSON.stringify({v:1,kind:'infobip_operational_pilot_slot',used:false})]);
   const [rows]=await c.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE',[key]);
   let state;try{state=typeof rows[0]?.payload==='string'?JSON.parse(rows[0].payload):rows[0]?.payload;}catch{return false;}
   if(state?.v!==1||state.kind!=='infobip_operational_pilot_slot'||state.used!==false||!allows(job)||!await reserveQuantity(c,job))return false;
   const [updated]=await c.query('UPDATE crewcheck_telegram_state SET payload=?,updated_at=NOW(3) WHERE state_key=?',[JSON.stringify({...state,used:true}),key]);
   if(updated.affectedRows!==1)throw Error('INFOBIP_OPERATIONAL_PILOT_UNAVAILABLE');
   return true;
  },
  command:text=>active()?operationalPilotCommand(text):null,
  allowsProposal:proposal=>active()&&proposal?.sender===scope.sender&&proposal.recipient===scope.recipient,
 });
}

export function validateInfobipOperationalPilotPolicy(policy) {
 if(policy?.version!==1||policy.mode!=='operational-pilot-v1'||policy.maxCostUsd!=='0.05')fail();
 createOperationalPilotScope(policy.configuration,policy.admission);
 const recipient=policy.admission.recipients[0];
 if(createHash('sha256').update(recipient).digest('hex')!==INFOBIP_OPERATIONAL_PILOT_RECIPIENT_SHA256)fail();
 return policy;
}
