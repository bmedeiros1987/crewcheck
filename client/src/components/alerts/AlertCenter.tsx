import { isGroundLimitAlert, isGroundAlertIgnored, ignoreGroundAlert, restoreGroundAlerts, pendingLegacyGroundAlerts, applyLegacyGroundAlerts, GROUND_DISPOSITION_EVENT } from '../../lib/groundAlertDispositions';
import { useEffect, useRef, useState } from 'react';
import { alertAccount, alertIsReviewed, complianceAlertIdentity, readAlertReviews, saveAlertReview } from '../../lib/alertReviewStore';
import { getSavedLanguage } from '../../lib/i18n';
import { alertText, alertHistoryDate } from '../../lib/alertExperienceText';
import { consumePendingNavigationContext, clearPendingNavigationContext } from '../../lib/navigationContext';
import type { CrewRoster } from '../../lib/pdfParser';
import './alert-center.css';
import { AlertDateEvidence, AlertDateSummary, alertRosterVersion } from './AlertDateEvidence';
import { formatCivilDate, parseCivilDate } from '../../lib/alertDateRanges';
import { alertRosterOwned } from '../../lib/alertRosterOwnership';

export function AlertCenter({ alerts, roster, onImport, onChoose, pendingAnalysis = [] }: { alerts: any[]; roster: CrewRoster; onImport(): void; onChoose(): void; pendingAnalysis?: any[] }) {
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState('');
  const [target, setTarget] = useState(() => consumePendingNavigationContext('alerts'));
  const targetRef = useRef<HTMLElement>(null);
  const pendingTargetRef = useRef<HTMLDetailsElement>(null);
  const language = getSavedLanguage(), copy = alertText(language), owner = alertAccount(), originalLanguage = language === 'pt';
  const historyDay = (value?: string) => { const date = parseCivilDate(value); return date ? formatCivilDate(date, language, true) : value || ''; };
  const ready = alertRosterOwned(roster);
  const items = (ready ? alerts : []).map(alert => ({ alert, identity: complianceAlertIdentity(alert, roster) }));
  const history = readAlertReviews();
  const ignoredItems = items.filter(item => isGroundAlertIgnored(item.identity));
  const legacyPending = ready ? pendingLegacyGroundAlerts(alerts, roster) : [];
  const pendingItems = (ready ? pendingAnalysis : []).map(alert => ({ alert, identity: complianceAlertIdentity(alert, roster) }));
  const targetValid = !target?.alertOwner || target.alertOwner === owner && target.alertRosterVersion === alertRosterVersion(roster);
  const isTarget = (item: typeof items[number]) => targetValid && item.identity.occurrence === target?.alertOccurrence && item.identity.version === target?.alertVersion;
  const currentTarget = target?.alertOccurrence ? [...items, ...pendingItems].find(isTarget) : null;
  useEffect(() => {
    const focusTarget = () => { const next = consumePendingNavigationContext('alerts'); if (next) setTarget(next); };
    const sync = () => setRevision(value => value + 1);
    window.addEventListener('crewcheck:set-view', focusTarget);
    window.addEventListener(GROUND_DISPOSITION_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener('crewcheck:set-view', focusTarget); window.removeEventListener(GROUND_DISPOSITION_EVENT, sync); window.removeEventListener('storage', sync); };
  }, []);
  useEffect(() => { if (currentTarget) { const element = pendingTargetRef.current || targetRef.current; element?.focus({ preventScroll: true }); element?.scrollIntoView({ block: 'center' }); } }, [target?.alertOccurrence, target?.alertVersion, currentTarget?.identity.occurrence, currentTarget?.identity.version]);
  function mark(item: typeof items[number]) {
    const ok = saveAlertReview({ ...item.identity, state: 'reviewed', title: item.alert.title, date: item.alert.date, category: 'compliance' }, owner);
    setStatus(ok ? copy.stored : copy.failed); setRevision(value => value + 1);
  }
  function groundAction(action: () => boolean) { setStatus(action() ? copy.stored : copy.failed); setRevision(value => value + 1); }
  function renderItem(item: typeof items[number]) { const { alert, identity } = item; const disposition = history.find(row => row.occurrence === identity.occurrence && row.version === identity.version); const reviewed = disposition?.state === 'reviewed'; const ignored = isGroundAlertIgnored(identity); const selected = currentTarget?.identity.occurrence === identity.occurrence;
      return <article className="cc-alert-card" key={identity.occurrence + identity.version} tabIndex={-1} ref={selected ? targetRef : undefined} data-alert-occurrence={identity.occurrence} data-ground-ignored={ignored || undefined} data-alert-version={identity.version} data-alert-selected={selected}>
        <header><h2>{originalLanguage ? alert.title : copy.analysis}</h2><span>{ignored ? copy.ignoredGround : disposition?.state === 'dismissed' ? copy.dismissed : reviewed ? copy.reviewed : copy.review}</span></header>
        <AlertDateSummary alert={alert}/>
        <p>{originalLanguage ? alert.description : copy.reviewHint}</p>
        <details open={selected || undefined}><summary>{copy.details}</summary>{!originalLanguage && <div lang="pt-BR"><strong>{copy.original}: {alert.title}</strong><p>{alert.description}</p></div>}{alert.details && <p lang={originalLanguage ? undefined : 'pt-BR'}>{alert.details}</p>}{alert.evidence && <p lang={originalLanguage ? undefined : 'pt-BR'}>{alert.evidence}</p>}{alert.legalReference && <p lang={originalLanguage ? undefined : 'pt-BR'}>{alert.legalReference}</p>}<AlertDateEvidence alert={alert} roster={roster}/></details>
        <div className="cc-alert-actions">{isGroundLimitAlert(alert) && !ignored && <button type="button" onClick={() => groundAction(() => ignoreGroundAlert(alert, roster, owner))}>{copy.ignoreGround}</button>}{!ignored && <button type="button" disabled={reviewed || !owner} onClick={() => mark(item)}>{reviewed ? copy.reviewed : copy.mark}</button>}<button type="button" onClick={() => { clearPendingNavigationContext(); window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'regulation' })); }}>{copy.reference}</button></div>
      </article>;
  }
  return <section className="cc-alert-center" data-review-revision={revision}>
    <div className="cz-panel-head"><h1>{copy.alerts}</h1><p>{copy.saved}</p></div>
    {targetValid && target?.alertOccurrence && !currentTarget && <p role="status">{copy.missing}</p>}
    {!roster.days?.length && <article className="cc-alert-card"><h2>{copy.noRoster}</h2><div className="cc-alert-actions"><button type="button" onClick={onImport}>{copy.import}</button><button type="button" onClick={onChoose}>{copy.choose}</button></div></article>}
    {roster.days?.length > 0 && !ready && <p role="status">{copy.pending}</p>}
    {ready && pendingAnalysis.length > 0 && <section role="status"><p>{copy.pending}</p>{pendingItems.map(({ alert: pending, identity }) => <details key={identity.occurrence + identity.version} tabIndex={-1} ref={isTarget({ alert: pending, identity }) ? pendingTargetRef : undefined} open={isTarget({ alert: pending, identity }) || undefined} data-alert-selected={isTarget({ alert: pending, identity })}><summary>{originalLanguage ? pending.title || copy.details : copy.details}</summary><AlertDateSummary alert={pending}/><p lang="pt-BR">{pending.description}</p>{pending.details && <p lang="pt-BR">{pending.details}</p>}{pending.evidence && <p lang="pt-BR">{pending.evidence}</p>}<AlertDateEvidence alert={pending} roster={roster}/></details>)}</section>}
    {roster.days?.length > 0 && ready && !items.length && !pendingAnalysis.length && <p>{copy.noAlerts}</p>}
    {legacyPending.length > 0 && <article className="cc-alert-card" role="status"><p>{copy.legacyGroundNotice}</p><div className="cc-alert-actions"><button type="button" onClick={() => groundAction(() => applyLegacyGroundAlerts(alerts, roster, owner))}>{copy.applyLegacyGround}</button></div></article>}
    {items.filter(item => !isGroundAlertIgnored(item.identity)).map(renderItem)}
    {ignoredItems.length > 0 && <section className="cc-alert-card cc-ground-ignored"><details open={ignoredItems.some(item => item === currentTarget) || undefined}><summary>{copy.ignoredGround} ({ignoredItems.length})</summary>{ignoredItems.map(renderItem)}</details><div className="cc-alert-actions"><button type="button" onClick={() => groundAction(() => restoreGroundAlerts(roster, owner))}>{copy.restoreGround}</button></div></section>}
    {status && <p role="status">{status}</p>}
    {history.length > 0 && <details className="cc-alert-history"><summary>{copy.history} ({history.length})</summary>{history.slice().reverse().map(row => <article key={row.occurrence + row.version}><strong>{row.title}</strong><p>{historyDay(row.date)}{row.date ? ' · ' : ''}{row.state === 'dismissed' ? copy.dismissed : copy.reviewed}</p><time dateTime={row.at}>{alertHistoryDate(row.at)}</time></article>)}</details>}
  </section>;
}
