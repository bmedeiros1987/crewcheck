import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Plane,
  ShieldAlert,
  Clock3,
  X,
  MapPin,
  Car,
  CloudSun,
  GitCompareArrows,
  AlarmClock,
  ChevronDown,
} from 'lucide-react';
import type { CrewCheckPulseCategory, CrewCheckPulseMessage, CrewCheckPulseTone } from './pulseTypes';
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

const CATEGORY_ICON: Record<CrewCheckPulseCategory, typeof Info> = {
  gate: MapPin,
  traffic: Car,
  weather: CloudSun,
  roster: GitCompareArrows,
  compliance: ShieldAlert,
  wakeup: AlarmClock,
  general: Info,
};

type CrewCheckPulseProps = {
  compact?: boolean;
  fallback?: ReactNode;
};

export function CrewCheckPulse({ compact = false, fallback = null }: CrewCheckPulseProps = {}) {
  const [state, setState] = useState(() => currentCrewCheckPulseState());
  const [expanded, setExpanded] = useState(false);
  const detailsRef = useRef<HTMLButtonElement>(null);
  const compactRef = useRef<HTMLDivElement>(null);
  const detailsId = useId();

  useEffect(() => subscribeCrewCheckPulse(setState), []);
  const { message, leaving, queued } = state;
  const messageKey = String(message?.dedupeKey || message?.id || message?.title || '');

  useEffect(() => setExpanded(false), [messageKey]);

  const dismiss = useCallback(() => {
    if (compact && compactRef.current?.contains(document.activeElement)) {
      const target = queued > 0 ? detailsRef.current : compactRef.current.closest('.cz-app')?.querySelector<HTMLButtonElement>('.cz-global-header .cz-brand-row button');
      target?.focus({ preventScroll: true });
    }
    setExpanded(false);
    dismissCrewCheckPulse();
  }, [compact, queued]);

  if (!message) return compact ? <>{fallback}</> : null;

  const tone: CrewCheckPulseTone = message.tone || 'informativo';
  const category: CrewCheckPulseCategory = message.category || 'general';
  const Icon = category !== 'general' ? CATEGORY_ICON[category] : (TONE_ICON[tone] || Info);
  const act = () => {
    if (!message.action?.view) {
      setExpanded((value) => !value);
      return;
    }
    if (compact && compactRef.current?.contains(document.activeElement)) detailsRef.current?.focus();
    try {
      window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: message.action.view }));
    } catch {}
    // Abrir o destino não equivale a dispensar o alerta. Mantemos o Pulse vivo
    // até o ciclo normal da mensagem ou uma dispensa explícita do usuário.
    setExpanded(false);
  };

  const collapseDetails = () => {
    setExpanded(false);
    requestAnimationFrame(() => {
      detailsRef.current?.focus({ preventScroll: true });
      detailsRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
  };
  const toggleDetails = () => expanded ? collapseDetails() : setExpanded(true);

  if (compact) {
    return (
      <div
        ref={compactRef}
        className="cc-pulse-compact"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && expanded) {
            event.preventDefault();
            collapseDetails();
          }
        }}
        data-tone={tone}
        data-expanded={expanded ? 'true' : 'false'}
        data-category={category}
        data-priority={message.priority || 'normal'}
        data-leaving={leaving ? 'true' : 'false'}
        role="status"
        aria-live="polite"
      >
        <button
          type="button"
          className="cc-pulse-compact-trigger"
          onClick={act}
          aria-label={message.action?.view ? `${message.action.label}: ${message.title}` : (expanded ? 'Recolher alerta CrewCheck' : 'Abrir detalhes do alerta CrewCheck')}
        >
          <span className="cc-pulse-compact-icon" aria-hidden="true"><Icon size={17}/><i/></span>
          <strong>{message.title}</strong>
          {queued > 0 && <span className="cc-pulse-queue" aria-label={`${queued} aviso(s) aguardando`}>+{queued}</span>}
        </button>
        <button
          type="button"
          ref={detailsRef}
          className="cc-pulse-compact-details"
          aria-controls={expanded ? detailsId : undefined}
          onClick={toggleDetails}
          aria-expanded={expanded}
          aria-label={expanded ? 'Recolher detalhes do alerta CrewCheck' : 'Abrir detalhes do alerta CrewCheck'}
        >
          <ChevronDown className="cc-pulse-compact-chevron" size={16} aria-hidden="true"/>
        </button>
        {expanded && (
          <div id={detailsId} className="cc-pulse-popover">
            <div className="cc-pulse-popover-copy" tabIndex={0} role="region" aria-label="Detalhes do alerta CrewCheck">
              {message.detail && <small>{message.detail}</small>}
              {message.action?.view && <button type="button" className="cc-pulse-action" onClick={act}>{message.action.label}</button>}
            </div>
            <div className="cc-pulse-controls">
              <button type="button" className="cc-pulse-collapse" onClick={collapseDetails} aria-label="Recolher detalhes do aviso"><ChevronDown size={16} aria-hidden="true"/></button>
              {message.dismissible !== false && (
                <button type="button" className="cc-pulse-dismiss" onClick={dismiss} aria-label="Dispensar aviso">
                  <X size={16}/>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

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
