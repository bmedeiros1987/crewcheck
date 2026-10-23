import {useState} from 'react';
import {financialRateSession} from '@/lib/financialStatementLearning';
import {readMonthlyFinancialSettings} from '@/lib/financialMonthlySettings';
import {FINANCIAL_SOURCES} from '@/lib/financialReferenceCatalog';
import {estimateEmployeeInss,estimateMonthlyIrrf} from '@/lib/financialTaxReferences';
import {useFinancialPrivacy} from './FinancialPrivacy';

/** A separate, explicit simulation. Never persists assumptions or changes the ledger. */
export default function PayrollNetEstimate({gross,complete,month,paymentMonth}:{gross:number|null;complete:boolean;month:string;paymentMonth?:string}) {
 const privacy=useFinancialPrivacy(),session=financialRateSession();
 const [consent,setConsent]=useState<string|null>(null);
 const record=readMonthlyFinancialSettings(month),money=(minor:number)=>privacy.amount(new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(minor/100));
 const valid=gross!==null&&Number.isFinite(gross)&&gross>=0;
 const approved=Boolean(session&&consent===session+':'+month+':'+paymentMonth+':'+gross);
 const known=(field:string)=>{const value=record?.values[field];return value?.kind==='deduction'&&value.currency==='BRL'&&Number.isSafeInteger(value.amountMinor)&&value.amountMinor!==null&&value.amountMinor>=0?value.amountMinor:null;};
 const inss=known('inss')??(approved&&valid?estimateEmployeeInss({contributionMonth:month,contributionBaseMinor:Math.round(gross!*100),singleEmploymentConfirmed:true})?.amountMinor??null:null);
 const irrf=known('irrf')??(approved&&valid&&paymentMonth?estimateMonthlyIrrf({paymentMonth,taxableIncomeMinor:Math.round(gross!*100),mode:'simplified',legalDeductionsMinor:null,ordinaryMonthlyConfirmed:true})?.amountMinor??null:null);
 const other=known('other_deductions');
 const pending=[...(!complete?['Ganhos e fixos incompletos']:[]),...(inss===null?['INSS']:[]),...(irrf===null?['IRRF ou mês de crédito comprovado']:[]),...(other===null?['Outros descontos, antecipações e ajustes pessoais']:[])];
 const subtotal=valid&&inss!==null&&irrf!==null?Math.round(gross!*100)-inss-irrf-(other??0):null;
 return <section aria-label="Previsão líquida individual"><h4>Previsão líquida · {month}</h4>
 <p>Competência dos descontos: {month}. Crédito: {paymentMonth||'mês a confirmar'}. Diárias, férias, 13º e PLR não entram nesta simulação.</p>
 <label><input type="checkbox" checked={approved} onChange={event=>setConsent(event.target.checked?session+':'+month+':'+paymentMonth+':'+gross:null)}/> Para esta simulação, conferi que o bruto disponível é remuneração mensal tributável e contributiva de um único vínculo. IRRF estimado pela alternativa simplificada, sem somar deduções legais.</label>
 <p>Bruto {complete?'estimado':'parcial'}: {valid?money(Math.round(gross!*100)):'indisponível'}. INSS: {inss===null?'pendente':money(inss)+(known('inss')===null?' (estimado)':' (revisado)')}. IRRF: {irrf===null?'pendente':money(irrf)+(known('irrf')===null?' (estimado)':' (revisado)')}. Outros: {other===null?'não informados':money(other)}.</p>
 {subtotal!==null&&<p>{pending.length?'Saldo parcial após os descontos disponíveis':'Líquido estimado'}: {money(subtotal)}. Não confirma pagamento.</p>}
 {pending.length>0&&<p>Pendente para fechar o líquido: {pending.join('; ')}. Campos ausentes não foram considerados zero.</p>}
 <p>Estimadores tributários disponíveis somente para 2026. Fontes: <a href={FINANCIAL_SOURCES.inss}>INSS</a> e <a href={FINANCIAL_SOURCES.irrf}>Receita Federal</a>. Valores revisados deste mês prevalecem; não há cópia de descontos de outra competência.</p>
 </section>;
}
