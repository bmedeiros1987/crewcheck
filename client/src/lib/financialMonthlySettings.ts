import { financialRateOwner, financialRateSession } from './financialStatementLearning';
import { getMe } from './authClient';
import { payrollMonthBounds } from './financialPayrollPeriods';

export type MonthlyFinancialValue={amountMinor:number|null;currency:'BRL';kind:'earning'|'deduction'|'informational';source:'manual'|'reviewed_statement'|'derived_reference';sourceId:string;recurrence:'once'|'monthly'};
export type MonthlyFinancialSettings={schema:1;ownerId:string;month:string;revision:number;closed:boolean;values:Record<string,MonthlyFinancialValue>};
const prefix='crewcheck_financial_month_settings_v1:';
const validField=(key:string)=>/^(fixed_with_co|other_fixed|inss|irrf|other_deductions|rubric_[a-z0-9_]{1,50})$/.test(key);
function validValue(value:MonthlyFinancialValue){return value&&value.currency==='BRL'&&(value.amountMinor===null||(Number.isSafeInteger(value.amountMinor)&&value.amountMinor>=0))&&['earning','deduction','informational'].includes(value.kind)&&['manual','reviewed_statement','derived_reference'].includes(value.source)&&typeof value.sourceId==='string'&&/^[a-zA-Z0-9:._-]{1,160}$/.test(value.sourceId)&&['once','monthly'].includes(value.recurrence);}
function validEntry(field:string,value:MonthlyFinancialValue){return validField(field)&&validValue(value)&&(!['fixed_with_co','other_fixed'].includes(field)||value.kind==='earning')&&(!['inss','irrf','other_deductions'].includes(field)||value.kind==='deduction');}
const key=(owner:string,month:string)=>prefix+encodeURIComponent(owner)+':'+month;

/** A planning operation: only chosen fields change. Missing and explicit zero
 * remain distinct; resetting never erases other rubrics, history or documents. */
export function planMonthlyFinancialEdit(current:MonthlyFinancialSettings,expectedRevision:number,changes:Record<string,MonthlyFinancialValue>,restoreFields:string[]=[]) {
  if(current.closed||current.revision!==expectedRevision||!payrollMonthBounds(current.month)||!Number.isSafeInteger(current.revision)||current.revision<0||current.revision>=Number.MAX_SAFE_INTEGER)return null;
  if(restoreFields.some(field=>!validField(field))||Object.entries(changes).some(([field,value])=>!validEntry(field,value))||restoreFields.some(field=>Object.hasOwn(changes,field)))return null;
  const values={...current.values};
  for(const field of restoreFields)delete values[field];
  for(const [field,value] of Object.entries(changes))values[field]={...value};
  return {...current,revision:current.revision+1,values};
}

/** Account-local configuration. This is not a server/profile synchronization. */
export function readMonthlyFinancialSettings(month:string):MonthlyFinancialSettings|null {
  const owner=financialRateOwner();if(!owner||!payrollMonthBounds(month))return null;
  try{
    const raw=localStorage.getItem(key(owner,month));
    if(!raw)return {schema:1,ownerId:owner,month,revision:0,closed:false,values:{}};
    const item=JSON.parse(raw);
    if(item.schema!==1||item.ownerId!==owner||item.month!==month||!Number.isSafeInteger(item.revision)||item.revision<0||typeof item.closed!=='boolean'||!item.values||typeof item.values!=='object'||Array.isArray(item.values)||Object.entries(item.values).some(([field,value])=>!validEntry(field,value as MonthlyFinancialValue)))return null;
    return item;
  }catch{return null;}
}

/** No identity is read from a PDF. Verify the app's current session using the
 * existing /api/auth/me flow, then recheck ownership immediately before writing.
 * No real call is made by simply importing this module. */
export async function saveMonthlyFinancialEdit(args:{month:string;expectedRevision:number;changes:Record<string,MonthlyFinancialValue>;restoreFields?:string[];expectedSession:string}) {
  const owner=financialRateOwner();
  if(!owner||!args.expectedSession||financialRateSession()!==args.expectedSession||!payrollMonthBounds(args.month))return {saved:false as const,reason:'session_unverified'};
  if(!args.changes||typeof args.changes!=='object'||Array.isArray(args.changes))return {saved:false as const,reason:'invalid_edit'};
  // Freeze the caller's intent before the asynchronous identity check.
  const request={...args,changes:Object.fromEntries(Object.entries(args.changes).map(([field,value])=>[field,{...value}])),restoreFields:[...(args.restoreFields||[])]};
  // This manual editor cannot forge the existing importer's reviewed provenance
  // or auto-adopt a derived floor. Those flows need their own explicit review.
  if(Object.values(request.changes).some(value=>value?.source!=='manual'))return {saved:false as const,reason:'review_flow_required'};
  try{
    const verified=await getMe();
    if(verified.id!==owner||['visitor','guest'].includes(verified.role||'')||financialRateOwner()!==owner||financialRateSession()!==request.expectedSession)return {saved:false as const,reason:'session_changed'};
    const current=readMonthlyFinancialSettings(request.month);
    if(!current)return {saved:false as const,reason:'invalid_record'};
    const next=planMonthlyFinancialEdit(current,request.expectedRevision,request.changes,request.restoreFields);
    if(!next)return {saved:false as const,reason:current.closed?'closed_month':'conflict_or_invalid_edit'};
    localStorage.setItem(key(owner,request.month),JSON.stringify(next));
    window.dispatchEvent(new Event('crewcheck:financial-config-changed'));
    return {saved:true as const,scope:'account_local' as const,month:next.month,revision:next.revision};
  }catch{return {saved:false as const,reason:'verification_or_storage_unavailable'};}
}
