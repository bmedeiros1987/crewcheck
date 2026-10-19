import type { MonthlyFinancialSettings } from './financialMonthlySettings';
export type SalaryDisplayBasis = 'gross' | 'net';
export type SalaryDisplaySummary = {basis:SalaryDisplayBasis;amount:number|null;complete:boolean;reason:string|null};
/** Presentation of one proved composition. No calendar, tariff or tax rules. */
export function salaryDisplaySummary(basis:SalaryDisplayBasis,gross:number|null,earningsComplete:boolean,months:readonly string[],records:readonly (MonthlyFinancialSettings|null)[]):SalaryDisplaySummary {
 const validGross=gross!==null&&Number.isFinite(gross)&&gross>=0&&Number.isSafeInteger(Math.round(gross*100));
 const unavailable=(reason:string):SalaryDisplaySummary=>({basis,amount:null,complete:false,reason});
 if(basis==='gross')return {basis,amount:validGross?gross:null,complete:validGross&&earningsComplete,reason:earningsComplete?null:'Há parcelas salariais a confirmar.'};
 if(!validGross||!earningsComplete)return unavailable('Falta completar os ganhos e fixos desta composição.');
 if(!months.length||months.some(month=>!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))||new Set(months).size!==months.length||months.length!==records.length||new Set(records.filter(Boolean).map(record=>record!.ownerId)).size>1)return unavailable('Falta vincular os descontos à competência desta composição.');
 let deductions=0;
 for(let index=0;index<months.length;index++){
  const record=records[index];
  if(!record||record.month!==months[index])return unavailable('Faltam os descontos da competência '+months[index]+'.');
  for(const [key,label] of [['inss','INSS'],['irrf','IRRF'],['other_deductions','outros descontos']] as const){
   const item=record.values[key];
   if(!item||item.kind!=='deduction'||item.currency!=='BRL'||!Number.isSafeInteger(item.amountMinor)||item.amountMinor===null||item.amountMinor<0)return unavailable('Falta confirmar '+label+' de '+months[index]+'.');
   deductions+=item.amountMinor;
   if(!Number.isSafeInteger(deductions))return unavailable('Valores de descontos inválidos nesta composição.');
  }
 }
 // Same subtraction/clamp as the existing salary engine, in validated cents.
 return {basis,amount:Math.max(0,Math.round(gross!*100)-deductions)/100,complete:true,reason:null};
}
