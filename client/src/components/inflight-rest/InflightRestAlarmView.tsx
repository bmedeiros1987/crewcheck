import {useEffect,useMemo,useState} from 'react';
import {AlarmClock,BellOff,Vibrate} from 'lucide-react';
import {planInflightRest,inflightRestGroup,INFLIGHT_REST_LIMITS} from '@shared/inflightRestPlan.mjs';
import {INFLIGHT_REST_ALARM_ENABLED,deviceLocalInstant,inflightRestJobs,inflightRestReason} from '../../lib/inflightRestAlarm';
import {cancelLocalAlarms,localAlarmCapabilities,readLocalAlarmGroup,replaceLocalAlarms,type LocalAlarmArmed} from '../../lib/localAlarms';
import './inflight-rest.css';

type Props={flightId?:string; defaultStart?:string; defaultEnd?:string; now?:()=>number};
const turnChoices=Array.from({length:INFLIGHT_REST_LIMITS.maxTurns-INFLIGHT_REST_LIMITS.minTurns+1},(_,i)=>i+INFLIGHT_REST_LIMITS.minTurns);
const clock=(value:string|number)=>new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'}).format(new Date(value));
const day=(value:string|number)=>new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit'}).format(new Date(value));

/** Split of the crew rest and its local alarms. Renders nothing while the feature is OFF. */
export function InflightRestAlarmView(props:Props) {
  if(!INFLIGHT_REST_ALARM_ENABLED)return null;
  return <InflightRestAlarmEditor {...props}/>;
}

