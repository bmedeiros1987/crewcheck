import { startupOwner, startupKey } from '@/lib/rosterStartup';
import { useEffect, useRef, useState } from 'react';
import type { CrewRoster } from '@/lib/pdfParser';
import { financialRateOwner, financialRateSession } from '@/lib/financialStatementLearning';
import { isCurrentPlannedRoster, loadOwnedPlannedRoster } from '@/lib/plannedRosterStore';
import { resolveActFinancialRules } from '@/lib/financialRules';
import { FREE_DAY_ACT_SOURCE, FREE_DAY_ACT_URL, freeDayAlertText, freeDayVersion, reviewFreeDayPostponements } from '@/lib/freeDayPostponement';
import { publishFreeDayAlert, readFreeDayAlertHistory, type FreeDayAlertRecord } from '@/lib/freeDayAlertDelivery';
import { clearCrewCheckPulse, crewCheckNotificationPermission, publishCrewCheckNotice } from './pulse/pulseRuntime';
import './free-day-alerts.css';

export function FreeDayPostponementAlerts({ roster, source, view, onOpen }: { roster: CrewRoster; source: string; view: string; onOpen(): void }) {
  const ownsPulse = useRef(false);
  const [revision, setRevision] = useState(0);
  const [records, setRecords] = useState<{ session: string | null; items: FreeDayAlertRecord[] }>({ session: null, items: [] });
  const session = financialRateSession(), owner = financialRateOwner();
  const planned = loadOwnedPlannedRoster();
  let boundCurrent = false;
  try { const choice = JSON.parse(localStorage.getItem(startupKey()) || 'null');
    boundCurrent = Boolean(sessionStorage.getItem('crewcheck_admin_audit_mode') !== '1' && owner && startupOwner() === owner.toLowerCase() && choice?.owner === startupOwner()
      && choice?.cacheSchema === 'p0-operational-date-anchor-v2' && choice.roster?.days?.length
      && freeDayVersion(choice.roster) === freeDayVersion(roster));
  } catch { /* Never assign an owner to an unbound current bundle. */ }
  const act = resolveActFinancialRules(roster);
  const review = reviewFreeDayPostponements(planned && isCurrentPlannedRoster(planned) ? planned : null, roster, source,
    boundCurrent ? owner || '' : '', act.profileLabel.startsWith('Comissário'));
  const visibleRecords = records.session === session ? records.items : [];
  useEffect(() => {
    let alive = true;
    const reset = () => { if (ownsPulse.current) { clearCrewCheckPulse(); ownsPulse.current = false; } setRecords({ session: null, items: [] }); setRevision(value => value + 1); };
    const update = (event: Event) => { if (event instanceof StorageEvent && (!event.key || ['crewcheck_auth_token', 'crewcheck_auth_user'].includes(event.key))) reset(); else setRevision(value => value + 1); };
    for (const name of ['crewcheck:auth-changed', 'crewcheck:auth-expired']) window.addEventListener(name, reset);
    for (const name of ['storage', 'crewcheck:planned-roster-updated']) window.addEventListener(name, update);
    const process = async () => {
      if (!boundCurrent || !session || session !== financialRateSession()) return;
      for (const alert of review.alerts) {
        if (!alive || session !== financialRateSession()) return;
        const enabled = localStorage.getItem('crewcheck_device_notifications') === '1' && crewCheckNotificationPermission() === 'granted';
        const record = await publishFreeDayAlert(alert, session, message => {
          if (!alive || session !== financialRateSession()) return { pulse: false, notification: false };
          ownsPulse.current = true;
          return publishCrewCheckNotice(message);
        }, enabled);
        if (!alive || session !== financialRateSession()) { if (ownsPulse.current) { clearCrewCheckPulse(); ownsPulse.current = false; } return; }
        if (!record) continue;
      }
      if (alive && session === financialRateSession()) setRecords({ session, items: readFreeDayAlertHistory() });
    };
    void process();
    return () => { alive = false; if (session !== financialRateSession() && ownsPulse.current) { clearCrewCheckPulse(); ownsPulse.current = false; } for (const name of ['crewcheck:auth-changed', 'crewcheck:auth-expired']) window.removeEventListener(name, reset);
      for (const name of ['storage', 'crewcheck:planned-roster-updated']) window.removeEventListener(name, update); };
  }, [session, roster, source, revision, boundCurrent]);

  if (!session || !roster.days?.length) return null;
  if (view === 'cockpit') return review.alerts.length ? <button type="button" className="cc-free-day-summary" onClick={onOpen}>
    <strong>{review.alerts.length} início de folga postergado</strong><span>Revisar horários e condições do ACT</span></button> : null;
  if (view !== 'alerts' && view !== 'compare') return null;
  return <section className="cc-free-day-alerts" aria-label="Postergação de folga">
    <h2>Início de folga</h2>
    {!review.alerts.length && <p>{review.reason || (review.pending.length ? 'Há dados pendentes para verificar a postergação.' : 'Nenhuma postergação acima de 4h identificada nas versões disponíveis.')}</p>}
    {review.alerts.map(alert => { const record = visibleRecords.find(item => item.alert.id === alert.id); return <article key={alert.id} data-free-day-alert={alert.date}>
      <h3>Folga {alert.date.split('-').reverse().join('/')}</h3><p>{freeDayAlertText(alert)}</p>
      <dl><div><dt>Início anterior publicado</dt><dd>{alert.oldClock} · UTC{alert.oldOffset >= 0 ? '+' : ''}{alert.oldOffset / 60}</dd></div>
        <div><dt>Novo início publicado</dt><dd>{alert.newClock} · UTC{alert.newOffset >= 0 ? '+' : ''}{alert.newOffset / 60}</dd></div></dl>
      <p>Uma avaliação por sequência de folgas, até {alert.sequenceEnd.split('-').reverse().join('/')}.</p>
      <p data-free-day-delivery>Notificação externa: {record?.external.state === 'accepted_unconfirmed' ? 'solicitada ao dispositivo · entrega não confirmada' : record?.external.state === 'failed' ? 'falha · entrega não comprovada' : 'indisponível · não enviada'}.</p>
      <details><summary>Fontes e condição da avaliação</summary><p>{alert.beforeSource} ({alert.beforeVersion}) → {alert.afterSource} ({alert.afterVersion}).</p><p>{alert.condition}</p><p>{record?.external.reason || 'Não há evidência de entrega externa.'}</p><a href={FREE_DAY_ACT_URL} target="_blank" rel="noreferrer">{FREE_DAY_ACT_SOURCE}</a></details>
    </article>; })}
    {review.pending.length > 0 && <details><summary>Verificações pendentes ({review.pending.length})</summary>{review.pending.map(item => <p key={item.date}>{item.date.split('-').reverse().join('/')}: {item.reason}</p>)}</details>}
    {visibleRecords.length > 0 && <details><summary>Histórico destas avaliações ({visibleRecords.length})</summary><p>Versões anteriores ficam preservadas para revisão. Alertas calculados não comprovam pagamento ou entrega.</p>{visibleRecords.map(item => <p key={item.alert.id}>{item.alert.date.split('-').reverse().join('/')} · {item.alert.oldClock} → {item.alert.newClock} · {item.alert.afterVersion} · {item.external.state === 'accepted_unconfirmed' ? 'solicitação externa sem confirmação de entrega' : 'sem entrega comprovada'}</p>)}</details>}
  </section>;
}
