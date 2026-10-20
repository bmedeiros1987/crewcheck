import {useEffect,useMemo,useRef,useState} from 'react';
import {Calculator,ChevronDown,RotateCcw} from 'lucide-react';
import {getStoredUser,getToken} from '@/lib/authClient';
import {captureAuthSession} from '@/lib/authClient';
import {getScheduledDutyLimitReference} from '@/lib/complianceEngine';
import type {LegalProfileSummary} from '@/lib/actRules';
import type {CanonicalRosterEvent} from '@/lib/canonicalRoster';
import {resolvePerDiemRule} from '@/lib/financialRules';
import {publishedDutyEndpoints} from '@/lib/canonicalDutyMeasurement';
import {regulationScenarioSeed,regulationDraftForm,regulationScheduleProjection} from '@shared/regulationScenarioPrefill.mjs';
import {regulationContextExplanation} from '@shared/regulationContextExplanation.mjs';
import type {RosterDay} from '@/lib/pdfParser';
import type {ScheduleDayLike} from '@/components/v1432/ManualRegulationView';
import {projectRegulationScenario,explicitInstant} from '@shared/regulationTemporalScenario.mjs';
import {regulationDeadlineSummary,regulationLastActivity,regulationExtensionMargin} from '@shared/regulationDeadlineSummary.mjs';
import {useRegulationOperationalArrival} from '@/lib/useRegulationOperationalArrival';
import type {RegulationOperationalArrivalInput} from '@/lib/useRegulationOperationalArrival';
import RegulationNavigationContext from './RegulationNavigationContext';
import RegulationAutomaticView from './RegulationAutomaticView';
import './regulation-scenario.css';
const session=()=>{const u=getStoredUser(),t=getToken();return u&&t&&!['visitor','guest'].includes(u.role||'')?[u.id,u.email,t].join(':'):'';};
const number=(s:string)=>/^\d+$/.test(s)?Number(s):null;
const dateOf=(s?:string|null)=>{const m=String(s||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?`${m[3]}-${m[2]}-${m[1]}`:/^\d{4}-\d{2}-\d{2}$/.test(s||'')?s!:'';};
const defaults=()=>({takeoff:'',normalEnd:'',offset:'',flight:'',delay:'0',taxi:'',postFlight:'',tasks:'',operation:'',extension:false,reviewed:false,publicationOffsetReviewed:false,composition:'',acclimatization:'unknown',limitSource:'Referência informada para esta simulação',limitBasis:'',presentation:'',presentationReviewed:false,acclimatizedClockReviewed:false,regime:'',timingChange:'flight-delay',changeReviewed:false,method:'schedule',plannedEnd:'',plannedEndSource:'',scheduledArrival:'',reviewRequired:false,manualLastActivity:'unknown'});
function localClock(instant:string|undefined,offset:string){if(!instant||!/^([+-])(\d{2}):(\d{2})$/.test(offset))return '—';const sign=offset[0]==='-'?-1:1,shift=sign*(Number(offset.slice(1,3))*60+Number(offset.slice(4)))*60000;return new Date(Date.parse(instant)+shift).toISOString().slice(0,16).replace('T',' · ');}
// Optional admitted-host input. No current cache is promoted into admission and
// no subscription/fetch is created here. captureAuthSession is continuity only;
// the supplying host must separately confirm authenticated source authority.
export type {RegulationOperationalArrivalInput} from '@/lib/useRegulationOperationalArrival';
export function DetailedRegulationScenarioView({scheduleDay,compliance,program,operationalArrival}:{scheduleDay?:ScheduleDayLike|null;program?:CanonicalRosterEvent|null;operationalArrival?:RegulationOperationalArrivalInput|null;compliance?:{legalProfile?:LegalProfileSummary;alerts?:Array<{title?:string;description?:string;actionable?:boolean;classification?:string;severity?:string}>}}){
 const details=useRef<HTMLDetailsElement>(null),owner=session(),signature=JSON.stringify(scheduleDay||null),key=owner+'|'+(program?.id||scheduleDay?.date||'manual');
 const admittedOwner=useRef(owner),observedOwner=useRef(owner),sourceAllowed=Boolean(owner&&admittedOwner.current===owner);
 const reference=useMemo(()=>{try{return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(scheduleDay?.dutyReport||'')?getScheduledDutyLimitReference(scheduleDay as RosterDay,compliance?.legalProfile):null;}catch{return null;}},[signature,compliance?.legalProfile]);
 const seed=useMemo(()=>{
  if(!sourceAllowed)return defaults();
  const next={...defaults(),...regulationScenarioSeed(scheduleDay,reference,program)};
  const report=scheduleDay?.dutyReport,date=dateOf(scheduleDay?.date);
  if(date&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(report||''))next.presentation=date+'T'+report;
  const journey=((scheduleDay as any)?.regulationJourney||[]) as CanonicalRosterEvent[];
  const legs=journey.length?journey.map(e=>e.leg):scheduleDay?.legs||[];
  // Reuse the existing airport catalogue only, with no financial overrides.
  // Both endpoints must be known: the route resolver's one-end fallback is not evidence.
  const airports=legs.flatMap((leg:any)=>[leg?.origin,leg?.destination]);
  const geography=airports.map((code:any)=>code?resolvePerDiemRule(code,code,{}).kind:'pending');
  if(geography.length&&geography.every(kind=>kind!=='pending')){next.operation=geography.includes('international')?'international':'domestic';next.postFlight=next.operation==='domestic'?'30':'45';}
  const endpoints=program&&journey.length?publishedDutyEndpoints(journey,program.id):null;
  const civil=(stamp:number)=>new Date(stamp-180*60000).toISOString().slice(0,16);
  if(endpoints?.end!==null&&endpoints?.end!==undefined){next.plannedEnd=civil(endpoints.end);next.plannedEndSource='Liberação publicada da jornada canônica';}
  else {
   const last=journey.at(-1),leg=last?.leg;
   const arrival=last&&/^([01]\d|2[0-3]):[0-5]\d$/.test(leg?.arrivalTime||'')?Date.parse(last.endDateTime):NaN;
   if(Number.isFinite(arrival)){next.scheduledArrival=civil(arrival);}
   if(Number.isFinite(arrival)&&next.postFlight){next.plannedEnd=civil(arrival+Number(next.postFlight)*60000);next.plannedEndSource='Estimativa: chegada programada + pós-voo de referência; tarefas adicionais não incluídas';}
  }
  return next;
 },[sourceAllowed,signature,reference,program]),basis=JSON.stringify([signature,program?.startDateTime,reference,compliance?.legalProfile]);
 type Form=ReturnType<typeof defaults>;
 const [draft,setDraft]=useState<{key:string;basis:string;overrides:Partial<Form>}>(()=>({key,basis,overrides:{}})),[,refresh]=useState(0);
 const [arrivalMode,setArrivalMode]=useState('manual');
 useEffect(()=>setArrivalMode('manual'),[key,basis,operationalArrival]);
 const form={...defaults(),...regulationDraftForm(draft,key,seed,basis)} as Form;
 const update=(changes:Partial<Form>)=>setDraft(previous=>({key,basis,overrides:{...(previous.key===key?previous.overrides:{}),...(previous.basis!==basis?{reviewed:false,publicationOffsetReviewed:false}:{}),...changes}}));
 useEffect(()=>{
  const reset=()=>{observedOwner.current=session();admittedOwner.current='';setDraft({key:'',basis:'',overrides:{}});refresh(n=>n+1);};
  // Storage also carries theme and other preferences from another tab. Only a
  // changed identity/token is an authentication boundary for this draft.
  const storageChanged=()=>{if(session()!==observedOwner.current)reset();};
  const names=['crewcheck:auth-will-change','crewcheck:auth-changed','crewcheck:auth-expired'];
  for(const name of names)window.addEventListener(name,reset);
  window.addEventListener('storage',storageChanged);
  return()=>{for(const name of names)window.removeEventListener(name,reset);window.removeEventListener('storage',storageChanged);};
 },[]);
 useEffect(()=>{setDraft(previous=>previous.key===key?previous:{key,basis,overrides:{}});window.scrollTo({top:0,behavior:'instant'});},[key]);
 const offsetValid=/^[+-]\d{2}:\d{2}$/.test(form.offset)&&explicitInstant('2026-01-01T00:00'+form.offset)!==null;
 const input={takeoffAt:offsetValid&&form.takeoff?form.takeoff+form.offset:'',normalDutyEndAt:offsetValid&&form.normalEnd?form.normalEnd+form.offset:'',limitReviewed:form.reviewed,flightMinutes:number(form.flight),flightDurationSource:form.flight?'user_estimate':'unknown',delayMinutes:number(form.delay),taxiInMinutes:number(form.taxi),operation:form.operation,postFlightMinutes:number(form.postFlight),additionalTasksMinutes:number(form.tasks),extensionMinutes:form.extension?60:0};
 const detailedResult=projectRegulationScenario(input),result=form.method==='schedule'?regulationScheduleProjection(form):detailedResult,known=result.state!=='indeterminate',within=result.state==='within_temporal_reference';
 const baseResult=form.method==='schedule'?regulationScheduleProjection({...form,extension:false}):projectRegulationScenario({...input,extensionMinutes:0});
 const lastActivity=regulationLastActivity(scheduleDay,form.manualLastActivity);
 const hasPositioning=(scheduleDay?.legs||[]).some((leg:any)=>leg.workType==='PS');
 const finalProgram=((scheduleDay as any)?.regulationJourney?.at(-1)) as CanonicalRosterEvent|undefined;
 const {read:operationalRead,projection:operationalProjection}=useRegulationOperationalArrival({input:operationalArrival,sourceAllowed,finalProgram,lastActivity,form});
 const useOperational=arrivalMode==='operational'&&Boolean(operationalProjection);
 const selectedProjection=useOperational?operationalProjection:baseResult;
 const deadlines=regulationDeadlineSummary(form,selectedProjection,{lastActivity,hasPositioning});
 const extensionMargin=regulationExtensionMargin(deadlines,form.extension);
 const explanation=regulationContextExplanation({allowed:sourceAllowed,scheduleDay,program,reference,form,result});
 const acclimatization=form.acclimatization==='acclimatized'?'Aclimatado':form.acclimatization==='not_acclimatized'?'Não aclimatado':'Indeterminado';
 const alerts=(sourceAllowed?compliance?.alerts||[]:[]).filter(a=>a.actionable!==false&&!['dados_insuficientes','informativa'].includes(a.classification||'')).slice(0,2);
 function openDetails(){if(details.current){details.current.open=true;details.current.scrollIntoView({block:'start',behavior:'smooth'});details.current.querySelector<HTMLInputElement>('input')?.focus({preventScroll:true});}}
 function useEngineReference(){if(!sourceAllowed||!reference||hasPositioning||form.presentation!==seed.presentation||form.timingChange!=='flight-delay'||form.composition!=='simple'||form.acclimatization!=='acclimatized'||!form.publicationOffsetReviewed||!offsetValid)return;const date=dateOf(scheduleDay?.date),start=explicitInstant(date+'T'+reference.startTime+form.offset);if(start===null)return;const shift=(form.offset[0]==='-'?-1:1)*(Number(form.offset.slice(1,3))*60+Number(form.offset.slice(4)))*60000;const end=new Date(start+reference.maxDutyMinutes*60000+shift).toISOString().slice(0,16);update({normalEnd:end,limitBasis:JSON.stringify([form.presentation,form.offset]),regime:'rbac117-b1',reviewed:false,reviewRequired:true,limitSource:'Motor existente · '+reference.source+', fuso informado '+form.offset+', aplicabilidade pendente'});}
 if(!owner)return <section className="cc-regulation-scenario"><h1>Regulamentação</h1><p>Entre na conta para simular.</p></section>;
 return <section className="cc-regulation-scenario" aria-label="Simulação de regulamentação">{sourceAllowed&&<RegulationNavigationContext/>}
  <header className="cc-reg-scenario-heading"><Calculator aria-hidden="true"/><div><h1>Regulamentação</h1><p>{sourceAllowed&&scheduleDay?.date?`Programação de ${scheduleDay.date}`:'Simulação sem escala'}</p></div></header>
  <section className="cc-reg-scenario-result" aria-label="Resultado temporal" data-state={deadlines.marginMinutes===null?'indeterminate':deadlines.marginMinutes<0?'exceeds_temporal_reference':'within_temporal_reference'}>
   <span>{deadlines.normalDutyEnd?'REFERÊNCIA REVISADA · SIMULAÇÃO':'REFERÊNCIA A CONFIRMAR · SIMULAÇÃO'}</span>
   <div className="cc-reg-deadlines">
    <div><h2>Limite normal da jornada</h2><strong>{localClock(deadlines.normalDutyEnd||undefined,form.offset).split(' · ').at(-1)}</strong><small>{deadlines.normalDutyEnd?localClock(deadlines.normalDutyEnd,form.offset).split(' · ')[0]+' · UTC'+form.offset:'Dados a confirmar'}</small></div>
    <div><h2>Corte dos motores até</h2><strong>{localClock(deadlines.engineStopLimit||undefined,form.offset).split(' · ').at(-1)}</strong><small>{deadlines.engineStopLimit?localClock(deadlines.engineStopLimit,form.offset).split(' · ')[0]+' · UTC'+form.offset:'Confirme pós-voo e tarefas'}</small></div>
   </div>
   {deadlines.marginMinutes!==null?<p className="cc-reg-margin" role="status">{deadlines.marginMinutes>=0?`${deadlines.marginMinutes} min de margem ${useOperational?'da previsão operacional':'da programação'}`:`Excede a referência em ${Math.abs(deadlines.marginMinutes)} min`}</p>:<p role="status">Falta confirmar: {(deadlines.missing.length?deadlines.missing:deadlines.marginMissing).slice(0,3).join(' · ')}{deadlines.missing.length>3?'…':''}.</p>}
   {deadlines.projectedDutyEnd&&<p>Encerramento previsto: <b>{localClock(deadlines.projectedDutyEnd,form.offset)}</b></p>}
   {!deadlines.engineStopLimit&&deadlines.normalDutyEnd&&<p>Corte pendente: {deadlines.cutMissing.join(' · ')}.</p>}
   <small>UTC{form.offset||' a confirmar'} · comparação temporal; não autoriza extensão.</small>
   {!deadlines.normalDutyEnd&&<button type="button" onClick={openDetails}>Confirmar dados do limite</button>}
  </section>
  <section className="cc-reg-scenario-actions" aria-label="Cenário de atraso">
   <label>Fonte da previsão<select aria-label="Fonte da previsão de encerramento" value={arrivalMode} onChange={e=>setArrivalMode(e.target.value)}><option value="manual">Programação e atraso manual</option><option value="operational" disabled={!operationalProjection}>Chegada operacional com evidência</option></select></label>
   {useOperational?<p role="status">{operationalRead.kind==='actual'?'Pouso real informado':'Pouso estimado'} · {operationalRead.provider} · observado {localClock(operationalRead.observedAt,form.offset)}. Táxi, pós-voo e tarefas informados compõem a previsão; o atraso manual não é somado.</p>:<p role="status">{arrivalMode==='operational'?'Evidência operacional expirou ou deixou de ser admitida; exibindo a programação e o atraso manual.':'Modo manual preservado. A chegada operacional exige evidência válida para a última etapa e táxi informado.'}</p>}
   <h2>Informar atraso</h2>
   <label>Atraso dos voos (min)<input aria-label="Atraso previsto em minutos" disabled={useOperational} inputMode="numeric" type="number" min="0" max="1440" value={form.delay} onChange={e=>update({delay:e.target.value})}/></label>
   <div className="cc-reg-delay-options">{[0,15,30,60].map(minutes=><button type="button" key={minutes} disabled={useOperational} aria-pressed={form.delay===String(minutes)} onClick={()=>update({delay:String(minutes)})}>{minutes===0?'Sem atraso':`+${minutes} min`}</button>)}</div>
   <label>O que mudou?<select aria-label="Tipo de alteração da jornada" value={form.timingChange} onChange={e=>update({timingChange:e.target.value,changeReviewed:false,reviewed:false})}><option value="flight-delay">Voos atrasados; mesma apresentação</option><option value="presentation-change">Apresentação alterada</option><option value="reprogramming">Reprogramação / interrupção</option></select></label>
   <p>Recalcula a previsão. O atraso não aumenta o limite da jornada.</p>
  </section>
  {known&&result.crossesReferenceDate&&<p role="status" className="cc-reg-scenario-warning">A projeção muda de data. Madrugadas e histórico precisam ser reavaliados.</p>}
  <details className="cc-reg-scenario-details"><summary>Como foi calculado <ChevronDown aria-hidden="true"/></summary>
  {explanation&&<section className="cc-reg-scenario-details" aria-label="Concierge explica esta jornada">
   <h2>Concierge · Entenda esta jornada</h2>
   {explanation.facts.map((text:string,index:number)=><p key={index}>{text}</p>)}
   <p>{explanation.hypothesis}</p><p>{explanation.scenario}</p>
   {explanation.pending.length>0&&<><h3>O que falta confirmar</h3><ul>{explanation.pending.map((item:{label:string},index:number)=><li key={index}>{item.label}</li>)}</ul></>}
   {explanation.next&&<button type="button" onClick={()=>{openDetails();const field=explanation.next?.field;Array.from(details.current?.querySelectorAll<HTMLElement>('[aria-label]')||[]).find(element=>element.getAttribute('aria-label')===field)?.focus({preventScroll:true});}}>Confirmar próximo dado</button>}
   <small>Leitura explicativa da programação; os ajustes valem apenas para esta simulação.</small>
  </section>}
  {alerts.length>0&&<section aria-label="Alertas da escala" className="cc-reg-scenario-alerts">{alerts.map((a,i)=><p key={i}>{a.title||'Alerta da escala'}</p>)}<button onClick={()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'alerts'}))}>Ver alertas</button></section>}
  </details>
  <details ref={details} className="cc-reg-scenario-details"><summary>Confirmar dados e ajustar referência <ChevronDown aria-hidden="true"/></summary>
   <label>Apresentação da jornada<input type="datetime-local" aria-label="Apresentação da jornada" value={form.presentation} onChange={e=>update({presentation:e.target.value,presentationReviewed:false,reviewed:false,acclimatizedClockReviewed:false})}/></label>
   {!scheduleDay&&<label>Última atividade da jornada<select aria-label="Última atividade da jornada" value={form.manualLastActivity} onChange={e=>update({manualLastActivity:e.target.value,reviewed:false,presentationReviewed:false})}><option value="unknown">A confirmar</option><option value="operating">Etapa operada (OP), sem deslocamento posterior</option><option value="positioning">Deslocamento (PS) após a última etapa operada</option></select></label>}
   <label className="cc-reg-review-limit"><input type="checkbox" aria-label="Confirmei apresentação e etapas" checked={form.presentationReviewed} onChange={e=>update({presentationReviewed:e.target.checked,reviewed:false})}/>Confirmei a apresentação e a classificação das etapas operadas e deslocamentos.</label>
   <label className="cc-reg-review-limit"><input type="checkbox" aria-label="Confirmei a hora de referência aclimatada" checked={form.acclimatizedClockReviewed} onChange={e=>update({acclimatizedClockReviewed:e.target.checked,reviewed:false})}/>A hora usada na B.1 corresponde ao local em que estou aclimatado.</label>
   <label>Regime / referência<select aria-label="Regime aplicável" value={form.regime} onChange={e=>update({regime:e.target.value,reviewed:false})}><option value="">A confirmar</option><option value="rbac117-b1">RBAC 117 B.1 · simples e aclimatada</option><option value="operator-reviewed">Referência do operador revisada</option></select></label>
   {form.timingChange!=='flight-delay'&&<label className="cc-reg-review-limit"><input type="checkbox" aria-label="Revisei a apresentação ou reprogramação" checked={form.changeReviewed} onChange={e=>update({changeReviewed:e.target.checked})}/>Revisei a nova apresentação e o limite aplicável com a regra do operador.</label>}
   <label>Método da projeção<select aria-label="Método da projeção" value={form.method} onChange={e=>update({method:e.target.value})}><option value="schedule">Jornada programada</option><option value="detailed">Decolagem, voo e táxi</option></select></label>
   <label>Encerramento programado / estimado<input type="datetime-local" aria-label="Encerramento programado da jornada" value={form.plannedEnd} onChange={e=>update({plannedEnd:e.target.value,plannedEndSource:'Encerramento informado pelo usuário'})}/><small>{form.plannedEndSource||'Liberação não comprovada; informe uma estimativa para simular.'}</small></label>
   {sourceAllowed&&<p>Apresentação usada na referência: {scheduleDay?.dutyReport||'ausente'} · {reference?.presentationSource==='published'?'publicada':reference?'estimada; confirme o horário':'referência indisponível'}. Ajuste o limite abaixo se a apresentação aplicável for diferente.</p>}
   <p>Dados da programação preenchidos para revisão. Partida programada não comprova decolagem real.</p><p>{sourceAllowed&&compliance?.legalProfile?.actName||'Perfil ACT não disponível'}</p><div className="cc-reg-scenario-inputs">
    <label>Partida programada / estimativa de decolagem<input type="datetime-local" aria-label="Decolagem base" value={form.takeoff} onChange={e=>update({takeoff:e.target.value})}/></label>
    <label>Fuso explícito (UTC±HH:MM)<input aria-label="Deslocamento UTC" value={form.offset} onChange={e=>update({offset:e.target.value,reviewed:false,reviewRequired:true,publicationOffsetReviewed:false})} placeholder="-03:00"/></label>
    <p>Os campos de voo, táxi e tarefas abaixo compõem o método “Decolagem, voo e táxi”. Na jornada programada, edite o encerramento acima; quando ele for estimado, pós-voo e tarefas atualizam a estimativa.</p>
    <label>Duração em voo (min)<input type="number" min="1" max="1440" aria-label="Duração em voo em minutos" value={form.flight} onChange={e=>update({flight:e.target.value})}/><small>Estimativa informada. Não copie tempo de bloco como tempo em voo.</small></label>
    <label>Táxi até parada dos motores (min)<input type="number" min="0" max="240" aria-label="Táxi de chegada em minutos" value={form.taxi} onChange={e=>update({taxi:e.target.value})}/></label>
    <label>Tipo de voo<select aria-label="Tipo de voo" value={form.operation} onChange={e=>update({operation:e.target.value,postFlight:e.target.value==='domestic'?'30':e.target.value==='international'?'45':''})}><option value="">A confirmar</option><option value="domestic">Doméstico</option><option value="international">Internacional</option></select></label>
    <label>Pós-voo (min)<input type="number" aria-label="Pós-voo em minutos" value={form.postFlight} onChange={e=>update({postFlight:e.target.value})}/><small>Mínimo de referência: 30 doméstico / 45 internacional; outras tarefas somam.</small></label>
    <label>Tarefas após pós-voo (min)<input type="number" min="0" aria-label="Tarefas posteriores em minutos" value={form.tasks} onChange={e=>update({tasks:e.target.value})}/><small>Informe 0 apenas se não houver tarefas adicionais.</small></label>
    <label>Composição<select aria-label="Composição da tripulação" value={form.composition} onChange={e=>update({composition:e.target.value,reviewed:false})}><option value="">A confirmar</option><option value="simple">Simples</option><option value="augmented">Composta</option><option value="relief">Revezamento</option></select></label>
    <label>Condição de aclimatação<select aria-label="Condição de aclimatação" value={form.acclimatization} onChange={e=>update({acclimatization:e.target.value,reviewed:false})}><option value="unknown">Indeterminado</option><option value="acclimatized">Aclimatado</option><option value="not_acclimatized">Não aclimatado</option></select></label>
    <label>Limite normal de encerramento<input type="datetime-local" aria-label="Limite normal de encerramento" value={form.normalEnd} onChange={e=>update({normalEnd:e.target.value,reviewed:false,reviewRequired:true,limitSource:'Referência informada para esta simulação'})}/></label>
   </div>
   <label className="cc-reg-review-limit"><input type="checkbox" aria-label="Confirmei o fuso dos horários publicados" checked={form.publicationOffsetReviewed} onChange={e=>update({publicationOffsetReviewed:e.target.checked,reviewed:false})}/>Confirmei o fuso dos horários publicados para usar a referência do motor.</label>
   {sourceAllowed&&reference&&<button type="button" disabled={hasPositioning||form.presentation!==seed.presentation||form.timingChange!=='flight-delay'||form.composition!=='simple'||form.acclimatization!=='acclimatized'||!form.publicationOffsetReviewed||!offsetValid} onClick={useEngineReference}>Usar referência B.1 do motor</button>}
   <label className="cc-reg-review-limit"><input type="checkbox" aria-label="Revisei a referência do limite normal" checked={form.reviewed} onChange={e=>update({reviewed:e.target.checked})}/>Revisei o limite normal aplicável à simulação.</label>
   <p>{form.limitSource}. Aclimatação informada: {acclimatization}.</p>
   {!known&&<ul aria-label="Dados pendentes">{result.missing.map((item:string)=><li key={item}>{item}</li>)}</ul>}
   {known&&<table><caption>Base informada e cenário · UTC{form.offset}</caption><thead><tr><th>Marco</th><th>Sem atraso</th><th>Cenário</th></tr></thead><tbody>{[['Pouso','landing'],['Motores','engineStop'],['Encerramento','dutyEnd']].map(([label,key])=><tr key={key}><th>{label}</th><td>{localClock(result.base[key],form.offset)}</td><td>{localClock(result.scenario[key],form.offset)}</td></tr>)}</tbody></table>}
   <p>{form.method==='schedule'?'Jornada programada: compara encerramento publicado/estimado + atraso com o limite de referência. Tempos de pouso e táxi não são inferidos. ':''}Conta detalhada: decolagem + atraso + tempo em voo + táxi + pós-voo + tarefas. Limite do cenário: limite normal revisado {form.extension?'+ 60 min':'+ 0 min'}. O tempo de voo não recebe 60 minutos.</p>
   <details><summary>Hipótese excepcional de extensão</summary><label className="cc-reg-extension-switch"><span>Simular extensão de 1 hora</span><input type="checkbox" role="switch" aria-label="Simular extensão de 1 hora" checked={form.extension} onChange={e=>update({extension:e.target.checked})}/></label><p>A hipótese não altera os dois prazos normais acima e depende das condições e decisão competentes.</p>{extensionMargin!==null&&<p>Margem da hipótese: {extensionMargin} min. Não é autorização operacional.</p>}</details>
   <details><summary>Fontes e condições</summary><p>Lei 13.475/2017, arts. 35 §4 e 40; RBAC 117 EMD01, 117.3(n)(4) e B117.17(b), vigente desde 01/08/2024. Extensão depende de decisão e condições operacionais competentes.</p><p>ACT LATAM comissários 2025/2027, cláusula 3.3.1: adicional remuneratório não autoriza extensão. Manual/SGRF específico não comprovado. Repouso, madrugadas e limites acumulados: indeterminados nesta comparação temporal.</p><a href="https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2017/lei/l13475.htm" target="_blank" rel="noreferrer">Lei do Aeronauta</a><a href="https://pergamum.anac.gov.br/pergamum/vinculos/RBAC117EMD01.pdf" target="_blank" rel="noreferrer">RBAC 117 EMD01</a></details>
   <button type="button" onClick={()=>setDraft({key,basis,overrides:{}})}><RotateCcw aria-hidden="true"/> Restaurar programação</button>
  </details>
 </section>;
}

