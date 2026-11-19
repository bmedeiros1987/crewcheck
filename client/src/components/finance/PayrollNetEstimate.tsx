import {useState} from 'react';
import {captureAuthSession} from '@/lib/authClient';
import {financialRateSession} from '@/lib/financialStatementLearning';
import {readMonthlyFinancialSettings, type MonthlyFinancialValue} from '@/lib/financialMonthlySettings';
import {FINANCIAL_SOURCES} from '@/lib/financialReferenceCatalog';
import {employeeTaxReference,estimateEmployeeInss,estimateMonthlyIrrf} from '@/lib/financialTaxReferences';
import {useFinancialPrivacy} from './FinancialPrivacy';
import {SalaryBasisAmount} from './SalaryDisplayBasis';

type AuthFence=ReturnType<typeof captureAuthSession>;
const fenceCurrent=(fence:AuthFence|null|undefined)=>{try{return fence?.isCurrent()===true;}catch{return false;}};
const deductionOrigins:Record<MonthlyFinancialValue['source'],string>={
 manual:'informado',reviewed_statement:'holerite revisado',derived_reference:'referência',
};
const emptyBases={inss:'',irrf:''};
const baseMinor=(value:string,grossMinor:number|null)=>{
 if(grossMinor===null||!/^\d+(?:[.,]\d{1,2})?$/.test(value))return null;
 const minor=Math.round(Number(value.replace(',','.'))*100);
 return Number.isSafeInteger(minor)&&minor<=grossMinor?minor:null;
};

