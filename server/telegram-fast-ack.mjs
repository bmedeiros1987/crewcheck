import http from 'node:http';
import crypto from 'node:crypto';
import { URL } from 'node:url';
import { dbPool, requestToken, safeEmail, verifyJwt } from './v139/common.mjs';
import { sendTelegram, callTelegram } from './v139/delivery.mjs';
import { handleFreeDayHeld } from './free-day-held.mjs';
import { handleVoluntarySources } from './free-day-sources.mjs';
import { handleSourceQueue } from './free-day-source-queue.mjs';
import { safeScheduleJob, safeCancelJob, dispatchClaimedJob } from './notification-job-safety.mjs';
import { buildInfobipTtsRequest, infobipPublicStatus } from './v1396/infobip.mjs';

const originalCreateServer = http.createServer.bind(http);
const RUNTIME_VERSION = '14.1.7-operational-intelligence';
const INTERVAL_MS = Math.max(15_000, Number(process.env.CREWCHECK_NOTIFICATION_INTERVAL_MS || 30_000));
let schedulerRunning = false;
let lastCycle = null;
let lastHeartbeatWrite = null;
let lastWebhookCheck = null;
let lastCommuteCycle = null;

function sendJson(res, status, payload) {
  if (res.headersSent || res.writableEnded) return;
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload));
}

function pathname(req) {
  try { return new URL(req.url || '/', 'http://127.0.0.1').pathname; }
  catch { return ''; }
}

function readJson(req, limit = 200_000) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > limit) reject(new Error('Corpo da requisição acima do limite.'));
    });
    req.on('end', () => {
      if (!raw.trim()) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Error('JSON inválido.')); }
    });
    req.on('error', reject);
  });
}

function identity(req) {
  try {
    const payload = verifyJwt(requestToken(req));
    const email = safeEmail(payload?.email);
    return payload && email && payload.iss === 'crewcheck' && payload.aud === 'crewcheck-web' && payload.sub && Number.isFinite(Number(payload.exp)) && Number(payload.exp) > Date.now() / 1000 && !payload.mustChangePassword ? { email, id: payload.sub, admin: Boolean(payload.admin) } : null;
  } catch { return null; }
}

