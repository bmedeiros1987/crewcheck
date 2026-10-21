import { composeSalaryWithDsr } from '../../../shared/financialSalaryDsr.mjs';
import { payrollMonthBounds } from './financialPayrollPeriods';
import type { confirmedPayrollDsrContext } from './financialStatementLearning';
export type SalaryComponentKey='base'|'fixedAdditions'|'production'|'reserve'|'standby'|'chief'|'instructor';
export type SalaryDsrPart={key:SalaryComponentKey;amount:number|null;knownAmount:number|null;complete:boolean};
const keys:SalaryComponentKey[]=['base','fixedAdditions','production','reserve','standby','chief','instructor'];
const cents=(value:number|null)=>value!==null&&Number.isFinite(value)&&value>=0&&Number.isSafeInteger(Math.round(value*100))?Math.round(value*100):null;
let sequence=0;
let active:{isCurrent:()=>boolean}|null=null;
const receipts=new Map<string,{signature:string;revision:number;sourceId:string}>();
/** Ephemeral calculation revision only, not server admission or a persisted payroll revision.
 * Full signatures are compared; the short hash is a display-free source locator only. */
export function salaryDsrReceipt(owner:string,month:string,signature:string,fence:{isCurrent:()=>boolean}){
 if(!owner||!fence.isCurrent())return null;
 if(!active?.isCurrent()){receipts.clear();active=fence;}
 const key=JSON.stringify([owner,month]),prior=receipts.get(key);
 if(prior?.signature===signature)return {revision:prior.revision,sourceId:prior.sourceId};
 let hash=2166136261;for(let i=0;i<signature.length;i++){hash^=signature.charCodeAt(i);hash=Math.imul(hash,16777619);}
 const revision=++sequence,sourceId=`salary-estimate:${month}:${(hash>>>0).toString(16)}:${revision}`;
 receipts.set(key,{signature,revision,sourceId});return {revision,sourceId};
}
/** Consume existing engine results. Partial observations never masquerade as full components.
 * No production/rate/DSR arithmetic is duplicated here; only final monetary conversion. */
export function consumeSalaryDsr(args:{ownerId:string;month:string;receipt:{sourceId:string;revision:number}|null;parts:SalaryDsrPart[];context:ReturnType<typeof confirmedPayrollDsrContext>;isCurrent:()=>boolean}){
 const bounds=payrollMonthBounds(args.month),current=args.isCurrent();
 const scoped=Boolean(current&&args.ownerId&&bounds&&args.receipt);
 const components=keys.map(key=>{const part=args.parts.find(x=>x.key===key),amountMinor=part?.complete?cents(part.amount):null;return {key,amountMinor,currency:'BRL',status:amountMinor===null?'unavailable':'estimated',ownerId:scoped?args.ownerId:'',competence:args.month,sourceId:args.receipt?.sourceId||'',revision:args.receipt?.revision||0,effectiveFrom:bounds?.start||'',effectiveTo:bounds?.end||''};});
 const observedParts=keys.map(key=>{const part=args.parts.find(x=>x.key===key);return {key,amountMinor:scoped&&part?cents(part.knownAmount):null};});
 const values=observedParts.flatMap(x=>x.amountMinor===null?[]:[x.amountMinor]);
 const sum=values.reduce((a,b)=>a+BigInt(b),0n);
 const observedSubtotalMinor=values.length&&sum<=BigInt(Number.MAX_SAFE_INTEGER)?Number(sum):null;
 if(scoped&&!args.isCurrent())return consumeSalaryDsr({...args,isCurrent:()=>false});
 const context=scoped?args.context:null;
 const composition=composeSalaryWithDsr({ownerId:scoped?args.ownerId:'',competence:args.month,revision:args.receipt?.revision||0,components,componentsExcludeDsr:true,profile:context?.profile,basisReview:context?.basisReview,...(context?{reportedDsr:context.reportedDsr}:{})});
 return {composition,components,observedParts,observedSubtotalMinor,sourcePayrollMonth:context?.sourcePayrollMonth||null,sourceOperationalMonth:context?.sourceOperationalMonth||null,inventoryComplete:false as const,ephemeralCalculationRevision:args.receipt?.revision||null,current:scoped&&args.isCurrent(),isCurrent:()=>scoped&&args.isCurrent()};
}
