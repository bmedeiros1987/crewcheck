import { rosterCardPresentation } from '@/lib/rosterPresentation';
import { RosterActivityIcon } from './RosterLegend';
import { rosterDisplayIso, rosterInstantIso, ROSTER_DISPLAY_TIME_ZONE } from '@/lib/rosterDisplayDate';
import { AimsRosterTable } from './AimsRosterTable';
import type { RosterZoom } from '@/lib/rosterLayoutPreference';

type CalendarRosterEvent = {
  id: string;
  operationalTimeZone?: string;
  kind?: string;
  title?: string;
  date?: Date | string;
  day?: Record<string, any>;
  origin?: string;
  destination?: string;
  flightNumber?: string;
  presentation?: string;
  departure?: string;
  arrival?: string;
  canonical?: { date?: string; publishedDay?: { date?: string }; startDateTime?: string };
};

const weekDays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];



function isoFromDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function isoOf(event: CalendarRosterEvent) {
  return rosterDisplayIso(event) || '';
}

export function buildCalendarDates(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  const first = new Date(year, monthNumber - 1, 1);
  const leading = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const total = Math.ceil((leading + daysInMonth) / 7) * 7;
  return Array.from({ length: total }, (_, index) => new Date(year, monthNumber - 1, index - leading + 1));
}

export function CalendarRosterView({ events, periodEvents = events, filtered = false, operationalEvents = events, month, zoom = 'month', selectedDay, onSelectDay }: { events: CalendarRosterEvent[]; periodEvents?: CalendarRosterEvent[]; filtered?: boolean; operationalEvents?: CalendarRosterEvent[]; month: string; zoom?: RosterZoom; selectedDay?: string; onSelectDay?: (iso: string) => void }) {
  const unconfirmed = events.filter(event => !isoOf(event));
  const unconfirmedView = unconfirmed.length ? <section className="cc-roster-unconfirmed" aria-label="Programações com data não confirmada"><h2>Data não confirmada</h2><p>Estas programações não puderam ser posicionadas no calendário; seus detalhes permanecem disponíveis.</p><AimsRosterTable operationalEvents={operationalEvents} events={unconfirmed} showHistory={false} dayView title="Programações com data não confirmada"/></section> : null;
  const byDate = new Map<string, CalendarRosterEvent[]>();
  for (const event of events) {
    const iso = isoOf(event);
    if (!iso) continue;
    byDate.set(iso, [...(byDate.get(iso) || []), event]);
  }
  const dates = buildCalendarDates(month);
  const weeks = Array.from({ length: Math.ceil(dates.length / 7) }, (_, index) => dates.slice(index * 7, index * 7 + 7));
  const todayIso = rosterInstantIso(new Date(), ROSTER_DISPLAY_TIME_ZONE);

  if (zoom === 'day') {
    const dayEvents = byDate.get(selectedDay || '') || [];
    return <>{dayEvents.length
      ? <AimsRosterTable operationalEvents={operationalEvents} events={dayEvents} showHistory={false} dayView title={`Programações de ${(selectedDay || '').split('-').reverse().join('/')}`}/>
      : <section className="cc-roster-empty-v1397" role="status"><h2>{filtered ? 'Nenhum item deste filtro neste dia' : 'Nenhuma programação neste dia'}</h2><p>Escolha outro dia ou volte ao mês completo.</p></section>}{unconfirmedView}</>;
  }

  return <><section className="cc-calendar-roster" aria-labelledby="cc-calendar-roster-title">
    <header>
      <div>
        <small>FORMATO CALENDÁRIO</small>
        <h2 id="cc-calendar-roster-title">Mês operacional</h2>
        <p>{filtered ? 'Cartões da categoria selecionada; datas preservadas.' : 'Todas as programações do dia.'}</p>
      </div>
      <span>{periodEvents.length} {periodEvents.length === 1 ? 'programação' : 'programações'}</span>
    </header>
    <div className="cc-calendar-roster-scroll" tabIndex={0} aria-label="Calendário da escala; deslize horizontalmente para ver a semana completa">
      <table>
        <caption>Escala mensal em calendário, de segunda-feira a domingo</caption>
        <thead><tr>{weekDays.map((day) => <th key={day} scope="col">{day}</th>)}</tr></thead>
        <tbody>
          {weeks.map((week, weekIndex) => <tr key={weekIndex}>
            {week.map((date) => {
              const iso = isoFromDate(date);
              const dayEvents = byDate.get(iso) || [];
              const fullDayCount = periodEvents.filter(event => isoOf(event) === iso).length;
              const inside = iso.startsWith(`${month}-`);
              return <td key={iso} data-roster-iso={iso} data-outside-month={inside ? 'false' : 'true'} data-today={iso === todayIso ? 'true' : 'false'}>
                <div className="cc-calendar-day">
                  <header><button type="button" disabled={!inside} aria-label={`Abrir dia ${iso.split('-').reverse().join('/')}, ${fullDayCount} programações`} onClick={() => onSelectDay?.(iso)}><time dateTime={iso}>{date.getDate()}</time></button>{fullDayCount > 0 && <span>{fullDayCount}</span>}</header>
                  <div>
                    {dayEvents.map((event, index) => { const card = rosterCardPresentation(event, iso); return <article key={`${event.id}:${periodEvents.indexOf(event)}:${index}`} className="cc-roster-token" data-roster-mode={card.mode} data-roster-event-id={event.id}>
                      <button type="button" aria-label={`Abrir ${card.title} em ${iso}`} onClick={() => onSelectDay?.(iso)}><strong className="cc-roster-card-heading"><RosterActivityIcon mode={card.mode}/>{card.title}</strong></button>
                      {card.context && <span>{card.context}</span>}
                      {card.presentation && <small>Apresentação {card.presentation}</small>}
                      <small className="cc-roster-clock-bound">Início{card.startDate && ` · ${card.startDate}`}: {card.start}</small>
                      <small className="cc-roster-clock-bound">Fim{card.endDate && ` · ${card.endDate}`}: {card.end}</small>
                      {card.datesUnconfirmed && <small>Virada de dia indicada; datas a confirmar</small>}
                      {card.hotel && <small>Hotel · {card.hotel}</small>}
                    </article>; })}
                    {!dayEvents.length && fullDayCount > 0 && filtered && <p className="cc-roster-filter-empty">Nenhum item deste filtro</p>}
                  </div>
                </div>
              </td>;
            })}
          </tr>)}
        </tbody>
      </table>
    </div>
  </section>{unconfirmedView}</>;
}
