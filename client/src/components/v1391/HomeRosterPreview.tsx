import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { rosterDisplayCompare, rosterDisplayIso, rosterInstantIso, rosterStrictInstant, ROSTER_DISPLAY_TIME_ZONE } from '@/lib/rosterDisplayDate';
import { setPendingNavigationContext } from '@/lib/navigationContext';
import { filterRosterEvents, rosterCardPresentation } from '@/lib/rosterPresentation';
import { RosterActivityIcon, RosterLegend, useRosterCategoryFilter } from './RosterLegend';
import { NextFlightGateCard } from '@/components/nextflight/NextFlightGateCard';
import './home-roster-preview.css';

export type HomeRosterEvent = {
  id: string; placeholder?: boolean; kind?: string; title?: string;
  operationalTimeZone?: string; date?: Date | string;
  origin?: string; destination?: string; flightNumber?: string;
  presentation?: string; departure?: string; arrival?: string;
  day?: Record<string, any>; leg?: Record<string, any>;
  canonical?: { date?: string; publishedDay?: { date?: string; type?: string; pairingCode?: string; hotel?: string | null }; kind?: string; code?: string; startDateTime?: string; endDateTime?: string; showPresentation?: boolean; isNextDay?: boolean };
};

function shiftDay(iso: string, offset: number) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
function dayLabel(iso: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('pt-BR', { ...options, timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
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
  const categoryFilter = useRosterCategoryFilter(events);
  const ordered = useMemo(() => events.filter(event => !event.placeholder && !event.id.includes('placeholder') && event.canonical?.kind !== 'journey-rest').slice().sort(rosterDisplayCompare), [events, categoryFilter.signature]);
  const periodEvents = ordered.filter(event => rosterDisplayIso(event) === selected);
  const dayEvents = filterRosterEvents(periodEvents, categoryFilter.filter);
  const unknown = ordered.filter(event => !rosterDisplayIso(event)).length;
  const nextDay = ordered.map(rosterDisplayIso).filter((iso): iso is string => Boolean(iso && iso > selected)).sort()[0];
  function open(event: HomeRosterEvent) {
    const instant = rosterStrictInstant(event.canonical?.startDateTime || event.date);
    setPendingNavigationContext({ sourceView: 'home-roster', targetView: 'roster', programId: event.id, dateEpochMs: instant?.getTime(), returnView: 'cockpit', returnLabel: 'Voltar à Escala rápida', policy: 'once' });
    onNavigate('roster');
  }
  function select(iso: string) { setSelected(iso); if (iso < start || iso > shiftDay(start, 6)) setStart(iso); }

  return <><section className="cc-home-roster" aria-label="Escala rápida">
    <header><div><small>CONSULTA RÁPIDA</small><h2>Sua escala, dia a dia</h2></div><button type="button" onClick={() => onNavigate('roster')}>Escala completa <ChevronRight aria-hidden="true"/></button></header>
    <div className="cc-home-roster-period"><button type="button" aria-label="Sete dias anteriores" onClick={() => setStart(shiftDay(start, -7))}><ChevronLeft/></button><strong>{dayLabel(start, { month: 'long', year: 'numeric' })}</strong><button type="button" aria-label="Próximos sete dias" onClick={() => setStart(shiftDay(start, 7))}><ChevronRight/></button><button type="button" onClick={() => { setStart(today); setSelected(today); }}>Hoje</button></div>
    <div className="cc-home-roster-days" aria-label="Escolher data">
      {Array.from({ length: 7 }, (_, index) => shiftDay(start, index)).map(iso => <button key={iso} type="button" aria-pressed={selected === iso} aria-label={dayLabel(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} onClick={() => select(iso)}><small>{dayLabel(iso, { weekday: 'short' })}</small><strong>{iso.slice(8)}</strong><span aria-hidden="true">{ordered.some(event => rosterDisplayIso(event) === iso) ? '•' : ' '}</span></button>)}
    </div>
    <RosterLegend events={periodEvents} selected={categoryFilter.filter} onSelect={categoryFilter.choose} periodLabel={dayLabel(selected, { day: 'numeric', month: 'long', year: 'numeric' })}/>
    <h3>{dayLabel(selected, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
    <div className="cc-home-roster-list">
      {dayEvents.map((event, index) => {
        const card = rosterCardPresentation(event, selected);
        const tone = ({ operating: 'flight', extra: 'extra', stay: 'layover', rest: 'off', 'journey-rest': 'rest', reserve: 'reserve', standby: 'standby', training: 'training', duty: 'duty' } as const)[card.mode];
        const uncertainty = card.datesUnconfirmed ? 'Virada de dia indicada; datas a confirmar' : '';
        return <button type="button" key={`${event.id}:${index}`} data-roster-event-id={event.id} className="cc-roster-token" data-roster-mode={card.mode} data-activity={card.category} data-card-tone={tone} onClick={() => open(event)} aria-label={`Abrir ${card.title} em ${dayLabel(selected, { day: 'numeric', month: 'long' })}, início ${card.start}${card.startDate ? `, ${card.startDate}` : ''}, fim ${card.end}${card.endDate ? `, ${card.endDate}` : ''} no AIMS${uncertainty ? `. ${uncertainty}` : ''}`}>
          <span className="cc-home-roster-icon"><RosterActivityIcon mode={card.mode}/></span>
          <span className="cc-home-roster-copy"><strong>{card.title}{!card.nonOperational && event.leg?.workType && <small> · {event.leg.workType}</small>}</strong>
            {card.context && <span>{card.context}</span>}
            {uncertainty && <small>{uncertainty}</small>}
            {card.hotel && <small className="cc-home-roster-hotel">Hotel · {card.hotel}</small>}
            {card.presentation && <small>Apresentação {card.presentation}</small>}
            {card.note && <small>{card.note}</small>}
          </span>
          <span className="cc-home-roster-clock"><span><small>Início{card.startDate && ` · ${card.startDate}`}</small><strong>{card.start}</strong></span><span><small>Fim{card.endDate && ` · ${card.endDate}`}</small><strong>{card.end}</strong></span></span><ChevronRight aria-hidden="true"/>
        </button>;
      })}
      {!dayEvents.length && categoryFilter.filter !== 'all' && periodEvents.length > 0 && <div className="cc-home-roster-empty"><p>Nenhum item deste filtro nesta data.</p><button type="button" onClick={categoryFilter.reset}>Mostrar tudo</button></div>}
      {!dayEvents.length && !(categoryFilter.filter !== 'all' && periodEvents.length > 0) && <div className="cc-home-roster-empty"><CalendarDays aria-hidden="true"/><p>{ordered.length ? 'Sem atividades informadas para esta data.' : 'Importe uma escala para consultar sua programação.'}</p>{nextDay ? <button type="button" onClick={() => select(nextDay)}>Próxima data com programação</button> : !ordered.length ? <button type="button" onClick={() => onNavigate('import')}>Importar escala</button> : null}</div>}
    </div>
    {unknown > 0 && <p className="cc-home-roster-unknown" role="status">{unknown} {unknown === 1 ? 'atividade com data não confirmada' : 'atividades com data não confirmada'}. Consulte a escala completa.</p>}
    <footer>Horários publicados. Consulte sempre a escala e as comunicações oficiais da companhia.</footer>
  </section>
  {/* A Escala rápida não mostra portão; o próximo voo fica logo abaixo dela. */}
  <NextFlightGateCard events={events}/></>;
}
