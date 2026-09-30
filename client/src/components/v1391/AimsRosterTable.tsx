import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  acknowledgeRosterChange,
  currentAccountId,
  readRosterChangeAwareness,
  renderedRosterEventBase,
  startRosterChangeAwarenessRuntime,
  type RosterChangeAwarenessRecord,
} from '@/lib/rosterChangeAwareness';

startRosterChangeAwarenessRuntime();

type AimsRosterEvent = {
  id: string;
  kind?: string;
  title?: string;
  subtitle?: string;
  date?: Date;
  day?: Record<string, any>;
  leg?: Record<string, any>;
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
  const published = String(event.day?.date || '').match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (published) {
    const year = published[3].length === 2 ? `20${published[3]}` : published[3];
    return `${year}-${String(Number(published[2])).padStart(2, '0')}-${String(Number(published[1])).padStart(2, '0')}`;
  }
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

function recordLabel(record: RosterChangeAwarenessRecord) {
  if (record.kind === 'added') return 'Incluída';
  if (record.kind === 'removed') return 'Removida';
  return 'Alterada';
}

export function AimsRosterTable({ events }: { events: AimsRosterEvent[] }) {
  const owner = currentAccountId();
  const [awarenessRevision, setAwarenessRevision] = useState(0);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  useEffect(() => {
    const refresh = () => setAwarenessRevision((value) => value + 1);
    window.addEventListener('crewcheck:roster-change-awareness', refresh);
    window.addEventListener('crewcheck:auth-expired', refresh);
    return () => {
      window.removeEventListener('crewcheck:roster-change-awareness', refresh);
      window.removeEventListener('crewcheck:auth-expired', refresh);
    };
  }, []);
  const awareness = useMemo(
    () => readRosterChangeAwareness(window.localStorage, owner),
    [owner, awarenessRevision, events],
  );
  const publicationFingerprint = awareness.ledger?.current.fingerprint || '';
  const recordByRenderKey = useMemo(
    () => new Map((awareness.ledger?.active || [])
      .filter((record) => record.currentRenderKey)
      .map((record) => [record.currentRenderKey as string, record])),
    [awareness.ledger],
  );
  const eventRenderKeys = useMemo(() => {
    const counts = new Map<string, number>();
    return events.map((event) => {
      const base = renderedRosterEventBase(event);
      const ordinal = counts.get(base) || 0;
      counts.set(base, ordinal + 1);
      return `${base}#${ordinal}`;
    });
  }, [events]);
  const removed = (awareness.ledger?.active || []).filter((record) => record.kind === 'removed');

  function acknowledge(record: RosterChangeAwarenessRecord | undefined) {
    if (!record || record.acknowledgedAt || !publicationFingerprint) return;
    const next = acknowledgeRosterChange(window.localStorage, owner, record.revisionId, publicationFingerprint);
    setStatus(next.message);
    setAwarenessRevision((value) => value + 1);
  }

  function openDetails(key: string, record?: RosterChangeAwarenessRecord) {
    setExpandedKey((current) => current === key ? null : key);
    acknowledge(record);
  }

  function keyboardOpen(event: React.KeyboardEvent, key: string, record?: RosterChangeAwarenessRecord) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openDetails(key, record);
  }

  return <section className="cc-aims-roster" aria-labelledby="cc-aims-roster-title">
    <header>
      <div>
        <small>FORMATO AIMS</small>
        <h2 id="cc-aims-roster-title">Escala publicada em tabela</h2>
        <p>Uma linha por programação. Amarelo indica alteração ainda não aberta neste dispositivo.</p>
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
            const record = recordByRenderKey.get(renderKey);
            const unread = Boolean(record && !record.acknowledgedAt);
            const expanded = expandedKey === renderKey;
            return <Fragment key={event.id}>
              <tr
                data-roster-iso={iso}
                data-new-day={iso !== previousIso ? 'true' : 'false'}
                data-change-status={unread ? 'unread' : record ? 'acknowledged' : 'unchanged'}
                tabIndex={0}
                role="button"
                aria-expanded={expanded}
                aria-label={`${activityCode(event)} em ${dateLabel(event)}${unread ? ', alteração não aberta' : ''}. Abrir detalhes`}
                onClick={() => openDetails(renderKey, record)}
                onKeyDown={(keyboardEvent) => keyboardOpen(keyboardEvent, renderKey, record)}
              >
                <th scope="row"><time dateTime={iso}>{dateLabel(event)}</time></th>
                <td><strong>{activityCode(event)}</strong>{unread && <span className="cc-aims-change-badge">Alterada</span>}</td>
                <td>{event.presentation && event.presentation !== 'Conexão/Solo' ? publishedClock(event.presentation) : '—'}</td>
                <td>{event.origin || '—'}</td>
                <td>{publishedClock(event.departure || event.day?.startTime || event.day?.dutyReport)}</td>
                <td>{event.destination || '—'}</td>
                <td>{publishedClock(event.arrival || event.day?.endTime || event.day?.dutyDebrief)}</td>
                <td>{details(event)}</td>
              </tr>
              {expanded && <tr className="cc-aims-detail-row">
                <td colSpan={8}>
                  <div>
                    <strong>Detalhes da programação</strong>
                    <p>{details(event)}</p>
                    {record && <aside aria-label={`${recordLabel(record)} nesta publicação`}>
                      <b>{recordLabel(record)} nesta publicação</b>
                      {record.descriptions.map((description) => <span key={description}>{description}</span>)}
                      <small>Ciência registra apenas que estes detalhes foram abertos; não significa concordância ou aceite contratual.</small>
                    </aside>}
                  </div>
                </td>
              </tr>}
            </Fragment>;
          })}
        </tbody>
      </table>
    </div>
    {removed.length > 0 && <section className="cc-aims-removed" aria-labelledby="cc-aims-removed-title">
      <h3 id="cc-aims-removed-title">Retiradas da publicação atual</h3>
      <p>Itens removidos ficam no histórico e não retornam à escala ativa.</p>
      {removed.map((record) => {
        const key = `removed:${record.revisionId}`;
        const expanded = expandedKey === key;
        return <article key={record.revisionId} data-change-status={record.acknowledgedAt ? 'acknowledged' : 'unread'}>
          <button type="button" aria-expanded={expanded} onClick={() => openDetails(key, record)}>
            <span>{record.date} · {record.title}</span>
            <b>{record.acknowledgedAt ? 'Vista' : 'Removida'}</b>
          </button>
          {expanded && <div>{record.descriptions.map((description) => <p key={description}>{description}</p>)}</div>}
        </article>;
      })}
    </section>}
    <p className="cc-aims-awareness-status" role="status" aria-live="polite">{status || (awareness.ledger?.active.length ? awareness.message : '')}</p>
  </section>;
}
