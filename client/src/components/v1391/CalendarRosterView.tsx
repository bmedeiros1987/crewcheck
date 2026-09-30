type CalendarRosterEvent = {
  id: string;
  kind?: string;
  title?: string;
  date?: Date;
  day?: Record<string, any>;
  origin?: string;
  destination?: string;
  flightNumber?: string;
  presentation?: string;
  departure?: string;
  arrival?: string;
  canonical?: { startDateTime?: string };
};

const weekDays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function eventDate(event: CalendarRosterEvent) {
  const value = new Date(event.canonical?.startDateTime || event.date || Date.now());
  return Number.isFinite(value.getTime()) ? value : new Date();
}

function isoFromDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function isoOf(event: CalendarRosterEvent) {
  return isoFromDate(eventDate(event));
}

function publishedClock(value?: string | null) {
  const match = String(value || '').match(/(\d{1,2}):(\d{2})/);
  return match ? `${String(Number(match[1])).padStart(2, '0')}:${match[2]}` : '';
}

function activityCode(event: CalendarRosterEvent) {
  return String(event.flightNumber || event.day?.pairingCode || event.day?.type || event.title || 'Programação');
}

function activityContext(event: CalendarRosterEvent) {
  if (event.origin || event.destination) return `${event.origin || '—'} → ${event.destination || '—'}`;
  return String(event.title || event.kind || 'Programação publicada');
}

function activityTimes(event: CalendarRosterEvent) {
  const values = [
    event.presentation && event.presentation !== 'Conexão/Solo' ? `APZ ${publishedClock(event.presentation)}` : '',
    publishedClock(event.departure || event.day?.startTime || event.day?.dutyReport),
    publishedClock(event.arrival || event.day?.endTime || event.day?.dutyDebrief),
  ].filter(Boolean);
  return Array.from(new Set(values)).join(' · ');
}

export function buildCalendarDates(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  const first = new Date(year, monthNumber - 1, 1);
  const leading = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const total = Math.ceil((leading + daysInMonth) / 7) * 7;
  return Array.from({ length: total }, (_, index) => new Date(year, monthNumber - 1, index - leading + 1));
}

export function CalendarRosterView({ events, month }: { events: CalendarRosterEvent[]; month: string }) {
  const byDate = new Map<string, CalendarRosterEvent[]>();
  for (const event of events) {
    const iso = isoOf(event);
    byDate.set(iso, [...(byDate.get(iso) || []), event]);
  }
  const dates = buildCalendarDates(month);
  const weeks = Array.from({ length: Math.ceil(dates.length / 7) }, (_, index) => dates.slice(index * 7, index * 7 + 7));
  const todayIso = isoFromDate(new Date());

  return <section className="cc-calendar-roster" aria-labelledby="cc-calendar-roster-title">
    <header>
      <div>
        <small>FORMATO CALENDÁRIO</small>
        <h2 id="cc-calendar-roster-title">Mês operacional</h2>
        <p>Todas as programações permanecem visíveis dentro do respectivo dia.</p>
      </div>
      <span>{events.length} {events.length === 1 ? 'programação' : 'programações'}</span>
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
              const inside = iso.startsWith(`${month}-`);
              return <td key={iso} data-roster-iso={iso} data-outside-month={inside ? 'false' : 'true'} data-today={iso === todayIso ? 'true' : 'false'}>
                <div className="cc-calendar-day">
                  <header><time dateTime={iso}>{date.getDate()}</time>{dayEvents.length > 0 && <span>{dayEvents.length}</span>}</header>
                  <div>
                    {dayEvents.map((event) => <article key={event.id}>
                      <strong>{activityCode(event)}</strong>
                      <span>{activityContext(event)}</span>
                      {activityTimes(event) && <small>{activityTimes(event)}</small>}
                    </article>)}
                  </div>
                </div>
              </td>;
            })}
          </tr>)}
        </tbody>
      </table>
    </div>
  </section>;
}
