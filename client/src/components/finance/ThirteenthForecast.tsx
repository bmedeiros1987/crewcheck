import {captureAuthSession} from '@/lib/authClient';
import {useEffect,useState} from 'react';
import {financialRateOwner,financialRateSession} from '@/lib/financialStatementLearning';
import {thirteenthForecast,type ThirteenthEvidence} from '../../../../shared/financialThirteenthForecast.mjs';
import {useFinancialPrivacy} from './FinancialPrivacy';
import './vacation-forecast.css';
import ForecastDraftControls from './ForecastDraftControls';
import {useFinancialScreen} from './FinancialScreen';
import {validFinancialDay} from '@/lib/financialHistoryPeriods';

const empty=()=>({year:'',start:'',end:'',avos:'',amount:'',basis:'full_year_equivalent' as ThirteenthEvidence['basis'],source:'',reviewed:false,complete:false,offsetsComplete:false,applicable:false,tax:'',loan:'',advance:''});
export default function ThirteenthForecast(){
 const owner=financialRateOwner(),session=financialRateSession(),privacy=useFinancialPrivacy();
 const {range}=useFinancialScreen();
 const selectedYear=range?.valid&&validFinancialDay(range.start)&&validFinancialDay(range.end)&&range.start<=range.end&&range.start.slice(0,4)===range.end.slice(0,4)?range.start.slice(0,4):null;
 const guard=owner?captureAuthSession():null;
 const [state,setState]=useState(()=>({session,guard,revision:1,draft:empty()}));
 useEffect(()=>{const reset=()=>{const nextSession=financialRateSession(),nextGuard=financialRateOwner()?captureAuthSession():null;setState(s=>nextSession===financialRateSession()&&(!nextGuard||nextGuard.isCurrent())?{session:nextSession,guard:nextGuard,revision:s.revision+1,draft:empty()}:s);};const storage=(e:StorageEvent)=>{if(e.key===null||['crewcheck_auth_token','crewcheck_auth_user'].includes(e.key))reset();};const events=['crewcheck:auth-will-change','crewcheck:auth-changed','crewcheck:auth-expired'];events.forEach(e=>addEventListener(e,reset));addEventListener('storage',storage);return()=>{events.forEach(e=>removeEventListener(e,reset));removeEventListener('storage',storage);};},[]);
 // The generation fence also invalidates a rapid same-token A→B→A return.
 const draft=state.session===session&&state.guard?.isCurrent()?state.draft:empty();
 const change=(patch:Partial<ReturnType<typeof empty>>)=>{if(!guard?.isCurrent())return;setState(s=>!guard.isCurrent()?s:({session,guard,revision:s.revision+1,draft:{...(s.session===session&&s.guard?.isCurrent()?s.draft:empty()),...(Object.keys(patch).some(k=>!['reviewed','complete','offsetsComplete'].includes(k))?{reviewed:false,complete:false,offsetsComplete:false}:{}),...patch}}));};
 const integer=(v:string)=>/^\d+$/.test(v)?Number(v):null;
 const amount=(v:string)=>/^\d+(?:[.,]\d{1,2})?$/.test(v)?Math.round(Number(v.replace(',','.'))*100):null;
 const source={kind:'manual_scenario' as const,id:draft.source.trim(),itemId:'remuneration',revision:state.revision,reviewed:draft.reviewed},averagePeriod={start:draft.start,end:draft.end},year=integer(draft.year)??NaN;
 const deductions:ThirteenthEvidence['deductions']=(['tax','loan','advance'] as const).flatMap(key=>amount(draft[key])===null?[]:[{id:key,component:'total',kind:({tax:'retention',loan:'consigned',advance:'advance'} as const)[key],source:{...source,itemId:key},amountMinor:amount(draft[key])!}]);
 const result=thirteenthForecast({ownerId:owner,plan:{ownerId:owner||'',revision:state.revision,year,averagePeriod},lawApplicable:draft.applicable,activeEmployment:draft.applicable,evidence:{ownerId:owner||'',planRevision:state.revision,year,averagePeriod,source,amountMinor:amount(draft.amount),avos:integer(draft.avos),basis:draft.basis,earningsComplete:draft.complete,deductions,deductionsComplete:draft.offsetsComplete&&[draft.tax,draft.loan,draft.advance].every(v=>amount(v)!==null)}});
 const money=(v:number|null)=>v===null?'Pendente':privacy.amount(new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v/100));
 const field=(label:string,key:'year'|'start'|'end'|'avos'|'amount'|'source'|'tax'|'loan'|'advance',type='text')=><label>{label}<input type={type} inputMode={['amount','tax','loan','advance'].includes(key)?'decimal':undefined} value={draft[key]} onChange={e=>change({[key]:e.target.value})} style={{display:'block',width:'100%',minHeight:44}}/></label>;
 const values={year:draft.year,start:draft.start,end:draft.end,avos:draft.avos,amount:draft.amount,basis:draft.basis,source:draft.source,tax:draft.tax,loan:draft.loan,advance:draft.advance};
 const nextStep=result.reason==='year_period_or_revision_missing'?'Defina o ano e o período da média.':result.reason==='applicability_unconfirmed'?'Confirme o enquadramento deste cenário.':result.reason==='remuneration_or_avos_unconfirmed'?'Confira avos, remuneração e fonte.':result.reason==='earnings_inventory'?'Confira a composição da remuneração.':result.reason==='negative_balance_review'?'Revise os adiantamentos e retenções.':'Confira descontos e adiantamentos; ausência não é zero.';
 return <details className="cz-finance-table" data-thirteenth-forecast><summary>13º salário · previsão</summary>
 <p>Previsão separada do salário e férias.</p>
 {!owner?<p>Entre na sua conta para simular.</p>:<>
 <section aria-live="polite"><p>Ano do 13º: {draft.year||'a definir'}</p><p><strong>{result.grossMinor===null?'Subtotal conhecido do 13º':'13º bruto estimado'}: {money(result.knownSubtotalMinor)}</strong></p><p>Saldo estimado após retenções e adiantamento: {money(result.netMinor)}</p>{!privacy.hidden&&result.cashState==='negative_review'&&<p role="status">Saldo negativo: revise os valores e a conciliação dos adiantamentos.</p>}<p>Fechamento · prazo legal: {result.finalDeadlineDate||'Pendente de ano e enquadramento'}. Depósito não confirmado.</p>{result.netMinor===null&&<small data-forecast-next-step>{nextStep}</small>}</section>
 <ForecastDraftControls kind="thirteenth" session={session} guard={state.guard} draftRevision={state.revision} values={values} onRestore={values=>change({...values as Partial<ReturnType<typeof empty>>,reviewed:false,complete:false,offsetsComplete:false,applicable:false})}/>
 <details data-thirteenth-setup><summary>Configurar simulação</summary>
 <fieldset><legend>Ano e apuração</legend>{field('Ano do 13º','year','number')}{selectedYear&&<button type="button" onClick={()=>change({year:selectedYear,applicable:false})} aria-label={`Usar ano da competência selecionada: ${selectedYear}`}>Usar {selectedYear}</button>}{field('Início da apuração da média','start','date')}{field('Fim da apuração da média','end','date')}{field('Avos conferidos no ano · 0 a 12','avos','number')}
 <label><input type="checkbox" checked={draft.applicable} onChange={e=>change({applicable:e.target.checked})}/> Cenário anual com vínculo ativo e legislação aplicável; não é rescisão</label></fieldset>
 <details><summary>Valores e revisão do 13º</summary>
 <p>A contagem de avos não vem das horas de voo. A regra geral considera meses com pelo menos 15 dias de serviço e preserva faltas legais/justificadas. Para aeronautas, a média tem período próprio; o ACT TAM/comissários 3.2.1 trata a variável pela média de KM voados. Essas evidências ainda não são calculadas automaticamente.</p>
 {privacy.hidden?<p>Valores ocultos. Use a privacidade do Financeiro para editar.</p>:<>
 <label>Base informada do 13º<select value={draft.basis} onChange={e=>change({basis:e.target.value as typeof draft.basis,amount:'',reviewed:false})}><option value="full_year_equivalent">Remuneração equivalente a 12 avos · média revisada</option><option value="annual_proportional_amount">Bruto anual já proporcional aos avos · sem novo rateio</option></select></label>
 {field('Remuneração revisada do 13º (R$)','amount')}{field('Fonte revisada do 13º','source')}
 <label><input type="checkbox" checked={draft.reviewed} onChange={e=>change({reviewed:e.target.checked})}/> Conferi ano, avos, período, base e valores na fonte</label>
 <label><input type="checkbox" checked={draft.complete} onChange={e=>change({complete:e.target.checked})}/> A remuneração contempla todas as parcelas deste cenário</label>
 {field('Retenções específicas do 13º · INSS/IRRF (R$)','tax')}{field('Consignados individuais deste acerto (R$)','loan')}{field('Adiantamento do 13º já recebido a compensar (R$)','advance')}
 <label><input type="checkbox" checked={draft.offsetsComplete} onChange={e=>change({offsetsComplete:e.target.checked})}/> Conferi todos os descontos e compensações, inclusive zeros, sem repetir parcela ou provisão</label>
 </>}
 <p>Não usamos o IRRF da folha mensal nem reduzimos a base por consignados. O adiantamento não é presumido como metade do bruto anual atual.</p></details>

 </details>
 </>}
 <details data-thirteenth-rules><summary>Regras e fontes</summary>
 <p>A lei prevê adiantamento entre fevereiro e novembro e fechamento até 20/12 no cenário anual. Datas efetivas, rescisão e calendário bancário exigem contexto próprio.</p>
 <p><a href="https://www2.camara.leg.br/legin/fed/lei/1960-1969/lei-4090-13-julho-1962-353863-publicacaooriginal-1-pl.html" target="_blank" rel="noopener noreferrer">Lei 4.090</a> · <a href="https://www2.camara.leg.br/legin/fed/lei/1960-1969/lei-4749-12-agosto-1965-377862-publicacaooriginal-1-pl.html" target="_blank" rel="noopener noreferrer">Lei 4.749</a> · Lei 13.475 art.70 · ACT aplicável. Sem terço de férias neste cálculo.</p>
 </details>
 </details>;
}