/** A separate, explicit simulation. Never persists assumptions or changes the ledger. */
export default function PayrollNetEstimate({gross,complete,month,paymentMonth,compositionKey,earningsIssue}:{gross:number|null;complete:boolean;month:string;paymentMonth?:string;compositionKey:string;earningsIssue?:string}) {
 const privacy=useFinancialPrivacy(),session=financialRateSession();
 let guard:AuthFence|null=null;try{if(session)guard=captureAuthSession();}catch{/* Storage unavailable: no approval capability. */}
 const record=readMonthlyFinancialSettings(month);
 const known=(field:'inss'|'irrf'|'other_deductions')=>{
  const value=record?.values[field];
  return value?.kind==='deduction'&&value.currency==='BRL'&&Number.isSafeInteger(value.amountMinor)&&value.amountMinor!==null&&value.amountMinor>=0
   ?{amountMinor:value.amountMinor,source:value.source}:null;
 };
 const savedInss=known('inss'),savedIrrf=known('irrf'),savedOther=known('other_deductions');
 const confirmedInss=savedInss?.source!=='derived_reference'?savedInss:null;
 const confirmedIrrf=savedIrrf?.source!=='derived_reference'?savedIrrf:null;
 const context=JSON.stringify([session,month,paymentMonth??null,compositionKey,gross,complete,record?.revision??null,savedInss,savedIrrf,savedOther]);
 const grossMinor=gross!==null&&Number.isFinite(gross)&&gross>=0&&Number.isSafeInteger(Math.round(gross*100))?Math.round(gross*100):null;
 const valid=grossMinor!==null,canEstimate=complete&&valid&&Boolean(compositionKey)&&record!==null&&fenceCurrent(guard);
 type Approval={guard:AuthFence};
 const [review,setReview]=useState<{context:string;revision:number;approval:Approval|null;draftGuard:AuthFence|null;bases:typeof emptyBases}>(()=>({context,revision:0,approval:null,draftGuard:null,bases:emptyBases}));
 // A different amount/period/completeness permanently revokes the old premise,
 // even if props later return to their previous value. Adjust this component's
 // own state before committing its children (no effect/deferred reset window).
 if(review.context!==context)setReview({context,revision:review.revision+1,approval:null,draftGuard:null,bases:emptyBases});
 const bases=review.context===context&&fenceCurrent(review.draftGuard)?review.bases:emptyBases;
 const inssBase=baseMinor(bases.inss,grossMinor),irrfBase=baseMinor(bases.irrf,grossMinor);
 const hasTaxPending=confirmedInss===null||confirmedIrrf===null;
 const ready=canEstimate&&hasTaxPending
  &&(confirmedInss!==null||(inssBase!==null&&employeeTaxReference(month)!==null))
  &&(confirmedIrrf!==null||(irrfBase!==null&&!!paymentMonth&&employeeTaxReference(paymentMonth)!==null));
 const editBase=(field:keyof typeof emptyBases,value:string)=>{
  const captured=guard;if(!canEstimate||!captured)return;
  setReview(current=>!fenceCurrent(captured)||current.context!==context||current.revision!==review.revision?current:{
   ...current,revision:current.revision+1,draftGuard:captured,bases:{...(fenceCurrent(current.draftGuard)?current.bases:emptyBases),[field]:value},approval:null,
  });
 };
 const approve=(checked:boolean)=>{const captured=guard;if(!ready||!session||!captured)return;setReview(current=>!fenceCurrent(captured)||current.context!==context||current.revision!==review.revision?current:{...current,approval:checked?{guard:captured}:null});};
 const money=(minor:number)=>privacy.amount(new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(minor/100));
 // A token string can recur after logout, rotation or a rapid A→B→A. The
 // canonical generation fence invalidates the old approval irreversibly.
 const approved=Boolean(ready&&session&&review.context===context&&fenceCurrent(review.approval?.guard));
 const inss=confirmedInss?.amountMinor??(approved?estimateEmployeeInss({contributionMonth:month,contributionBaseMinor:inssBase,singleEmploymentConfirmed:true})?.amountMinor??null:null);
 const irrf=confirmedIrrf?.amountMinor??(approved&&paymentMonth?estimateMonthlyIrrf({paymentMonth,taxableIncomeMinor:irrfBase,mode:'simplified',legalDeductionsMinor:null,ordinaryMonthlyConfirmed:true})?.amountMinor??null:null);
 // The reviewed aggregate already represents the selected group's debits.
 // Individual rubric keys and reference/manual totals are not extra debits.
 const personal=savedOther?.source==='reviewed_statement'?savedOther.amountMinor:null;
 const described=(minor:number|null,source:MonthlyFinancialValue['source']|undefined,missing='pendente')=>
  minor===null?missing:money(minor)+' ('+(source?deductionOrigins[source]:'estimado')+')';
 const pending=[...(!valid?['Bruto indisponível ou fora da faixa segura']:[]),...(!complete?[earningsIssue||'Ganhos e fixos incompletos']:[]),...(inss===null?['INSS']:[]),...(irrf===null?['IRRF ou mês previsto de crédito']:[])];
 const taxes=inss!==null&&irrf!==null?inss+irrf:null;
 const afterTaxes=grossMinor!==null&&taxes!==null&&Number.isSafeInteger(taxes)?grossMinor-taxes:null;
 const withPersonal=taxes!==null&&personal!==null?taxes+personal:null;
 const individual=grossMinor!==null&&withPersonal!==null&&Number.isSafeInteger(withPersonal)?grossMinor-withPersonal:null;
 const balance=individual??afterTaxes;
 if(valid&&taxes!==null&&afterTaxes===null)pending.push('Tributos fora da faixa segura');
 return <section className="cc-payroll-net-preview" aria-label="Previsão líquida individual">
 {complete&&afterTaxes!==null
  ? <p data-payroll-standard-net>Líquido padrão estimado: {money(Math.max(0,afterTaxes))}. Após INSS e IRRF, antes dos descontos pessoais.</p>
  : <SalaryBasisAmount summary={{basis:'net',amount:null,complete:false,reason:null}}/>}
 {complete&&individual!==null&&<p data-payroll-individual-net>Líquido individual estimado: {money(Math.max(0,individual))}. Inclui os descontos pessoais do holerite revisado.</p>}
 {!complete&&balance!==null&&<p>Saldo parcial após os descontos disponíveis: {money(Math.max(0,balance))}.</p>}
 {!privacy.hidden&&balance!==null&&balance<0&&<p>Saldo de ajuste negativo: {money(balance)}. Os descontos disponíveis excedem o bruto em {money(-balance)}.</p>}
 {pending.length>0&&<p className="cc-payroll-net-pending">Pendente para calcular o líquido: {privacy.text(pending.join(' · '))}.</p>}
 {personal===null&&<p className="cc-payroll-net-pending">Líquido individual a confirmar. Faltam descontos pessoais revisados no holerite desta competência.</p>}
 {complete&&afterTaxes!==null&&personal!==null&&individual===null&&<p className="cc-payroll-net-pending">Saldo individual fora da faixa segura.</p>}

 <details className="cc-payroll-net-details"><summary>Ver composição e premissas</summary><p>Competência dos descontos: {month}. Crédito previsto: {paymentMonth||'mês a confirmar'}. Recebimento a confirmar.</p>
 {hasTaxPending&&!privacy.hidden&&<>
  {confirmedInss===null&&<label className="cc-payroll-tax-base">Base de INSS (R$)<input inputMode="decimal" autoComplete="off" disabled={!canEstimate} value={bases.inss} onChange={event=>editBase('inss',event.target.value)}/></label>}
  {confirmedIrrf===null&&<label className="cc-payroll-tax-base">Rendimento tributável antes das deduções do IRRF (R$)<input inputMode="decimal" autoComplete="off" disabled={!canEstimate} value={bases.irrf} onChange={event=>editBase('irrf',event.target.value)}/></label>}
  <label><input type="checkbox" disabled={!ready} checked={approved} onChange={event=>approve(event.target.checked)}/> Conferi as bases da folha mensal de um único vínculo no RGPS, sob a tributação comum de residente no Brasil.</label>
 </>}
 {hasTaxPending&&privacy.hidden&&<p>Mostre os valores financeiros para informar as bases.</p>}
 {!canEstimate&&<p>A simulação de tributos exige bruto completo e dados da competência disponíveis.</p>}
 <p>Bruto {complete?'estimado':'parcial'}: {valid?money(grossMinor!):'indisponível'}. INSS: {described(inss,confirmedInss?.source)}. IRRF: {described(irrf,confirmedIrrf?.source)}.</p>
 <p>Descontos pessoais: {described(savedOther?.amountMinor??null,savedOther?.source,'pendentes')}.{savedOther&&personal===null?' Use o holerite revisado para incluí-los no líquido individual.':''}</p>
 <p>Os tributos estimados seguem as tabelas de 2026. O IRRF usa a dedução simplificada e a tabela progressiva, cuja faixa máxima é 27,5%. O FGTS não é descontado do líquido. <a href={FINANCIAL_SOURCES.inss}>INSS</a> · <a href={FINANCIAL_SOURCES.irrf}>Receita Federal</a></p></details>
 </section>;
}