export function InflightRestAlarmEditor({flightId='manual',defaultStart='',defaultEnd='',now=Date.now}:Props) {
  const [start,setStart]=useState(defaultStart),[end,setEnd]=useState(defaultEnd);
  const [turns,setTurns]=useState(3),[handover,setHandover]=useState(10),[myTurn,setMyTurn]=useState<number|null>(1);
  const [everyHandover,setEveryHandover]=useState(false),[mode,setMode]=useState<'sound'|'vibrate'>('sound');
  const [status,setStatus]=useState(''),[busy,setBusy]=useState(false),[armed,setArmed]=useState<LocalAlarmArmed[]|null>(null);
  const group=inflightRestGroup(flightId);
  const capabilities=useMemo(()=>localAlarmCapabilities(),[]);
  useEffect(()=>{if(group)setArmed(readLocalAlarmGroup(group));},[group]);
  useEffect(()=>{if(myTurn!==null&&myTurn>turns)setMyTurn(turns);},[turns,myTurn]);

  const startAt=deviceLocalInstant(start),endAt=deviceLocalInstant(end);
  const plan=startAt&&endAt?planInflightRest({flightId,startAt,endAt,turns,handoverMinutes:handover,myTurn,alertEveryHandover:everyHandover,mode},now()):null;
  const draft=!start||!end?'Informe o início e o fim do descanso.':!startAt||!endAt?inflightRestReason('invalid-instant'):plan&&!plan.ok?inflightRestReason(plan.reason):'';
  const ready=plan?.ok===true&&capabilities.enabled&&capabilities.permitted&&!busy;

  const program=()=>{
    if(!plan?.ok||!group)return;setBusy(true);
    const result=replaceLocalAlarms(group,inflightRestJobs(plan));
    setArmed(readLocalAlarmGroup(group));setBusy(false);
    if(!result.ok){setStatus(inflightRestReason(result.reason));return;}
    setStatus(result.armed.length===0?'Nenhum alarme programado para este descanso.'
      :`${result.armed.length===1?'Alarme programado':`${result.armed.length} alarmes programados`} no aparelho.${result.exact?'':' Sem permissão de alarme exato, pode tocar alguns minutos depois.'}`);
  };
  const cancel=()=>{
    if(!group)return;setBusy(true);const result=cancelLocalAlarms(group);setArmed(readLocalAlarmGroup(group));setBusy(false);
    setStatus(result.ok?'Alarmes deste descanso cancelados.':inflightRestReason(result.reason));
  };

  return <section className="cc-inflight-rest" aria-label="Descanso a bordo">
    <h2><AlarmClock size={20} aria-hidden="true"/> Descanso a bordo</h2>
    <p>Divide o período de descanso em turnos iguais, com um intervalo para a troca, e toca no fim do seu turno.</p>
    <div className="cc-inflight-rest-fields">
      <label>Início do descanso<input type="datetime-local" value={start} onChange={event=>setStart(event.target.value)}/></label>
      <label>Fim do descanso<input type="datetime-local" value={end} onChange={event=>setEnd(event.target.value)}/></label>
      <label>Turnos<select value={turns} onChange={event=>setTurns(Number(event.target.value))}>{turnChoices.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
      <label>Troca entre turnos<select value={handover} onChange={event=>setHandover(Number(event.target.value))}>{[0,5,10,15,20,30].map(value=><option key={value} value={value}>{value} min</option>)}</select></label>
      <label>Meu turno<select value={myTurn??0} onChange={event=>setMyTurn(Number(event.target.value)||null)}>
        {Array.from({length:turns},(_,i)=><option key={i+1} value={i+1}>Turno {i+1}</option>)}<option value={0}>Só acompanhar</option></select></label>
    </div>
    <p className="cc-inflight-rest-zone">Horários do aparelho · {Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
    <label className="cc-inflight-rest-check"><input type="checkbox" checked={everyHandover} onChange={event=>setEveryHandover(event.target.checked)}/><span>Avisar em toda troca, não só no fim do meu turno</span></label>
    <fieldset className="cc-inflight-rest-mode"><legend>Como tocar</legend>
      <label><input type="radio" name="inflight-rest-mode" checked={mode==='sound'} onChange={()=>setMode('sound')}/><span><AlarmClock size={16} aria-hidden="true"/> Som e vibração</span></label>
      <label><input type="radio" name="inflight-rest-mode" checked={mode==='vibrate'} onChange={()=>setMode('vibrate')}/><span><Vibrate size={16} aria-hidden="true"/> Só vibração (cabine em silêncio)</span></label>
    </fieldset>
    {plan?.ok&&<ol className="cc-inflight-rest-turns" aria-label="Turnos">{plan.turns.map(turn=><li key={turn.index} data-mine={turn.mine||undefined}>
      <strong>Turno {turn.index}{turn.mine?' · seu':''}</strong><span>{clock(turn.startAt)}–{clock(turn.endAt)} · {turn.minutes} min{day(turn.startAt)!==day(turn.endAt)?` · termina ${day(turn.endAt)}`:''}</span></li>)}</ol>}
    {plan?.ok&&plan.watchOnly&&<p className="cc-inflight-rest-note">Só acompanhando: nenhum alarme será programado. Ative "Avisar em toda troca" para ser avisado de cada turno.</p>}
    {plan?.ok&&plan.past.length>0&&<p className="cc-inflight-rest-note">{plan.past.length===1?'Um horário já passou e não será programado.':`${plan.past.length} horários já passaram e não serão programados.`}</p>}
    <p className="cc-inflight-rest-status" role="status">{draft||status||(capabilities.enabled?capabilities.permitted?'Pronto · ainda não programado.':inflightRestReason('notifications-not-permitted'):inflightRestReason(capabilities.available?'disabled':'unavailable'))}</p>
    {armed&&armed.length>0&&<p className="cc-inflight-rest-armed">Programado no aparelho: {armed.map(item=>clock(item.at)).join(', ')}</p>}
    <button type="button" className="primary" disabled={!ready} onClick={program}>{busy?'Programando…':'Programar alarmes'}</button>
    <button type="button" disabled={busy||!capabilities.enabled||!armed?.length} onClick={cancel}><BellOff size={16} aria-hidden="true"/> Cancelar alarmes deste descanso</button>
    <p className="cc-inflight-rest-note">Funciona sem internet. Se o aparelho reiniciar, abra esta tela e programe de novo.</p>
  </section>;
}
