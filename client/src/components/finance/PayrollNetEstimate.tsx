import {useState} from 'react';
import {captureAuthSession} from '@/lib/authClient';
import {financialRateSession} from '@/lib/financialStatementLearning';
import {readMonthlyFinancialSettings} from '@/lib/financialMonthlySettings';
import {FINANCIAL_SOURCES} from '@/lib/financialReferenceCatalog';
import {estimateEmployeeInss,estimateMonthlyIrrf} from '@/lib/financialTaxReferences';
import {useFinancialPrivacy} from './FinancialPrivacy';

/** A separate, explicit simulation. Never persists assumptions or changes the ledger. */
export default function PayrollNetEstimate({gross,complete,month,paymentMonth}:{gross:number|null;complete:boolean;month:string;paymentMonth?:string}) {
 const privacy=useFinancialPrivacy(),session=financialRateSession();
 const guard=captureAuthSession(),context=JSON.stringify([session,month,paymentMonth??null,gross,complete]);
 type Approval={guard:ReturnType<typeof captureAuthSession>};
 const [review,setReview]=useState<{context:string;revision:number;approval:Approval|null}>(()=>({context,revision:0,approval:null}));
 // A different amount/period/completeness permanently revokes the old premise,
 // even if props later return to their previous value. Adjust this component's
 // own state before committing its children (no effect/deferred reset window).
 if(review.context!==context)setReview({context,revision:review.revision+1,approval:null});
 const approve=(checked:boolean)=>{if(!session||!guard.isCurrent())return;setReview(current=>!guard.isCurrent()||current.context!==context||current.revision!==review.revision?current:{...current,approval:checked?{guard}:null});};
 const record=readMonthlyFinancialSettings(month),money=(minor:number)=>privacy.amount(new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(minor/100));
 const grossMinor=gross!==null&&Number.isFinite(gross)&&gross>=0&&Number.isSafeInteger(Math.round(gross*100))?Math.round(gross*100):null;
 const valid=grossMinor!==null;
 // A token string can recur after logout, rotation or a rapid A→B→A. The
 // canonical generation fence invalidates the old approval irreversibly.
 const approved=Boolean(session&&review.context===context&&review.approval?.guard.isCurrent());
 const known=(field:string)=>{const value=record?.values[field];return value?.kind==='deduction'&&value.currency==='BRL'&&Number.isSafeInteger(value.amountMinor)&&value.amountMinor!==null&&value.amountMinor>=0?value.amountMinor:null;};
 const inss=known('inss')??(approved&&valid?estimateEmployeeInss({contributionMonth:month,contributionBaseMinor:grossMinor,singleEmploymentConfirmed:true})?.amountMinor??null:null);
 const irrf=known('irrf')??(approved&&valid&&paymentMonth?estimateMonthlyIrrf({paymentMonth,taxableIncomeMinor:grossMinor,mode:'simplified',legalDeductionsMinor:null,ordinaryMonthlyConfirmed:true})?.amountMinor??null:null);
 const other=known('other_deductions');
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
 <label><input type="checkbox" checked={approved} onChange={event=>approve(event.target.checked)}/> Para esta simulação, conferi que o bruto disponível é remuneração mensal tributável e contributiva de um único vínculo. IRRF estimado pela alternativa simplificada, sem somar deduções legais.</label>
 <p>Bruto {complete?'estimado':'parcial'}: {valid?money(grossMinor!):'indisponível'}. INSS: {inss===null?'pendente':money(inss)+(known('inss')===null?' (estimado)':' (revisado)')}. IRRF: {irrf===null?'pendente':money(irrf)+(known('irrf')===null?' (estimado)':' (revisado)')}. Outros: {other===null?'não informados':money(other)}.</p>
 <p>Estimadores tributários disponíveis somente para 2026. Fontes: <a href={FINANCIAL_SOURCES.inss}>INSS</a> e <a href={FINANCIAL_SOURCES.irrf}>Receita Federal</a>. Valores revisados deste mês prevalecem; não há cópia de descontos de outra competência.</p></details>
 </section>;
}
