import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Plane, ShieldAlert, Clock3, X } from 'lucide-react';
import type { CrewCheckPulseMessage, CrewCheckPulseTone } from './pulseTypes';
import {
  CREWCHECK_PULSE_EVENT,
  currentCrewCheckPulseState,
  dismissCrewCheckPulse,
  publishCrewCheckPulse,
  subscribeCrewCheckPulse,
} from './pulseRuntime';
import './crewcheck-pulse.css';

export type { CrewCheckPulseMessage, CrewCheckPulseTone } from './pulseTypes';
export { CREWCHECK_PULSE_EVENT, publishCrewCheckPulse } from './pulseRuntime';

const TONE_ICON = {
  informativo: Info,
  sucesso: CheckCircle2,
  atencao: AlertTriangle,
  erro: ShieldAlert,
  operacional: Plane,
  lembrete: Clock3,
} as const;

export function CrewCheckPulse() {
  const [state, setState] = useState(() => currentCrewCheckPulseState());

  useEffect(() => subscribeCrewCheckPulse(setState), []);
  const dismiss = useCallback(() => dismissCrewCheckPulse(), []);

  const { message, leaving, queued } = state;
  if (!message) return null;

  const tone: CrewCheckPulseTone = message.tone || 'informativo';
  const Icon = TONE_ICON[tone] || Info;
  const act = () => {
    if (!message.action?.view) return;
    try {
      window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: message.action.view }));
    } catch {}
    dismiss();
  };

  return (
    <div
      className="cc-pulse"
      data-tone={tone}
      data-priority={message.priority || 'normal'}
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
      <span className="cc-pulse-controls">
        {queued > 0 && <span className="cc-pulse-queue" aria-label={`${queued} aviso(s) aguardando`}>+{queued}</span>}
        {message.action?.view && (
          <button type="button" className="cc-pulse-action" onClick={act}>
            {message.action.label}
          </button>
        )}
        {message.dismissible !== false && (
          <button type="button" className="cc-pulse-dismiss" onClick={dismiss} aria-label="Dispensar aviso">
            <X size={16} />
          </button>
        )}
      </span>
    </div>
  );
}

export default CrewCheckPulse;
