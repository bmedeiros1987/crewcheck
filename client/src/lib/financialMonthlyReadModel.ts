import type {FinancialReadLease} from './financialMonthlyLifecycle';

/** Read-only, disconnected contract. No calculation, persistence or transport.
 * Browser epochs/generations never authorize a Telegram/server read.
 */
export type FinancialReadState='ready'|'legacy_review_required'|'conflict'|'unavailable'|'invalidated';
export type FinancialReadValue={
  field:string; presence:'absent'|'present'; amountMinor:number|null;
  currency:string; category:string; kind:'earning'|'deduction'|'informational';
  source:'manual'|'reviewed_statement'|'derived_reference'; sourceId:string;
  recurrence:'once'|'monthly';
};
export type FinancialReadPeriod={from:string;to:string;timeZone:string};
export type FinancialReadLayer={
  ownerId:string;month:string;revision:number|null;closed:boolean;
  sourceId:string;updatedAt:string|null;values:FinancialReadValue[];
};
export type FinancialReadDocument={
  schema:1;ownerId:string;month:string;
  workPeriod:FinancialReadPeriod|null;
  // Placeholder only: multiple event/currency payment dates remain unresolved.
  // Consumers must not derive dates from competence or this singleton.
  expectedPayment:{date:string;timeZone:string;status:'expected'}|null;
  coverage:{status:'complete'|'partial'|'unknown';categories:string[]};
  monthlyLegacy:FinancialReadLayer|null;globalManual:FinancialReadLayer|null;
};
export type FinancialReadSnapshot={
  state:FinancialReadState;reason:string;authority:'browser-local'|'none';
  scope:{ownerId:string;month:string;generation:string;sessionEpoch:number}|null;
  document:FinancialReadDocument|null;
};
const object=(x:unknown):x is Record<string,unknown>=>Boolean(x)&&typeof x==='object'&&!Array.isArray(x);
const id=(x:unknown):x is string=>typeof x==='string'&&/^[a-zA-Z0-9:._-]{1,160}$/.test(x);
const month=(x:unknown):x is string=>typeof x==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(x);
const date=(x:unknown):x is string=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const zone=(x:unknown)=>{if(typeof x!=='string')return false;try{new Intl.DateTimeFormat('en',{timeZone:x});return true;}catch{return false;}};
const enumString=(x:unknown,allowed:readonly string[]):boolean=>typeof x==='string'&&allowed.includes(x);
const revision=(x:unknown)=>Number.isSafeInteger(x)&&Number(x)>=0&&Number(x)<Number.MAX_SAFE_INTEGER;
function value(x:unknown):boolean {
  if(!object(x)||!id(x.field)||!id(x.category)||!id(x.sourceId)||typeof x.currency!=='string'||!(/^[A-Z]{3}$/).test(x.currency))return false;
  if(!enumString(x.kind,['earning','deduction','informational'])||!enumString(x.source,['manual','reviewed_statement','derived_reference'])||!enumString(x.recurrence,['once','monthly']))return false;
  if(!enumString(x.presence,['absent','present']))return false;
  return x.presence==='absent'?x.amountMinor===null:x.amountMinor===null||(Number.isSafeInteger(x.amountMinor)&&Number(x.amountMinor)>=0);
}
function layer(x:unknown,ownerId:string,reference:string,global:boolean):boolean {
  if(x===null)return true;
  if(!object(x)||x.ownerId!==ownerId||x.month!==reference||!(global?x.revision===null:revision(x.revision))||typeof x.closed!=='boolean'||!id(x.sourceId)||!(x.updatedAt===null||(typeof x.updatedAt==='string'&&Number.isFinite(Date.parse(x.updatedAt)))))return false;
  if(!Array.isArray(x.values)||!x.values.every(value))return false;
  const fields=new Set();
  for(const row of x.values as FinancialReadValue[]){if(fields.has(row.field)||global&&row.source!=='manual')return false;fields.add(row.field);}
  return true;
}
function validDocument(x:unknown,lease:FinancialReadLease):x is FinancialReadDocument {
  if(!object(x)||x.schema!==1||x.ownerId!==lease.ownerId||x.month!==lease.month||!month(x.month))return false;
  if(!layer(x.monthlyLegacy,lease.ownerId,lease.month,false)||!layer(x.globalManual,lease.ownerId,lease.month,true))return false;
  if(x.workPeriod!==null&&(!object(x.workPeriod)||!date(x.workPeriod.from)||!date(x.workPeriod.to)||x.workPeriod.from>x.workPeriod.to||!zone(x.workPeriod.timeZone)))return false;
  if(x.expectedPayment!==null&&(!object(x.expectedPayment)||!date(x.expectedPayment.date)||!zone(x.expectedPayment.timeZone)||x.expectedPayment.status!=='expected'))return false;
  return object(x.coverage)&&enumString(x.coverage.status,['complete','partial','unknown'])&&Array.isArray(x.coverage.categories)&&x.coverage.categories.every(id)&&new Set(x.coverage.categories).size===x.coverage.categories.length;
}
const cleanValue=(x:FinancialReadValue):FinancialReadValue=>({field:x.field,presence:x.presence,amountMinor:x.amountMinor,currency:x.currency,category:x.category,kind:x.kind,source:x.source,sourceId:x.sourceId,recurrence:x.recurrence});
const cleanLayer=(x:FinancialReadLayer|null):FinancialReadLayer|null=>x===null?null:({ownerId:x.ownerId,month:x.month,revision:x.revision,closed:x.closed,sourceId:x.sourceId,updatedAt:x.updatedAt,values:x.values.map(cleanValue)});
const unavailable=(reason:string):FinancialReadSnapshot=>({state:'unavailable',reason,authority:'none',scope:null,document:null});
/** Caller supplies the approved snapshot; no browser-to-server transmission.
 * Missing server authority fails closed even with a valid browser envelope.
 */
