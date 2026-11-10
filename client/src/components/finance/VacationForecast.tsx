import {useEffect,useState} from 'react';
import {financialRateOwner,financialRateSession} from '@/lib/financialStatementLearning';
import {vacationForecast,type VacationEvidence} from '../../../../shared/financialVacationForecast.mjs';
import {useFinancialPrivacy} from './FinancialPrivacy';

const empty=()=>({acquisitionStart:'',acquisitionEnd:'',split:false,starts:['',''],basis:'monthly_average' as 'monthly_average'|'period_amount',amounts:['',''],source:'',reviewed:false,earningsComplete:false,deductionsComplete:false,lawApplicable:false,retentions:['',''],consigned:['',''],advances:['','']});
// An editable scenario, deliberately ephemeral: it is not the monthly payroll
// writer, an import confirmation, or a bank settlement. No automatic carryover.
export default function VacationForecast(){
 const session=financialRateSession(),owner=financialRateOwner(),privacy=useFinancialPrivacy();
 const [state,setState]=useState(()=>({session,revision:1,draft:empty()}));
 useEffect(()=>{
  const reset=()=>setState(current=>({session:financialRateSession(),revision:current.revision+1,draft:empty()}));
  const storage=(event:StorageEvent)=>{if(event.key===null||['crewcheck_auth_token','crewcheck_auth_user'].includes(event.key))reset();};
  const events=['crewcheck:auth-will-change','crewcheck:auth-changed','crewcheck:auth-expired'];
  events.forEach(event=>window.addEventListener(event,reset));window.addEventListener('storage',storage);
  return()=>{events.forEach(event=>window.removeEventListener(event,reset));window.removeEventListener('storage',storage);};
 },[]);
 const draft=state.session===session?state.draft:empty();
 const change=(patch:Partial<ReturnType<typeof empty>>)=>setState(current=>({session,revision:current.revision+1,draft:{...(current.session===session?current.draft:empty()),...(Object.keys(patch).some(key=>!['reviewed','earningsComplete','deductionsComplete'].includes(key))?{reviewed:false}:{}),...patch}}));
 const amount=(s:string)=>/^\d+(?:[.,]\d{1,2})?$/.test(s)?Math.round(Number(s.replace(',','.'))*100):null;
 const periods=Array.from({length:draft.split?2:1},(_,i)=>({id:String(i),startDate:draft.starts[i]||null,days:draft.split?15:30}));
 const source={id:draft.source.trim(),revision:state.revision,reviewed:draft.reviewed};
 const earnings:VacationEvidence['earnings']=draft.basis==='monthly_average'?(amount(draft.amounts[0])===null?[]:[{id:'average',source,amountMinor:amount(draft.amounts[0])!,basis:'monthly_average'}]):periods.flatMap((p,i)=>amount(draft.amounts[i])===null?[]:[{id:'period-'+i,source,amountMinor:amount(draft.amounts[i])!,basis:'period_amount' as const,periodId:p.id}]);
 const deductions:VacationEvidence['deductions']=periods.flatMap((p,i)=>(['retentions','consigned','advances'] as const).flatMap(key=>amount(draft[key][i])===null?[]:[{id:key+i,source,periodId:p.id,kind:({retentions:'retention',consigned:'consigned',advances:'advance'} as const)[key],amountMinor:amount(draft[key][i])!}]));
 const allDeductionsEntered=periods.every((_,i)=>[draft.retentions[i],draft.consigned[i],draft.advances[i]].every(v=>amount(v)!==null));
 const allEarningsEntered=draft.basis==='monthly_average'?amount(draft.amounts[0])!==null:periods.every((_,i)=>amount(draft.amounts[i])!==null);
 const acquisition={start:draft.acquisitionStart,end:draft.acquisitionEnd};
 const result=vacationForecast({ownerId:owner,plan:{ownerId:owner||'',revision:state.revision,acquisition,periods},lawApplicable:draft.lawApplicable,evidence:{ownerId:owner||'',planRevision:state.revision,acquisition,earnings,deductions,earningsComplete:draft.earningsComplete&&allEarningsEntered,deductionsComplete:draft.deductionsComplete&&allDeductionsEntered}});
 const money=(minor:number|null)=>minor===null?'Pendente':privacy.amount(new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(minor/100));
 const dateField=(label:string,value:string,onChange:(v:string)=>void)=><label style={{display:'block',marginBlock:8}}>{label}<input type="date" value={value} onChange={e=>onChange(e.target.value)} style={{display:'block',maxWidth:'100%',minHeight:44}}/></label>;
 const amountField=(label:string,value:string,onChange:(v:string)=>void)=><label style={{display:'block',marginBlock:8}}>{label}<input inputMode="decimal" value={value} onChange={e=>onChange(e.target.value)} style={{display:'block',width:'100%',maxWidth:280,minHeight:44}}/></label>;
 const indexed=(key:'starts'|'amounts'|'retentions'|'consigned'|'advances',index:number,value:string)=>change({[key]:draft[key].map((old,i)=>i===index?value:old)});
 return <details className="cz-finance-table" style={{overflowWrap:'anywhere'}} data-vacation-forecast><summary>Previsão de férias · separada do salário</summary>
 <p>Simulação nesta tela, sem salvar ou alterar sua folha. Médias e retenções ainda não são recuperadas automaticamente do holerite.</p>
 {!owner?<p>Entre na sua conta para simular.</p>:<>
 <fieldset><legend>Períodos</legend>
 {dateField('Início do período aquisitivo',draft.acquisitionStart,v=>change({acquisitionStart:v}))}
 {dateField('Fim do período aquisitivo',draft.acquisitionEnd,v=>change({acquisitionEnd:v}))}
 <label><input type="checkbox" checked={draft.split} onChange={e=>change({split:e.target.checked})}/> Dois períodos de 15 dias</label>
 {periods.map((p,i)=><div key={p.id}>{dateField(`Início do gozo ${i+1} · ${p.days} dias`,draft.starts[i],v=>indexed('starts',i,v))}</div>)}
 <label style={{display:'block'}}><input type="checkbox" checked={draft.lawApplicable} onChange={e=>change({lawApplicable:e.target.checked})}/> Lei do Aeronauta aplicável; fracionamento previsto no meu ACT quando escolhido</label>
 </fieldset>
 <details><summary>Valores e revisão</summary>
 <p>A média precisa ter fonte e período aquisitivo. Para comissários TAM, o ACT 3.2.1 usa a média dos KM voados no período aquisitivo, aplicada na concessão. A escala parcial e o salário atual não comprovam essa média.</p>
 {privacy.hidden?<p>Valores ocultos. Use o controle de privacidade do Financeiro para editar.</p>:<>
 <label style={{display:'block'}}>Origem da remuneração<select value={draft.basis} onChange={e=>change({basis:e.target.value as typeof draft.basis,amounts:['',''],reviewed:false})}><option value="monthly_average">Média mensal comprovada · fixa e variável</option><option value="period_amount">Remuneração já proporcional ao gozo · sem o terço</option></select></label>
 {(draft.basis==='monthly_average'?[periods[0]]:periods).map((p,i)=><div key={p.id}>{amountField(draft.basis==='monthly_average'?'Remuneração média mensal (R$)':`Remuneração proporcional do período ${i+1} (R$)`,draft.amounts[i],v=>indexed('amounts',i,v))}</div>)}
 <label style={{display:'block'}}>Fonte revisada (referência do recibo/demonstrativo)<input value={draft.source} onChange={e=>change({source:e.target.value,reviewed:false})} style={{display:'block',width:'100%',minHeight:44}}/></label>
 <label style={{display:'block'}}><input type="checkbox" checked={draft.reviewed} onChange={e=>change({reviewed:e.target.checked})}/> Conferi a fonte, o período aquisitivo e a base escolhida</label>
 <label style={{display:'block'}}><input type="checkbox" checked={draft.earningsComplete} onChange={e=>change({earningsComplete:e.target.checked})}/> A remuneração informada contém todas as parcelas devidas neste cenário</label>
 {periods.map((p,i)=><fieldset key={p.id}><legend>Gozo {i+1} · descontos e acertos revisados</legend>{amountField('Retenções informadas · INSS/IRRF (R$)',draft.retentions[i],v=>indexed('retentions',i,v))}{amountField('Consignados individuais (R$)',draft.consigned[i],v=>indexed('consigned',i,v))}{amountField('Adiantamento já recebido a abater neste fechamento (R$)',draft.advances[i],v=>indexed('advances',i,v))}</fieldset>)}
 <label style={{display:'block'}}><input type="checkbox" checked={draft.deductionsComplete} onChange={e=>change({deductionsComplete:e.target.checked})}/> Conferi todos os descontos e acertos, inclusive zeros explícitos, sem repetir provisões ou parcelas já abatidas</label>
 </>}
 <p>Consignados reduzem o caixa; não reduzem automaticamente remuneração ou base tributável. Não calculamos tributos de férias com a tabela da folha mensal.</p>
 </details>
 <div aria-live="polite">{result.periods.length?result.periods.map((p,i)=><section key={p.id}><h4>Gozo {i+1} · {p.days} dias</h4><p>Remuneração: {money(p.earningsMinor)} · terço: {money(p.thirdMinor)}</p><p><strong>{p.grossMinor===null?'Subtotal conhecido com terço':'Bruto estimado'}: {money(p.knownSubtotalMinor)}</strong></p><p>Saldo estimado após descontos e adiantamentos: {money(p.netMinor)}</p><p>Data limite legal: {p.deadlineDate||'Pendente de data e enquadramento'}. Depósito não confirmado.</p>{p.pending.length>0&&<small>Composição integral e/ou retenções ainda pendentes; campos ausentes não são zero.</small>}</section>):<p>Informe período aquisitivo válido e gozos sem sobreposição para preparar a previsão.</p>}</div>
 </>}
 <p><a href="/legal/ACT-Comissarios-2025-2027.pdf" target="_blank" rel="noopener noreferrer">ACT comissários TAM · 3.2.1 e 3.7.5</a> · Lei 13.475, arts. 67–71. O prazo é dois dias corridos antes de cada início, sem inferir depósito.</p>
 </details>;
}
