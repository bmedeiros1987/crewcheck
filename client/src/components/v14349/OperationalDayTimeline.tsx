import {
  CalendarDays,
  ChevronRight,
  Clock3,
  Hotel,
  MapPin,
  MoonStar,
  Navigation,
  Plane,
  ShieldCheck,
} from 'lucide-react';
import './operational-day-timeline.css';

type RosterEvent = {
  id?: string;
  kind?: string;
  title?: string;
  subtitle?: string;
  presentation?: string;
  origin?: string;
  destination?: string;
  flightNumber?: string;
  hotel?: string;
  gate?: string;
  terminal?: string;
  status?: string;
  placeholder?: boolean;
  canonical?: {
    kind?: string;
    code?: string;
    startDateTime?: string;
    endDateTime?: string;
  };
};

type TimelineTone = 'departure' | 'presentation' | 'operation' | 'stay' | 'rest';

type TimelineItem = {
  id: string;
  at: Date;
  eyebrow: string;
  title: string;
  detail: string;
  meta?: string;
  tone: TimelineTone;
  targetView?: string;
};

const REST_PATTERN = /\b(?:DO|DOF|DOP|OFF|FOLGA|DESCANSO|REPOUSO)\b/i;

function validDate(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function eventStart(event: RosterEvent): Date | null {
  return validDate(event.canonical?.startDateTime);
}

function eventEnd(event: RosterEvent): Date | null {
  return validDate(event.canonical?.endDateTime) || eventStart(event);
}

function eventText(event: RosterEvent): string {
  return [event.canonical?.code, event.title, event.subtitle, event.kind, event.canonical?.kind]
    .filter(Boolean)
    .join(' ');
}

function isRest(event: RosterEvent): boolean {
  return event.kind === 'rest'
    || event.canonical?.kind === 'rest'
    || REST_PATTERN.test(eventText(event));
}

function isStay(event: RosterEvent): boolean {
  return event.kind === 'stay'
    || event.canonical?.kind === 'stay'
    || Boolean(event.hotel);
}

function isOperational(event: RosterEvent): boolean {
  return !event.placeholder && !isRest(event) && !isStay(event);
}

function routeLabel(event: RosterEvent): string {
  const origin = String(event.origin || '').trim().toUpperCase();
  const destination = String(event.destination || '').trim().toUpperCase();
  if (origin && destination && origin !== destination) return `${origin} → ${destination}`;
  return origin || destination || '';
}

function timeLabel(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function dateLabel(date: Date): string {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
  if (sameDay(date, today)) return 'Hoje';
  if (sameDay(date, tomorrow)) return 'Amanhã';
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(date).replace('.', '');
}

function presentationDate(event: RosterEvent): Date | null {
  const start = eventStart(event);
  const match = String(event.presentation || '').match(/(\d{1,2}):(\d{2})/);
  if (!start || !match) return null;
  const result = new Date(start);
  result.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return result;
}

function operationTitle(event: RosterEvent): string {
  const flight = String(event.flightNumber || '').trim().toUpperCase();
  const title = String(event.title || '').trim();
  return flight || title || 'Programação operacional';
}

function buildTimeline(events: RosterEvent[]): TimelineItem[] {
  const now = Date.now();
  const relevant = events
    .filter((event) => !event.placeholder)
    .filter((event) => eventStart(event))
    .filter((event) => (eventEnd(event)?.getTime() || 0) >= now - 2 * 60 * 60 * 1000)
    .sort((left, right) => (eventStart(left)?.getTime() || 0) - (eventStart(right)?.getTime() || 0));

  const items: TimelineItem[] = [];
  const nextOperational = relevant.find(isOperational);
  if (nextOperational) {
    const presentation = presentationDate(nextOperational);
    if (presentation) {
      const recommendedDeparture = new Date(presentation.getTime() - 90 * 60 * 1000);
      if (recommendedDeparture.getTime() >= now - 3 * 60 * 60 * 1000) {
        items.push({
          id: `departure-${nextOperational.id || recommendedDeparture.toISOString()}`,
          at: recommendedDeparture,
          eyebrow: 'Saída Inteligente',
          title: 'Saída recomendada',
          detail: routeLabel(nextOperational) || 'Deslocamento para a apresentação',
          meta: 'Estimativa inicial; confirme o trânsito no card de rota.',
          tone: 'departure',
          targetView: 'departure',
        });
      }
      items.push({
        id: `presentation-${nextOperational.id || presentation.toISOString()}`,
        at: presentation,
        eyebrow: 'Apresentação',
        title: `Apresentação para ${operationTitle(nextOperational)}`,
        detail: String(nextOperational.origin || '').trim().toUpperCase() || 'Local a confirmar',
        meta: nextOperational.gate ? `Portão ${nextOperational.gate}` : undefined,
        tone: 'presentation',
        targetView: 'roster',
      });
    }
  }

  for (const event of relevant.slice(0, 8)) {
    const start = eventStart(event);
    if (!start) continue;
    if (isRest(event)) {
      items.push({
        id: `rest-${event.id || start.toISOString()}`,
        at: start,
        eyebrow: 'Descanso',
        title: 'Folga',
        detail: 'Descanso programado',
        meta: eventEnd(event) ? `Encerra ${dateLabel(eventEnd(event) as Date)}, às ${timeLabel(eventEnd(event) as Date)}` : undefined,
        tone: 'rest',
        targetView: 'roster',
      });
      continue;
    }
    if (isStay(event)) {
      items.push({
        id: `stay-${event.id || start.toISOString()}`,
        at: start,
        eyebrow: 'Hospedagem',
        title: 'Pernoite',
        detail: event.hotel || routeLabel(event) || 'Hotel a confirmar',
        meta: eventEnd(event) ? `Até ${dateLabel(eventEnd(event) as Date)}, às ${timeLabel(eventEnd(event) as Date)}` : undefined,
        tone: 'stay',
        targetView: 'hotels',
      });
      continue;
    }
    items.push({
      id: `operation-${event.id || start.toISOString()}`,
      at: start,
      eyebrow: event.kind === 'flight' ? 'Voo' : 'Programação',
      title: operationTitle(event),
      detail: routeLabel(event) || event.subtitle || 'Atividade operacional',
      meta: [event.status, event.gate ? `Portão ${event.gate}` : '', event.terminal || ''].filter(Boolean).join(' · ') || undefined,
      tone: 'operation',
      targetView: event.kind === 'flight' ? 'radar' : 'roster',
    });
  }

  const seen = new Set<string>();
  return items
    .sort((left, right) => left.at.getTime() - right.at.getTime())
    .filter((item) => {
      const signature = `${item.eyebrow}|${item.title}|${item.at.toISOString()}`;
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    })
    .slice(0, 7);
}

const iconForTone = {
  departure: Navigation,
  presentation: Clock3,
  operation: Plane,
  stay: Hotel,
  rest: MoonStar,
} satisfies Record<TimelineTone, typeof Plane>;

export default function OperationalDayTimeline({
  events,
  onNavigate,
}: {
  events: RosterEvent[];
  onNavigate: (view: string) => void;
}) {
  const timeline = buildTimeline(events);

  return <section className="cc14349-dayline" aria-labelledby="cc14349-dayline-title">
    <header className="cc14349-dayline-head">
      <span className="cc14349-dayline-heading">
        <span className="cc14349-dayline-heading-icon"><CalendarDays/></span>
        <span>
          <small>ROTINA OPERACIONAL</small>
          <h2 id="cc14349-dayline-title">Linha do Dia</h2>
          <p>Sua rotina operacional em ordem cronológica.</p>
        </span>
      </span>
      <button type="button" onClick={() => onNavigate('roster')}>Ver escala <ChevronRight/></button>
    </header>

    {timeline.length ? <div className="cc14349-dayline-list">
      {timeline.map((item) => {
        const Icon = iconForTone[item.tone];
        return <button
          type="button"
          key={item.id}
          className={`cc14349-dayline-item tone-${item.tone}`}
          onClick={() => onNavigate(item.targetView || 'roster')}
        >
          <span className="cc14349-dayline-time"><strong>{timeLabel(item.at)}</strong><small>{dateLabel(item.at)}</small></span>
          <span className="cc14349-dayline-marker"><Icon/></span>
          <span className="cc14349-dayline-copy">
            <small>{item.eyebrow}</small>
            <strong>{item.title}</strong>
            <span><MapPin/>{item.detail}</span>
            {item.meta && <em>{item.meta}</em>}
          </span>
          <ChevronRight className="cc14349-dayline-chevron"/>
        </button>;
      })}
    </div> : <div className="cc14349-dayline-empty">
      <ShieldCheck/>
      <div><strong>Nenhuma programação futura encontrada</strong><span>Confira o período da escala ou importe um arquivo atualizado.</span></div>
      <button type="button" onClick={() => onNavigate('import')}>Importar escala</button>
    </div>}
  </section>;
}
