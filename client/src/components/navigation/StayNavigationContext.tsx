import { useState } from 'react';
import {
  clearPendingNavigationContext,
  peekPendingNavigationContext,
  type CrewCheckNavigationContext,
} from '@/lib/navigationContext';
import './stay-context.css';

type StayContextTarget = 'wakeup' | 'concierge';

function dateLabel(epoch?: number): string {
  const value = Number(epoch);
  if (!Number.isFinite(value) || value <= 0) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(date);
}

function stayContext(
  context: CrewCheckNavigationContext | null,
  targetView: StayContextTarget,
): context is CrewCheckNavigationContext {
  return Boolean(
    context
      && context.targetView === targetView
      && context.sourceView === 'hotels'
      && context.returnView === 'hotels'
      && context.stayId,
  );
}

function returnToStay() {
  clearPendingNavigationContext();
  window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'hotels' }));
}

/**
 * Navigation-only bridge for #566/#519. The stay identity is supplied explicitly by
 * the Pernoite surface. This component never reads room data, recalculates APZ,
 * creates alarms or injects hotel facts into Concierge.
 */
export default function StayNavigationContext({ targetView }: { targetView: StayContextTarget }) {
  const [context] = useState(() => peekPendingNavigationContext(targetView));
  if (!stayContext(context, targetView)) return null;

  const date = dateLabel(context.dateEpochMs);
  const airport = String(context.airportCode || '').trim();
  const detail = [airport ? `pernoite em ${airport}` : '', date].filter(Boolean).join(' · ');

  return <section className="cc-stay-context-return cc-readable-surface" aria-label="Contexto aberto pelo Pernoite">
    <button type="button" onClick={returnToStay}>
      <span aria-hidden="true">←</span>
      {context.returnLabel || 'Voltar ao Pernoite'}
    </button>
    <div>
      <small>ABERTO PELO PERNOITE</small>
      <strong>{targetView === 'wakeup' ? 'Despertador aberto a partir do Pernoite' : 'Concierge aberto a partir do Pernoite'}</strong>
      <span>{detail || 'Pernoite selecionado na tela anterior'} · confirme a programação exibida antes de alterar alertas ou horários.</span>
    </div>
  </section>;
}
