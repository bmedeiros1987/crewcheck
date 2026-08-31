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
 * A superfície continua desacoplada dos motores de escala. Produtores publicam
 * mensagens pelo barramento abaixo e podem, opcionalmente, oferecer uma ação
 * contextual que navega para a tela interna correspondente.
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

/** Publica uma mensagem no Pulse sem acoplar o componente ao produtor. */
export function publishCrewCheckPulse(message: CrewCheckPulseMessage): void {
  try {
    window.dispatchEvent(new CustomEvent(CREWCHECK_PULSE_EVENT, { detail: message }));
  } catch {}
}

export function CrewCheckPulse() {
  const [state, setState] = useState<PulseSessionState>({ message: null, leaving: false });
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

  const activate = useCallback(() => {
    const action = message?.action;
    if (!action) return;
    if (action.view) {
      try { window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: action.view })); } catch {}
    } else if (action.href) {
      try { window.location.assign(action.href); } catch {}
    }
    sessionRef.current?.dismiss();
  }, [message]);

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
      {message.action?.label && <button type="button" className="cc-pulse-action" onClick={activate}>{message.action.label}</button>}
      {message.dismissible !== false && (
        <button type="button" className="cc-pulse-dismiss" onClick={dismiss} aria-label="Dispensar aviso">
          <X size={16} />
        </button>
      )}
    </div>
  );
}

export default CrewCheckPulse;
