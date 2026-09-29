type AimsRosterEvent = {
  id: string;
  kind?: string;
  title?: string;
  subtitle?: string;
  date?: Date;
  day?: Record<string, any>;
  origin?: string;
  destination?: string;
  flightNumber?: string;
  presentation?: string;
  departure?: string;
  arrival?: string;
  hotel?: string;
  canonical?: { startDateTime?: string; endDateTime?: string };
};

function eventDate(event: AimsRosterEvent) {
  const value = new Date(event.canonical?.startDateTime || event.date || Date.now());
  return Number.isFinite(value.getTime()) ? value : new Date();
}

function isoOf(event: AimsRosterEvent) {
  const value = eventDate(event);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function dateLabel(event: AimsRosterEvent) {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(eventDate(event));
}

function publishedClock(value?: string | null) {
  const match = String(value || '').match(/(\d{1,2}):(\d{2})/);
  return match ? `${String(Number(match[1])).padStart(2, '0')}:${match[2]}` : '—';
}

function activityCode(event: AimsRosterEvent) {
  return String(event.flightNumber || event.day?.pairingCode || event.day?.type || event.title || 'Programação');
}

function details(event: AimsRosterEvent) {
  return String(event.subtitle || event.hotel || event.title || event.kind || '—');
}

export function AimsRosterTable({ events }: { events: AimsRosterEvent[] }) {
  return <section className="cc-aims-roster" aria-labelledby="cc-aims-roster-title">
    <header>
      <div>
        <small>FORMATO AIMS</small>
        <h2 id="cc-aims-roster-title">Escala publicada em tabela</h2>
        <p>Uma linha por programação, sem alterar horários ou regras da escala canônica.</p>
      </div>
      <span>{events.length} {events.length === 1 ? 'linha' : 'linhas'}</span>
    </header>
    <div className="cc-aims-roster-scroll" tabIndex={0} aria-label="Tabela AIMS; deslize horizontalmente para ver todas as colunas">
      <table>
        <caption>Programações publicadas no período selecionado</caption>
        <thead>
          <tr>
            <th scope="col">Data</th>
            <th scope="col">Código / atividade</th>
            <th scope="col">Apresentação</th>
            <th scope="col">Origem</th>
            <th scope="col">Partida</th>
            <th scope="col">Destino</th>
            <th scope="col">Chegada</th>
            <th scope="col">Detalhes publicados</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event, index) => {
            const iso = isoOf(event);
            const previousIso = index > 0 ? isoOf(events[index - 1]) : null;
            return <tr key={event.id} data-roster-iso={iso} data-new-day={iso !== previousIso ? 'true' : 'false'}>
              <th scope="row"><time dateTime={iso}>{dateLabel(event)}</time></th>
              <td><strong>{activityCode(event)}</strong></td>
              <td>{event.presentation && event.presentation !== 'Conexão/Solo' ? publishedClock(event.presentation) : '—'}</td>
              <td>{event.origin || '—'}</td>
              <td>{publishedClock(event.departure || event.day?.startTime || event.day?.dutyReport)}</td>
              <td>{event.destination || '—'}</td>
              <td>{publishedClock(event.arrival || event.day?.endTime || event.day?.dutyDebrief)}</td>
              <td>{details(event)}</td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  </section>;
}
