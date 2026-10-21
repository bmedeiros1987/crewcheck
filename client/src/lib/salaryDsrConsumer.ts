import { decimalToMinor } from '../../../shared/financialMoney.mjs';
import { composeSalaryWithDsr } from '../../../shared/financialSalaryDsr.mjs';
import { payrollMonthBounds } from './financialPayrollPeriods';
import type { confirmedPayrollDsrContext } from './financialStatementLearning';
export type SalaryComponentKey='base'|'fixedAdditions'|'production'|'reserve'|'standby'|'chief'|'instructor';
export type SalaryDsrPart={key:SalaryComponentKey;amount:number|null;knownAmount:number|null;complete:boolean};
const keys:SalaryComponentKey[]=['base','fixedAdditions','production','reserve','standby','chief','instructor'];
// Match existing salary moneyBRL presentation at the final component boundary.
// This is estimated projection precision, not an ACT rounding rule or a printed value.
const finalAmountFormat=new Intl.NumberFormat('en-US',{useGrouping:false,minimumFractionDigits:2,maximumFractionDigits:2});
const cents=(value:number|null)=>value!==null&&Number.isFinite(value)&&value>=0?decimalToMinor(finalAmountFormat.format(value),'BRL'):null;
/** Sector additions use their own evidence, independently of geographic KM. */
export function observedSalaryFlightSubtotal(rows:ReadonlyArray<{production:number;chief:number;instructor:number;distanceKnown:boolean;timeKnown:boolean;chiefEligible:boolean;instructorEvidence?:boolean}>,key:'production'|'chief'|'instructor'){
 const known=rows.filter(row=>(key==='production'?row.distanceKnown&&row.timeKnown:key==='chief'?row.chiefEligible===true:row.instructorEvidence===true)&&Number.isFinite(row[key])&&row[key]>=0);
 return known.length?known.reduce((sum,row)=>sum+row[key],0):null;
}
let sequence=0;
let active:{isCurrent:()=>boolean}|null=null;
const receipts=new Map<string,{signature:string;revision:number;sourceId:string}>();
/** Ephemeral calculation revision only, not server admission or a persisted payroll revision.
 * Full signatures are compared; the short hash is a display-free source locator only. */
export function salaryDsrReceipt(owner:string,month:string,signature:string,fence:{isCurrent:()=>boolean},scope='forecast'){
 const isCurrent=fence.isCurrent;
 if(!owner||!isCurrent())return null;
 if(!active?.isCurrent()){receipts.clear();active={isCurrent};}
 const key=JSON.stringify([owner,month,scope]),prior=receipts.get(key);
 let record=prior;
 if(!record||record.signature!==signature){
  let hash=2166136261;for(let i=0;i<signature.length;i++){hash^=signature.charCodeAt(i);hash=Math.imul(hash,16777619);}
  const revision=++sequence,sourceId=`salary-estimate:${month}:${(hash>>>0).toString(16)}:${revision}`;
  record=Object.freeze({signature,revision,sourceId});receipts.set(key,record);
 }
 const captured=record;
 return Object.freeze({revision:captured.revision,sourceId:captured.sourceId,ownerId:owner,competence:month,scope,isCurrent:()=>isCurrent()&&receipts.get(key)===captured});
}
/** Consume existing engine results. Partial observations never masquerade as full components.
 * No production/rate/DSR arithmetic is duplicated here; only final monetary conversion. */
export function consumeSalaryDsr(args:{ownerId:string;month:string;receipt:ReturnType<typeof salaryDsrReceipt>;parts:SalaryDsrPart[];context:ReturnType<typeof confirmedPayrollDsrContext>;isCurrent:()=>boolean}){
 const bounds=payrollMonthBounds(args.month),current=args.isCurrent()&&args.receipt?.isCurrent()===true&&args.receipt.ownerId===args.ownerId&&args.receipt.competence===args.month;
 const scoped=Boolean(current&&args.ownerId&&bounds&&args.receipt);
 const components=keys.map(key=>{const part=args.parts.find(x=>x.key===key),amountMinor=part?.complete?cents(part.amount):null;return {key,amountMinor,currency:'BRL',status:amountMinor===null?'unavailable':'estimated',ownerId:scoped?args.ownerId:'',competence:args.month,sourceId:args.receipt?.sourceId||'',revision:args.receipt?.revision||0,effectiveFrom:bounds?.start||'',effectiveTo:bounds?.end||''};});
 const observedParts=keys.map(key=>{const part=args.parts.find(x=>x.key===key);return {key,amountMinor:scoped&&part?cents(part.knownAmount):null};});
 const values=observedParts.flatMap(x=>x.amountMinor===null?[]:[x.amountMinor]);
 const sum=values.reduce((a,b)=>a+BigInt(b),0n);
 const observedSubtotalMinor=values.length&&sum<=BigInt(Number.MAX_SAFE_INTEGER)?Number(sum):null;
 if(scoped&&(!args.isCurrent()||!args.receipt?.isCurrent()))return consumeSalaryDsr({...args,isCurrent:()=>false});
 const context=scoped?args.context:null;
 const composition=composeSalaryWithDsr({ownerId:scoped?args.ownerId:'',competence:args.month,revision:args.receipt?.revision||0,components,componentsExcludeDsr:true,profile:context?.profile,basisReview:context?.basisReview,...(context?{reportedDsr:context.reportedDsr}:{})});
 return {composition,components,observedParts,observedSubtotalMinor,sourcePayrollMonth:context?.sourcePayrollMonth||null,sourceOperationalMonth:context?.sourceOperationalMonth||null,inventoryComplete:false as const,ephemeralCalculationRevision:args.receipt?.revision||null,current:scoped&&args.isCurrent()&&args.receipt?.isCurrent()===true,isCurrent:()=>scoped&&args.isCurrent()&&args.receipt?.isCurrent()===true};
}
