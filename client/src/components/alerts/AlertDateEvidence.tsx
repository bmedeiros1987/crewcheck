import { alertAccount, alertDigest, complianceAlertIdentity } from '../../lib/alertReviewStore';
import { alertRosterOwned } from '../../lib/alertRosterOwnership';
import { setPendingNavigationContext } from '../../lib/navigationContext';
import type { CrewRoster } from '../../lib/pdfParser';
import type { AlertDateEvidence as DateEvidence } from '../../lib/nightAlertEvidence';

export const alertRosterVersion = (roster: CrewRoster) => alertDigest([roster.year, roster.month, roster.days]);
export function AlertDateEvidence({ alert, roster }: { alert: any; roster: CrewRoster }) {
  const owner = alertAccount();
  const rows: DateEvidence[] = Array.isArray(alert.dateEvidence) ? alert.dateEvidence : [];
  if (!rows.length) return null;
  function open(row: DateEvidence) {
    if (!owner || owner !== alertAccount() || !alertRosterOwned(roster) || !roster.days.some(day => day.date === row.date)) return;
    const [day, month, year] = row.date.split('/').map(Number);
    const epoch = Date.UTC(year, month - 1, day, 12);
    if (!Number.isFinite(epoch)) return;
    const identity = complianceAlertIdentity(alert, roster);
    setPendingNavigationContext({ sourceView: 'alerts', targetView: 'roster', dateEpochMs: epoch, journeyId: row.journeyId,
      alertOwner: owner, alertRosterVersion: alertRosterVersion(roster), alertOccurrence: identity.occurrence, alertVersion: identity.version,
      returnView: 'alerts', policy: 'once' });
    window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'roster' }));
  }
  return <section aria-label="Datas e evidências da contagem"><h3>Datas e evidências da contagem</h3><ul>{rows.map((row, index) => <li key={`${row.journeyId}:${row.date}:${index}`}><strong>{row.date}</strong><p>{row.description}</p><button type="button" disabled={!owner || !roster.days.some(day => day.date === row.date)} onClick={() => open(row)}>Abrir {row.date} na escala</button></li>)}</ul></section>;
}
