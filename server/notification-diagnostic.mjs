import { requireExistingIdentity, sendJson, parseJsonColumn } from './v139/common.mjs';
import { bidsAlertStateKey, CURRENT_BIDS_ALERT_CAMPAIGN } from './v139/bidsAlertPreferences.mjs';

// Observer only: no schema initialization, queue mutation, provider or secret access.
export async function handleNotificationDiagnostic(req, res, {
  identify = requireExistingIdentity, reply = sendJson,
  schedulerHealthState = () => 'unavailable',
  gateEnabled = () => process.env.WEB_PUSH_ENABLED === 'true',
} = {}) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { reply(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED' }); return; }
  const context = await identify(req, res);
  if (!context) return;
  const ownerId = String(context.payload?.sub || '');
  if (!ownerId || context.payload?.iss !== 'crewcheck' || context.payload?.aud !== 'crewcheck-web' || context.payload?.mustChangePassword || !Number.isFinite(Number(context.payload?.exp)) || Number(context.payload.exp) <= Date.now() / 1000 || context.profile?.public_id !== ownerId) { reply(res, 401, { ok: false, code: 'ACCOUNT_CHANGED' }); return; }
  const { db, email } = context;
  const observe = async (sql, params, project) => {
    try { const [rows] = await db.query(sql, params); return project(rows); }
    catch { return { status: 'unavailable' }; }
  };
  const preferences = await observe('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? LIMIT 1', [bidsAlertStateKey(email, ownerId)], rows => {
    if (!rows.length) return { status: 'absent' };
    const state = parseJsonColumn(rows[0].payload, null);
    if (state?.ownerId !== ownerId || state?.email !== email || !Number.isSafeInteger(state.revision) || state.revision < 0) return { status: 'unavailable' };
    return { status: 'saved', revision: state.revision, enabled: state.preferences?.enabled === true, createsSchedule: false };
  });
  const alarms = await observe(`SELECT j.status,COUNT(*) AS total,
    SUM(j.status='pending' AND j.scheduled_at < DATE_SUB(NOW(3), INTERVAL 120 SECOND)) AS overdue
    FROM crewcheck_notification_jobs j JOIN crewcheck_platform_profiles p ON p.email=j.email
    WHERE j.email=? AND BINARY p.public_id=BINARY ? AND j.created_at>=p.created_at GROUP BY j.status`, [email, ownerId], rows => {
    const counts = Object.fromEntries(['pending','processing','dispatching','sent','failed','expired','uncertain','cancelled'].map(key => [key, 0]));
    let overdue = 0;
    for (const row of rows) { if (Object.hasOwn(counts, row.status)) counts[row.status] = Number(row.total) || 0; overdue += Number(row.overdue) || 0; }
    return { status: rows.length ? 'recorded' : 'absent', counts, pendingPastDispatchWindow: overdue, received: null,
      sentMeaning: 'provider_accepted_unconfirmed', scope: 'alarm_jobs_only' };
  });
  const scheduler = await observe(`SELECT last_started_at,last_finished_at,last_status,
    ROUND(UNIX_TIMESTAMP(last_started_at)*1000) AS started_epoch,
    ROUND(UNIX_TIMESTAMP(last_finished_at)*1000) AS finished_epoch
    FROM crewcheck_scheduler_heartbeat WHERE scheduler_key='notifications' LIMIT 1`, [], rows => ({
      status: rows.length ? schedulerHealthState(rows[0]) : 'absent', scope: 'global_scheduler', provesOwnerDelivery: false,
    }));
  // Account recreation during the reads must not expose the former owner's records.
  const owners = await observe('SELECT public_id FROM crewcheck_platform_profiles WHERE email=? AND BINARY public_id=BINARY ? LIMIT 1', [email, ownerId], rows => ({ status: rows.length ? 'current' : 'changed' }));
  if (owners.status !== 'current') { reply(res, owners.status === 'changed' ? 401 : 503, { ok: false, code: owners.status === 'changed' ? 'ACCOUNT_CHANGED' : 'IDENTITY_UNAVAILABLE' }); return; }
  reply(res, 200, { ok: true, observational: true, preferences, alarms, scheduler,
    bids: { campaign: CURRENT_BIDS_ALERT_CAMPAIGN === null ? 'absent' : 'configured', savingPreferencesSchedules: false },
    webPush: { gate: gateEnabled() ? 'enabled' : 'disabled', configuration: 'not_observed', installation: 'not_observed', delivery: 'not_observed' },
    localNative: { status: 'not_observed' }, watch: { status: 'not_observed' }, crewCierge: { status: 'not_observed' },
    deliveryConfirmed: false,
  });
}
