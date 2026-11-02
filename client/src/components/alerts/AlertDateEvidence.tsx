import { alertAccount, alertDigest, complianceAlertIdentity } from '../../lib/alertReviewStore';
import { alertRosterOwned } from '../../lib/alertRosterOwnership';
import { setPendingNavigationContext } from '../../lib/navigationContext';
import type { CrewRoster } from '../../lib/pdfParser';
import type { AlertDateEvidence as DateEvidence } from '../../lib/nightAlertEvidence';
import { getSavedLanguage } from '../../lib/i18n';
import { alertText } from '../../lib/alertExperienceText';
import { formatCivilDate, formatCivilDateRange, groupCivilDates, parseCivilDate, rangesNeedYear } from '../../lib/alertDateRanges';

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
  const language = getSavedLanguage(), copy = alertText(language);
  // Row descriptions are the engine's original analysis (Portuguese); they are marked as such.
  const label = (row: DateEvidence) => { const date = parseCivilDate(row.date); return date ? formatCivilDate(date, language, true) : row.date; };
  return <section aria-label={copy.evidenceTitle}><h3>{copy.evidenceTitle}</h3><ul>{rows.map((row, index) => <li key={`${row.journeyId}:${row.date}:${index}`}><strong>{label(row)}</strong><p lang={language === 'pt' ? undefined : 'pt-BR'}>{row.description}</p><button type="button" disabled={!owner || !roster.days.some(day => day.date === row.date)} onClick={() => open(row)}>{copy.openDay.replace('{date}', label(row))}</button></li>)}</ul></section>;
}

const NIGHT_SEQUENCE_CODES = new Set(['NIGHT_WORKED_SEQUENCE', 'night-sequence-pending']);
/**
 * Short summary of the days behind an alert, from the engine's own evidence only.
 * Night sequences use their date evidence (confirmed or, when pending, possible); other alerts
 * show their single published date. Nothing is derived from a count or filled between dates.
 */
export function AlertDateSummary({ alert }: { alert: any }) {
  const language = getSavedLanguage(), copy = alertText(language);
  const evidence: DateEvidence[] = Array.isArray(alert.dateEvidence) ? alert.dateEvidence : [];
  const pending = alert.code === 'night-sequence-pending' || alert.classification === 'dados_insuficientes';
  if (evidence.length || NIGHT_SEQUENCE_CODES.has(alert.code)) {
    const ranges = groupCivilDates(evidence.map(row => row.date));
    if (!ranges.length) return <p className="cc-alert-dates" data-alert-dates="unproven">{copy.datesUnproven}</p>;
    const withYear = rangesNeedYear(ranges);
    return <p className="cc-alert-dates" data-alert-dates={pending ? 'possible' : 'review'}><strong>{pending ? copy.datesPossible : copy.datesReview}:</strong> {ranges.map((range, index) => <span key={range.start.iso}>{index ? '; ' : ''}<time dateTime={range.start.iso}>{formatCivilDateRange(range, language, withYear)}</time></span>)}</p>;
  }
  const single = parseCivilDate(alert.date);
  if (single) return <p className="cc-alert-dates" data-alert-dates="date"><strong>{copy.alertDate}:</strong> <time dateTime={single.iso}>{formatCivilDate(single, language, true)}</time></p>;
  return alert.date ? <p className="cc-alert-dates"><time>{alert.date}</time></p> : null;
}
