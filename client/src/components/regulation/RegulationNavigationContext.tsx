import { useState } from 'react';
import {
  clearPendingNavigationContext,
  peekPendingNavigationContext,
  type CrewCheckNavigationContext,
} from '@/lib/navigationContext';
import { setPendingRosterFocus } from '@/lib/rosterFocus';

function contextualDateLabel(epoch?: number): string {
  const value = Number(epoch);
  if (!Number.isFinite(value) || value <= 0) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function isRosterContext(context: CrewCheckNavigationContext | null): context is CrewCheckNavigationContext {
  return Boolean(
    context
      && context.targetView === 'regulation'
      && context.sourceView === 'roster'
      && context.returnView === 'roster',
  );
}

/**
 * Contextual bridge for #565. It never calculates regulatory facts; it only carries
 * the explicit roster date/program reference already selected by the user.
 */
export default function RegulationNavigationContext() {
  const [context] = useState(() => peekPendingNavigationContext('regulation'));
  if (!isRosterContext(context)) return null;

  const dateLabel = contextualDateLabel(context.dateEpochMs);

  function returnToRoster() {
    const current = peekPendingNavigationContext('regulation');
    const source = isRosterContext(current) ? current : context;
    const epoch = Number(source.dateEpochMs);

    // Clear the persistent regulation context first. Then deposit the one-shot roster
    // focus, so the global setView guard preserves exactly this return and nothing stale.
    clearPendingNavigationContext();
    if (Number.isFinite(epoch) && epoch > 0) setPendingRosterFocus(new Date(epoch));
    window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'roster' }));
  }

  return <section className="cc-reg-context-return cc-readable-surface" aria-label="Contexto da consulta regulatória">
    <button type="button" onClick={returnToRoster}>
      <span aria-hidden="true">←</span>
      {context.returnLabel || 'Voltar para Escala'}
    </button>
    <div>
      <small>CONSULTA ABERTA PELA ESCALA</small>
      <strong>{dateLabel ? `Programação de ${dateLabel}` : 'Programação selecionada'}</strong>
      <span>Ao voltar, o CrewCheck restaura o mesmo dia da escala.</span>
    </div>
  </section>;
}
