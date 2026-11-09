import {financialActAt,readFinancialActApplicability,type FinancialActSnapshot} from './financialActApplicability';
import {actPayrollCompetences,ACT_PAYROLL_CYCLE_SOURCE,PAYROLL_CYCLE_SOURCE,payrollMonthBounds} from './financialPayrollPeriods';
import {resolveCrewFunction} from './actRules';

export type FinancialPresetScope={company:'TAM';role:'cabin';basis:'system_default'|'owner_declaration';employmentConfirmed:boolean;allowsMonth:(month:string)=>boolean};
/** Product configuration is not an employment declaration. Unknown roles,
 * incompatible operators and unreadable/revoked owner records never opt in.
 * Roster carrier is only a compatibility check, not proof of employment. */
export function financialPresetScope(roster:{airline?:string;rank?:string},context:FinancialActSnapshot,reread:()=>FinancialActSnapshot=readFinancialActApplicability):FinancialPresetScope|null {
 if(!context.ownerId||context.history?.ownerId!==context.ownerId||!context.isCurrent()||!['ready','missing'].includes(context.state))return null;
 const current=()=>{const live=reread();return context.isCurrent()&&live.isCurrent()&&live.ownerId===context.ownerId&&live.session===context.session&&live.state===context.state&&live.raw===context.raw;};
 if(!current())return null;
 const history=context.history;
 if(!history)return null;
 if(history.events.length){
  return {company:'TAM',role:'cabin',basis:'owner_declaration',employmentConfirmed:false,allowsMonth:month=>{
   const bounds=payrollMonthBounds(month);if(!bounds||!current())return false;
   for(let d=new Date(bounds.start+'T12:00:00Z');d.toISOString().slice(0,10)<=bounds.end;d.setUTCDate(d.getUTCDate()+1)){
    const selection=financialActAt(history,d.toISOString().slice(0,10));
    if(selection.state!=='applicable'||!selection.event.active||selection.event.role!=='cabin')return false;
   }return current();
  }};
 }
 const functionResolution=resolveCrewFunction(roster.rank);
 if(!['LA','TAM','LATAM'].includes(String(roster.airline||'').trim().toUpperCase())||functionResolution.role!=='cabin'||functionResolution.confidence!=='alta')return null;
 return {company:'TAM',role:'cabin',basis:'system_default',employmentConfirmed:false,allowsMonth:month=>Boolean(current()&&payrollMonthBounds(month))};
}

type ReviewedCycle={payrollMonth:string;operationalVariableMonth:string;fixedMonth:string;expectedCreditMonth:string;source:string};
export type PayrollProjectionPeriod=ReviewedCycle&{rateMonth:string;basis:'reviewed_company_cycle'|'system_default'|'owner_declaration'};
/** Period mapping only. It never certifies a tariff, source completeness,
 * individual fixed salary, tax amount, bank credit or paid roster. */
export function payrollProjectionPeriods(months:readonly string[],scope:FinancialPresetScope|null,reviewed:(month:string)=>ReviewedCycle|null):PayrollProjectionPeriod[]{
 return [...new Set(months)].filter(month=>Boolean(payrollMonthBounds(month))).sort().flatMap<PayrollProjectionPeriod>(month=>{
  const personal=reviewed(month);
  if(personal){
   if(personal.operationalVariableMonth!==month||![personal.payrollMonth,personal.fixedMonth,personal.expectedCreditMonth].every(m=>Boolean(payrollMonthBounds(m))))return [];
   return [{...personal,rateMonth:personal.payrollMonth,basis:'reviewed_company_cycle' as const}];
  }
  if(!scope?.allowsMonth(month))return [];
  const cycle=actPayrollCompetences(month,ACT_PAYROLL_CYCLE_SOURCE,PAYROLL_CYCLE_SOURCE);
  return cycle&&cycle.fixedMonth?[{...cycle,fixedMonth:cycle.fixedMonth,source:scope.basis==='system_default'?'system-default:TAM-cabin:ACT-variable:user-informed-fixed-cycle':'owner-financial-scope:ACT-variable:user-informed-fixed-cycle',basis:scope.basis}]:[];
 });
}
