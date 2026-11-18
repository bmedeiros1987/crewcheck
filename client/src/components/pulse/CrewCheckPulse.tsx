import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
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
import { alertText } from '../../lib/alertExperienceText';
import { setPendingNavigationContext, clearPendingNavigationContext } from '../../lib/navigationContext';
import { availablePulseReturnTarget } from '../navigation/headerMenuAccess';

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
  brandMark?: boolean;
  fallback?: ReactNode;
};

export function CrewCheckPulse({ compact = false, brandMark = false, fallback = null }: CrewCheckPulseProps = {}) {
  const [state, setState] = useState(() => currentCrewCheckPulseState());
  const [expanded, setExpanded] = useState(false);
  const [languageRevision, setLanguageRevision] = useState(0);
  const [saveFailed, setSaveFailed] = useState(false);
  const copy = alertText();
  useEffect(() => {
    const sync = () => setLanguageRevision(value => value + 1);
    for (const name of ['crewcheck:language-change', 'crewcheck:locale-change']) window.addEventListener(name, sync);
    return () => { for (const name of ['crewcheck:language-change', 'crewcheck:locale-change']) window.removeEventListener(name, sync); };
  }, []);
  const detailsRef = useRef<HTMLButtonElement>(null);
  const compactRef = useRef<HTMLDivElement>(null);
  const detailsId = useId();

  useEffect(() => subscribeCrewCheckPulse(setState), []);
  const { message, leaving, queued } = state;
  const messageKey = String(message?.dedupeKey || message?.id || message?.title || '');

  // Layout effect: a passive one could run after a tap in the new message's first
  // frame and collapse what the user just opened.
  useLayoutEffect(() => setExpanded(false), [messageKey]);

  const dismiss = useCallback(() => {
    if (compact && compactRef.current?.contains(document.activeElement)) {
      const target = queued > 0 ? detailsRef.current : availablePulseReturnTarget(compactRef.current.closest('.cz-app'));
      target?.focus({ preventScroll: true });
    }
    const saved = dismissCrewCheckPulse(state.message || undefined);
    setExpanded(!saved);
    setSaveFailed(!saved);
  }, [compact, queued, state.message]);

  if (!message) return compact ? <>{fallback}</> : null;

  const tone: CrewCheckPulseTone = message.tone || 'informativo';
  const category: CrewCheckPulseCategory = message.category || 'general';
  const Icon = (category !== 'general' && CATEGORY_ICON[category]) || TONE_ICON[tone] || Info;
  if (brandMark) return <span key={messageKey} className="cz-logo cc-pulse-compact-icon cc-pulse-brand-mark" role="img" aria-label="Notificações CrewCheck" data-crewcheck-brand="notifications"><Icon size={18} strokeWidth={2} absoluteStrokeWidth aria-hidden="true"/><i aria-hidden="true"/></span>;
  const act = () => {
    if (!message.action?.view) {
      setExpanded((value) => !value);
      return;
    }
    if (compact && compactRef.current?.contains(document.activeElement)) detailsRef.current?.focus();
    try {
      clearPendingNavigationContext();
      if (message.action.context) setPendingNavigationContext({ ...message.action.context, targetView: message.action.view, sourceView: 'pulse', policy: 'persistent-until-return' });
      if (message.action.alert) setPendingNavigationContext({ targetView: message.action.view, sourceView: 'pulse', policy: 'once', alertOccurrence: message.action.alert.occurrence, alertVersion: message.action.alert.version });
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
          ref={detailsRef}
          className="cc-pulse-compact-trigger cc-pulse-compact-details-trigger cc-pulse-compact-details"
          onClick={toggleDetails}
          aria-controls={expanded ? detailsId : undefined}
          aria-expanded={expanded}
          aria-label={`${copy.details}: ${message.title}`}
        >
          <span className="cc-pulse-compact-icon" aria-hidden="true"><Icon size={17}/><i/></span>
          <strong>{(typeof message.compactTitle === 'string' ? message.compactTitle.trim() : '') || message.title}</strong>
          <span className="cc-pulse-count" aria-hidden="true">{queued + 1}<ChevronDown size={14}/></span>
        </button>
        {expanded && (
          <div id={detailsId} className="cc-pulse-popover">
            <div className="cc-pulse-popover-copy" tabIndex={0} role="region" aria-label={copy.details}>
              <strong>{message.title}</strong>
              {message.detail && <small>{message.detail}</small>}
              {message.action?.view && <button type="button" className="cc-pulse-action" onClick={act}>{message.action.label}</button>}
            </div>
            <div className="cc-pulse-controls">
              <button type="button" className="cc-pulse-collapse" onClick={collapseDetails} aria-label={copy.collapse}>
                <ChevronDown size={16} aria-hidden="true"/>
              </button>
              {message.dismissible !== false && (
                <button type="button" className="cc-pulse-dismiss" onClick={dismiss} disabled={leaving} aria-label={copy.close}>
                  <X size={16} aria-hidden="true"/>
                </button>
              )}
            </div>
            {saveFailed && <small role="alert">{copy.failed}</small>}
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
