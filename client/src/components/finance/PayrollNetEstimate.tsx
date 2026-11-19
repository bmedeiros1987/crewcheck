import {useState} from 'react';
import {captureAuthSession} from '@/lib/authClient';
import {financialRateSession} from '@/lib/financialStatementLearning';
import {readMonthlyFinancialSettings, type MonthlyFinancialValue} from '@/lib/financialMonthlySettings';
import {FINANCIAL_SOURCES} from '@/lib/financialReferenceCatalog';
import {estimateEmployeeInss,estimateMonthlyIrrf} from '@/lib/financialTaxReferences';
import {useFinancialPrivacy} from './FinancialPrivacy';

type AuthFence=ReturnType<typeof captureAuthSession>;
const fenceCurrent=(fence:AuthFence|null|undefined)=>{try{return fence?.isCurrent()===true;}catch{return false;}};
const deductionOrigins:Record<MonthlyFinancialValue['source'],string>={
 manual:'informado',reviewed_statement:'holerite revisado',derived_reference:'referência',
};

/** A separate, explicit simulation. Never persists assumptions or changes the ledger. */
export default function PayrollNetEstimate({gross,complete,month,paymentMonth}:{gross:number|null;complete:boolean;month:string;paymentMonth?:string}) {
 const privacy=useFinancialPrivacy(),session=financialRateSession();
 let guard:AuthFence|null=null;try{if(session)guard=captureAuthSession();}catch{/* Storage unavailable: no approval capability. */}
 const record=readMonthlyFinancialSettings(month);
 const known=(field:'inss'|'irrf'|'other_deductions')=>{
  const value=record?.values[field];
  return value?.kind==='deduction'&&value.currency==='BRL'&&Number.isSafeInteger(value.amountMinor)&&value.amountMinor!==null&&value.amountMinor>=0
   ?{amountMinor:value.amountMinor,source:value.source}:null;
 };
 const savedInss=known('inss'),savedIrrf=known('irrf'),savedOther=known('other_deductions');
 const context=JSON.stringify([session,month,paymentMonth??null,gross,complete,record?.revision??null,savedInss,savedIrrf,savedOther]);
 const grossMinor=gross!==null&&Number.isFinite(gross)&&gross>=0&&Number.isSafeInteger(Math.round(gross*100))?Math.round(gross*100):null;
 const valid=grossMinor!==null,canEstimate=complete&&valid&&record!==null&&fenceCurrent(guard);
 type Approval={guard:AuthFence};
 const [review,setReview]=useState<{context:string;revision:number;approval:Approval|null}>(()=>({context,revision:0,approval:null}));
 // A different amount/period/completeness permanently revokes the old premise,
 // even if props later return to their previous value. Adjust this component's
 // own state before committing its children (no effect/deferred reset window).
 if(review.context!==context)setReview({context,revision:review.revision+1,approval:null});
 const approve=(checked:boolean)=>{const captured=guard;if(!canEstimate||!session||!captured)return;setReview(current=>!fenceCurrent(captured)||current.context!==context||current.revision!==review.revision?current:{...current,approval:checked?{guard:captured}:null});};
 const money=(minor:number)=>privacy.amount(new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(minor/100));
 // A token string can recur after logout, rotation or a rapid A→B→A. The
 // canonical generation fence invalidates the old approval irreversibly.
 const approved=Boolean(canEstimate&&session&&review.context===context&&fenceCurrent(review.approval?.guard));
 const inss=savedInss?.amountMinor??(approved?estimateEmployeeInss({contributionMonth:month,contributionBaseMinor:grossMinor,singleEmploymentConfirmed:true})?.amountMinor??null:null);
 const irrf=savedIrrf?.amountMinor??(approved&&paymentMonth?estimateMonthlyIrrf({paymentMonth,taxableIncomeMinor:grossMinor,mode:'simplified',legalDeductionsMinor:null,ordinaryMonthlyConfirmed:true})?.amountMinor??null:null);
 const other=savedOther?.amountMinor??null;
 const described=(minor:number|null,source:MonthlyFinancialValue['source']|undefined,missing='pendente')=>
  minor===null?missing:money(minor)+' ('+(source?deductionOrigins[source]:'estimado')+')';
 const pending=[...(!valid?['Bruto indisponível ou fora da faixa segura']:[]),...(!complete?['Ganhos e fixos incompletos']:[]),...(inss===null?['INSS']:[]),...(irrf===null?['IRRF ou mês de crédito comprovado']:[]),...(other===null?['Outros descontos, antecipações e ajustes pessoais']:[])];
 const deductionsAvailable=inss!==null&&irrf!==null?inss+irrf+(other??0):null;
 const cash=valid&&deductionsAvailable!==null&&Number.isSafeInteger(deductionsAvailable)?grossMinor!-deductionsAvailable:null;
 const subtotal=cash!==null&&Number.isSafeInteger(cash)?cash:null;
 if(valid&&inss!==null&&irrf!==null&&subtotal===null)pending.push('Descontos ou saldo fora da faixa segura');
 return <section className="cc-payroll-net-preview" aria-label="Previsão líquida individual">
 {subtotal!==null&&<p>{pending.length?'Saldo parcial após os descontos disponíveis':'Líquido estimado'}: {money(Math.max(0,subtotal))}. Não confirma pagamento.</p>}
 {!privacy.hidden&&subtotal!==null&&subtotal<0&&<p>Saldo de ajuste negativo: {money(subtotal)}. Os descontos disponíveis excedem o bruto em {money(-subtotal)}; crédito estimado limitado a zero, sem apagar o ajuste a conferir.</p>}
 {pending.length>0&&<p className="cc-payroll-net-pending">Pendente para fechar o líquido: {pending.join('; ')}. Campos ausentes não foram considerados zero.</p>}

 <details className="cc-payroll-net-details"><summary>Ver composição e premissas</summary> <p>Competência dos descontos: {month}. Crédito: {paymentMonth||'mês a confirmar'}. Diárias, férias, 13º e PLR não entram nesta simulação.</p>
 <label><input type="checkbox" disabled={!canEstimate} checked={approved} onChange={event=>approve(event.target.checked)}/> Para esta simulação, conferi que o bruto disponível é remuneração mensal tributável e contributiva de um único vínculo. IRRF estimado pela alternativa simplificada, sem somar deduções legais.</label>
 {!canEstimate&&<p>A simulação de tributos exige bruto completo e dados da competência disponíveis.</p>}
 <p>Bruto {complete?'estimado':'parcial'}: {valid?money(grossMinor!):'indisponível'}. INSS: {described(inss,savedInss?.source)}. IRRF: {described(irrf,savedIrrf?.source)}. Outros: {described(other,savedOther?.source,'não informados')}.</p>
 <p>Estimadores tributários disponíveis somente para 2026. Fontes: <a href={FINANCIAL_SOURCES.inss}>INSS</a> e <a href={FINANCIAL_SOURCES.irrf}>Receita Federal</a>. Valores salvos nesta competência prevalecem.</p></details>
 </section>;
}
