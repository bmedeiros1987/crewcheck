import {finiteReservePolicy,finiteReserveManifest} from './concierge-finite-reserve-off.mjs';
import {createLockedPromotionalGrantReader,promotionalGrantManifest} from './concierge-promotional-credit-sql.mjs';
import {sharedCreditKey} from './concierge-shared-credit-candidate.mjs';

export const FINITE_CREDIT_SQL_SHIPPING=false;
const int=value=>Number.isSafeInteger(value)&&value>=0;
const parse=value=>{try{return typeof value==='string'?JSON.parse(value):value;}catch{return null;}};
const period=at=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(at);
const fail=()=>{throw Error('FINITE_CREDIT_SQL_CONFIGURATION');};
const lock=async(c,key)=>{const [rows]=await c.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE',[key]);return rows.length===1?parse(rows[0].payload):null;};

// Bind two distinct approvals. This validates declarations, never grants credit
// or invents approval/evidence. The SQL reader rechecks their stored authorities.
export function finiteCreditPolicy({finiteReserve,grant}={}){
 const p=finiteReservePolicy(finiteReserve),g=structuredClone(grant);
 const manifest=promotionalGrantManifest(g),t=p.observedTariff;
 if(p.grantManifest!==manifest||g.programId!==p.programId||g.ownerAccountKey!==p.ownerAccountKey||
  g.monthlyBudgetMicroUsd!==p.monthlyBudgetMicroUsd||g.amountMicroUsd!==p.totalMicroUsd||
  g.validFrom>p.validFrom||g.validUntil<p.validUntil||g.approvalId===p.approvalId||
  typeof t.sourceId!=='string'||!t.sourceId.trim()||t.sourceId.length>160||
  !int(t.setupMicroUsd)||!int(t.markupMicroUsd)||!int(t.observedUnitMicroUsd+t.setupMicroUsd+t.markupMicroUsd)||
  t.observedUnitMicroUsd+t.setupMicroUsd+t.markupMicroUsd>p.perAttemptMicroUsd)fail();
 return {finiteReserve:p,grant:g};
}

export function createFiniteCreditSqlResolver({finiteReserve,grant,linkHashKey,now=Date.now}={}){
 const {finiteReserve:p,grant:g}=finiteCreditPolicy({finiteReserve,grant});
 if(typeof now!=='function')fail();
 const manifest=finiteReserveManifest(p),t=p.observedTariff;
 const readGrant=createLockedPromotionalGrantReader({programId:p.programId,approvalId:g.approvalId,ownerAccountKey:p.ownerAccountKey,
  sender:p.sender,recipient:p.recipient,linkHashKey,expectedGrantManifest:p.grantManifest,
  expectedValidFrom:g.validFrom,expectedValidUntil:g.validUntil,now});
 return async(c,j)=>{
  const started=now();
  if(!int(started)||started<p.validFrom||started>=p.validUntil||c?.signal?.aborted)return null;
  const identity=await readGrant(c,j);if(!identity)return null;
  const recorded=await lock(c,sharedCreditKey('tariff',[p.programId,p.sender,'BR','service-text']));
  // Match prefunding/reservation/send order: account (in readGrant), tariff,
  // global, finite authority. Never acquire finite authority before global.
  const global=await lock(c,sharedCreditKey('global',[p.programId,period(p.validFrom)]));
  const authority=await lock(c,sharedCreditKey('finite-reserve-authorization',[p.approvalId]));
  const current=now(),a=identity.account;
  if(!int(current)||current<started||current<identity.at||current<p.validFrom||current>=p.validUntil||
   current<a.validFrom||current>=a.expiresAt||current<j.receivedAt||current-j.receivedAt>900000||c.signal?.aborted)return null;
  if(authority?.v!==1||authority.kind!=='finite-reserve-authorization'||authority.status!=='approved'||authority.manifest!==manifest||
   authority.approvedAt!==p.approvedAt||authority.evidenceReference!==p.evidenceReference)return null;
  if(global?.v!==1||global.kind!=='global-credit'||global.period!==period(current)||global.budgetMicroUsd!==p.monthlyBudgetMicroUsd||
   global.reconciled!==true||global.reconciledAt!==p.observedBudget.observedAt||global.billingEvidenceSha256!==p.observedBudget.evidenceSha256)return null;
  // Original observations are immutable under this approved finite basis.
  // Unlike the ordinary path, their age alone is not new financial authority.
  // Known setup/markup fees are bound too; unknown/outside charges remain an
  // explicit approval/provisioning risk, not a promised provider invoice cap.
  if(recorded?.v!==1||recorded.kind!=='verified-tariff'||recorded.currency!=='USD'||recorded.country!=='BR'||
   recorded.category!=='service-text'||recorded.sender!==p.sender||recorded.recipientHash!==identity.phoneHash||
   recorded.sourceId!==t.sourceId||recorded.evidenceSha256!==t.evidenceSha256||recorded.verifiedAt!==t.observedAt||
   recorded.validUntil!==t.validUntil||current<recorded.verifiedAt||current>=recorded.validUntil||
   recorded.unitMicroUsd!==t.observedUnitMicroUsd||recorded.setupMicroUsd!==t.setupMicroUsd||recorded.markupMicroUsd!==t.markupMicroUsd)return null;
  return {...identity.context,quote:{...recorded,channel:'whatsapp',sessionUntil:j.receivedAt+24*3600000}};
 };
}
