import type { CanonicalRosterEvent } from '@/lib/canonicalRoster';
import { setPendingNavigationContext } from '@/lib/navigationContext';
import { ShieldCheck, ChevronRight, Calculator } from 'lucide-react';
import { canonicalDutyDurationLabel, type CanonicalDutyMeasurement } from '@/lib/canonicalDutyMeasurement';
import './canonical-duty-card.css';

function publishedClock(instant: string | null) {
  const value = instant ? Date.parse(instant) : NaN;
  return Number.isFinite(value) ? new Date(value - 180 * 60_000).toISOString().slice(11, 16) : '';
}

export function CanonicalDutyCard({ measurement, onOpen }: { measurement: CanonicalDutyMeasurement | null; onOpen: () => void }) {
  if (!measurement) return <aside className="cc-canonical-duty-card" role="status"><ShieldCheck aria-hidden="true" className="cc-canonical-duty-icon"/><span className="cc-canonical-duty-copy"><strong>Jornada · Dados pendentes</strong><small>Programação ou identidade da jornada não comprovada.</small><small>Limite pendente: composição e condições aplicáveis não comprovadas.</small></span></aside>;
  return <div className="cc-canonical-duty-tools"><button type="button" className="cc-canonical-duty-card" onClick={onOpen}>
    <ShieldCheck aria-hidden="true" className="cc-canonical-duty-icon"/>
    <span className="cc-canonical-duty-copy">
      <span className="cc-canonical-duty-heading"><strong>{measurement.label}</strong><b role={measurement.minutes === null ? 'img' : undefined} aria-label={measurement.minutes === null ? 'Duração pendente' : undefined}>{measurement.minutes === null ? '-' : canonicalDutyDurationLabel(measurement.minutes)}</b></span>
      <span>{measurement.date} · Base {measurement.base}</span>
      <span className="cc-canonical-duty-times">
        <span><small>{measurement.label === 'Jornada publicada' ? 'Apresentação publicada' : 'Início publicado'}</small><b role={measurement.state !== 'available' ? 'img' : undefined} aria-label={measurement.state !== 'available' ? 'Início publicado não comprovado' : undefined}>{measurement.state === 'available' ? publishedClock(measurement.start) : '-'}</b></span>
        <span><small>Liberação publicada</small><b role={measurement.state !== 'available' ? 'img' : undefined} aria-label={measurement.state !== 'available' ? 'Liberação publicada não comprovada' : undefined}>{measurement.state === 'available' ? publishedClock(measurement.end) : '-'}</b></span>
        <span><small>Fuso</small><b>BRT</b><small>UTC−03</small></span>
      </span>
      <small className="cc-canonical-duty-status">Execução não confirmada · Limite pendente</small>
    </span>
    <ChevronRight aria-hidden="true" className="cc-canonical-duty-icon"/>
  </button>
    <details className="cc-canonical-duty-details"><summary>Detalhes da programação</summary>
      <p>Etapas da jornada: {measurement.program}</p>
      <p>{measurement.state === 'incomplete' ? measurement.reasons.join(' ') : 'Intervalo publicado, incluindo solo; não confirma execução real.'}</p>
      <p>Limite pendente: composição e condições aplicáveis não comprovadas.</p>
    </details>
    <button type="button" className="cc-duty-calculator-shortcut" aria-label="Simular regulamentação desta jornada" onClick={onOpen}><Calculator aria-hidden="true"/><span>Simular regulamentação</span></button></div>;
}

export function openCanonicalDutyDetails(canonical: CanonicalRosterEvent | null | undefined, navigate: (view: 'regulation') => void) {
  if (!canonical) return;
  setPendingNavigationContext({ sourceView: 'cockpit', targetView: 'regulation', dateEpochMs: Date.parse(canonical.startDateTime), journeyId: canonical.journeyId, programId: canonical.id, returnView: 'cockpit', returnLabel: 'Voltar ao Cockpit', policy: 'persistent-until-return' });
  navigate('regulation');
}
