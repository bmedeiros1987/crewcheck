import { useEffect, useMemo, useState } from 'react';
import { Car, ChevronDown, ChevronUp, CloudSun, DollarSign, Hotel, Radar, ShieldCheck, Bell, Clock3 } from 'lucide-react';
import {
  CREW_EXPERIENCE_CHANGE_EVENT,
  experienceVisibleActionLimit,
  loadExperiencePreferences,
} from '@/lib/experiencePreferences';
import { rememberCrewContext, type CrewContextTarget } from '@/lib/contextualNavigation';

export type ContextualEventLike = {
  id?: string;
  kind?: string;
  date?: Date | string;
  origin?: string;
  destination?: string;
  flightNumber?: string;
  presentation?: string;
  hotel?: string;
  day?: { date?: string; base?: string } | Record<string, unknown>;
};

type Action = {
  target: CrewContextTarget;
  label: string;
  icon: typeof Car;
  priority: number;
};

function eventDate(event: ContextualEventLike): string {
  if (event.date instanceof Date && Number.isFinite(event.date.getTime())) return event.date.toISOString().slice(0, 10);
  const direct = String(event.date || '').trim();
  if (direct) return direct.slice(0, 10);
  const dayDate = String((event.day as any)?.date || '').trim();
  return dayDate.slice(0, 10);
}

function hasPublishedPresentation(event: ContextualEventLike): boolean {
  const value = String(event.presentation || '').trim();
  return Boolean(value && value !== '—' && value !== 'Conexão/Solo' && /\d{1,2}:\d{2}/.test(value));
}

function actionsFor(event: ContextualEventLike): Action[] {
  const isStay = event.kind === 'stay' || Boolean(String(event.hotel || '').trim());
  const isFlight = event.kind === 'flight';

  if (isStay) {
    return [
      { target: 'hotels', label: 'Gerenciar pernoite', icon: Hotel, priority: 1 },
      { target: 'presentation', label: 'Próxima apresentação', icon: Clock3, priority: 2 },
      { target: 'weather', label: 'Clima do pernoite', icon: CloudSun, priority: 3 },
      { target: 'perdiem', label: 'Diárias', icon: DollarSign, priority: 4 },
      { target: 'wakeup', label: 'Despertador', icon: Bell, priority: 5 },
    ];
  }

  if (isFlight) {
    const primary: Action[] = [];
    if (hasPublishedPresentation(event)) primary.push({ target: 'departure', label: 'Planejar saída', icon: Car, priority: 1 });
    primary.push(
      { target: 'radar', label: 'Portão e operação', icon: Radar, priority: 2 },
      { target: 'weather', label: 'Meteorologia', icon: CloudSun, priority: 3 },
      { target: 'salary', label: 'Ganhos do voo', icon: DollarSign, priority: 4 },
      { target: 'regulation', label: 'Limites da jornada', icon: ShieldCheck, priority: 5 },
      { target: 'wakeup', label: 'Despertador', icon: Bell, priority: 6 },
    );
    return primary;
  }

  return [
    { target: 'regulation', label: 'Ver regras da jornada', icon: ShieldCheck, priority: 1 },
    { target: 'routine', label: 'Planejar rotina', icon: Clock3, priority: 2 },
    { target: 'roster', label: 'Ver na escala', icon: Clock3, priority: 3 },
  ];
}

export default function ContextualJourneyActions({
  event,
  sourceView,
  onNavigate,
  compact = false,
}: {
  event: ContextualEventLike;
  sourceView: string;
  onNavigate: (target: CrewContextTarget) => void;
  compact?: boolean;
}) {
  const [preferences, setPreferences] = useState(loadExperiencePreferences);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const refresh = () => setPreferences(loadExperiencePreferences());
    window.addEventListener(CREW_EXPERIENCE_CHANGE_EVENT, refresh as EventListener);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(CREW_EXPERIENCE_CHANGE_EVENT, refresh as EventListener);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const actions = useMemo(() => actionsFor(event).sort((a, b) => a.priority - b.priority), [event]);
  const limit = experienceVisibleActionLimit(preferences);
  const primary = actions.slice(0, limit);
  const extra = actions.slice(limit);

  function go(action: Action) {
    rememberCrewContext({
      eventId: event.id,
      date: eventDate(event),
      kind: event.kind,
      origin: event.origin,
      destination: event.destination,
      flightNumber: event.flightNumber,
      sourceView,
      target: action.target,
    });
    onNavigate(action.target);
  }

  return <div className={`cc-context-actions ${compact ? 'compact' : ''}`} data-experience={preferences.level}>
    <div className="cc-context-actions-primary">
      {primary.map((action) => {
        const Icon = action.icon;
        return <button type="button" key={action.target} onClick={(click) => { click.stopPropagation(); go(action); }}><Icon size={17}/><span>{action.label}</span></button>;
      })}
      {extra.length > 0 && <button type="button" className="cc-context-more" aria-expanded={expanded} onClick={(click) => { click.stopPropagation(); setExpanded((value) => !value); }}>
        {expanded ? <ChevronUp size={17}/> : <ChevronDown size={17}/>}<span>{expanded ? 'Menos' : 'Mais'}</span>
      </button>}
    </div>
    {expanded && extra.length > 0 && <div className="cc-context-actions-extra">
      {extra.map((action) => {
        const Icon = action.icon;
        return <button type="button" key={action.target} onClick={(click) => { click.stopPropagation(); go(action); }}><Icon size={16}/><span>{action.label}</span></button>;
      })}
    </div>}
  </div>;
}
