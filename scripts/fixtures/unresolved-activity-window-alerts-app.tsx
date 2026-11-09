import React from 'react';
import { createRoot } from 'react-dom/client';
import { AlertCenter } from '../../client/src/components/alerts/AlertCenter';
import { installGlobalStaticTranslations } from '../../client/src/lib/i18n';
import { parseAimsRoster } from '../../client/src/lib/aimsParser';
import { analyzeCompliance } from '../../client/src/lib/complianceEngine';
import { informationalComplianceDiagnostics, isActionableComplianceAlert } from '../../client/src/lib/complianceAlertSemantics';

// Synthetic AIMS text only (no real roster). The real parser and the real compliance engine produce
// the alerts; they are split exactly like the Home caller: actionable alerts use the same predicate
// as Home's actionableComplianceAlerts (isActionableComplianceAlert) and pending items come from
// informationalComplianceDiagnostics, as in <ReviewedAlerts>.
const win = window as any;
const owner = 'unresolved-window-alerts';
localStorage.setItem('crewcheck_auth_token', 'synthetic-local-only');
localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: owner }));
const text = [
  'Escala de Tripulante Convertida para padrão AIMS',
  'Tripulante: TRIPULANTE SINTETICO -BP:00000000 -Base: BSB -01/08/2026 até31/08/2026 -Timezone Brasília (-3)',
  '',
  '17Aug Mon HSB 06:00 09:00 LA 3730 09:25 10:15 BSB FOR 12:55',
  '20Aug Thu ASB 06:00 12:00',
  '22Aug Sat HSB BSB 06:00 BSB 09:00',
  '',
].join('\n');
const roster: any = parseAimsRoster(text);
localStorage.setItem(`crewcheck_roster_choice_v1_${owner}`, JSON.stringify({ owner, roster }));
const compliance: any = analyzeCompliance(JSON.parse(JSON.stringify(roster)), 'cabin');
const alerts = (compliance.alerts || []).filter((alert: any) => isActionableComplianceAlert(alert));
const pending = informationalComplianceDiagnostics(compliance.alerts);
win.__engineAlerts = compliance.alerts; win.__alerts = alerts; win.__pending = pending;

installGlobalStaticTranslations();
createRoot(document.getElementById('root')!).render(<React.StrictMode>
  <main className="cz-app" data-version="synthetic" data-view="alerts">
    <AlertCenter alerts={alerts} roster={roster} onImport={() => undefined} onChoose={() => undefined} pendingAnalysis={pending}/>
  </main>
</React.StrictMode>);