async function ensureNotificationTable(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS crewcheck_notification_jobs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(190) NOT NULL,
    job_key VARCHAR(220) NOT NULL,
    scheduled_at DATETIME(3) NOT NULL,
    channel VARCHAR(40) NOT NULL DEFAULT 'telegram',
    chat_id VARCHAR(80) NULL,
    telegram_username VARCHAR(120) NULL,
    phone VARCHAR(40) NULL,
    message VARCHAR(1000) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'pending',
    attempts INT NOT NULL DEFAULT 0,
    locked_at DATETIME(3) NULL,
    sent_at DATETIME(3) NULL,
    last_error VARCHAR(500) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_notification_job (email, job_key),
    KEY idx_notification_due (status, scheduled_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

async function ensureCommuteTables(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS crewcheck_commute_monitors (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(190) NOT NULL,
    route_key VARCHAR(80) NOT NULL,
    origin VARCHAR(300) NOT NULL,
    destination VARCHAR(300) NOT NULL,
    travel_mode VARCHAR(32) NOT NULL DEFAULT 'driving',
    presentation_at DATETIME(3) NOT NULL,
    margin_minutes INT NOT NULL DEFAULT 25,
    active TINYINT(1) NOT NULL DEFAULT 1,
    next_check_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    last_duration_seconds INT NULL,
    last_delay_seconds INT NULL,
    last_incident_hash VARCHAR(80) NULL,
    last_alert_at DATETIME(3) NULL,
    last_error VARCHAR(500) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_commute_monitor (email, route_key),
    KEY idx_commute_due (active, next_check_at),
    KEY idx_commute_presentation (presentation_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await db.query(`CREATE TABLE IF NOT EXISTS crewcheck_commute_samples (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(190) NOT NULL,
    route_key VARCHAR(80) NOT NULL,
    sampled_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    weekday TINYINT UNSIGNED NOT NULL,
    hour_bucket TINYINT UNSIGNED NOT NULL,
    duration_seconds INT NOT NULL,
    delay_seconds INT NOT NULL DEFAULT 0,
    incident_count INT NOT NULL DEFAULT 0,
    provider VARCHAR(40) NULL,
    KEY idx_commute_learning (email, route_key, weekday, hour_bucket, sampled_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

async function ensureSchedulerHeartbeatTable(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS crewcheck_scheduler_heartbeat (
    scheduler_key VARCHAR(64) NOT NULL PRIMARY KEY,
    last_started_at DATETIME(3) NULL,
    last_finished_at DATETIME(3) NULL,
    last_status VARCHAR(24) NULL,
    last_summary_json TEXT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

// lastCycle/schedulerRunning above are in-memory only, so a restart/redeploy always
// resets them to null/false - the same gap the weather monitor had before it gained a
// persisted heartbeat (see recordWeatherMonitorHeartbeat/weatherMonitorHealthState in
// server.mjs). Without persistence, "never ran a cycle since this deploy" and "ran
// fine for days before this restart" are indistinguishable from the outside, and a
// scheduler that's silently broken looks identical to one that just started.
const SCHEDULER_STALE_MS = Math.max(5 * 60_000, INTERVAL_MS * 6);
function schedulerHealthState(heartbeat, now = Date.now()) {
  if (!heartbeat?.last_started_at) return 'never_run';
  const startedAt = heartbeat.started_epoch != null ? Number(heartbeat.started_epoch) : new Date(heartbeat.last_started_at).getTime();
  const finishedAt = heartbeat.finished_epoch != null ? Number(heartbeat.finished_epoch) : heartbeat.last_finished_at ? new Date(heartbeat.last_finished_at).getTime() : NaN;
  const inProgress = !Number.isFinite(finishedAt) || finishedAt < startedAt;
  if (!Number.isFinite(startedAt)) return 'unknown';
  if (!inProgress && now - finishedAt > SCHEDULER_STALE_MS) return 'stale';
  if (inProgress) return Number.isFinite(startedAt) && now - startedAt > SCHEDULER_STALE_MS ? 'stuck' : 'running';
  return heartbeat.last_status === 'error' ? 'last_failure' : 'completed';
}
async function recordSchedulerHeartbeat(db, patch) {
  try {
    await ensureSchedulerHeartbeatTable(db);
    // ISO strings with a Z suffix are not valid strict MySQL DATETIME parameters.
    // Convert zoned instants in SQL, using the session's timezone on both reads/writes.
    const instant = value => value == null ? null : new Date(value).getTime();
    const started = instant(patch.lastStartedAt), finished = instant(patch.lastFinishedAt);
    if ((started != null && !Number.isFinite(started)) || (finished != null && !Number.isFinite(finished))) throw Object.assign(new Error('Invalid heartbeat instant'), { code: 'INVALID_INSTANT' });
    await db.query(`INSERT INTO crewcheck_scheduler_heartbeat (scheduler_key,last_started_at,last_finished_at,last_status,last_summary_json)
      VALUES ('notifications',FROM_UNIXTIME(?/1000),FROM_UNIXTIME(?/1000),?,?)
      ON DUPLICATE KEY UPDATE
        last_started_at=IF(?,VALUES(last_started_at),last_started_at),
        last_finished_at=IF(?,VALUES(last_finished_at),last_finished_at),
        last_status=IF(?,VALUES(last_status),last_status),
        last_summary_json=IF(?,VALUES(last_summary_json),last_summary_json)`,
      [started, finished, patch.lastStatus ?? null, patch.lastSummary === undefined ? null : JSON.stringify(patch.lastSummary),
        patch.lastStartedAt !== undefined, patch.lastFinishedAt !== undefined, patch.lastStatus !== undefined, patch.lastSummary !== undefined]);
    lastHeartbeatWrite = { ok: true, checkedAt: new Date().toISOString() };
  } catch (error) {
    // Report only the error code, never SQL, parameters, recipient or credentials.
    lastHeartbeatWrite = { ok: false, code: /^[A-Z0-9_]+$/.test(String(error?.code || '')) ? error.code : 'WRITE_FAILED', checkedAt: new Date().toISOString() };
  }
}

async function sendInfobipPhone(phone, message) {
  const request = buildInfobipTtsRequest({ phone, text: message });
  if (!request.ok) return request;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(request.url, {
      method: 'POST', headers: request.headers, body: JSON.stringify(request.body), signal: controller.signal,
    });
    const raw = await response.text().catch(() => '');
    return { ok: response.ok, configured: true, provider: 'infobip', status: response.status, raw: raw.slice(0, 500) };
  } catch (error) {
    return { ok: false, configured: true, provider: 'infobip', raw: error?.name === 'AbortError' ? 'Tempo limite na ligação.' : String(error?.message || 'Falha Infobip.') };
  } finally { clearTimeout(timer); }
}

async function deliverJob(job) {
  const channel = String(job.channel || 'telegram').toLowerCase();
  if (channel === 'telegram') return sendTelegram(job.chat_id, job.message);
  if (channel === 'telegram-call') return callTelegram(job.telegram_username, job.message);
  if (channel === 'phone' || channel === 'phone-call' || channel === 'infobip') return sendInfobipPhone(job.phone, job.message);
  if (channel === 'both') {
    const telegram = await sendTelegram(job.chat_id, job.message);
    const phone = await sendInfobipPhone(job.phone, job.message);
    return { ok: Boolean(telegram.ok || phone.ok), configured: Boolean(telegram.configured || phone.configured), provider: 'both', results: [telegram, phone] };
  }
  return { ok: false, configured: false, provider: channel, raw: 'Canal de notificação inválido.' };
}

function commuteRouteKey(origin, destination, mode) {
  return crypto.createHash('sha256').update(`${String(origin).trim().toLowerCase()}|${String(destination).trim().toLowerCase()}|${String(mode).trim().toLowerCase()}`).digest('hex').slice(0, 64);
}

function parsedJson(value) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(String(value || '{}')); } catch { return {}; }
}

async function linkedTelegramRecord(db, email) {
  try {
    const [rows] = await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? LIMIT 1', [`link-email:${safeEmail(email)}`]);
    return parsedJson(rows?.[0]?.payload);
  } catch {
    return {};
  }
}

async function linkedTelegramChatId(db, email) {
  return String((await linkedTelegramRecord(db, email))?.chatId || '');
}

function commuteTimeBucket(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const weekdayLabel = parts.find((part) => part.type === 'weekday')?.value || 'Sun';
  const weekday = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(weekdayLabel);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0);
  return { weekday: Math.max(0, weekday), hour: Math.min(23, Math.max(0, hour)) };
}

async function learnedCommuteBaseline(db, monitor, at = new Date()) {
  const bucket = commuteTimeBucket(at);
  const [rows] = await db.query(`SELECT COUNT(*) AS samples, AVG(duration_seconds) AS average_seconds
    FROM crewcheck_commute_samples
    WHERE email=? AND route_key=? AND weekday=? AND ABS(hour_bucket - ?) <= 1
      AND incident_count=0 AND sampled_at >= DATE_SUB(NOW(3), INTERVAL 90 DAY)`,
    [monitor.email, monitor.route_key, bucket.weekday, bucket.hour]);
  return { samples: Number(rows?.[0]?.samples || 0), averageSeconds: Math.round(Number(rows?.[0]?.average_seconds || 0)) };
}

async function fetchLiveCommuteRoute(monitor) {
  const localBase = `http://127.0.0.1:${Number(process.env.PORT || 4173)}`;
  const endpoint = new URL('/api/maps/route-preview', localBase);
  endpoint.searchParams.set('origin', monitor.origin);
  endpoint.searchParams.set('destination', monitor.destination);
  endpoint.searchParams.set('mode', monitor.travel_mode || 'driving');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(endpoint, { headers: { accept: 'application/json', 'x-crewcheck-runtime': RUNTIME_VERSION }, signal: controller.signal });
    const payload = await response.json().catch(() => null);
    return response.ok && payload?.ok ? payload : null;
  } finally {
    clearTimeout(timer);
  }
}

function incidentFingerprint(route = {}) {
  const incidents = Array.isArray(route.incidents) ? route.incidents : [];
  if (!incidents.length) return '';
  return crypto.createHash('sha256').update(JSON.stringify(incidents.map((item) => [item.id, item.category, item.severity, item.delaySeconds]))).digest('hex').slice(0, 64);
}

function nextCommuteCheckMinutes(presentationAt) {
  const remaining = new Date(presentationAt).getTime() - Date.now();
  if (remaining <= 2 * 60 * 60_000) return 1;
  if (remaining <= 6 * 60 * 60_000) return 2;
  if (remaining <= 24 * 60 * 60_000) return 5;
  return 20;
}

function clockLabel(date) {
  try { return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(date); }
  catch { return ''; }
}

function commuteAlertMessage(monitor, route, learning, reason) {
  const durationSeconds = Number(route.durationSeconds || 0);
  const delaySeconds = Number(route.trafficDelaySeconds || 0);
  const leaveAt = new Date(new Date(monitor.presentation_at).getTime() - durationSeconds * 1000 - Number(monitor.margin_minutes || 25) * 60_000);
  const incidents = (Array.isArray(route.incidents) ? route.incidents : []).slice(0, 3);
  const incidentLines = incidents.map((item) => `• ${item.title || 'Ocorrência na rota'}${item.delayText ? ` · ${item.delayText}` : ''}`);
  const trend = learning.samples >= 3 && learning.averageSeconds
    ? `Tendência aprendida (${learning.samples} amostras): ${Math.round(learning.averageSeconds / 60)} min neste dia/horário.`
    : 'O histórico desta rota ainda está sendo aprendido.';
  return [
    reason === 'closure' ? '🚧 ALERTA DE BLOQUEIO NA ROTA' : reason === 'incident' ? '⚠️ NOVA OCORRÊNCIA NA ROTA' : '🚗 TRÂNSITO MUDOU',
    '',
    `${monitor.origin} → ${monitor.destination}`,
    `Tempo atual: ${Math.max(1, Math.round(durationSeconds / 60))} min${delaySeconds ? ` · atraso ${Math.round(delaySeconds / 60)} min` : ''}`,
    `Saída recomendada: ${clockLabel(leaveAt)} · margem ${monitor.margin_minutes || 25} min`,
    ...incidentLines,
    '',
    trend,
    'Abra o Planejador de Saída no CrewCheck antes de iniciar o deslocamento.',
  ].filter(Boolean).join('\n');
}

async function runCommuteMonitorCycle(db) {
  const summary = { startedAt: new Date().toISOString(), selected: 0, sampled: 0, alerted: 0, failed: 0 };
  try {
    await ensureCommuteTables(db);
    await db.query("UPDATE crewcheck_commute_monitors SET active=0 WHERE active=1 AND presentation_at < DATE_SUB(NOW(3), INTERVAL 30 MINUTE)");
    const [rows] = await db.query("SELECT * FROM crewcheck_commute_monitors WHERE active=1 AND next_check_at <= NOW(3) AND presentation_at >= NOW(3) AND presentation_at <= DATE_ADD(NOW(3), INTERVAL 7 DAY) ORDER BY next_check_at ASC LIMIT 30");
    summary.selected = rows.length;
    for (const monitor of rows) {
      try {
        const route = await fetchLiveCommuteRoute(monitor);
        if (!route) throw new Error('Rota ao vivo indisponível.');
        const durationSeconds = Math.max(1, Number(route.durationSeconds || 0));
        const delaySeconds = Math.max(0, Number(route.trafficDelaySeconds || 0));
        const incidents = Array.isArray(route.incidents) ? route.incidents : [];
        const bucket = commuteTimeBucket();
        await db.query(`INSERT INTO crewcheck_commute_samples (email,route_key,weekday,hour_bucket,duration_seconds,delay_seconds,incident_count,provider)
          VALUES(?,?,?,?,?,?,?,?)`, [monitor.email, monitor.route_key, bucket.weekday, bucket.hour, durationSeconds, delaySeconds, incidents.length, String(route.provider || '').slice(0, 40)]);
        summary.sampled += 1;
        const learning = await learnedCommuteBaseline(db, monitor);
        const fingerprint = incidentFingerprint(route);
        const newIncident = Boolean(fingerprint && fingerprint !== String(monitor.last_incident_hash || ''));
        const closure = Boolean(route.hasRoadClosure || incidents.some((item) => item.roadClosure));
        const previousDelay = Number(monitor.last_delay_seconds || 0);
        const learnedDelta = learning.samples >= 3 ? durationSeconds - learning.averageSeconds : 0;
        const materialDelay = delaySeconds >= 10 * 60 && delaySeconds >= previousDelay + 5 * 60;
        const learnedSurprise = learning.samples >= 3 && learnedDelta >= 12 * 60;
        const cooldownPassed = !monitor.last_alert_at || Date.now() - new Date(monitor.last_alert_at).getTime() >= 20 * 60_000;
        const reason = closure ? 'closure' : newIncident ? 'incident' : materialDelay || learnedSurprise ? 'delay' : '';
        let alertDelivered = false;
        if (reason && (newIncident || cooldownPassed)) {
          const chatId = await linkedTelegramChatId(db, monitor.email);
          if (chatId) {
            const delivered = await sendTelegram(chatId, commuteAlertMessage(monitor, route, learning, reason));
            if (delivered?.ok) { summary.alerted += 1; alertDelivered = true; }
          }
        }
        const nextMinutes = nextCommuteCheckMinutes(monitor.presentation_at);
        await db.query(`UPDATE crewcheck_commute_monitors SET
          next_check_at=DATE_ADD(NOW(3), INTERVAL ? MINUTE),last_duration_seconds=?,last_delay_seconds=?,last_incident_hash=?,
          last_alert_at=IF(?,NOW(3),last_alert_at),last_error=NULL WHERE id=?`,
        [nextMinutes, durationSeconds, delaySeconds, fingerprint, alertDelivered, monitor.id]);
      } catch (error) {
        summary.failed += 1;
        await db.query("UPDATE crewcheck_commute_monitors SET next_check_at=DATE_ADD(NOW(3), INTERVAL 5 MINUTE),last_error=? WHERE id=?", [String(error?.message || error).slice(0, 500), monitor.id]);
      }
    }
    await db.query("DELETE FROM crewcheck_commute_samples WHERE sampled_at < DATE_SUB(NOW(3), INTERVAL 120 DAY)");
  } catch (error) {
    summary.error = String(error?.message || error).slice(0, 500);
  }
  summary.finishedAt = new Date().toISOString();
  lastCommuteCycle = summary;
  return summary;
}

async function runSchedulerCycle() {
  if (schedulerRunning) return;
  schedulerRunning = true;
  const summary = { startedAt: new Date().toISOString(), selected: 0, sent: 0, failed: 0 };
  // db is resolved INSIDE the try (not before it): dbPool() rejecting/throwing here
  // must still hit the finally below, or schedulerRunning would stay true forever and
  // block every future cycle until a restart.
  let db = null;
  try {
    db = await dbPool();
    if (!db) throw new Error('Banco indisponível para notificações.');
    await recordSchedulerHeartbeat(db, { lastStartedAt: summary.startedAt, lastFinishedAt: null });
    await ensureNotificationTable(db);
    await db.query("UPDATE crewcheck_notification_jobs SET status='uncertain',locked_at=NULL WHERE status IN ('processing','dispatching') AND locked_at < DATE_SUB(NOW(3), INTERVAL 5 MINUTE)");
    await db.query("UPDATE crewcheck_notification_jobs SET status='expired' WHERE status='pending' AND scheduled_at < DATE_SUB(NOW(3), INTERVAL 120 SECOND)");
    const [rows] = await db.query("SELECT * FROM crewcheck_notification_jobs WHERE status='pending' AND scheduled_at <= NOW(3) AND scheduled_at >= DATE_SUB(NOW(3), INTERVAL 120 SECOND) ORDER BY scheduled_at ASC LIMIT 50");
    summary.selected = rows.length;
    for (const job of rows) {
      const [claim] = await db.query("UPDATE crewcheck_notification_jobs SET status='processing',locked_at=NOW(3),attempts=attempts+1 WHERE id=? AND status='pending'", [job.id]);
      if (!claim.affectedRows) continue;
      const outcome = await dispatchClaimedJob(db, job, { deliver: deliverJob, findLink: linkedTelegramRecord });
      if (outcome.accepted) summary.sent += 1;
      else if (!['skipped', 'pending'].includes(outcome.status)) summary.failed += 1;
    }
    summary.commute = await runCommuteMonitorCycle(db);
  } catch (error) {
    summary.error = String(error?.message || error).slice(0, 500);
  } finally {
    summary.finishedAt = new Date().toISOString();
    lastCycle = summary;
    schedulerRunning = false;
    if (db) await recordSchedulerHeartbeat(db, { lastFinishedAt: summary.finishedAt, lastStatus: summary.error ? 'error' : 'ok', lastSummary: { selected: summary.selected, sent: summary.sent, failed: summary.failed } });
  }
}

async function repairTelegramWebhook() {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || process.env.CREWCHECK_TELEGRAM_BOT_TOKEN || '').trim();
  const secret = String(process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
  const base = String(process.env.TELEGRAM_PUBLIC_BASE_URL || process.env.CREWCHECK_PUBLIC_BASE_URL || 'https://crewcheck.online').replace(/\/$/, '');
  if (!token) { lastWebhookCheck = { ok: false, configured: false, checkedAt: new Date().toISOString() }; return; }
  const expectedUrl = `${base}/api/telegram/webhook`;
  try {
    const infoResponse = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    const infoPayload = await infoResponse.json().catch(() => ({}));
    const info = infoPayload?.result || {};
    const needsRepair = info.url !== expectedUrl || Boolean(info.last_error_message);
    if (needsRepair) {
      const body = new URLSearchParams({ url: expectedUrl, allowed_updates: JSON.stringify(['message','edited_message','callback_query']) });
      if (secret) body.set('secret_token', secret);
      const setResponse = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, { method: 'POST', body });
      const setPayload = await setResponse.json().catch(() => ({}));
      lastWebhookCheck = { ok: Boolean(setResponse.ok && setPayload.ok), repaired: true, pending: Number(info.pending_update_count || 0), previousError: info.last_error_message || '', checkedAt: new Date().toISOString() };
    } else {
      lastWebhookCheck = { ok: true, repaired: false, pending: Number(info.pending_update_count || 0), checkedAt: new Date().toISOString() };
    }
  } catch (error) {
    lastWebhookCheck = { ok: false, configured: true, error: String(error?.message || error).slice(0, 300), checkedAt: new Date().toISOString() };
  }
}

async function scheduleJob(req, res) {
  return safeScheduleJob({ req, res, identity, readJson, dbPool, ensureNotificationTable, linkedTelegramRecord, sendJson });
}

async function listJobs(req, res) {
  const user = identity(req);
  if (!user) return sendJson(res, 401, { ok: false, message: 'Sessão expirada.' });
  const db = await dbPool();
  if (!db) return sendJson(res, 503, { ok: false, message: 'Banco indisponível.' });
  const [owners] = await db.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=? LIMIT 1', [user.email]);
  if (String(owners[0]?.public_id || '') !== String(user.id)) return sendJson(res, 401, { ok: false, message: 'Sessão da conta não é mais válida.' });
  await ensureNotificationTable(db);
  const [rows] = await db.query('SELECT id,job_key AS jobKey,ROUND(UNIX_TIMESTAMP(scheduled_at)*1000) AS scheduledEpoch,channel,status,attempts,ROUND(UNIX_TIMESTAMP(sent_at)*1000) AS sentEpoch,last_error AS lastError FROM crewcheck_notification_jobs WHERE email=? ORDER BY scheduled_at DESC LIMIT 100', [user.email]);
  const linked = await linkedTelegramRecord(db, user.email);
  const telegramConfigured = Boolean(String(process.env.TELEGRAM_BOT_TOKEN || process.env.CREWCHECK_TELEGRAM_BOT_TOKEN || '').trim());
  const telegramLinked = Boolean(linked?.chatId && safeEmail(linked.email) === user.email);
  const jobs = rows.map(({ scheduledEpoch, sentEpoch, ...job }) => ({ ...job,
    scheduledAt: scheduledEpoch == null ? null : new Date(Number(scheduledEpoch)).toISOString(),
    sentAt: sentEpoch == null ? null : new Date(Number(sentEpoch)).toISOString(),
  }));
  return sendJson(res, 200, { ok: true, jobs, readiness: { telegramConfigured, telegramLinked, remoteAndroidPush: false, webPush: false } });
}

async function cancelJob(req, res) {
  return safeCancelJob({ req, res, identity, readJson, dbPool, sendJson });
}

async function registerCommuteMonitor(req, res) {
  const user = identity(req);
  if (!user) return sendJson(res, 401, { ok: false, message: 'Sessão expirada.' });
  const body = await readJson(req);
  const origin = String(body.origin || '').trim().slice(0, 300);
  const destination = String(body.destination || '').trim().slice(0, 300);
  const travelMode = String(body.mode || body.travelMode || 'driving').toLowerCase().slice(0, 32);
  const presentationAt = new Date(body.presentationAt || body.presentation_at || '');
  const marginMinutes = Math.min(120, Math.max(0, Number(body.marginMinutes || 25)));
  if (!origin || !destination) return sendJson(res, 400, { ok: false, message: 'Origem e destino são necessários.' });
  if (Number.isNaN(presentationAt.getTime()) || presentationAt.getTime() <= Date.now()) return sendJson(res, 400, { ok: false, message: 'A apresentação precisa estar no futuro.' });
  if (presentationAt.getTime() > Date.now() + 7 * 86_400_000) return sendJson(res, 400, { ok: false, message: 'O monitor é ativado até sete dias antes da apresentação.' });
  const routeKey = commuteRouteKey(origin, destination, travelMode);
  const db = await dbPool();
  if (!db) return sendJson(res, 503, { ok: false, message: 'Banco indisponível.' });
  await ensureCommuteTables(db);
  await db.query(`INSERT INTO crewcheck_commute_monitors
    (email,route_key,origin,destination,travel_mode,presentation_at,margin_minutes,active,next_check_at)
    VALUES(?,?,?,?,?,?,?,1,NOW(3))
    ON DUPLICATE KEY UPDATE origin=VALUES(origin),destination=VALUES(destination),travel_mode=VALUES(travel_mode),
      presentation_at=VALUES(presentation_at),margin_minutes=VALUES(margin_minutes),active=1,next_check_at=LEAST(next_check_at,NOW(3)),last_error=NULL`,
    [user.email, routeKey, origin, destination, travelMode, presentationAt, marginMinutes]);
  const monitor = { email: user.email, route_key: routeKey };
  const learning = await learnedCommuteBaseline(db, monitor, presentationAt);
  const chatId = await linkedTelegramChatId(db, user.email);
  return sendJson(res, 200, {
    ok: true,
    routeKey,
    presentationAt: presentationAt.toISOString(),
    telegramLinked: Boolean(chatId),
    learning: { samples: learning.samples, expectedMinutes: learning.averageSeconds ? Math.round(learning.averageSeconds / 60) : null },
    message: chatId ? 'Monitor de rota ativo no servidor e conectado ao Telegram.' : 'Monitor ativo; vincule o Telegram para receber alertas com o sistema fechado.',
  });
}

async function listCommuteMonitors(req, res) {
  const user = identity(req);
  if (!user) return sendJson(res, 401, { ok: false, message: 'Sessão expirada.' });
  const db = await dbPool();
  if (!db) return sendJson(res, 503, { ok: false, message: 'Banco indisponível.' });
  await ensureCommuteTables(db);
  const [rows] = await db.query(`SELECT route_key AS routeKey,origin,destination,travel_mode AS travelMode,presentation_at AS presentationAt,
    margin_minutes AS marginMinutes,active,next_check_at AS nextCheckAt,last_duration_seconds AS lastDurationSeconds,
    last_delay_seconds AS lastDelaySeconds,last_alert_at AS lastAlertAt,last_error AS lastError
    FROM crewcheck_commute_monitors WHERE email=? ORDER BY presentation_at DESC LIMIT 30`, [user.email]);
  return sendJson(res, 200, { ok: true, monitors: rows });
}

async function cancelCommuteMonitor(req, res) {
  const user = identity(req);
  if (!user) return sendJson(res, 401, { ok: false, message: 'Sessão expirada.' });
  const body = await readJson(req);
  const routeKey = String(body.routeKey || body.route_key || '').trim();
  const db = await dbPool();
  if (!db) return sendJson(res, 503, { ok: false, message: 'Banco indisponível.' });
  const [result] = await db.query('UPDATE crewcheck_commute_monitors SET active=0 WHERE email=? AND route_key=?', [user.email, routeKey]);
  return sendJson(res, 200, { ok: true, cancelled: result.affectedRows });
}

async function runtimeHealth(_req, res) {
  let database = false;
  let heartbeat = null;
  try {
    const db = await dbPool();
    if (db) {
      await ensureNotificationTable(db);
      await ensureCommuteTables(db);
      database = true;
      await ensureSchedulerHeartbeatTable(db);
      const [rows] = await db.query("SELECT *,ROUND(UNIX_TIMESTAMP(last_started_at)*1000) AS started_epoch,ROUND(UNIX_TIMESTAMP(last_finished_at)*1000) AS finished_epoch FROM crewcheck_scheduler_heartbeat WHERE scheduler_key='notifications' LIMIT 1");
      heartbeat = rows[0] || null;
    }
  } catch {}
  return sendJson(res, 200, {
    ok: database && Boolean(lastWebhookCheck?.ok), version: RUNTIME_VERSION, database,
    // persistedState/persistedLastStartedAt/persistedLastFinishedAt survive a restart;
    // running/lastCycle stay in-memory for immediate same-process visibility. Both are
    // exposed together on purpose: after a fresh deploy, in-memory alone would say
    // "never ran" even if the scheduler had been healthy for days beforehand.
    scheduler: {
      running: schedulerRunning, intervalMs: INTERVAL_MS, lastCycle,
      persistedState: schedulerHealthState(heartbeat),
      persistedLastStartedAt: heartbeat?.last_started_at || null,
      persistedLastFinishedAt: heartbeat?.last_finished_at || null,
      persistedLastStatus: heartbeat?.last_status || null,
      persistence: lastHeartbeatWrite,
    },
    commute: { enabled: true, lastCycle: lastCommuteCycle, learningWindowDays: 90 },
    telegram: lastWebhookCheck,
    infobip: infobipPublicStatus(),
    message: database ? 'Runtime de notificações ativo.' : 'Runtime ativo, mas o banco está indisponível.',
  });
}

http.createServer = function patchedCreateServer(...args) {
  const options = typeof args[0] === 'function' ? undefined : args[0];
  const listener = typeof args[0] === 'function' ? args[0] : args[1];
  if (typeof listener !== 'function') return originalCreateServer(...args);
  const wrapped = async (req, res) => {
    const path = pathname(req);
    try {
      if (path === '/api/notifications/runtime-health') return runtimeHealth(req, res);
      if (path === '/api/notifications/free-day-source-queue') return handleSourceQueue(req, res, { identity, readJson, dbPool, sendJson, configured: Boolean(String(process.env.TELEGRAM_BOT_TOKEN || process.env.CREWCHECK_TELEGRAM_BOT_TOKEN || '').trim()) });
      if (path === '/api/notifications/free-day-sources') return handleVoluntarySources(req, res, { identity, readJson, dbPool, sendJson });
      if (path === '/api/notifications/free-day-held') return handleFreeDayHeld(req, res, { identity, readJson, dbPool, sendJson, configured: Boolean(String(process.env.TELEGRAM_BOT_TOKEN || process.env.CREWCHECK_TELEGRAM_BOT_TOKEN || '').trim()) });
      if (path === '/api/alarm/schedule' && req.method === 'POST') return scheduleJob(req, res);
      if (path === '/api/alarm/scheduled' && req.method === 'GET') return listJobs(req, res);
      if (path === '/api/alarm/cancel' && req.method === 'POST') return cancelJob(req, res);
      if (path === '/api/commute/monitor' && req.method === 'POST') return registerCommuteMonitor(req, res);
      if (path === '/api/commute/monitors' && req.method === 'GET') return listCommuteMonitors(req, res);
      if (path === '/api/commute/cancel' && req.method === 'POST') return cancelCommuteMonitor(req, res);
      return listener(req, res);
    } catch (error) {
      return sendJson(res, 500, { ok: false, message: String(error?.message || 'Falha no runtime de notificações.').slice(0, 300) });
    }
  };
  return options === undefined ? originalCreateServer(wrapped) : originalCreateServer(options, wrapped);
};

setTimeout(() => {
  repairTelegramWebhook();
  runSchedulerCycle();
  setInterval(runSchedulerCycle, INTERVAL_MS).unref?.();
  setInterval(repairTelegramWebhook, 15 * 60_000).unref?.();
}, 2_000).unref?.();

console.log(`[notifications] ${RUNTIME_VERSION} loaded; Telegram request body preserved; persistent scheduler enabled`);
