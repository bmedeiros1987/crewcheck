import type {MonthlyFinancialSettings} from './financialMonthlySettings';
import {payrollMonthBounds} from './financialPayrollPeriods';
type Inputs={basePay:number;baseConfigured:boolean;fixedAdditions:number;fixedAdditionsConfigured?:boolean;inssDeduction:number;irrfDeduction:number;otherDeductions:number;configured:boolean;source:string};
export function applyMonthlySalaryInputs<T extends Inputs>(legacy:T,month:string,record:MonthlyFinancialSettings|null):T&{baseLabel?:string} {
 if(!record||!payrollMonthBounds(month)||record.month!==month)return legacy;
 const value=(key:string,kind:string)=>{const x=record.values[key];return x?.kind===kind&&x.currency==='BRL'&&Number.isSafeInteger(x.amountMinor)&&Number(x.amountMinor)>=0?x.amountMinor!/100:null;};
 const base=value('fixed_with_co','earning'),fixed=value('other_fixed','earning'),inss=value('inss','deduction'),irrf=value('irrf','deduction'),other=value('other_deductions','deduction');
 const has=(key:string)=>Object.hasOwn(record.values,key);
 return {...legacy,basePay:has('fixed_with_co')?(base??0):legacy.basePay,baseConfigured:has('fixed_with_co')?base!==null:legacy.baseConfigured,
  ...(has('fixed_with_co')?{baseLabel:'Fixos da competência (inclui CO)'}:{}),fixedAdditions:has('other_fixed')?(fixed??NaN):legacy.fixedAdditions,fixedAdditionsConfigured:has('other_fixed')?fixed!==null:legacy.fixedAdditionsConfigured,
  inssDeduction:has('inss')?(inss??NaN):legacy.inssDeduction,irrfDeduction:has('irrf')?(irrf??NaN):legacy.irrfDeduction,otherDeductions:has('other_deductions')?(other??NaN):legacy.otherDeductions,
  configured:legacy.configured||base!==null||fixed!==null,source:legacy.source+([base,fixed,inss,irrf,other].some(x=>x!==null)?' · valores pessoais informados para '+month:'')};
}