export function telegramFinancialRead():FinancialReadSnapshot {
  return unavailable('server_authorized_snapshot_not_integrated');
}
export function createFinancialMonthlyReadAdapter(capturedLease:FinancialReadLease,
  admission?:{isAuthorized:(scope:Readonly<{ownerId:string;month:string}>)=>boolean}) {
  // Capture scalars and fence once; callers cannot retarget this adapter later.
  const lease:FinancialReadLease=Object.freeze({ownerId:capturedLease.ownerId,month:capturedLease.month,
    generation:capturedLease.generation,sessionEpoch:capturedLease.sessionEpoch,
    isCurrent:capturedLease.isCurrent.bind(capturedLease)});
  // Continuity is not authentication. A trusted host must supply admission
  // from its authenticated owner/period context; absent/throw/non-true deny.
  // This seam neither performs login nor treats a retained identity as proof.
  const admit=admission?.isAuthorized;
  const authorized=()=>{try{return admit?.(Object.freeze({ownerId:lease.ownerId,month:lease.month}))===true;}catch{return false;}};
  let serial=0,current:FinancialReadSnapshot=unavailable('not_loaded');
  const invalidated=():FinancialReadSnapshot=>({state:'invalidated',reason:'scope_invalidated',authority:'none',scope:null,document:null});
  const read=()=>!lease.isCurrent()?invalidated():!authorized()?unavailable('authenticated_admission_required'):structuredClone(current);
  return {
    read,
    async load(readSource:()=>Promise<unknown>):Promise<FinancialReadSnapshot>{
      const request=++serial;current=unavailable('loading');
      if(!lease.isCurrent())return invalidated();
      if(!authorized())return unavailable('authenticated_admission_required');
      let input:unknown;
      try{input=await readSource();}catch{if(request===serial)current=unavailable('source_unavailable');return read();}
      if(request!==serial)return unavailable('superseded_load');
      if(!lease.isCurrent())return invalidated();
      if(!authorized())return unavailable('authenticated_admission_required');
      if(!validDocument(input,lease)){current={state:'conflict',reason:'invalid_or_mismatched_document',authority:'none',scope:null,document:null};return read();}
      // Pick only contract fields; never forward auth, raw PDFs or extra payload.
      const document:FinancialReadDocument={schema:1,ownerId:input.ownerId,month:input.month,
        workPeriod:input.workPeriod?{from:input.workPeriod.from,to:input.workPeriod.to,timeZone:input.workPeriod.timeZone}:null,
        expectedPayment:input.expectedPayment?{date:input.expectedPayment.date,timeZone:input.expectedPayment.timeZone,status:'expected'}:null,
        coverage:{status:input.coverage.status,categories:[...input.coverage.categories]},
        monthlyLegacy:cleanLayer(input.monthlyLegacy),globalManual:cleanLayer(input.globalManual)};
      current={state:document.monthlyLegacy?'legacy_review_required':'ready',reason:document.monthlyLegacy?'monthly_v1_adoption_unresolved':'legacy_layers_only_no_canonical_activation',authority:'browser-local',
        scope:{ownerId:lease.ownerId,month:lease.month,generation:lease.generation,sessionEpoch:lease.sessionEpoch},document:structuredClone(document)};
      return read();
    },
  };
}
