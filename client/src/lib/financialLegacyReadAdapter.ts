import type {FinancialReadDocument,FinancialReadLayer,FinancialReadValue} from './financialMonthlyReadModel';

/** Disconnected parser of the existing legacy formats, not a storage reader.
 * Input is a synthetic/captured envelope supplied by a future authorized host.
 * Never imports app readers, touches storage, writes, or derives payment dates.
 */
export const LEGACY_DEDUCTION_KEYS={
  inss:'crewcheck_salary_inss_brl',irrf:'crewcheck_salary_irrf_brl',
  other_deductions:'crewcheck_salary_other_deductions_brl',
} as const;
export type LegacyFinancialCapture={ownerId:string;month:string;monthlyRaw:string|null;
  globalRaw:Record<keyof typeof LEGACY_DEDUCTION_KEYS,string|null>};
export type LegacyReadAdaptation={ok:true;document:FinancialReadDocument}|{ok:false;reason:'invalid_capture'|'invalid_monthly_v1'|'invalid_global_manual'};
const object=(x:unknown):x is Record<string,unknown>=>Boolean(x)&&typeof x==='object'&&!Array.isArray(x);
const member=(x:unknown,list:string[])=>typeof x==='string'&&list.includes(x);
function monthlyValue(field:string,x:unknown):x is Omit<FinancialReadValue,'field'|'presence'|'category'> {
  if(!/^(fixed_with_co|other_fixed|inss|irrf|other_deductions|rubric_[a-z0-9_]{1,50})$/.test(field)||!object(x))return false;
  if(x.currency!=='BRL'||!(x.amountMinor===null||(Number.isSafeInteger(x.amountMinor)&&Number(x.amountMinor)>=0)))return false;
  if(!member(x.kind,['earning','deduction','informational'])||!member(x.source,['manual','reviewed_statement','derived_reference'])||!member(x.recurrence,['once','monthly'])||typeof x.sourceId!=='string'||!(/^[a-zA-Z0-9:._-]{1,160}$/).test(x.sourceId))return false;
  if(['fixed_with_co','other_fixed'].includes(field)&&x.kind!=='earning')return false;
  return !['inss','irrf','other_deductions'].includes(field)||x.kind==='deduction';
}
/** Parse account setting's decimal major units exactly, without floating round.
 * Empty/null-like/negative/exponent/overprecision strings conflict, never zero.
 */
function globalMinor(raw:string):number|null {
  if(raw.length>40||!/^\d+(?:\.\d{1,2})?$/.test(raw))return null;
  const [whole,fraction='']=raw.split('.');
  const minor=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
  return minor<=BigInt(Number.MAX_SAFE_INTEGER)?Number(minor):null;
}
export function adaptLegacyFinancialCapture(input:LegacyFinancialCapture):LegacyReadAdaptation {
  if(!object(input)||typeof input.ownerId!=='string'||!input.ownerId||typeof input.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)||!(input.monthlyRaw===null||typeof input.monthlyRaw==='string')||!object(input.globalRaw))return {ok:false,reason:'invalid_capture'};
  const fields=Object.keys(LEGACY_DEDUCTION_KEYS) as (keyof typeof LEGACY_DEDUCTION_KEYS)[];
  if(Object.keys(input.globalRaw).length!==fields.length||fields.some(field=>!Object.hasOwn(input.globalRaw,field)))return {ok:false,reason:'invalid_capture'};
  let monthlyLegacy:FinancialReadLayer|null=null;
  if(input.monthlyRaw!==null){
    let record:unknown;try{record=JSON.parse(input.monthlyRaw);}catch{return {ok:false,reason:'invalid_monthly_v1'};}
    if(!object(record)||record.schema!==1||record.ownerId!==input.ownerId||record.month!==input.month||!Number.isSafeInteger(record.revision)||Number(record.revision)<0||Number(record.revision)>=Number.MAX_SAFE_INTEGER||typeof record.closed!=='boolean'||!object(record.values))return {ok:false,reason:'invalid_monthly_v1'};
    const values:FinancialReadValue[]=[];
    for(const [field,x] of Object.entries(record.values)){
      if(!monthlyValue(field,x))return {ok:false,reason:'invalid_monthly_v1'};
      values.push({field,presence:'present',amountMinor:x.amountMinor,currency:x.currency,
        category:x.kind==='earning'?'earnings':x.kind==='deduction'?'deductions':'informational',
        kind:x.kind,source:x.source,sourceId:x.sourceId,recurrence:x.recurrence});
    }
    monthlyLegacy={ownerId:input.ownerId,month:input.month,revision:Number(record.revision),closed:record.closed,
      sourceId:'monthly-v1',updatedAt:null,values};
  }
  const globals:FinancialReadValue[]=[];
  for(const field of fields){
    const raw=input.globalRaw[field];
    if(raw!==null&&typeof raw!=='string')return {ok:false,reason:'invalid_global_manual'};
    const amountMinor=raw===null?null:globalMinor(raw);
    if(raw!==null&&amountMinor===null)return {ok:false,reason:'invalid_global_manual'};
    globals.push({field,presence:raw===null?'absent':'present',amountMinor,currency:'BRL',category:'deductions',
      kind:'deduction',source:'manual',sourceId:'legacy-global:'+LEGACY_DEDUCTION_KEYS[field],recurrence:'unknown'});
  }
  return {ok:true,document:{schema:1,ownerId:input.ownerId,month:input.month,workPeriod:null,expectedPayment:null,
    coverage:{status:'unknown',categories:['deductions','earnings','informational']},monthlyLegacy,
    globalManual:{ownerId:input.ownerId,month:input.month,revision:null,closed:false,sourceId:'global-manual-v1',updatedAt:null,values:globals}}};
}
