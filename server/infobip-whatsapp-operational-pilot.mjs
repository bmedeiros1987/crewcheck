import {createHash} from 'node:crypto';
import {operationalQuestion} from './concierge/operational-question.mjs';

export const INFOBIP_OPERATIONAL_PILOT_APPROVAL='Sentinel_366aa9592b448191bea5d2f60bebb46a';
export const INFOBIP_OPERATIONAL_PILOT_OWNER_SHA256='05eb7c5842b6db71803338d34f1bc5f45875692da4bbfe76ce647acda8c113e3';
// Opaque manifest of the already consumed, verified approval. It includes the
// exact original window; changing policy fields cannot invent another origin.
export const INFOBIP_OPERATIONAL_PILOT_ORIGIN_SCOPE_SHA256='bee99934a7532c86445ba6fb0682d5165d0b6b7a1f45864d157f7e2be10c6ea6';
export const INFOBIP_OPERATIONAL_PILOT_RECIPIENT_SHA256='a95f7f4c078ba9a1b5d7a27cdd212beb571d1d496a19178d1c070932b09aa5b6';
export const INFOBIP_OPERATIONAL_PILOT_INPUTS=Object.freeze(['menu','qual minha próxima jornada?','q hrs a van me pega no hotel?']);
const commands=new Map([[INFOBIP_OPERATIONAL_PILOT_INPUTS[0],'/menu'],[INFOBIP_OPERATIONAL_PILOT_INPUTS[1],'/proximo'],[INFOBIP_OPERATIONAL_PILOT_INPUTS[2],INFOBIP_OPERATIONAL_PILOT_INPUTS[2]]]);
const fail=()=>{throw Error('INFOBIP_OPERATIONAL_PILOT_POLICY');};
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export const operationalPilotOriginalSnapshot=(configuration,admission)=>({id:admission.id,maxAttempts:admission.maxAttempts,
 validFrom:admission.validFrom,validUntil:admission.validUntil,recipients:[...admission.recipients].sort(),sender:configuration.sender});
// Original quantity identity remains byte-compatible with the deployed ledger.
export const operationalPilotApprovalDigest=(configuration,admission)=>digest({version:1,
 originalDigest:digest(operationalPilotOriginalSnapshot(configuration,admission)),ownerSha256:admission.ownerSha256,
 sender:configuration.sender,baseUrl:configuration.baseUrl,recipients:[...admission.recipients].sort(),
 maxAttempts:3,maxCostMicroUsd:50000,categories:['/menu','/proximo',INFOBIP_OPERATIONAL_PILOT_INPUTS[2]]});

function renewalWindow(configuration,admission) {
 const r=configuration.operationalPilotRenewal;if(r===undefined)return null;
 if(!r||Object.keys(r).sort().join(',')!=='authorizationReference,authorizedAt,expectedRevision,expectedScopeDigest,expectedUsed,revision,validFrom,validUntil,version'||
  r.version!==1||r.revision!==1||r.expectedRevision!==0||r.expectedUsed!==2||
  typeof r.authorizationReference!=='string'||!/^[A-Za-z0-9_.:/-]{1,160}$/.test(r.authorizationReference)||
  !integer(r.authorizedAt)||!integer(r.validFrom)||!integer(r.validUntil)||r.authorizedAt>r.validFrom||
  r.validFrom<admission.validUntil||r.validUntil<=r.validFrom||r.validUntil-r.authorizedAt>900000||
  r.expectedScopeDigest!==operationalPilotApprovalDigest(configuration,admission))fail();
 return Object.freeze({...r});
}
const phone=x=>typeof x==='string'&&/^[1-9]\d{7,14}$/.test(x);
export function operationalPilotCommand(text) {
 if(typeof text!=='string'||text.length>100)return null;
 const value=text.normalize('NFC').trim().toLowerCase().replace(/\s+/g,' ');
 const exact=commands.get(value);if(exact)return exact;
 // Bounded aliases for the same approved pickup category, never general routing.
 // Anchoring excludes negation, multiple requests and instruction suffixes.
 if(!/^(?:q|que) (?:hr|hrs|hora|horas) a van me (?:pega|busca) no hotel\??$/.test(value))return null;
 const question=operationalQuestion(value);
 return question?.kind==='logistics-question'&&question.subject==='pickup'&&question.direction===null
  ? INFOBIP_OPERATIONAL_PILOT_INPUTS[2]:null;
}

