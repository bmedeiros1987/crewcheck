import { useEffect, useId, useState, type FormEvent } from 'react';
import { DoorOpen, Trash2 } from 'lucide-react';
import { getStoredUser } from '@/lib/authClient';
import { MANUAL_GATE_EVENT, writeManualGate, type NextFlightLike } from '@/lib/nextFlightGate';
import { currentManualGateAccount, useNextFlightGate } from './useNextFlightGate';
import { gateSourceLabel } from './NextFlightGateCard';
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
  const [gate, setGate] = useState(manual?.gate || '');
  const [terminal, setTerminal] = useState(manual?.terminal || '');
  const [message, setMessage] = useState('');
  const gateId = useId();
  const terminalId = useId();

  useEffect(() => {
    setGate(manual?.gate || '');
    setTerminal(manual?.terminal || '');
  }, [event.id, manual?.gate, manual?.terminal, manual?.setAtEpochMs]);

  if (!info) return null;

  function save(value: string, nextTerminal: string) {
    const result = writeManualGate(window.localStorage, currentManualGateAccount(), event, { gate: value, terminal: nextTerminal, author: authorLabel() });
    if (!result.ok) { setMessage(result.message); return; }
    setMessage(result.entry ? `Portão ${result.entry.gate} salvo para ${result.entry.flight} em ${result.entry.date.split('-').reverse().join('/')}.` : 'Portão manual removido.');
    window.dispatchEvent(new CustomEvent(MANUAL_GATE_EVENT, { detail: { eventId: event.id } }));
  }

  function submit(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (!gate.trim()) { setMessage('Informe o portão de embarque.'); return; }
    save(gate, terminal);
  }

  return <section className="cz-toolbox cc-manual-gate" aria-labelledby={`${gateId}-title`}>
    <h2 id={`${gateId}-title`}><DoorOpen aria-hidden="true"/> Portão informado por você</h2>
    <p>Vale só para {info.flight} em {info.operationalDate.split('-').reverse().join('/')} ({info.origin} → {info.destination}). Não substitui a fonte: divergências continuam visíveis.</p>
    {manual && <p className="cc-manual-gate-current">{gateSourceLabel({ ...info, gateSource: 'manual' })}: <b>{manual.gate}</b>{manual.terminal ? ` · Terminal ${manual.terminal}` : ''}</p>}
    {info.divergence && <p className="cc-next-gate-divergence" role="note">{info.divergence.source === 'radar' ? 'O Radar' : 'A escala'} indica portão {info.divergence.sourceGate}. Sua informação foi mantida; confirme no aeroporto.</p>}
    <form onSubmit={submit}>
      <label htmlFor={gateId}>Portão de embarque</label>
      <input id={gateId} value={gate} maxLength={12} autoCapitalize="characters" autoComplete="off" inputMode="text" placeholder="Ex.: 24" onChange={(e) => setGate(e.target.value)}/>
      <label htmlFor={terminalId}>Terminal (opcional)</label>
      <input id={terminalId} value={terminal} maxLength={6} autoCapitalize="characters" autoComplete="off" placeholder="Ex.: 2" onChange={(e) => setTerminal(e.target.value)}/>
      <div className="cz-tool-actions">
        <button type="submit"><DoorOpen aria-hidden="true"/> Salvar portão</button>
        {manual && <button type="button" onClick={() => save('', '')}><Trash2 aria-hidden="true"/> Remover</button>}
      </div>
    </form>
    <p className="cc-manual-gate-status" role="status" aria-live="polite">{message}</p>
  </section>;
}
