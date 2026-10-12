import type { CanonicalRosterEvent } from '@/lib/canonicalRoster';
import { setPendingNavigationContext } from '@/lib/navigationContext';
import { ShieldCheck, ChevronRight } from 'lucide-react';
import { canonicalDutyDurationLabel, type CanonicalDutyMeasurement } from '@/lib/canonicalDutyMeasurement';
import './canonical-duty-card.css';

export function CanonicalDutyCard({ measurement, onOpen }: { measurement: CanonicalDutyMeasurement | null; onOpen: () => void }) {
  if (!measurement) return <aside className="cc-canonical-duty-card" role="status"><ShieldCheck aria-hidden="true" className="cc-canonical-duty-icon"/><span className="cc-canonical-duty-copy"><strong>Jornada · Dados pendentes</strong><small>Programação ou identidade da jornada não comprovada.</small><small>Limite pendente: composição e condições aplicáveis não comprovadas.</small></span></aside>;
  return <button type="button" className="cc-canonical-duty-card" onClick={onOpen}>
    <ShieldCheck aria-hidden="true" className="cc-canonical-duty-icon"/>
    <span className="cc-canonical-duty-copy">
      <strong>{measurement.label} · {canonicalDutyDurationLabel(measurement.minutes)}</strong>
      <span>{measurement.date} · {measurement.program} · {measurement.base}</span>
      <small>{measurement.state === 'incomplete' ? measurement.reasons.join(' ') : 'Intervalo publicado, incluindo solo; não confirma execução real.'}</small>
      <small>Limite pendente: composição e condições aplicáveis não comprovadas.</small>
    </span>
    <ChevronRight aria-hidden="true" className="cc-canonical-duty-icon"/>
  </button>;
}

export function openCanonicalDutyDetails(canonical: CanonicalRosterEvent | null | undefined, navigate: (view: 'regulation') => void) {
  if (!canonical) return;
  setPendingNavigationContext({ sourceView: 'cockpit', targetView: 'regulation', dateEpochMs: Date.parse(canonical.startDateTime), journeyId: canonical.journeyId, programId: canonical.id, returnView: 'cockpit', returnLabel: 'Voltar ao Cockpit', policy: 'persistent-until-return' });
  navigate('regulation');
}
