import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { DoorOpen, Trash2 } from 'lucide-react';
import { getStoredUser, getToken } from '@/lib/authClient';
import { MANUAL_GATE_EVENT, writeManualGate, patchManualOperationalFields, manualGateRevision, manualGateIdentity, boardingTypeLabel, type BoardingType, type NextFlightLike } from '@/lib/nextFlightGate';
import { currentManualGateAccount, useNextFlightGate } from './useNextFlightGate';
import { gateSourceLabel } from './NextFlightGateCard';
import { ManualGateReview } from './ManualGateReview';
import './next-flight-gate.css';

function authorLabel(): string {
  try {
    const user = getStoredUser();
    return String(user?.name || user?.email || '').trim() || 'Este dispositivo';
  } catch {
    return 'Este dispositivo';
  }
}

/** Portão informado pelo tripulante no Radar, associado ao voo e à data deste evento. */
export function ManualGateEditor({ event }: { event: NextFlightLike }) {
  const info = useNextFlightGate(event.kind === 'flight' && !event.placeholder ? event : null);
  const manual = info?.manual || null;
  const owner = currentManualGateAccount(), token = getToken();
  const scope = [owner, token, event.id, manualGateIdentity(event), event.canonical?.startDateTime].join('|');
  const capturedOccurrence = [event.id,manualGateIdentity(event),event.canonical?.startDateTime].join('|');
  const active = useRef(scope);active.current=scope;
  useEffect(()=>()=>{if(active.current===scope)active.current='';},[scope]);
  const initial = () => ({scope,gate:manual?.gate || '',terminal:manual?.terminal || '',status:manual?.operationalStatus?.value || '',registration:manual?.operationalRegistration?.value || '',boardingType:info?.manualBoardingType?.value || 'unknown' as BoardingType,revision:manualGateRevision(manual,owner,event)});
  const [draft,setDraft] = useState(initial);
  const values = draft.scope === scope ? draft : initial();
  const {gate,terminal,status,registration,boardingType} = values;
  const update = (field:'gate'|'terminal'|'status'|'registration',value:string) => setDraft({...values,[field]:value,...(field === 'gate' && value !== gate ? {boardingType:'unknown' as BoardingType} : {})});
  const [notice,setNotice] = useState({scope:'',text:''});
  const message = notice.scope === scope ? notice.text : '';
  const setMessage = (text:string) => setNotice({scope,text});
  const gateId = useId();
  const terminalId = useId(), boardingTypeId = useId();
  const statusId = useId(), registrationId = useId();
  useEffect(() => { setDraft(initial()); }, [scope,manual?.gate,manual?.terminal,manual?.setAtEpochMs,manual?.operationalStatus?.setAtEpochMs,manual?.operationalRegistration?.setAtEpochMs,manualGateRevision(manual,owner,event)]);
  const sessionCurrent = () => Boolean(active.current === scope && token && owner !== 'local' && currentManualGateAccount() === owner && getToken() === token
    && [event.id,manualGateIdentity(event),event.canonical?.startDateTime].join('|') === capturedOccurrence);

  if (!info) return null;

  function save(value: string, nextTerminal: string) {
    if (!sessionCurrent()) { setMessage('A conta ou sessão mudou. Reveja a programação.'); return; }
    const result = writeManualGate(window.localStorage, owner, event, { gate: value, terminal: nextTerminal, author: authorLabel(), boardingType: value ? boardingType : 'unknown', expectedManualRevision: values.revision });
    if (!result.ok) { setMessage(result.message); return; }
    setMessage(result.entry ? `Portão ${result.entry.gate} salvo para ${result.entry.flight} em ${result.entry.date.split('-').reverse().join('/')}.` : 'Portão manual removido.');
    window.dispatchEvent(new CustomEvent(MANUAL_GATE_EVENT, { detail: { eventId: event.id } }));
  }

  function saveField(field:'status'|'registration',value:string|null) {
    if (!sessionCurrent()) { setMessage('A conta ou sessão mudou. Reveja a programação.'); return; }
    const result = patchManualOperationalFields(window.localStorage,owner,event,{[field]:value},authorLabel());
    if (!result.ok) { setMessage(result.message); return; }
    setMessage(value === null ? 'Informação manual removida deste campo.' : 'Informação manual salva para esta ocorrência neste dispositivo.');
    window.dispatchEvent(new CustomEvent(MANUAL_GATE_EVENT,{detail:{eventId:event.id}}));
  }

  function submit(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (!gate.trim()) { setMessage('Informe o portão de embarque.'); return; }
    save(gate, terminal);
  }

  return <section className="cz-toolbox cc-manual-gate" aria-labelledby={`${gateId}-title`}>
    <h2 id={`${gateId}-title`}><DoorOpen aria-hidden="true"/> Informações operacionais manuais</h2>
    <p>Vale só para {info.flight} em {info.operationalDate.split('-').reverse().join('/')} ({info.origin} → {info.destination}). Não substitui a fonte: divergências continuam visíveis.</p>
    {manual?.gate && <p className="cc-manual-gate-current">{info.manualGateUnlinked ? 'Informação manual anterior sem vínculo com esta partida. Confirme e salve novamente:' : gateSourceLabel({ ...info, gateSource: 'manual' })} <b>{manual.gate}</b>{manual.terminal ? ` · Terminal ${manual.terminal}` : ''}</p>}
    {info.manualBoardingType && <p>Tipo de embarque: <b>{boardingTypeLabel(info.boardingType)}</b> · informado por {info.manualBoardingType.author} em {new Date(info.manualBoardingType.setAtEpochMs).toLocaleString('pt-BR')}.</p>}
    <ManualGateReview event={event} info={info}/>
    <form onSubmit={submit}>
      <label htmlFor={gateId}>Portão de embarque</label>
      <input id={gateId} value={gate} maxLength={12} autoCapitalize="characters" autoComplete="off" inputMode="text" placeholder="Ex.: 24" onChange={(e) => update('gate',e.target.value)}/>
      <label htmlFor={boardingTypeId}>Tipo de embarque informado por você</label>
      <select id={boardingTypeId} value={boardingType} onChange={e=>setDraft({...values,boardingType:e.target.value as BoardingType})} aria-describedby={`${boardingTypeId}-help`}>
        <option value="unknown">Não confirmado</option><option value="remote">Remota</option><option value="finger">Finger</option>
      </select>
      <p id={`${boardingTypeId}-help`}>Informação manual só para este portão e voo, neste dispositivo. Não é confirmação da fonte. Ao mudar o portão, confirme o tipo novamente.</p>
      <label htmlFor={terminalId}>Terminal (opcional)</label>
      <input id={terminalId} value={terminal} maxLength={6} autoCapitalize="characters" autoComplete="off" placeholder="Ex.: 2" onChange={(e) => update('terminal',e.target.value)}/>
      <div className="cz-tool-actions">
        <button type="submit"><DoorOpen aria-hidden="true"/> Salvar portão</button>
        {manual?.gate && <button type="button" onClick={() => save('', '')}><Trash2 aria-hidden="true"/> Remover</button>}
      </div>
    </form>
    <form onSubmit={e=>{e.preventDefault();saveField('status',status);}}>
      <label htmlFor={statusId}>Status informado por você</label>
      <input id={statusId} value={status} maxLength={80} autoComplete="off" placeholder="Ex.: Embarcando" onChange={e=>update('status',e.target.value)}/>
      {manual?.operationalStatus&&<p>Informado por {manual.operationalStatus.author} em {new Date(manual.operationalStatus.setAtEpochMs).toLocaleString('pt-BR')}; preservado neste dispositivo.</p>}
      <div className="cz-tool-actions"><button type="submit">Salvar status</button>{manual?.operationalStatus&&<button type="button" onClick={()=>saveField('status',null)}>Remover status manual</button>}</div>
    </form>
    <form onSubmit={e=>{e.preventDefault();saveField('registration',registration);}}>
      <label htmlFor={registrationId}>Matrícula informada por você</label>
      <input id={registrationId} value={registration} maxLength={16} autoCapitalize="characters" autoComplete="off" placeholder="Ex.: PR-ABC" onChange={e=>update('registration',e.target.value)}/>
      {manual?.operationalRegistration&&<p>Informada por {manual.operationalRegistration.author} em {new Date(manual.operationalRegistration.setAtEpochMs).toLocaleString('pt-BR')}; preservada neste dispositivo.</p>}
      <div className="cz-tool-actions"><button type="submit">Salvar matrícula</button>{manual?.operationalRegistration&&<button type="button" onClick={()=>saveField('registration',null)}>Remover matrícula manual</button>}</div>
    </form>
    <p className="cc-manual-gate-status" role="status" aria-live="polite">{message}</p>
  </section>;
}
