import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Plane, ShieldAlert, Clock3, X } from 'lucide-react';
import { createPulseSession, type PulseSessionState } from './pulseSession';
import type { CrewCheckPulseMessage, CrewCheckPulseTone } from './pulseTypes';
import './crewcheck-pulse.css';

/**
 * CrewCheck Pulse — camada de comunicação viva do sistema (#546).
 *
 * O Pulse não é cabeçalho. Cabeçalho é navegação e contexto da tela; Pulse é o
 * que o sistema tem a dizer agora: escala importada, apresentação alterada,
 * pernoite identificado, inconsistência detectada. São duas responsabilidades
 * diferentes na mesma vizinhança, e é justamente a confusão entre elas que
 * produzia a faixa com cara de bloqueio.
 *
 * Fundação (slice 1): superfície própria, estados visuais, tema claro e escuro,
 * animação discreta e dispensa. Fila, prioridade e integração com os eventos
 * reais do sistema ficam para o slice 2 — por isso este componente não emite
 * nada sozinho: sem mensagem publicada, ele não renderiza nada e não ocupa
 * espaço.
 */

export type { CrewCheckPulseMessage, CrewCheckPulseTone } from './pulseTypes';

export const CREWCHECK_PULSE_EVENT = 'crewcheck:pulse';

const TONE_ICON = {
  informativo: Info,
  sucesso: CheckCircle2,
  atencao: AlertTriangle,
  erro: ShieldAlert,
  operacional: Plane,
  lembrete: Clock3,
} as const;

/**
 * Publica uma mensagem no Pulse. É o único caminho de entrada: o slice 2 liga
 * os eventos reais do sistema aqui, sem que o componente precise conhecê-los.
 */
export function publishCrewCheckPulse(message: CrewCheckPulseMessage): void {
  try {
    window.dispatchEvent(new CustomEvent(CREWCHECK_PULSE_EVENT, { detail: message }));
  } catch {}
}

export function CrewCheckPulse() {
  const [state, setState] = useState<PulseSessionState>({ message: null, leaving: false });
  // A sessão é dona única do timer de saída. Publicar cancela a saída pendente,
  // então uma mensagem nova nunca é apagada pela dispensa da anterior.
  const sessionRef = useRef<ReturnType<typeof createPulseSession> | null>(null);
  if (!sessionRef.current) sessionRef.current = createPulseSession(setState);

  useEffect(() => {
    const session = sessionRef.current!;
    const onPulse = (event: Event) => {
      const detail = (event as CustomEvent<CrewCheckPulseMessage>).detail;
      if (!detail || !detail.title) return;
      session.publish(detail);
    };
    window.addEventListener(CREWCHECK_PULSE_EVENT, onPulse as EventListener);
    return () => {
      window.removeEventListener(CREWCHECK_PULSE_EVENT, onPulse as EventListener);
      session.dispose();
    };
  }, []);

  const dismiss = useCallback(() => sessionRef.current?.dismiss(), []);

  const { message, leaving } = state;
  if (!message) return null;

  const tone: CrewCheckPulseTone = message.tone || 'informativo';
  const Icon = TONE_ICON[tone] || Info;

  return (
    <div
      className="cc-pulse"
      data-tone={tone}
      data-leaving={leaving ? 'true' : 'false'}
      role="status"
      aria-live="polite"
    >
      <span className="cc-pulse-icon" aria-hidden="true">
        <Icon size={18} />
        <i className="cc-pulse-dot" />
      </span>
      <span className="cc-pulse-copy">
        <strong>{message.title}</strong>
        {message.detail && <small>{message.detail}</small>}
      </span>
      {message.dismissible !== false && (
        <button type="button" className="cc-pulse-dismiss" onClick={dismiss} aria-label="Dispensar aviso">
          <X size={16} />
        </button>
      )}
    </div>
  );
}

export default CrewCheckPulse;
