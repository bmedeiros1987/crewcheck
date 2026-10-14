import { useEffect, useRef, useState } from 'react';
import { alertAccount, alertIsReviewed, complianceAlertIdentity, readAlertReviews, saveAlertReview } from '../../lib/alertReviewStore';
import { getSavedLanguage } from '../../lib/i18n';
import { alertText } from '../../lib/alertExperienceText';
import { consumePendingNavigationContext, clearPendingNavigationContext } from '../../lib/navigationContext';
import type { CrewRoster } from '../../lib/pdfParser';
import './alert-center.css';
import { alertRosterOwned } from '../../lib/alertRosterOwnership';

export function AlertCenter({ alerts, roster, onImport, onChoose }: { alerts: any[]; roster: CrewRoster; onImport(): void; onChoose(): void }) {
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState('');
  const [target, setTarget] = useState(() => consumePendingNavigationContext('alerts'));
  const targetRef = useRef<HTMLElement>(null);
  const copy = alertText(), owner = alertAccount(), originalLanguage = getSavedLanguage() === 'pt';
  const ready = alertRosterOwned(roster);
  const items = (ready ? alerts : []).map(alert => ({ alert, identity: complianceAlertIdentity(alert, roster) }));
  const history = readAlertReviews();
  const currentTarget = target?.alertOccurrence ? items.find(item => item.identity.occurrence === target.alertOccurrence && item.identity.version === target.alertVersion) : null;
  useEffect(() => {
    const focusTarget = () => { const next = consumePendingNavigationContext('alerts'); if (next) setTarget(next); };
    window.addEventListener('crewcheck:set-view', focusTarget);
    return () => window.removeEventListener('crewcheck:set-view', focusTarget);
  }, []);
  useEffect(() => { if (currentTarget) { targetRef.current?.focus({ preventScroll: true }); targetRef.current?.scrollIntoView({ block: 'center' }); } }, [target?.alertOccurrence, target?.alertVersion, currentTarget?.identity.occurrence, currentTarget?.identity.version]);
  function mark(item: typeof items[number]) {
    const ok = saveAlertReview({ ...item.identity, state: 'reviewed', title: item.alert.title, date: item.alert.date, category: 'compliance' }, owner);
    setStatus(ok ? copy.stored : copy.failed); setRevision(value => value + 1);
  }
  return <section className="cc-alert-center" data-review-revision={revision}>
    <div className="cz-panel-head"><h1>{copy.alerts}</h1><p>{copy.saved}</p></div>
    {target?.alertOccurrence && !currentTarget && <p role="status">{copy.missing}</p>}
    {!roster.days?.length && <article className="cc-alert-card"><h2>{copy.noRoster}</h2><div className="cc-alert-actions"><button type="button" onClick={onImport}>{copy.import}</button><button type="button" onClick={onChoose}>{copy.choose}</button></div></article>}
    {roster.days?.length > 0 && !ready && <p role="status">{copy.pending}</p>}
    {roster.days?.length > 0 && ready && !items.length && <p>{copy.noAlerts}</p>}
    {items.map(item => { const { alert, identity } = item; const disposition = history.find(row => row.occurrence === identity.occurrence && row.version === identity.version); const reviewed = disposition?.state === 'reviewed'; const selected = currentTarget?.identity.occurrence === identity.occurrence;
      return <article className="cc-alert-card" key={identity.occurrence + identity.version} tabIndex={-1} ref={selected ? targetRef : undefined} data-alert-occurrence={identity.occurrence} data-alert-version={identity.version} data-alert-selected={selected}>
        <header><h2>{originalLanguage ? alert.title : copy.analysis}</h2><span>{disposition?.state === 'dismissed' ? copy.dismissed : reviewed ? copy.reviewed : copy.review}</span></header>
        {alert.date && <p><time>{alert.date}</time></p>}
        <p>{originalLanguage ? alert.description : copy.reviewHint}</p>
        <details open={selected || undefined}><summary>{copy.details}</summary>{!originalLanguage && <div lang="pt-BR"><strong>{copy.original}: {alert.title}</strong><p>{alert.description}</p></div>}{alert.details && <p>{alert.details}</p>}{alert.evidence && <p>{alert.evidence}</p>}{alert.legalReference && <p>{alert.legalReference}</p>}</details>
        <div className="cc-alert-actions"><button type="button" disabled={reviewed || !owner} onClick={() => mark(item)}>{reviewed ? copy.reviewed : copy.mark}</button><button type="button" onClick={() => { clearPendingNavigationContext(); window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'regulation' })); }}>{copy.reference}</button></div>
      </article>;
    })}
    {status && <p role="status">{status}</p>}
    {history.length > 0 && <details className="cc-alert-history"><summary>{copy.history} ({history.length})</summary>{history.slice().reverse().map(row => <article key={row.occurrence + row.version}><strong>{row.title}</strong><p>{row.date || ''} · {row.state === 'dismissed' ? copy.dismissed : copy.reviewed}</p><time dateTime={row.at}>{new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(row.at))}</time></article>)}</details>}
  </section>;
}
