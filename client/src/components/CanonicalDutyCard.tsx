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
      <strong>{measurement.label} · {canonicalDutyDurationLabel(measurement.minutes)}</strong>
      <span>{measurement.date} · Base {measurement.base}</span>
      <small>Etapas da jornada: {measurement.program}</small>
      {measurement.state === 'available' && <small>{measurement.label === 'Jornada publicada' ? 'Apresentação publicada' : 'Início publicado'} {publishedClock(measurement.start)} · Liberação publicada {publishedClock(measurement.end)} · BRT (UTC−03)</small>}
      <small>{measurement.state === 'incomplete' ? measurement.reasons.join(' ') : 'Intervalo publicado, incluindo solo; não confirma execução real.'}</small>
      <small>Limite pendente: composição e condições aplicáveis não comprovadas.</small>
    </span>
    <ChevronRight aria-hidden="true" className="cc-canonical-duty-icon"/>
  </button><button type="button" className="cc-duty-calculator-shortcut" aria-label="Simular regulamentação desta jornada" onClick={onOpen}><Calculator aria-hidden="true"/></button></div>;
}

export function openCanonicalDutyDetails(canonical: CanonicalRosterEvent | null | undefined, navigate: (view: 'regulation') => void) {
  if (!canonical) return;
  setPendingNavigationContext({ sourceView: 'cockpit', targetView: 'regulation', dateEpochMs: Date.parse(canonical.startDateTime), journeyId: canonical.journeyId, programId: canonical.id, returnView: 'cockpit', returnLabel: 'Voltar ao Cockpit', policy: 'persistent-until-return' });
  navigate('regulation');
}
