import { rosterDisplayIso, rosterLabelDate, rosterUnconfirmedDateText, ROSTER_DISPLAY_TIME_ZONE } from '@/lib/rosterDisplayDate';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { currentPublicationReview, publicationOwner, publicationReviewStatus, subscribePublicationReview } from '@/lib/rosterPublicationRuntime';
import { publication, type PublishedEvent } from '@/lib/rosterPublicationReview';
import { PublicationChangeDetail } from './PublicationChangeDetail';
import './aims-vertical.css';
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

export function AimsRosterTable({ events, title = 'Escala publicada por dia', dayView = false, showHistory = true, focusEventId }: { focusEventId?: string; showHistory?: boolean; events: AimsRosterEvent[]; title?: string; dayView?: boolean }) {
  const [storedReview,setReview] = useState(currentPublicationReview);
  const review = storedReview?.owner === publicationOwner() ? storedReview : null;
  const [runtimeStatus,setRuntimeStatus] = useState(publicationReviewStatus);
  const [historyOpen,setHistoryOpen] = useState<number | null>(null);
  useEffect(() => subscribePublicationReview(() => { setReview(currentPublicationReview()); setRuntimeStatus(publicationReviewStatus()); }), []);
  const owner = publicationOwner();
  useEffect(() => { setHistoryOpen(null); setExpandedKey(null); }, [owner]);
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
  // Group only for presentation. Keep every event and its original order within
  // the published day; never infer dates, times or additional activities here.
  const days = useMemo(() => {
    const groups = new Map<string, { iso: string; events: { event: AimsRosterEvent; renderKey: string }[] }>();
    events.forEach((event, index) => {
      const iso = isoOf(event);
      // Unknown dates are deliberately not presented as one confirmed day.
      const key = iso || `unconfirmed-${index}`;
      if (!groups.has(key)) groups.set(key, { iso, events: [] });
      groups.get(key)!.events.push({ event, renderKey: eventRenderKeys[index] });
    });
    return Array.from(groups.entries());
  }, [events, eventRenderKeys]);
  const consumedFocus = useRef<string>();
  useEffect(() => {
    if (!focusEventId || consumedFocus.current === focusEventId) return;
    const index = events.findIndex(event => event.id === focusEventId);
    if (index >= 0) { consumedFocus.current = focusEventId; setExpandedKey(eventRenderKeys[index]); }
  }, [focusEventId, events, eventRenderKeys]);
  // A newer publication must never inherit an already open detail's consultation.
  const observedVersion = useRef(review?.version);
  useEffect(() => {
    if (review?.version !== observedVersion.current) { setExpandedKey(null); setHistoryOpen(null); observedVersion.current = review?.version; }
  }, [review?.version]);
  function openDetails(key: string) { setExpandedKey(current => current === key ? null : key); }

  return <section className="cc-aims-roster cc-aims-vertical" data-day-view={dayView} aria-labelledby={titleId}>
    <header>
      <div>
        <small>FORMATO AIMS</small>
        <h2 id={titleId}>{title}</h2>
        <p>Dias em colunas, com as atividades na vertical. Horários publicados.</p>
      </div>
      <span>{events.length} {events.length === 1 ? 'atividade' : 'atividades'}</span>
    </header>
    {events.length === 0 && <p className="cc-aims-empty" role="status">Nenhuma programação no período selecionado.</p>}
    <ol className="cc-aims-days" aria-label="Programações publicadas por dia">
      {days.map(([dayKey, group]) => <li className="cc-aims-day" key={dayKey} data-roster-iso={group.iso}>
        <h3 className="cc-aims-date">
          {group.iso ? <time dateTime={group.iso}>{dateLabel(group.events[0].event)}</time> : 'Data não confirmada'}
        </h3>
        <ol className="cc-aims-activities" aria-label={`Atividades de ${dateLabel(group.events[0].event)}`}>
          {group.events.map(({ event, renderKey }) => {
            const iso = isoOf(event);
            const expanded = expandedKey === renderKey && review?.version === observedVersion.current;
            const item = event.canonical ? publication([event.canonical as PublishedEvent]).items[0] : null;
            const changes = item && review ? review.history.filter(change => change.after && JSON.stringify(change.after) === JSON.stringify(item)) : [];
            const unread = changes.some(change => !change.seen);
            const detailId = `${titleId}-detail-${eventRenderKeys.indexOf(renderKey)}`;
            return <li key={renderKey} className="cc-aims-activity"
              data-change-status={unread ? 'unread' : undefined}
              data-roster-iso={iso} data-roster-event-id={event.id}>
              <button type="button" className="cc-aims-activity-toggle"
                aria-expanded={expanded} aria-controls={expanded ? detailId : undefined}
                aria-label={`${activityCode(event)} em ${dateLabel(event)}. ${expanded ? 'Fechar' : 'Abrir'} detalhes`}
                onClick={() => openDetails(renderKey)}>
                <small>Código / atividade</small>
                <strong>{activityCode(event)}</strong>
                {unread && <span className="cc-aims-change-badge">Alteração não vista</span>}
                <span className="cc-aims-detail-label">{expanded ? 'Fechar detalhes −' : 'Ver detalhes +'}</span>
              </button>
              {!iso && <p className="cc-aims-unconfirmed-date">{rosterUnconfirmedDateText(event)}</p>}
              <dl className="cc-aims-published-fields">
                <div><dt>Apresentação</dt><dd>{event.presentation && event.presentation !== 'Conexão/Solo' ? publishedClock(event.presentation) : '—'}</dd></div>
                <div><dt>Partida / início</dt><dd>{publishedClock(event.kind === 'flight' ? event.departure : event.day?.dutyReport || event.day?.startTime || event.departure)}</dd></div>
                <div><dt>Origem</dt><dd>{event.origin || '—'}</dd></div>
                <div><dt>Destino</dt><dd>{event.destination || '—'}</dd></div>
                <div><dt>Chegada / fim</dt><dd>{publishedClock(event.kind === 'flight' ? event.arrival : event.day?.dutyDebrief || event.day?.endTime || event.arrival)}</dd></div>
              </dl>
              {expanded && <div id={detailId} className="cc-aims-activity-detail">
                <strong>Detalhes publicados</strong>
                <p>{details(event)}</p>
                {review && changes.map(change => <PublicationChangeDetail key={`${review.owner}:${change.id}`} owner={review.owner} change={change}/>)}
              </div>}
            </li>;
          })}
        </ol>
      </li>)}
    </ol>
    {showHistory && <aside className="cc-publication-history" aria-label="Histórico de alterações">
      <h3>Alterações da escala</h3>
      {runtimeStatus && <p role="status">{runtimeStatus}</p>}
      <p>{!review ? 'Sem referência pessoal confirmada. A primeira publicação cria a referência; não indica mudanças.' : review.version === 1 ? 'Primeira leitura registrada como referência pessoal. Ainda não há comparação com uma versão anterior.' : review.unknown ? 'Comparação parcial ou ambígua. Inclusões e remoções não são inferidas sem cobertura comprovada.' : 'Comparação com a última referência pessoal conhecida.'}</p>
      <p>Amarelo indica alteração ainda não vista. Abrir esta tela não confirma leitura nem aceite da companhia.</p>
      {Boolean(review?.unconfirmed?.length) && <details>
        <summary>Diferenças sem confirmação nesta comparação · {review!.unconfirmed!.length}</summary>
        <p>Versão local {review!.version}. Estes registros não confirmam alteração da programação e não recebem marca de leitura. Confira as duas fontes oficiais.</p>
        <ul>{review!.unconfirmed!.map((entry, index) => <li key={index}>
          {entry.item.code || entry.item.pairing || 'Programação'} · {entry.item.date} · {entry.item.origin} → {entry.item.destination}: {entry.kind === 'not-observed' ? 'Não encontrada nesta leitura; remoção não confirmada.' : entry.kind === 'newly-observed' ? 'Observada nesta leitura e ausente da referência anterior; inclusão não confirmada.' : 'Correspondência ambígua; alteração não confirmada.'}
        </li>)}</ul>
      </details>}
      {review?.history.map(change => <div key={`${review.owner}:${change.id}`} data-change-status={change.seen ? 'seen' : 'unread'}>
        <button type="button" aria-expanded={historyOpen === change.id} onClick={()=>setHistoryOpen(historyOpen === change.id ? null : change.id)}>{change.seen ? 'Vista' : 'Não vista'} · {(change.after || change.before)?.code || 'Programação'} · {(change.after || change.before)?.date} · versão {change.version}{change.kind === 'removed' ? ' · Removida' : ''}</button>
        {historyOpen === change.id && review.version === observedVersion.current && <PublicationChangeDetail owner={review.owner} change={change}/>}
      </div>)}
    </aside>}
  </section>;
}

