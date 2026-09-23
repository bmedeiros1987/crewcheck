import { useState } from 'react';
import {
  clearPendingNavigationContext,
  peekPendingNavigationContext,
  type CrewCheckNavigationContext,
} from '@/lib/navigationContext';
import './flight-context.css';

type FlightContextTarget = 'radar' | 'weather';

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

function flightDeckContext(
  context: CrewCheckNavigationContext | null,
  targetView: FlightContextTarget,
): context is CrewCheckNavigationContext {
  return Boolean(
    context
      && context.targetView === targetView
      && context.sourceView === 'cockpit'
      && context.returnView === 'cockpit'
      && context.programId,
  );
}

function returnToFlightDeck() {
  clearPendingNavigationContext();
  window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'cockpit' }));
}

export default function FlightDeckNavigationContext({ targetView }: { targetView: FlightContextTarget }) {
  const [context] = useState(() => peekPendingNavigationContext(targetView));
  if (!flightDeckContext(context, targetView)) return null;

  const date = dateLabel(context.dateEpochMs);
  const flight = String(context.flightKey || '').trim();
  const airport = String(context.airportCode || '').trim();
  const detail = [flight, airport ? `origem ${airport}` : '', date].filter(Boolean).join(' · ');

  return <section className="cc-flight-context-return cc-readable-surface" aria-label="Contexto do voo aberto pelo FlightDeck">
    <button type="button" onClick={returnToFlightDeck}>
      <span aria-hidden="true">←</span>
      {context.returnLabel || 'Voltar ao FlightDeck'}
    </button>
    <div>
      <small>ABERTO PELO FLIGHTDECK</small>
      <strong>{targetView === 'radar' ? 'Situação do voo selecionado' : 'Meteorologia do voo selecionado'}</strong>
      <span>{detail || 'Programação selecionada na tela anterior'}</span>
    </div>
  </section>;
}

export function FlightDeckContextUnavailable({ targetView }: { targetView: FlightContextTarget }) {
  const [context] = useState(() => peekPendingNavigationContext(targetView));
  if (!flightDeckContext(context, targetView)) return null;

  return <section className="cc-flight-context-return cc-readable-surface" aria-label="Contexto do voo indisponível">
    <button type="button" onClick={returnToFlightDeck}>
      <span aria-hidden="true">←</span>
      {context.returnLabel || 'Voltar ao FlightDeck'}
    </button>
    <div>
      <small>CONTEXTO NÃO ENCONTRADO</small>
      <strong>O voo selecionado não está mais na escala ativa</strong>
      <span>O CrewCheck não substituiu essa programação por outro voo. Volte ao FlightDeck e escolha novamente.</span>
    </div>
  </section>;
}
