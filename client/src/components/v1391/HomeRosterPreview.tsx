import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Plane } from 'lucide-react';
import { rosterDisplayCompare, rosterDisplayIso, rosterInstantIso, rosterStrictInstant, ROSTER_DISPLAY_TIME_ZONE } from '@/lib/rosterDisplayDate';
import { setPendingNavigationContext } from '@/lib/navigationContext';
import { classifyScheduleActivity } from '@/lib/scheduleActivityClassification';
import './home-roster-preview.css';

export type HomeRosterEvent = {
  id: string; placeholder?: boolean; kind?: string; title?: string;
  operationalTimeZone?: string; date?: Date | string;
  origin?: string; destination?: string; flightNumber?: string;
  presentation?: string; departure?: string; arrival?: string;
  day?: Record<string, any>; leg?: Record<string, any>;
  canonical?: { date?: string; publishedDay?: { date?: string; type?: string; pairingCode?: string }; kind?: string; startDateTime?: string; endDateTime?: string; showPresentation?: boolean; isNextDay?: boolean };
};

function shiftDay(iso: string, offset: number) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
function dayLabel(iso: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('pt-BR', { ...options, timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
}
function clock(value?: string) {
  const match = /^(\d{1,2}):([0-5]\d)(\(\+\d+\))?$/.exec(String(value || '').trim());
  return match && Number(match[1]) < 24 ? `${match[1].padStart(2, '0')}:${match[2]}${match[3] || ''}` : '—';
}

/** Read-only projection of the same events used by RosterLaunchView. */
export function HomeRosterPreview({ events, onNavigate }: { events: HomeRosterEvent[]; onNavigate: (view: 'roster' | 'import') => void }) {
  const [now, setNow] = useState(() => Date.now());
  const today = rosterInstantIso(new Date(now), ROSTER_DISPLAY_TIME_ZONE)!;
  const [selected, setSelected] = useState(today);
  const [start, setStart] = useState(today);
  const previousToday = useRef(today);
  useEffect(() => {
    const previous = previousToday.current;
    if (today !== previous) { setSelected(value => value === previous ? today : value); setStart(value => value === previous ? today : value); previousToday.current = today; }
  }, [today]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(timer); }, []);
  const ordered = useMemo(() => events.filter(event => !event.placeholder && !event.id.includes('placeholder') && event.canonical?.kind !== 'journey-rest').slice().sort(rosterDisplayCompare), [events]);
  const dayEvents = ordered.filter(event => rosterDisplayIso(event) === selected);
  const unknown = ordered.filter(event => !rosterDisplayIso(event)).length;
  const nextDay = ordered.map(rosterDisplayIso).filter((iso): iso is string => Boolean(iso && iso > selected)).sort()[0];
  function open(event: HomeRosterEvent) {
    const instant = rosterStrictInstant(event.canonical?.startDateTime || event.date);
    setPendingNavigationContext({ sourceView: 'home-roster', targetView: 'roster', programId: event.id, dateEpochMs: instant?.getTime(), returnView: 'cockpit', returnLabel: 'Voltar à Escala rápida', policy: 'once' });
    onNavigate('roster');
  }
  function select(iso: string) { setSelected(iso); if (iso < start || iso > shiftDay(start, 6)) setStart(iso); }

  return <section className="cc-home-roster" aria-label="Escala rápida">
    <header><div><small>CONSULTA RÁPIDA</small><h2>Sua escala, dia a dia</h2></div><button type="button" onClick={() => onNavigate('roster')}>Escala completa <ChevronRight aria-hidden="true"/></button></header>
    <div className="cc-home-roster-period"><button type="button" aria-label="Sete dias anteriores" onClick={() => setStart(shiftDay(start, -7))}><ChevronLeft/></button><strong>{dayLabel(start, { month: 'long', year: 'numeric' })}</strong><button type="button" aria-label="Próximos sete dias" onClick={() => setStart(shiftDay(start, 7))}><ChevronRight/></button><button type="button" onClick={() => { setStart(today); setSelected(today); }}>Hoje</button></div>
    <div className="cc-home-roster-days" aria-label="Escolher data">
      {Array.from({ length: 7 }, (_, index) => shiftDay(start, index)).map(iso => <button key={iso} type="button" aria-pressed={selected === iso} aria-label={dayLabel(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} onClick={() => select(iso)}><small>{dayLabel(iso, { weekday: 'short' })}</small><strong>{iso.slice(8)}</strong><span aria-hidden="true">{ordered.some(event => rosterDisplayIso(event) === iso) ? '•' : ' '}</span></button>)}
    </div>
    <h3>{dayLabel(selected, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
    <div className="cc-home-roster-list">
      {dayEvents.map((event, index) => <button type="button" key={`${event.id}:${index}`} data-roster-event-id={event.id} data-activity={classifyScheduleActivity(event)} onClick={() => open(event)} aria-label={`Abrir ${event.flightNumber || event.day?.pairingCode || event.day?.type || event.title || 'programação'} em ${dayLabel(selected, { day: 'numeric', month: 'long' })} no AIMS`}>
        <span className="cc-home-roster-icon">{event.kind === 'flight' ? <Plane aria-hidden="true"/> : <CalendarDays aria-hidden="true"/>}</span>
        <span className="cc-home-roster-copy"><strong>{event.flightNumber || event.day?.pairingCode || event.day?.type || event.title || 'Programação'}{event.leg?.workType && <small> · {event.leg.workType}</small>}</strong><span>{event.origin || '—'}{event.destination && event.destination !== event.origin ? ` → ${event.destination}` : ''}</span><small>{event.canonical?.showPresentation !== false && clock(event.presentation) !== '—' ? `Apresentação ${clock(event.presentation)}` : 'Detalhes publicados no AIMS'}</small></span>
        <span className="cc-home-roster-clock"><strong>{clock(event.departure || event.day?.startTime || event.day?.dutyReport)}</strong><small>{clock(event.arrival || event.day?.endTime || event.day?.dutyDebrief)}</small></span><ChevronRight aria-hidden="true"/>
      </button>)}
      {!dayEvents.length && <div className="cc-home-roster-empty"><CalendarDays aria-hidden="true"/><p>{ordered.length ? 'Sem atividades informadas para esta data.' : 'Importe uma escala para consultar sua programação.'}</p>{nextDay ? <button type="button" onClick={() => select(nextDay)}>Próxima data com programação</button> : !ordered.length ? <button type="button" onClick={() => onNavigate('import')}>Importar escala</button> : null}</div>}
    </div>
    {unknown > 0 && <p role="status">{unknown} {unknown === 1 ? 'atividade com data não confirmada' : 'atividades com data não confirmada'}. Consulte a escala completa.</p>}
    <footer>Horários publicados. Consulte sempre a escala e as comunicações oficiais da companhia.</footer>
  </section>;
}
