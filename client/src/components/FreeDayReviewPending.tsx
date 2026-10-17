import { useRef } from 'react';
import type { CrewRoster } from '@/lib/pdfParser';
import type { FreeDayReview } from '@/lib/freeDayPostponement';
import { alertAccount } from '@/lib/alertReviewStore';
import { alertRosterOwned } from '@/lib/alertRosterOwnership';
import { alertRosterVersion } from './alerts/AlertDateEvidence';
import { setPendingNavigationContext } from '@/lib/navigationContext';

function isoDate(value: string): string | null {
  const input = /^\d{2}\/\d{2}\/\d{4}$/.test(value) ? value.split('/').reverse().join('-') : value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;
  const instant = Date.parse(input + 'T12:00:00Z');
  return Number.isFinite(instant) && new Date(instant).toISOString().slice(0, 10) === input ? input : null;
}
export function FreeDayReviewPending({ review, roster, view, bound, onCompare }: { review: FreeDayReview; roster: CrewRoster; view: string; bound: boolean; onCompare(): void }) {
  const owner = alertAccount(), expectedOwner = useRef(owner);
  function open(date: string) {
    if (!bound || !owner || owner !== expectedOwner.current || owner !== alertAccount() || !alertRosterOwned(roster)) return;
    if (!roster.days.some(day => isoDate(day.date) === date)) return;
    setPendingNavigationContext({ sourceView: 'alerts', targetView: 'roster', policy: 'once', dateEpochMs: Date.parse(date + 'T12:00:00Z'),
      alertOwner: owner, alertRosterVersion: alertRosterVersion(roster), returnView: view === 'compare' ? 'compare' : 'alerts', returnLabel: 'Voltar à verificação de folga' });
    window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'roster' }));
  }
  if (!review.reason && !review.pending.length) return null;
  return <section data-free-day-pending>
    <p role="status"><strong>Comparação inconclusiva.</strong> {review.alerts.length ? 'As verificações abaixo continuam pendentes, além das postergações identificadas.' : 'Este quadro não confirma adiamento da folga nem irregularidade.'}</p>
    {review.reason && <p>{review.reason}</p>}
    {review.pending.length > 0 && <><h3>O que falta conferir ({review.pending.length})</h3>{review.pending.map((item, index) => {
      const date = isoDate(item.date), present = date && roster.days.some(day => isoDate(day.date) === date);
      return <article key={`${item.date}:${index}`} data-free-day-pending-date={date || 'unconfirmed'}>
        <h4>{date ? `Folga de ${date.split('-').reverse().join('/')}` : 'Folga com data não confirmada'}</h4>
        {date ? null : <p>Data informada na leitura: {item.date || 'ausente'}.</p>}
        {item.missing?.length ? <ul>{item.missing.map((missing, i) => <li key={i}>{missing}</li>)}</ul> : <p>{item.reason}</p>}
        {present && bound && <button type="button" onClick={() => open(date!)}>Abrir {date!.split('-').reverse().join('/')} na escala atual</button>}
        {date && !present && <p>Esta data não consta na escala atual; confira a sequência na publicação anterior.</p>}
      </article>;
    })}</>}
    <p>Confira o início literal e o fuso nas publicações anterior e atual. Horário de chegada de voo e meia-noite não substituem esse dado. Não há confirmação de pagamento.</p>
    {bound && <button type="button" onClick={onCompare}>Conferir as duas publicações</button>}
  </section>;
}
