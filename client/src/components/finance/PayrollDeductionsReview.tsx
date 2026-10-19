import { useEffect, useMemo, useState } from 'react';
import type { PrivatePayrollExtraction } from '@/lib/privatePayrollExtraction';
import { financialRateOwner, financialRateSession } from '@/lib/financialStatementLearning';
import { readMonthlyFinancialSettings } from '@/lib/financialMonthlySettings';
import { planReviewedPayrollDeductions, type DeductionBucket, type DeductionSelection } from '@/lib/reviewedPayrollDeductions';
import { useFinancialPrivacy } from './FinancialPrivacy';
import './payroll-deductions-review.css';

const labels = { inss:'INSS',irrf:'IRRF',other_deductions:'Outros descontos' };
/** Review draft only: no save, rollback, network or persistence handler. */
export default function PayrollDeductionsReview({ extraction, documentFingerprint }: { extraction:PrivatePayrollExtraction; documentFingerprint:string }) {
  const privacy=useFinancialPrivacy();
  const month=extraction.competence.state==='candidate'?extraction.competence.candidates[0]?.value||'':'';
  const [identity]=useState(()=>({owner:financialRateOwner()||'',session:financialRateSession()||''}));
  const [snapshot]=useState(()=>readMonthlyFinancialSettings(month));
  const [current,setCurrent]=useState(snapshot);
  const [selection,setSelection]=useState<DeductionSelection[]>([]);
  const [completeBuckets,setCompleteBuckets]=useState<DeductionBucket[]>([]);
  const [monthly,setMonthly]=useState(false),[confirmed,setConfirmed]=useState(false);
  useEffect(()=>{
    const refresh=()=>setCurrent(readMonthlyFinancialSettings(month));
    window.addEventListener('storage',refresh);window.addEventListener('crewcheck:financial-config-changed',refresh);
    return()=>{window.removeEventListener('storage',refresh);window.removeEventListener('crewcheck:financial-config-changed',refresh);};
  },[month]);
  const plan=useMemo(()=>planReviewedPayrollDeductions({ownerId:identity.owner,expectedSession:identity.session,currentSession:financialRateSession()||'',
    documentFingerprint,documentKind:monthly?'monthly':'unknown',month,current,expectedRevision:snapshot?.revision??-1,
    extraction,selection,completeBuckets,ownershipAndMonthConfirmed:confirmed}),[identity,documentFingerprint,monthly,month,current,snapshot,extraction,selection,completeBuckets,confirmed]);
  const amount=(minor:number|null)=>minor===null?'Não informado':privacy.amount(new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(minor/100));
  function select(rowId:string,bucket:DeductionBucket,checked:boolean){
    setSelection(old=>checked?[...old.filter(row=>row.rowId!==rowId),{rowId,bucket}]:old.filter(row=>row.rowId!==rowId));
    setCompleteBuckets([]);setConfirmed(false);
  }
  return <section aria-label="Revisão de descontos por competência" className="payroll-deductions-review">
    <h4>Revisar descontos · {month||'Competência pendente'}</h4>
    <p>Selecione rubricas para conferir a substituição dos grupos desta competência. Esta etapa prepara a revisão; ainda não salva valores.</p>
    <label><input type="checkbox" checked={monthly} onChange={event=>{setMonthly(event.target.checked);setConfirmed(false);}}/> Confirmei que este é o holerite mensal; férias, 13º, PPR e complementos exigem revisão separada.</label>
    <div role="group" aria-label="Rubricas e grupos de desconto" className="payroll-deductions-rows">
      {plan.rows.map(row=><article key={row.rowId}>
        <label><input type="checkbox" aria-label={`Selecionar desconto ${row.rowId}`} disabled={!row.eligible} checked={selection.some(item=>item.rowId===row.rowId)} onChange={event=>{if(row.bucket)select(row.rowId,row.bucket,event.target.checked);}}/><span>{privacy.hidden?'Rubrica oculta':row.label}</span></label>
        <p>{row.classification==='informational'?'Informativo — não aplicar':row.bucket?labels[row.bucket]:'Grupo pendente'} · {row.amountState==='conflict'?'Valor pendente':amount(row.amountMinor)}</p>
        <small>{row.locations.map(source=>`${source.origin==='pdf-physical'?'Página PDF':'Página lógica'} ${source.page}, linha ${source.line}`).join('; ')}{row.nature?' · rubrica especial: recorrência não confirmada':''}</small>
        {row.reason&&<p>{row.reason}</p>}
        {(row.amountState==='conflict'||row.locations.length>1)&&<details><summary>Conferir candidatos e origens</summary>{row.candidates.map((candidate,index)=><div key={index}><p>{amount(candidate.amountMinor)}</p><small>{candidate.locations.map(source=>`${source.origin==='pdf-physical'?'Página PDF':'Página lógica'} ${source.page}, linha ${source.line}`).join('; ')}</small></div>)}</details>}
      </article>)}
    </div>
    <p>Totais impressos são referência: não entram novamente na soma e não confirmam depósito. Campos ausentes não viram zero. Nenhum desconto se torna recorrente por aparecer no documento.</p>
    {(['inss','irrf','other_deductions'] as const).filter(bucket=>selection.some(row=>row.bucket===bucket)).map(bucket=><label key={bucket}><input type="checkbox" checked={completeBuckets.includes(bucket)} onChange={event=>setCompleteBuckets(old=>event.target.checked?[...old,bucket]:old.filter(item=>item!==bucket))}/> Conferi todas as rubricas de {labels[bucket]} e a substituição completa apenas neste mês.</label>)}
    <div role="group" aria-label="Prévia exata dos campos selecionados" className="payroll-deductions-before-after">
      <h5>Prévia exata dos campos selecionados</h5>
      {plan.beforeAfter.map(row=><article key={row.field}><h5>{labels[row.field]}</h5><dl>
        <dt>Antes</dt><dd>{row.beforePresent?amount(row.before?.amountMinor??null):'Não informado'}{row.before&&<small> · {row.before.source==='manual'?'informado manualmente':'referência anterior'}</small>}</dd>
        <dt>Depois</dt><dd>{amount(row.after?.amountMinor??null)}<small> · somente {month}</small></dd>
      </dl></article>)}
    </div>
    <label><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/> Conferi a titularidade, a competência e o antes/depois de cada grupo selecionado.</label>
    {plan.reasons.length>0&&<ul>{plan.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>}
    <p role="status">{plan.reviewable?'Revisão preparada. ':''}{plan.applicationReason}</p>
    <button type="button" disabled>Aplicar descontos · indisponível</button>
    <p>Reversão indisponível até confirmar a proteção da gravação. Não há alteração de pagamentos confirmados.</p>
    <details><summary>Estimativa futura opcional</summary><p>Etapa separada: parâmetros anteriores só poderão ser selecionados com origem, data e rótulo de estimativa, sem copiar valores como confirmados.</p><button type="button" disabled>Estimar descontos futuros</button><p>{plan.futureEstimate.reason}</p></details>
  </section>;
}
