import { rosterDisplayIso, rosterLabelDate, rosterUnconfirmedDateText, ROSTER_DISPLAY_TIME_ZONE } from '@/lib/rosterDisplayDate';
import { Fragment, useId, useMemo, useState } from 'react';
type AimsRosterEvent = {
  id: string;
  operationalTimeZone?: string;
  kind?: string;
  title?: string;
  subtitle?: string;
  date?: Date | string;
  day?: Record<string, any>;
  leg?: Record<string, any>;
  origin?: string;
  destination?: string;
  flightNumber?: string;
  presentation?: string;
  departure?: string;
  arrival?: string;
  hotel?: string;
  canonical?: { date?: string; publishedDay?: { date?: string }; startDateTime?: string; endDateTime?: string };
};



function isoOf(event: AimsRosterEvent) {
  return rosterDisplayIso(event) || '';
}

function dateLabel(event: AimsRosterEvent) {
  const date = rosterLabelDate(event);
  if (!date) return 'Data não confirmada';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: ROSTER_DISPLAY_TIME_ZONE, weekday: 'short', day: '2-digit', month: '2-digit' }).format(date);
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

export function AimsRosterTable({ events, title = 'Escala publicada em tabela', dayView = false }: { events: AimsRosterEvent[]; title?: string; dayView?: boolean }) {
  const titleId = `cc-aims-roster-${useId()}`;
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const eventRenderKeys = useMemo(() => {
    const counts = new Map<string, number>();
    return events.map((event) => {
      const base = String(event.id || 'row');
      const ordinal = counts.get(base) || 0;
      counts.set(base, ordinal + 1);
      return `${base}#${ordinal}`;
    });
  }, [events]);
  function openDetails(key: string) { setExpandedKey(current => current === key ? null : key); }
  function keyboardOpen(event: React.KeyboardEvent, key: string) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault(); openDetails(key);
  }

  return <section className="cc-aims-roster" data-day-view={dayView} aria-labelledby={titleId}>
    <header>
      <div>
        <small>FORMATO AIMS</small>
        <h2 id={titleId}>{title}</h2>
        <p>Horários publicados.</p>
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
            const renderKey = eventRenderKeys[index];
            const expanded = expandedKey === renderKey;
            return <Fragment key={renderKey}>
              <tr
                data-roster-iso={iso}
                data-roster-event-id={event.id}
                data-new-day={iso !== previousIso ? 'true' : 'false'}
                tabIndex={0}
                role="button"
                aria-expanded={expanded}
                aria-label={`${activityCode(event)} em ${dateLabel(event)}. Abrir detalhes`}
                onClick={() => openDetails(renderKey)}
                onKeyDown={(keyboardEvent) => keyboardOpen(keyboardEvent, renderKey)}
              >
                <th scope="row">{iso ? <time dateTime={iso}>{dateLabel(event)}</time> : <><span>Data não confirmada</span><small>{rosterUnconfirmedDateText(event)}</small></>}</th>
                <td><strong>{activityCode(event)}</strong></td>
                <td>{event.presentation && event.presentation !== 'Conexão/Solo' ? publishedClock(event.presentation) : '—'}</td>
                <td>{event.origin || '—'}</td>
                <td>{publishedClock(event.kind === 'flight' ? event.departure : event.day?.dutyReport || event.day?.startTime || event.departure)}</td>
                <td>{event.destination || '—'}</td>
                <td>{publishedClock(event.kind === 'flight' ? event.arrival : event.day?.dutyDebrief || event.day?.endTime || event.arrival)}</td>
                <td>{details(event)}</td>
              </tr>
              {expanded && <tr className="cc-aims-detail-row">
                <td colSpan={8}>
                  <div>
                    <strong>Detalhes da programação</strong>
                    <p>{details(event)}</p>

                  </div>
                </td>
              </tr>}
            </Fragment>;
          })}
        </tbody>
      </table>
    </div>
  </section>;
}