export default function RegulationScenarioView(props:Parameters<typeof DetailedRegulationScenarioView>[0]){
 const originalSession=useRef(captureAuthSession()),[invalidated,setInvalidated]=useState(false),[manual,setManual]=useState(false);
 const sourceKey=JSON.stringify([props.scheduleDay,props.program,props.compliance?.legalProfile]);
 useEffect(()=>setManual(false),[sourceKey]);
 useEffect(()=>{const frame=requestAnimationFrame(()=>window.scrollTo({top:0,behavior:'instant'}));return()=>cancelAnimationFrame(frame);},[manual]);
 useEffect(()=>{const reset=()=>{setInvalidated(true);setManual(false);};const storage=(event:StorageEvent)=>{if(event.key===null||['crewcheck_auth_token','crewcheck_auth_user'].includes(event.key)||!originalSession.current.isCurrent())reset();};const names=['crewcheck:auth-will-change','crewcheck:auth-changed','crewcheck:auth-expired'];for(const name of names)window.addEventListener(name,reset);window.addEventListener('storage',storage);return()=>{for(const name of names)window.removeEventListener(name,reset);window.removeEventListener('storage',storage);};},[]);
 if(!originalSession.current.token||!originalSession.current.owner||['visitor','guest'].includes(getStoredUser()?.role||''))return <section className="cc-regulation-scenario"><h1>Regulamentação</h1><p>Entre na conta para simular.</p></section>;
 if(invalidated||!originalSession.current.isCurrent())return <section className="cc-regulation-scenario"><h1>Regulamentação</h1><p>Sessão alterada. Reabra a programação para carregar os dados atuais.</p></section>;
 // A placeholder/borrowed day is not import evidence. Unknown classification on
 // a real imported leg remains imported and cannot be overwritten as manual OP.
 const imported=Boolean(props.scheduleDay&&props.scheduleDay.type!=='IMPORTAR'&&(props.scheduleDay.legs?.length||props.program?.kind==='duty'));
 const automatic=imported&&props.scheduleDay?.type==='VOO'&&!manual;
 if(automatic)return <RegulationAutomaticView scheduleDay={props.scheduleDay!} program={props.program} compliance={props.compliance} operationalArrival={props.operationalArrival} onManual={()=>setManual(true)}/>;
 return <>{imported&&<button className="cc-reg-return-auto" type="button" onClick={()=>setManual(false)}>Voltar ao cenário automático</button>}<DetailedRegulationScenarioView {...props} scheduleDay={imported?props.scheduleDay:null} program={imported?props.program:null}/></>;
}
