import { ChevronRight, Clock3, Hotel, MapPin, MoonStar, Plane, ShieldCheck } from 'lucide-react';
import { classifyScheduleActivity, isFlightScheduleActivity, isProgramScheduleActivity, type ScheduleActivityLike } from '../../lib/scheduleActivityClassification';
import CrewCheckDynamicCalendar from '../ui/CrewCheckDynamicCalendar';
import './operational-day-timeline.css';

type RosterEvent = ScheduleActivityLike & { id?: string; kind?: string; title?: string; subtitle?: string; presentation?: string; origin?: string; destination?: string; flightNumber?: string; hotel?: string; gate?: string; terminal?: string; status?: string; placeholder?: boolean; canonical?: { kind?: string; code?: string; startDateTime?: string; endDateTime?: string } };
type TimelineTone = 'presentation' | 'operation' | 'stay' | 'rest';
type TimelineItem = { id: string; at: Date; eyebrow: string; title: string; detail: string; meta?: string; tone: TimelineTone; targetView?: string };

function validDate(value?: string): Date | null { if (!value) return null; const date = new Date(value); return Number.isFinite(date.getTime()) ? date : null; }
function eventStart(event: RosterEvent): Date | null { return validDate(event.canonical?.startDateTime); }
function eventEnd(event: RosterEvent): Date | null { return validDate(event.canonical?.endDateTime) || eventStart(event); }
function isFlight(event: RosterEvent): boolean { return isFlightScheduleActivity(event); }
function isOperational(event: RosterEvent): boolean { return isProgramScheduleActivity(event); }
function restCopy(event: RosterEvent): { title: string; detail: string } { return classifyScheduleActivity(event) === 'REPOUSO' ? { title: 'Repouso', detail: 'Período de recuperação programado' } : { title: 'Folga', detail: 'Descanso programado' }; }
function routeLabel(event: RosterEvent): string { const origin = String(event.origin || '').trim().toUpperCase(); const destination = String(event.destination || '').trim().toUpperCase(); if (origin && destination && origin !== destination) return `${origin} → ${destination}`; return origin || destination || ''; }
function timeLabel(date: Date): string { return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date); }
function dateLabel(date: Date): string { const today = new Date(); const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1); const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); if (sameDay(date, today)) return 'Hoje'; if (sameDay(date, tomorrow)) return 'Amanhã'; return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(date).replace('.', ''); }
function presentationDate(event: RosterEvent): Date | null { const start = eventStart(event); const match = String(event.presentation || '').match(/(\d{1,2}):(\d{2})/); if (!start || !match) return null; const result = new Date(start); result.setHours(Number(match[1]), Number(match[2]), 0, 0); if (result.getTime() > start.getTime() + 3 * 60 * 60 * 1000) result.setDate(result.getDate() - 1); return result; }
function operationTitle(event: RosterEvent): string { const flight = String(event.flightNumber || '').trim().toUpperCase(); const title = String(event.title || '').trim(); return flight || title || 'Programação operacional'; }

