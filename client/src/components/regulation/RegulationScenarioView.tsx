import {useEffect,useMemo,useRef,useState} from 'react';
import {Calculator,ChevronDown,RotateCcw} from 'lucide-react';
import {getStoredUser,getToken} from '@/lib/authClient';
import {getScheduledDutyLimitReference} from '@/lib/complianceEngine';
import type {LegalProfileSummary} from '@/lib/actRules';
import type {CanonicalRosterEvent} from '@/lib/canonicalRoster';
import {resolvePerDiemRule} from '@/lib/financialRules';
import {publishedDutyEndpoints} from '@/lib/canonicalDutyMeasurement';
import {regulationScenarioSeed,regulationDraftForm,regulationScheduleProjection} from '@shared/regulationScenarioPrefill.mjs';
import type {RosterDay} from '@/lib/pdfParser';
import type {ScheduleDayLike} from '@/components/v1432/ManualRegulationView';
import {projectRegulationScenario,explicitInstant} from '@shared/regulationTemporalScenario.mjs';
import RegulationNavigationContext from './RegulationNavigationContext';
import './regulation-scenario.css';
const session=()=>{const u=getStoredUser(),t=getToken();return u&&t&&!['visitor','guest'].includes(u.role||'')?[u.id,u.email,t].join(':'):'';};
const number=(s:string)=>/^\d+$/.test(s)?Number(s):null;
const dateOf=(s?:string|null)=>{const m=String(s||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?`${m[3]}-${m[2]}-${m[1]}`:/^\d{4}-\d{2}-\d{2}$/.test(s||'')?s!:'';};
const defaults=()=>({takeoff:'',normalEnd:'',offset:'',flight:'',delay:'0',taxi:'',postFlight:'',tasks:'',operation:'',extension:false,reviewed:false,publicationOffsetReviewed:false,composition:'',acclimatization:'unknown',limitSource:'Referência informada para esta simulação',method:'schedule',plannedEnd:'',plannedEndSource:'',scheduledArrival:''});
function localClock(instant:string|undefined,offset:string){if(!instant||!/^([+-])(\d{2}):(\d{2})$/.test(offset))return '—';const sign=offset[0]==='-'?-1:1,shift=sign*(Number(offset.slice(1,3))*60+Number(offset.slice(4)))*60000;return new Date(Date.parse(instant)+shift).toISOString().slice(0,16).replace('T',' · ');}
export default function RegulationScenarioView({scheduleDay,compliance,program}:{scheduleDay?:ScheduleDayLike|null;program?:CanonicalRosterEvent|null;compliance?:{legalProfile?:LegalProfileSummary;alerts?:Array<{title?:string;description?:string;actionable?:boolean;classification?:string;severity?:string}>}}){
 const details=useRef<HTMLDetailsElement>(null),owner=session(),signature=JSON.stringify(scheduleDay||null),key=owner+'|'+(program?.id||scheduleDay?.date||'manual');
 const admittedOwner=useRef(owner),observedOwner=useRef(owner),sourceAllowed=Boolean(owner&&admittedOwner.current===owner);
 const reference=useMemo(()=>{try{return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(scheduleDay?.dutyReport||'')?getScheduledDutyLimitReference(scheduleDay as RosterDay,compliance?.legalProfile):null;}catch{return null;}},[signature,compliance?.legalProfile]);
 const seed=useMemo(()=>{
  if(!sourceAllowed)return defaults();
  const next=regulationScenarioSeed(scheduleDay,reference,program);
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
 const form=regulationDraftForm(draft,key,seed,basis) as Form;
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
 const acclimatization=form.acclimatization==='acclimatized'?'Aclimatado':form.acclimatization==='not_acclimatized'?'Não aclimatado':'Indeterminado';
 const alerts=(sourceAllowed?compliance?.alerts||[]:[]).filter(a=>a.actionable!==false&&!['dados_insuficientes','informativa'].includes(a.classification||'')).slice(0,2);
 function openDetails(){if(details.current){details.current.open=true;details.current.scrollIntoView({block:'start',behavior:'smooth'});details.current.querySelector<HTMLInputElement>('input')?.focus({preventScroll:true});}}
 function useEngineReference(){if(!sourceAllowed||!reference||form.composition!=='simple'||form.acclimatization!=='acclimatized'||!form.publicationOffsetReviewed||!offsetValid)return;const date=dateOf(scheduleDay?.date),start=explicitInstant(date+'T'+reference.startTime+form.offset);if(start===null)return;const shift=(form.offset[0]==='-'?-1:1)*(Number(form.offset.slice(1,3))*60+Number(form.offset.slice(4)))*60000;const end=new Date(start+reference.maxDutyMinutes*60000+shift).toISOString().slice(0,16);update({normalEnd:end,reviewed:false,limitSource:'Motor existente · '+reference.source+', fuso informado '+form.offset+', aplicabilidade pendente'});}
 if(!owner)return <section className="cc-regulation-scenario"><h1>Regulamentação</h1><p>Entre na conta para simular.</p></section>;
 return <section className="cc-regulation-scenario" aria-label="Simulação de regulamentação">{sourceAllowed&&<RegulationNavigationContext/>}
  <header className="cc-reg-scenario-heading"><Calculator aria-hidden="true"/><div><h1>Regulamentação</h1><p>{sourceAllowed&&scheduleDay?.date?`Programação de ${scheduleDay.date}`:'Simulação sem escala'}</p></div></header>
  <section className="cc-reg-scenario-result" aria-label="Resultado temporal" data-state={result.state}>
   <span>SIMULAÇÃO · {form.extension?'+1 hora':'SEM EXTENSÃO'}</span><h2>{!known?'Indeterminado':within?(form.method==='schedule'?'Programação dentro da referência':'Cabe na referência informada'):(form.method==='schedule'?'Programação excede a referência':'Excede a referência informada')}</h2>
   {known?<><strong>{result.marginMinutes>=0?`${result.marginMinutes} min de margem`:`${Math.abs(result.marginMinutes)} min acima`}</strong><p>{form.method==='schedule'?'Projeção programada condicional · atraso desloca o encerramento; não autoriza extensão.':'Comparação temporal condicional · não autoriza extensão.'}</p></>:<><p>Confirme os dados pendentes para concluir a comparação.</p><button type="button" onClick={openDetails}>Completar dados</button></>}
   {form.method==='schedule'&&<p>{form.plannedEndSource}. {form.limitSource}. {form.limitSource.startsWith('Motor existente')?'Hipótese B.1: tripulação simples e aclimatada; composição e aclimatação permanecem a confirmar.':'Limite informado pelo usuário; aplicabilidade a revisar.'}</p>}
   <dl><div><dt>Pouso estimado</dt><dd>{localClock(result.scenario?.landing,form.offset)}</dd></div><div><dt>Parada final dos motores</dt><dd>{localClock(result.scenario?.engineStop,form.offset)}</dd></div><div><dt>Encerramento estimado</dt><dd>{localClock(result.scenario?.dutyEnd,form.offset)}</dd></div></dl>
   <small>{known?`Referência UTC${form.offset} · validação regulatória indeterminada`:'Horários disponíveis preservados; dados pendentes abaixo.'}</small><p className="cc-reg-acclimatization-status">{acclimatization==='Indeterminado'?'Aclimatação: Indeterminado':`${acclimatization} · informado`}</p>
  </section>
  <section className="cc-reg-scenario-actions" aria-label="Cenário de atraso"><label className="cc-reg-extension-switch"><span>Simular extensão de 1 hora</span><input type="checkbox" role="switch" aria-label="Simular extensão de 1 hora" checked={form.extension} onChange={e=>update({extension:e.target.checked})}/></label><label>Atraso previsto (min)<input aria-label="Atraso previsto em minutos" type="number" min="0" max="1440" value={form.delay} onChange={e=>update({delay:e.target.value})}/></label><p>{form.method==='schedule'?'Na projeção programada, o atraso desloca o encerramento da jornada; reveja mudanças de programação.':'O atraso desloca só a decolagem deste trecho.'}</p></section>
  {known&&result.crossesReferenceDate&&<p role="status" className="cc-reg-scenario-warning">A projeção muda de data. Madrugadas e histórico precisam ser reavaliados.</p>}
  {alerts.length>0&&<section aria-label="Alertas da escala" className="cc-reg-scenario-alerts">{alerts.map((a,i)=><p key={i}>{a.title||'Alerta da escala'}</p>)}<button onClick={()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'alerts'}))}>Ver alertas</button></section>}
  <details ref={details} className="cc-reg-scenario-details"><summary>Ver cálculo <ChevronDown aria-hidden="true"/></summary>
   <label>Método da projeção<select aria-label="Método da projeção" value={form.method} onChange={e=>update({method:e.target.value})}><option value="schedule">Jornada programada</option><option value="detailed">Decolagem, voo e táxi</option></select></label>
   <label>Encerramento programado / estimado<input type="datetime-local" aria-label="Encerramento programado da jornada" value={form.plannedEnd} onChange={e=>update({plannedEnd:e.target.value,plannedEndSource:'Encerramento informado pelo usuário'})}/><small>{form.plannedEndSource||'Liberação não comprovada; informe uma estimativa para simular.'}</small></label>
   {sourceAllowed&&<p>Apresentação usada na referência: {scheduleDay?.dutyReport||'ausente'} · {reference?.presentationSource==='published'?'publicada':reference?'estimada; confirme o horário':'referência indisponível'}. Ajuste o limite abaixo se a apresentação aplicável for diferente.</p>}
   <p>Dados da programação preenchidos para revisão. Partida programada não comprova decolagem real.</p><p>{sourceAllowed&&compliance?.legalProfile?.actName||'Perfil ACT não disponível'}</p><div className="cc-reg-scenario-inputs">
    <label>Partida programada / estimativa de decolagem<input type="datetime-local" aria-label="Decolagem base" value={form.takeoff} onChange={e=>update({takeoff:e.target.value})}/></label>
    <label>Fuso explícito (UTC±HH:MM)<input aria-label="Deslocamento UTC" value={form.offset} onChange={e=>update({offset:e.target.value,reviewed:false,publicationOffsetReviewed:false})} placeholder="-03:00"/></label>
    <p>Os campos de voo, táxi e tarefas abaixo compõem o método “Decolagem, voo e táxi”. Na jornada programada, edite o encerramento acima; quando ele for estimado, pós-voo e tarefas atualizam a estimativa.</p>
    <label>Duração em voo (min)<input type="number" min="1" max="1440" aria-label="Duração em voo em minutos" value={form.flight} onChange={e=>update({flight:e.target.value})}/><small>Estimativa informada. Não copie tempo de bloco como tempo em voo.</small></label>
    <label>Táxi até parada dos motores (min)<input type="number" min="0" max="240" aria-label="Táxi de chegada em minutos" value={form.taxi} onChange={e=>update({taxi:e.target.value})}/></label>
    <label>Tipo de voo<select aria-label="Tipo de voo" value={form.operation} onChange={e=>update({operation:e.target.value,postFlight:e.target.value==='domestic'?'30':e.target.value==='international'?'45':''})}><option value="">A confirmar</option><option value="domestic">Doméstico</option><option value="international">Internacional</option></select></label>
    <label>Pós-voo (min)<input type="number" aria-label="Pós-voo em minutos" value={form.postFlight} onChange={e=>update({postFlight:e.target.value})}/><small>Mínimo de referência: 30 doméstico / 45 internacional; outras tarefas somam.</small></label>
    <label>Tarefas após pós-voo (min)<input type="number" min="0" aria-label="Tarefas posteriores em minutos" value={form.tasks} onChange={e=>update({tasks:e.target.value})}/><small>Informe 0 apenas se não houver tarefas adicionais.</small></label>
    <label>Composição<select aria-label="Composição da tripulação" value={form.composition} onChange={e=>update({composition:e.target.value,reviewed:false})}><option value="">A confirmar</option><option value="simple">Simples</option><option value="augmented">Composta</option><option value="relief">Revezamento</option></select></label>
    <label>Condição de aclimatação<select aria-label="Condição de aclimatação" value={form.acclimatization} onChange={e=>update({acclimatization:e.target.value,reviewed:false})}><option value="unknown">Indeterminado</option><option value="acclimatized">Aclimatado</option><option value="not_acclimatized">Não aclimatado</option></select></label>
    <label>Limite normal de encerramento<input type="datetime-local" aria-label="Limite normal de encerramento" value={form.normalEnd} onChange={e=>update({normalEnd:e.target.value,reviewed:false,limitSource:'Referência informada para esta simulação'})}/></label>
   </div>
   <label className="cc-reg-review-limit"><input type="checkbox" aria-label="Confirmei o fuso dos horários publicados" checked={form.publicationOffsetReviewed} onChange={e=>update({publicationOffsetReviewed:e.target.checked,reviewed:false})}/>Confirmei o fuso dos horários publicados para usar a referência do motor.</label>
   {sourceAllowed&&reference&&<button type="button" disabled={form.composition!=='simple'||form.acclimatization!=='acclimatized'||!form.publicationOffsetReviewed||!offsetValid} onClick={useEngineReference}>Usar referência B.1 do motor</button>}
   <label className="cc-reg-review-limit"><input type="checkbox" aria-label="Revisei a referência do limite normal" checked={form.reviewed} onChange={e=>update({reviewed:e.target.checked})}/>Revisei o limite normal aplicável à simulação.</label>
   <p>{form.limitSource}. Aclimatação informada: {acclimatization}.</p>
   {!known&&<ul aria-label="Dados pendentes">{result.missing.map((item:string)=><li key={item}>{item}</li>)}</ul>}
   {known&&<table><caption>Base informada e cenário · UTC{form.offset}</caption><thead><tr><th>Marco</th><th>Sem atraso</th><th>Cenário</th></tr></thead><tbody>{[['Pouso','landing'],['Motores','engineStop'],['Encerramento','dutyEnd']].map(([label,key])=><tr key={key}><th>{label}</th><td>{localClock(result.base[key],form.offset)}</td><td>{localClock(result.scenario[key],form.offset)}</td></tr>)}</tbody></table>}
   <p>{form.method==='schedule'?'Jornada programada: compara encerramento publicado/estimado + atraso com o limite de referência. Tempos de pouso e táxi não são inferidos. ':''}Conta detalhada: decolagem + atraso + tempo em voo + táxi + pós-voo + tarefas. Limite do cenário: limite normal revisado {form.extension?'+ 60 min':'+ 0 min'}. O tempo de voo não recebe 60 minutos.</p>
   <details><summary>Fontes e condições</summary><p>Lei 13.475/2017, arts. 35 §4 e 40; RBAC 117 EMD01, 117.3(n)(4) e B117.17(b), vigente desde 01/08/2024. Extensão depende de decisão e condições operacionais competentes.</p><p>ACT LATAM comissários 2025/2027, cláusula 3.3.1: adicional remuneratório não autoriza extensão. Manual/SGRF específico não comprovado. Repouso, madrugadas e limites acumulados: indeterminados nesta comparação temporal.</p><a href="https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2017/lei/l13475.htm" target="_blank" rel="noreferrer">Lei do Aeronauta</a><a href="https://pergamum.anac.gov.br/pergamum/vinculos/RBAC117EMD01.pdf" target="_blank" rel="noreferrer">RBAC 117 EMD01</a></details>
   <button type="button" onClick={()=>setDraft({key,basis,overrides:{}})}><RotateCcw aria-hidden="true"/> Restaurar programação</button>
  </details>
 </section>;
}
