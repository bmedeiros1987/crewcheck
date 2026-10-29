import {PreferenceSwitch} from '../preferences/PreferenceSwitch';
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
 return <fieldset className="cc-salary-basis"><legend>Valor salarial</legend><label><span>Líquido</span><PreferenceSwitch aria-label="Líquido" aria-describedby="salary-basis-hint" checked={basis==='net'} onChange={event=>choose(event.target.checked?'net':'gross')}/></label><small id="salary-basis-hint">{basis==='net'?'Exibindo líquido estimado':'Exibindo bruto estimado'}</small></fieldset>;
}
export function SalaryBasisAmount({summary}:{summary:SalaryDisplaySummary}){
 const privacy=useFinancialPrivacy();
 return <div className="cc-salary-basis-amount" aria-live="polite"><strong>{summary.amount===null?'Não calculável':privacy.amount(new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(summary.amount))}</strong><p>{summary.basis==='gross'?(summary.complete?'bruto estimado':'subtotal bruto estimado'):(summary.complete?'líquido estimado':'líquido a confirmar')}</p>{summary.reason&&<p>{summary.reason}</p>}</div>;
}

/** No PLR rule/competence has been verified in the current calculation flow. */
export function SalaryPlrNotice(){
 return <aside className="cc-salary-plr-note" aria-label="Prévia de PLR"><span>PLR: faltam referências para estimar.</span><details><summary aria-label="Entender a prévia de PLR">?</summary><p>Falta conferir a regra e a competência da PLR. O holerite de dezembro pode complementar ou confirmar os dados, conforme a regra aplicável; o ano de referência ainda precisa ser verificado. Uma estimativa pode ser apresentada antes quando houver fonte e dados suficientes. Nenhum valor ou recebimento é presumido.</p></details></aside>;
}