// Lower-level explicitly injected production composition is also exercised with
// synthetic recipients. The published caller adds the approved recipient pin.
export function createOperationalPilotScope(configuration,admission,{now=Date.now}={}) {
 const pricing=configuration?.operationalPilotPricing,budget=configuration?.operationalPilotBudget;
 if(configuration?.operationalPilot!==true||!phone(configuration.sender)||configuration.singleMessageTest!==false||
  configuration.canonicalLinkHandshake!==false||configuration.canonicalLinkHandshakeOnly!==false||
  admission?.id!==INFOBIP_OPERATIONAL_PILOT_APPROVAL||admission.maxAttempts!==3||
  typeof admission.ownerSha256!=='string'||! /^[a-f0-9]{64}$/.test(admission.ownerSha256)||
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
 const renewal=renewalWindow(configuration,admission),window=renewal||admission;
 if(pricing.validUntil<window.validUntil||budget.validUntil<window.validUntil)fail();
 const ownerSha256=admission.ownerSha256;
 const allowsOwner=accountId=>typeof accountId==='string'&&accountId.length>0&&createHash('sha256').update(accountId).digest('hex')===ownerSha256;
 const ownsStamp=value=>{try{return allowsOwner(JSON.parse(value)[0]);}catch{return false;}};
 const scope=Object.freeze({recipient:admission.recipients[0],sender:configuration.sender,from:window.validFrom,until:window.validUntil,
  pricing:Object.freeze({...pricing}),budget:Object.freeze({...budget})});
 // Quote/budget fields are operator assertions, not proof of provider billing.
 // Stale/missing evidence denies. No provider I/O, env, grant/reset or DDL here.
 const active=()=>{const at=now();return integer(at)&&at>=scope.from&&at<scope.until&&
  at>=scope.pricing.verifiedAt&&at-scope.pricing.verifiedAt<=900000&&at<scope.pricing.validUntil&&
  at>=scope.budget.verifiedAt&&at-scope.budget.verifiedAt<=900000&&at<scope.budget.validUntil;};
 const command=text=>{const c=operationalPilotCommand(text);return renewal&&c!==INFOBIP_OPERATIONAL_PILOT_INPUTS[2]?null:c;};
 const allows=job=>active()&&job?.sender===scope.sender&&job.recipient===scope.recipient&&
   Number.isSafeInteger(job.receivedAt)&&job.receivedAt>=scope.from&&job.receivedAt<scope.until&&command(job.text)!==null,
  slotKey=job=>'crewcheck-infobip-pilot-v1:'+createHash('sha256').update(JSON.stringify([scope.sender,INFOBIP_OPERATIONAL_PILOT_APPROVAL,scope.recipient,operationalPilotCommand(job.text)])).digest('hex');
 return Object.freeze({
  allows,allowsOwner,renewal,
  async reserve(c,job,reserveQuantity){
   if(!allows(job)||!ownsStamp(job.bindingStamp))return false;
   const key=slotKey(job);
   await c.query('INSERT INTO crewcheck_telegram_state (state_key,payload,updated_at) VALUES(?,?,NOW(3)) ON DUPLICATE KEY UPDATE state_key=state_key',[key,JSON.stringify({v:1,kind:'infobip_operational_pilot_slot',used:false})]);
   const [rows]=await c.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE',[key]);
   let state;try{state=typeof rows[0]?.payload==='string'?JSON.parse(rows[0].payload):rows[0]?.payload;}catch{return false;}
   if(state?.v!==1||state.kind!=='infobip_operational_pilot_slot'||state.used!==false||!allows(job)||!await reserveQuantity(c,job))return false;
   const [updated]=await c.query('UPDATE crewcheck_telegram_state SET payload=?,updated_at=NOW(3) WHERE state_key=?',[JSON.stringify({...state,used:true}),key]);
   if(updated.affectedRows!==1)throw Error('INFOBIP_OPERATIONAL_PILOT_UNAVAILABLE');
   return true;
  },
  command:text=>active()?command(text):null,
  allowsProposal:proposal=>active()&&proposal?.sender===scope.sender&&proposal.recipient===scope.recipient&&ownsStamp(proposal.bindingStamp),
 });
}

export function validateInfobipOperationalPilotPolicy(policy) {
 if(policy?.version!==1||policy.mode!=='operational-pilot-v1'||policy.maxCostUsd!=='0.05')fail();
 createOperationalPilotScope(policy.configuration,policy.admission);
 const recipient=policy.admission.recipients[0];
 if(createHash('sha256').update(recipient).digest('hex')!==INFOBIP_OPERATIONAL_PILOT_RECIPIENT_SHA256)fail();
 if(policy.configuration.operationalPilotRenewal&&(policy.admission.ownerSha256!==INFOBIP_OPERATIONAL_PILOT_OWNER_SHA256||
  operationalPilotApprovalDigest(policy.configuration,policy.admission)!==INFOBIP_OPERATIONAL_PILOT_ORIGIN_SCOPE_SHA256))fail();
 return policy;
}
