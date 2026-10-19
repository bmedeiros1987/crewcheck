import { useSyncExternalStore } from 'react';
import { financialRateSession } from '@/lib/financialStatementLearning';
import { readFinancialSetting, writeFinancialSetting } from '@/lib/financialSettingStore';
import type { SalaryDisplayBasis, SalaryDisplaySummary } from '@/lib/salaryDisplayBasis';
import { useFinancialPrivacy } from './FinancialPrivacy';
import './salary-display-basis.css';
const key='crewcheck_salary_display_basis';
const events=['crewcheck:financial-config-changed','crewcheck:auth-changed','crewcheck:auth-expired','storage'];
function subscribe(listener:()=>void){events.forEach(event=>window.addEventListener(event,listener));return()=>events.forEach(event=>window.removeEventListener(event,listener));}
const snapshot=():SalaryDisplayBasis=>readFinancialSetting(key)==='net'?'net':'gross';
export function useSalaryDisplayBasis(){
 const basis=useSyncExternalStore(subscribe,snapshot,()=> 'gross' as const);
 const session=financialRateSession();
 return {basis,choose:(value:SalaryDisplayBasis)=>writeFinancialSetting(key,value,session)};
}
export function SalaryBasisControl({basis,choose}:{basis:SalaryDisplayBasis;choose:(value:SalaryDisplayBasis)=>unknown}){
 return <fieldset className="cc-salary-basis"><legend>Valor salarial</legend>{(['gross','net'] as const).map(value=><label key={value}><input type="radio" name="salary-display-basis" value={value} checked={basis===value} onChange={()=>choose(value)}/>{value==='gross'?'Bruto':'Líquido'}</label>)}</fieldset>;
}
export function SalaryBasisAmount({summary}:{summary:SalaryDisplaySummary}){
 const privacy=useFinancialPrivacy();
 return <div className="cc-salary-basis-amount" aria-live="polite"><strong>{summary.amount===null?'Não calculável':privacy.amount(new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(summary.amount))}</strong><p>{summary.basis==='gross'?'Bruto':'Líquido'} {summary.complete?'estimado':'a confirmar'}</p>{summary.reason&&<p>{summary.reason}</p>}</div>;
}
