import {
  ChevronRight,
  Clock3,
  Hotel,
  MapPin,
  MoonStar,
  Plane,
  ShieldCheck,
} from 'lucide-react';
import {
  classifyScheduleActivity,
  isFlightScheduleActivity,
  isProgramScheduleActivity,
  type ScheduleActivityLike,
} from '../../lib/scheduleActivityClassification';
import { setPendingRosterFocus } from '../../lib/rosterFocus';
import './operational-day-timeline.css';

type RosterEvent = ScheduleActivityLike & {
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

type TimelineTone = 'presentation' | 'operation' | 'stay' | 'rest';

type TimelineItem = {
  id: string;
  at: Date;
  endAt?: Date;
  eyebrow: string;
  title: string;
  detail: string;
  meta?: string;
  tone: TimelineTone;
  targetView?: string;
  actionLabel: string;
};

const ACTIVITY_NAMES: Record<string, string> = {
  HSB: 'Sobreaviso',
  ASB: 'Reserva',
  RES: 'Reserva',
  RESERVA: 'Reserva',
  EAD: 'Treinamento EAD',
  MCK: 'Treinamento MCK',
  CRM: 'Treinamento CRM',
  PS: 'Passageiro',
  DH: 'Deslocamento',
  EXTRA: 'Extra',
};

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

function isFlight(event: RosterEvent): boolean {
  return isFlightScheduleActivity(event);
}

function isOperational(event: RosterEvent): boolean {
  return isProgramScheduleActivity(event);
}

function normalized(value?: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function meaningful(value?: string): string {
  const text = String(value || '').trim();
  if (!text || /^(?:A CONFIRMAR|CONFIRMAR|N\/A|NA|—|-)$/i.test(text)) return '';
  return text;
}

function eventCode(event: RosterEvent): string {
  return normalized(event.canonical?.code || event.title || event.kind || event.canonical?.kind);
}

function restCopy(event: RosterEvent): { title: string; detail: string } {
  if (classifyScheduleActivity(event) === 'REPOUSO') {
    return { title: 'Repouso', detail: 'Período de recuperação programado' };
  }
  return { title: 'Folga', detail: 'Descanso programado' };
}

function routeLabel(event: RosterEvent): string {
  const origin = normalized(event.origin);
  const destination = normalized(event.destination);
  if (origin && destination && origin !== destination) return `${origin} → ${destination}`;
  return origin || destination || '';
}

function timeLabel(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
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
  if (result.getTime() > start.getTime() + 3 * 60 * 60 * 1000) {
    result.setDate(result.getDate() - 1);
  }
  return result;
}

function operationTitle(event: RosterEvent): string {
  const flight = normalized(event.flightNumber);
  if (flight) return flight;
  const code = eventCode(event);
  return ACTIVITY_NAMES[code] || meaningful(event.title) || 'Programação operacional';
}

function operationalMeta(event: RosterEvent): string | undefined {
  const values = [
    meaningful(event.status),
    meaningful(event.gate) ? `Portão ${meaningful(event.gate)}` : '',
    meaningful(event.terminal) ? `Terminal ${meaningful(event.terminal)}` : '',
  ].filter(Boolean);
  const seen = new Set<string>();
  const unique = values.filter((value) => {
    const key = normalized(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.join(' · ') || undefined;
}

function actionLabelFor(event: RosterEvent, tone: TimelineTone): string {
  if (tone === 'stay') return 'Ver hotel';
  if (tone === 'operation' && isFlight(event)) return 'Ver voo';
  return 'Ver escala';
}

export function buildOperationalDayTimeline(events: RosterEvent[], nowDate = new Date()): TimelineItem[] {
  const now = nowDate.getTime();
  const relevant = events
    .filter((event) => !event.placeholder)
    .filter((event) => eventStart(event))
    .filter((event) => (eventEnd(event)?.getTime() || 0) >= now - 2 * 60 * 60 * 1000)
    .sort((left, right) => (eventStart(left)?.getTime() || 0) - (eventStart(right)?.getTime() || 0));

  const items: TimelineItem[] = [];
  const nextOperational = relevant.find((event) => isOperational(event) && (eventEnd(event)?.getTime() || 0) >= now);
  if (nextOperational) {
    const presentation = presentationDate(nextOperational);
    const start = eventStart(nextOperational);
    const isDistinctUpcomingPresentation = Boolean(
      presentation
      && start
      && presentation.getTime() >= now - 5 * 60 * 1000
      && presentation.getTime() < start.getTime() - 60 * 1000,
    );
    if (presentation && isDistinctUpcomingPresentation) {
      items.push({
        id: `presentation-${nextOperational.id || presentation.toISOString()}`,
        at: presentation,
        endAt: start || undefined,
        eyebrow: 'Apresentação',
        title: `Apresentação para ${operationTitle(nextOperational)}`,
        detail: normalized(nextOperational.origin) || 'Local a confirmar',
        meta: meaningful(nextOperational.gate) ? `Portão ${meaningful(nextOperational.gate)}` : undefined,
        tone: 'presentation',
        targetView: 'roster',
        actionLabel: 'Ver escala',
      });
    }
  }

  for (const event of relevant.slice(0, 9)) {
    const start = eventStart(event);
    if (!start) continue;
    const end = eventEnd(event) || undefined;
    const category = classifyScheduleActivity(event);
    if (category === 'FOLGA' || category === 'REPOUSO') {
      const copy = restCopy(event);
      items.push({
        id: `rest-${event.id || start.toISOString()}`,
        at: start,
        endAt: end,
        eyebrow: 'Descanso',
        title: copy.title,
        detail: copy.detail,
        meta: end ? `Até ${dateLabel(end)}, às ${timeLabel(end)}` : undefined,
        tone: 'rest',
        targetView: 'roster',
        actionLabel: 'Ver escala',
      });
      continue;
    }
    if (category === 'PERNOITE') {
      items.push({
        id: `stay-${event.id || start.toISOString()}`,
        at: start,
        endAt: end,
        eyebrow: 'Hospedagem',
        title: 'Pernoite',
        detail: meaningful(event.hotel) || routeLabel(event) || 'Hotel a confirmar',
        meta: end ? `Até ${dateLabel(end)}, às ${timeLabel(end)}` : undefined,
        tone: 'stay',
        targetView: 'hotels',
        actionLabel: 'Ver hotel',
      });
      continue;
    }
    const tone: TimelineTone = 'operation';
    items.push({
      id: `operation-${event.id || start.toISOString()}`,
      at: start,
      endAt: end,
      eyebrow: isFlight(event) ? 'Voo' : 'Programação',
      title: operationTitle(event),
      detail: routeLabel(event) || meaningful(event.subtitle) || 'Atividade operacional',
      meta: operationalMeta(event),
      tone,
      targetView: isFlight(event) ? 'radar' : 'roster',
      actionLabel: actionLabelFor(event, tone),
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
  const now = new Date();
  const timeline = buildOperationalDayTimeline(events, now);
  const current = timeline.find((item) => item.at.getTime() <= now.getTime() && (item.endAt?.getTime() || item.at.getTime()) >= now.getTime());
  const next = timeline.find((item) => item.at.getTime() > now.getTime());
  // #560: a data que o CTA leva para a escala é a do compromisso corrente; se
  // não houver, a do próximo; só então o primeiro item relevante. Usar
  // timeline[0] direto abre a data errada, porque buildOperationalDayTimeline
  // mantém itens já encerrados por até 2 h (filtro de now - 2h na montagem).
  const focusDate = current?.at || next?.at || timeline[0]?.at || new Date();

  return <section className="cc14349-dayline cc14357-dayline" aria-labelledby="cc14349-dayline-title">
    <header className="cc14349-dayline-head">
      <span className="cc14349-dayline-heading">
        <span>
          <small>ROTINA OPERACIONAL</small>
          <h2 id="cc14349-dayline-title">Linha do Dia</h2>
          <p>Agora, próximo compromisso e sequência operacional.</p>
        </span>
      </span>
      <button type="button" onClick={() => { setPendingRosterFocus(focusDate); onNavigate('roster'); }}>Ver escala <ChevronRight aria-hidden="true"/></button>
    </header>

    {timeline.length ? <>
      <div className="cc14357-dayline-summary" aria-label="Resumo da rotina">
        <article className="current">
          <small>AGORA</small>
          <strong>{current?.title || 'Sem atividade em andamento'}</strong>
          <span>{current ? `${current.detail}${current.endAt ? ` · até ${timeLabel(current.endAt)}` : ''}` : 'Você está entre compromissos operacionais.'}</span>
        </article>
        <article className="next">
          <small>PRÓXIMO COMPROMISSO</small>
          <strong>{next?.title || 'Nenhuma programação futura'}</strong>
          <span>{next ? `${dateLabel(next.at)}, às ${timeLabel(next.at)} · ${next.detail}` : 'Confira o período importado da escala.'}</span>
        </article>
      </div>
      <div className="cc14349-dayline-list">
        {timeline.map((item) => {
          const Icon = iconForTone[item.tone];
          const isCurrent = current?.id === item.id;
          const isNext = next?.id === item.id;
          return <button
            type="button"
            key={item.id}
            className={`cc14349-dayline-item tone-${item.tone}${isCurrent ? ' is-current' : ''}${isNext ? ' is-next' : ''}`}
            onClick={() => { if (!item.targetView || item.targetView === 'roster') setPendingRosterFocus(item.at); onNavigate(item.targetView || 'roster'); }}
          >
            <span className="cc14349-dayline-time"><strong>{timeLabel(item.at)}</strong><small>{dateLabel(item.at)}</small></span>
            <span className="cc14349-dayline-marker" aria-hidden="true"><Icon/></span>
            <span className="cc14349-dayline-copy">
              <small>{item.eyebrow}{isCurrent && <b>Agora</b>}{isNext && <b>Próximo</b>}</small>
              <strong>{item.title}</strong>
              <span><MapPin aria-hidden="true"/>{item.detail}</span>
              {item.meta && <em>{item.meta}</em>}
            </span>
            <span className="cc14357-dayline-action">{item.actionLabel}</span>
            <ChevronRight className="cc14349-dayline-chevron" aria-hidden="true"/>
          </button>;
        })}
      </div>
    </> : <div className="cc14349-dayline-empty">
      <ShieldCheck aria-hidden="true"/>
      <div><strong>Nenhuma programação futura encontrada</strong><span>Confira o período da escala ou importe um arquivo atualizado.</span></div>
      <button type="button" onClick={() => onNavigate('import')}>Importar escala</button>
    </div>}
  </section>;
}