export function buildOperationalDayTimeline(events: RosterEvent[], nowDate = new Date()): TimelineItem[] {
  const now = nowDate.getTime();
  const relevant = events.filter((event) => !event.placeholder).filter((event) => eventStart(event)).filter((event) => (eventEnd(event)?.getTime() || 0) >= now - 2 * 60 * 60 * 1000).sort((left, right) => (eventStart(left)?.getTime() || 0) - (eventStart(right)?.getTime() || 0));
  const items: TimelineItem[] = [];
  const nextOperational = relevant.find((event) => isOperational(event) && (eventEnd(event)?.getTime() || 0) >= now);
  if (nextOperational) {
    const presentation = presentationDate(nextOperational); const start = eventStart(nextOperational);
    const distinct = Boolean(presentation && start && presentation.getTime() >= now - 5 * 60 * 1000 && presentation.getTime() < start.getTime() - 60 * 1000);
    if (presentation && distinct) items.push({ id: `presentation-${nextOperational.id || presentation.toISOString()}`, at: presentation, eyebrow: 'Apresentação', title: `Apresentação para ${operationTitle(nextOperational)}`, detail: String(nextOperational.origin || '').trim().toUpperCase() || 'Local a confirmar', meta: nextOperational.gate ? `Portão ${nextOperational.gate}` : undefined, tone: 'presentation', targetView: 'roster' });
  }
  for (const event of relevant.slice(0, 8)) {
    const start = eventStart(event); if (!start) continue; const category = classifyScheduleActivity(event);
    if (category === 'FOLGA' || category === 'REPOUSO') { const copy = restCopy(event); const end = eventEnd(event); items.push({ id: `rest-${event.id || start.toISOString()}`, at: start, eyebrow: 'Descanso', title: copy.title, detail: copy.detail, meta: end ? `Encerra ${dateLabel(end)}, às ${timeLabel(end)}` : undefined, tone: 'rest', targetView: 'roster' }); continue; }
    if (category === 'PERNOITE') { const end = eventEnd(event); items.push({ id: `stay-${event.id || start.toISOString()}`, at: start, eyebrow: 'Hospedagem', title: 'Pernoite', detail: event.hotel || routeLabel(event) || 'Hotel a confirmar', meta: end ? `Até ${dateLabel(end)}, às ${timeLabel(end)}` : undefined, tone: 'stay', targetView: 'hotels' }); continue; }
    items.push({ id: `operation-${event.id || start.toISOString()}`, at: start, eyebrow: isFlight(event) ? 'Voo' : 'Programação', title: operationTitle(event), detail: routeLabel(event) || event.subtitle || 'Atividade operacional', meta: [event.status, event.gate ? `Portão ${event.gate}` : '', event.terminal || ''].filter(Boolean).join(' · ') || undefined, tone: 'operation', targetView: isFlight(event) ? 'radar' : 'roster' });
  }
  const seen = new Set<string>();
  return items.sort((left, right) => left.at.getTime() - right.at.getTime()).filter((item) => { const signature = `${item.eyebrow}|${item.title}|${item.at.toISOString()}`; if (seen.has(signature)) return false; seen.add(signature); return true; }).slice(0, 7);
}

const iconForTone = { presentation: Clock3, operation: Plane, stay: Hotel, rest: MoonStar } satisfies Record<TimelineTone, typeof Plane>;

export default function OperationalDayTimeline({ events, onNavigate }: { events: RosterEvent[]; onNavigate: (view: string) => void }) {
  const timeline = buildOperationalDayTimeline(events);
  const focusDate = timeline[0]?.at || new Date();
  return <section className="cc14349-dayline" aria-labelledby="cc14349-dayline-title">
    <header className="cc14349-dayline-head">
      <span className="cc14349-dayline-heading">
        <CrewCheckDynamicCalendar date={focusDate} compact/>
        <span><small>ROTINA OPERACIONAL</small><h2 id="cc14349-dayline-title">Linha do Dia</h2><p>Sua rotina operacional em ordem cronológica.</p></span>
      </span>
      <button type="button" onClick={() => onNavigate('roster')} aria-label={`Abrir escala da programação de ${dateLabel(focusDate)}`}>Ver escala <ChevronRight aria-hidden="true"/></button>
    </header>
    {timeline.length ? <div className="cc14349-dayline-list">{timeline.map((item) => { const Icon = iconForTone[item.tone]; return <button type="button" key={item.id} className={`cc14349-dayline-item tone-${item.tone}`} onClick={() => onNavigate(item.targetView || 'roster')}>
      <span className="cc14349-dayline-time"><strong>{timeLabel(item.at)}</strong><small>{dateLabel(item.at)}</small></span><span className="cc14349-dayline-marker" aria-hidden="true"><Icon/></span><span className="cc14349-dayline-copy"><small>{item.eyebrow}</small><strong>{item.title}</strong><span><MapPin aria-hidden="true"/>{item.detail}</span>{item.meta && <em>{item.meta}</em>}</span><ChevronRight className="cc14349-dayline-chevron" aria-hidden="true"/>
    </button>; })}</div> : <div className="cc14349-dayline-empty"><ShieldCheck aria-hidden="true"/><div><strong>Nenhuma programação futura encontrada</strong><span>Confira o período da escala ou importe um arquivo atualizado.</span></div><button type="button" onClick={() => onNavigate('import')}>Importar escala</button></div>}
  </section>;
}
