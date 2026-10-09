import { useEffect, useState } from 'react';
import type { CanonicalRosterEvent } from '@/lib/canonicalRoster';
import { sequenceEvidence } from '@/lib/publishedSequence';
import { publication } from '@/lib/rosterPublicationReview';
import { currentPublicationReview, publicationOwner, subscribePublicationReview } from '@/lib/rosterPublicationRuntime';
import './PublishedSequenceCard.css';

/** A projection of this import, never an activation producer or a legal clock. */
export function PublishedSequenceCard({ events, anchorId }: { events: CanonicalRosterEvent[]; anchorId: string }) {
  const [, refresh] = useState(0);
  useEffect(() => subscribePublicationReview(() => refresh(value => value + 1)), []);
  const owner = publicationOwner(), snapshot = publication(events), review = currentPublicationReview();
  const result = sequenceEvidence({ owner, revision: snapshot.revision, events, anchorId });
  const anchor = events.find(event => event.id === anchorId);
  if (!anchor || !/^(HSB\d?|HSBE|HSBD|HSB[_-]ADM|SA|ASB|RES|RSV|RESERVA)$/.test(String(anchor.publishedDay?.type || anchor.flightNumber).toUpperCase())) return null;
  // A unique exact changed occurrence proves only a shortened published window.
  const current = publication([anchor]).items[0];
  const shortened = owner && review?.owner === owner && review.publication.revision === snapshot.revision && review.history.filter(change => change.version === review.version && change.kind === 'changed' && change.after && JSON.stringify(change.after) === JSON.stringify(current) && change.before?.start === current.start && Number.isFinite(Date.parse(change.before.end)) && Date.parse(change.before.end) > Date.parse(current.end));
  const shortening = Array.isArray(shortened) && shortened.length === 1;
  return <article className="cc-published-sequence" data-published-sequence="true">
    <h3>Sequência disponível na escala</h3>
    <p>Programado · horários publicados, sem confirmação de realização.</p>
    <ol>{result.rows.map(row => <li key={row.id}><strong>{row.code || 'Atividade'}</strong><span>{row.date} · {row.published.start && row.published.end ? `${new Date(row.published.start).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })} → ${new Date(row.published.end).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })}` : 'Horário publicado incompleto'}</span><small>Programado</small></li>)}</ol>
    {shortening && <p>Janela de sobreaviso encurtada entre versões publicadas; motivo não confirmado.</p>}
    <p><strong>{result.activation === 'possible' ? 'Indício de acionamento (inferido)' : 'Acionamento não confirmado'}</strong>{result.activation === 'possible' && ' · Sobreaviso seguido imediatamente de reserva ou voo na escala.'}</p>
    <p>Telefonema, início do deslocamento e início efetivo da jornada não confirmados. Consulte a comunicação da empresa.</p>
    {result.gaps.filter(message => message.startsWith('Intervalo') || message.startsWith('Sobreposição') || message.startsWith('Horário')).map(message => <p key={message} role="note">{message.replace(/ entre .*; vínculo/, '; vínculo').replace(/: .*\.$/, '.')}</p>)}
    {result.rows.length === 1 && <p>Nenhum sucessor operacional vinculado disponível antes do descanso ou término desta programação.</p>}
  </article>;
}
