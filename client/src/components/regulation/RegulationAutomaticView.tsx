import {useEffect,useMemo,useRef,useState} from 'react';
import {Calculator,ChevronDown,RotateCcw} from 'lucide-react';
import {captureAuthSession} from '@/lib/authClient';
import {regulationAutomaticContext,regulationAutomaticAssessment,type AutomaticRegulationForm} from '@/lib/regulationAutomaticScenario';
import {regulationAircraftEvidence} from '@/lib/regulationAircraftEvidence';
import {useRegulationOperationalArrival,type RegulationOperationalArrivalInput} from '@/lib/useRegulationOperationalArrival';
import type {CanonicalRosterEvent} from '@/lib/canonicalRoster';
import type {RosterDay} from '@/lib/pdfParser';
import type {LegalProfileSummary} from '@/lib/actRules';
import type {ScheduleDayLike} from '@/components/v1432/ManualRegulationView';
import RegulationNavigationContext from './RegulationNavigationContext';
import './regulation-scenario.css';

const localClock=(instant:string|null,offset:string)=>{if(!instant||!/^([+-])\d{2}:\d{2}$/.test(offset))return '—';const sign=offset[0]==='-'?-1:1,shift=sign*(Number(offset.slice(1,3))*60+Number(offset.slice(4)))*60_000;return new Date(Date.parse(instant)+shift).toISOString().slice(0,16).replace('T',' · ');};
type Props={scheduleDay:ScheduleDayLike;program?:CanonicalRosterEvent|null;compliance?:{legalProfile?:LegalProfileSummary};operationalArrival?:RegulationOperationalArrivalInput|null;onManual:()=>void};
export default function RegulationAutomaticView({scheduleDay,program,compliance,operationalArrival,onManual}:Props){
 const session=useRef(captureAuthSession()),[invalidated,setInvalidated]=useState(false),details=useRef<HTMLElement>(null),[editing,setEditing]=useState(false);
 // This is a local scenario continuity fence, not login/source authority.
 const current=Boolean(!invalidated&&session.current.token&&session.current.owner&&session.current.isCurrent());
 const signature=JSON.stringify([scheduleDay,program,compliance?.legalProfile]);
 const context=useMemo(()=>regulationAutomaticContext(current?scheduleDay as RosterDay:null,current?program:null),[current,signature]);
 const [draft,setDraft]=useState<{key:string;overrides:Partial<AutomaticRegulationForm>}>({key:signature,overrides:{}});
 const form={...context.form,...(current&&draft.key===signature?draft.overrides:{})};
 const baseAssessment=regulationAutomaticAssessment(context,form,current?compliance?.legalProfile:null);
 const [forecastMode,setForecastMode]=useState('automatic');
 const finalProgram=context.journey.at(-1),lastActivity=form.workTypes.at(-1)==='OP'?'operating':form.workTypes.at(-1)==='PS'?'positioning':'unknown';
 const {read:operationalRead,projection:operationalProjection}=useRegulationOperationalArrival({input:operationalArrival,sourceAllowed:current&&form.workTypes.every((type,i)=>type===context.form.workTypes[i]),finalProgram,lastActivity,form});
 const useOperational=forecastMode==='automatic'&&Boolean(operationalProjection);
 const operationalEnd=useOperational?operationalProjection.scenario.dutyEnd:null;
 const assessment=operationalEnd?{...baseAssessment,projectedDutyEnd:operationalEnd,marginMinutes:baseAssessment.normalDutyEnd?(Date.parse(baseAssessment.normalDutyEnd)-Date.parse(operationalEnd))/60_000:null}:baseAssessment;
 useEffect(()=>{setDraft({key:signature,overrides:{}});setForecastMode('automatic');},[signature]);
 useEffect(()=>{const reset=()=>{setInvalidated(true);setDraft({key:'',overrides:{}});};const storage=(event:StorageEvent)=>{if(event.key===null||['crewcheck_auth_token','crewcheck_auth_user'].includes(event.key)||!session.current.isCurrent())reset();};const names=['crewcheck:auth-will-change','crewcheck:auth-changed','crewcheck:auth-expired'];for(const name of names)window.addEventListener(name,reset);window.addEventListener('storage',storage);return()=>{for(const name of names)window.removeEventListener(name,reset);window.removeEventListener('storage',storage);};},[]);
 const update=(changes:Partial<AutomaticRegulationForm>)=>setDraft(previous=>({key:signature,overrides:{...(previous.key===signature?previous.overrides:{}),...changes}}));
 function equipmentAt(index:number,value:string){const equipment=[...form.equipment];equipment[index]=value;const group=regulationAircraftEvidence(context.legs.map((leg,i)=>({...leg,aircraftType:equipment[i]}))).group;update({equipment,composition:group==='NB'?'simple':''});}
 function edit(){setEditing(value=>!value);}
 useEffect(()=>{if(editing){details.current?.scrollIntoView({block:'start'});details.current?.querySelector<HTMLInputElement>('input')?.focus({preventScroll:true});}},[editing]);
 if(!current)return <section className="cc-regulation-scenario"><h1>Regulamentação</h1><p>Sessão alterada. Reabra a programação para carregar os dados atuais.</p></section>;
 const composition=form.composition==='augmented'?'composta':form.composition==='relief'?'revezamento':assessment.evidence.composition==='NB_scenario_default'?'simples (padrão NB)':'simples (hipótese)';
 const clockSource=form.offset==='-03:00'?'BRT (convenção de publicação)':'UTC'+form.offset+' (informado)';
 const plannedSource=form.plannedEnd!==context.form.plannedEnd?'encerramento editado':context.plannedEndSource==='published_release'?'liberação publicada':'chegada programada + pós-voo do cenário';
 return <section className="cc-regulation-scenario cc-reg-automatic" aria-label="Regulamentação automática condicional">
  <RegulationNavigationContext/>
  <header className="cc-reg-scenario-heading"><Calculator aria-hidden="true"/><div><h1>Regulamentação</h1><p>Programação de {scheduleDay.date}</p></div></header>
  <section className="cc-reg-scenario-result" aria-label="Resultado automático condicional" data-state={assessment.state}>
   <span>REFERÊNCIA AUTOMÁTICA · HIPÓTESE</span>
   <div className="cc-reg-deadlines">
    <div><h2>Limite da jornada</h2><strong>{localClock(assessment.normalDutyEnd,form.offset).split(' · ').at(-1)}</strong></div>
    <div><h2>Corte dos motores</h2><strong>{localClock(assessment.engineStopLimit,form.offset).split(' · ').at(-1)}</strong></div>
   </div>
   <p className="cc-reg-assumptions">{assessment.aircraft.group==='NB'?'NB':assessment.aircraft.group==='WB'?'WB':assessment.aircraft.group==='mixed'?'Equipamentos mistos':'Equipamento não reconhecido'} · {composition} · {form.acclimatization==='acclimatized'?'aclimatado (padrão)':'aclimatação fora da hipótese'} · {clockSource}.</p>
   <small>Hipótese ajustável — conferir condições.</small>
   {assessment.projectedDutyEnd&&<p>Encerramento previsto: <b>{localClock(assessment.projectedDutyEnd,form.offset)}</b>{useOperational?` · ${operationalRead.kind==='actual'?'pouso real':'pouso estimado'} · ${operationalRead.provider} · observado ${localClock(operationalRead.observedAt,form.offset)}`:' · escala + atraso manual'}.</p>}
   {assessment.marginMinutes!==null&&<p className="cc-reg-margin">{assessment.marginMinutes>=0?`${assessment.marginMinutes} min de diferença até a referência`:`${Math.abs(assessment.marginMinutes)} min além da referência`} · neste cenário</p>}
   {(assessment.missing.length>0||!assessment.normalDutyEnd)&&<p role="status">{assessment.missing[0]||assessment.conditions[0]||'Dados do cenário a completar'}.</p>}
   {!assessment.engineStopLimit&&assessment.normalDutyEnd&&<p role="status">Corte depende de pós-voo, tarefas e última etapa operada conhecidos.</p>}
   <button type="button" aria-expanded={editing} onClick={edit}>Ajustar dados</button>
  </section>
  <section className="cc-reg-scenario-actions" aria-label="Atraso do cenário"><h2>Atraso previsto</h2><label>Minutos de atraso<input aria-label="Atraso previsto em minutos" disabled={useOperational} type="number" inputMode="numeric" min="0" max="1440" value={form.delay} onChange={e=>update({delay:e.target.value})}/></label><div className="cc-reg-delay-options">{[0,15,30,60].map(value=><button type="button" key={value} disabled={useOperational} aria-pressed={form.delay===String(value)} onClick={()=>update({delay:String(value)})}>{value?`+${value} min`:'Sem atraso'}</button>)}</div><p>{useOperational?'Chegada com evidência + táxi, pós-voo e tarefas; atraso manual não é somado.':'O atraso desloca a previsão do cenário. A apresentação e o limite não aumentam.'}</p></section>
  {editing&&<section ref={details} className="cc-reg-scenario-details" aria-label="Dados do cenário"><h2>Dados do cenário</h2>
   <p>Ajustes valem apenas para este cenário. Dados importados e valores padrão permanecem distinguíveis; nada é gravado na escala.</p>
   <div className="cc-reg-scenario-inputs">
    <label>Apresentação<input aria-label="Apresentação da jornada" type="datetime-local" value={form.presentation} onChange={e=>update({presentation:e.target.value})}/><small>{assessment.evidence.presentation==='published'?'Publicada na jornada selecionada':'Informada para o cenário; origem publicada não comprovada'}</small></label>
    <label>Fuso<input aria-label="Deslocamento UTC" value={form.offset} onChange={e=>update({offset:e.target.value})}/><small>BRT é convenção do importador, não confirmação documental nem hora aclimatada.</small></label>
    <label>Composição<select aria-label="Composição da tripulação" value={form.composition} onChange={e=>update({composition:e.target.value})}><option value="">Não comprovada · comparação simples</option><option value="simple">Simples</option><option value="augmented">Composta</option><option value="relief">Revezamento</option></select><small>NB→simples é o padrão ajustável solicitado, não equivalência legal.</small></label>
    <label>Aclimatação<select aria-label="Condição de aclimatação" value={form.acclimatization} onChange={e=>update({acclimatization:e.target.value})}><option value="acclimatized">Aclimatado · cenário padrão</option><option value="not_acclimatized">Não aclimatado</option><option value="unknown">Indeterminado</option></select></label>
    <label>Tipo de voo<select aria-label="Tipo de voo" value={form.operation} onChange={e=>update({operation:e.target.value,postFlight:e.target.value==='domestic'?'30':e.target.value==='international'?'45':''})}><option value="">Não identificado</option><option value="domestic">Doméstico</option><option value="international">Internacional</option></select></label>
    <label>Pós-voo do cenário<input aria-label="Pós-voo em minutos" type="number" min="0" max="360" value={form.postFlight} onChange={e=>update({postFlight:e.target.value})}/><small>30/45 min são parâmetros do cenário existente; não comprovam pós-voo real nem regra aplicável.</small></label>
    <label>Tarefas posteriores<input aria-label="Tarefas posteriores em minutos" type="number" min="0" max="1440" value={form.tasks} onChange={e=>update({tasks:e.target.value})}/><small>Zero é padrão do cenário; ajuste se houver tarefas.</small></label>
    <label>Encerramento previsto<input aria-label="Encerramento programado da jornada" type="datetime-local" value={form.plannedEnd} onChange={e=>update({plannedEnd:e.target.value})}/><small>{plannedSource}</small></label>
    <label>Fonte da previsão<select aria-label="Fonte da previsão de encerramento" value={forecastMode} onChange={e=>setForecastMode(e.target.value)}><option value="automatic">Automática, quando houver evidência válida</option><option value="manual">Programação e atraso manual</option></select><small>{useOperational?`${operationalRead.provider} · observado ${localClock(operationalRead.observedAt,form.offset)}`:operationalArrival?'Fonte sem evidência atual para esta etapa; usando programação e atraso manual.':'Sem chegada operacional admitida; usando programação e atraso manual.'}</small></label>
    <label>Táxi após pouso (min)<input aria-label="Táxi de chegada em minutos" type="number" min="0" max="240" value={form.taxi} onChange={e=>update({taxi:e.target.value})}/><small>Necessário para usar pouso operacional; chegada ao portão não vira corte dos motores.</small></label>
    <label>O que mudou?<select aria-label="Tipo de alteração da jornada" value={form.timingChange} onChange={e=>update({timingChange:e.target.value})}><option value="flight-delay">Atraso dos voos, mesma apresentação</option><option value="presentation-change">Apresentação alterada</option><option value="reprogramming">Reprogramação / interrupção</option></select></label>
   </div>
   <h2>Etapas da jornada</h2><p>Etapas, rotas e horários publicados ficam preservados neste cenário; ajustes temporais detalhados em Simulação manual.</p>{context.legs.map((leg,index)=><div className="cc-reg-scenario-inputs" key={index}><p>{leg.flightNumber} · {leg.origin} → {leg.destination} · {leg.departureTime} → {leg.arrivalTime}</p><label>Equipamento de {leg.flightNumber}<input aria-label={`Equipamento da etapa ${index+1}`} value={form.equipment[index]||''} onChange={e=>equipmentAt(index,e.target.value)}/><small>{assessment.aircraft.rows[index]?.group==='unknown'?'Não reconhecido; sem inferência pela rota':`${assessment.aircraft.rows[index]?.model} · ${assessment.aircraft.rows[index]?.group} · ${form.equipment[index]===context.form.equipment[index]?'escala':'cenário editado'}`}</small></label><label>Atividade de {leg.flightNumber}<select aria-label={`Atividade da etapa ${index+1}`} value={form.workTypes[index]||''} onChange={e=>{const workTypes=[...form.workTypes];workTypes[index]=e.target.value;update({workTypes});}}><option value="">Não comprovada</option><option value="OP">OP · operada</option><option value="PS">PS · deslocamento</option></select></label></div>)}
   {assessment.conditions.map(condition=><p key={condition}>{condition}.</p>)}
   <button type="button" onClick={()=>{setDraft({key:signature,overrides:{}});setForecastMode('automatic');}}><RotateCcw aria-hidden="true"/> Restaurar dados da escala</button>
   <button type="button" onClick={onManual}>Simulação manual</button>
  </section>}
  <details className="cc-reg-scenario-details"><summary>Ver cálculo e regras <ChevronDown aria-hidden="true"/></summary><p>{assessment.reference?.source||'Sem referência calculável'}. Versão {assessment.version}.</p>{assessment.reference&&<p>{assessment.reference.sectors} etapa(s), apresentação {assessment.reference.startTime}, referência existente {assessment.reference.maxDutyMinutes} min. {assessment.referenceDutyEnd&&`Encerramento hipotético B.1: ${localClock(assessment.referenceDutyEnd,form.offset)}.`}</p>}<p>Resultado numérico condicional separado da conformidade operacional. Composição, aclimatação, ACT/SGRF, repousos e acumulados não foram validados por estes padrões.</p><p>Corte no cenário = referência de encerramento − pós-voo parametrizado − tarefas. Chegada não é parada de motores. Pós-voo, tarefas e atrasos são hipóteses editáveis; o limite não recebe minutos extras.</p><p>{assessment.aircraft.group==='unknown'?'Equipamento não classificado':`Catálogo ${assessment.aircraft.version}: ${assessment.aircraft.group}`}; somente equipamentos da jornada selecionada.</p></details>
 </section>;
}
