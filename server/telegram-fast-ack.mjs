import http from 'node:http';
import { URL } from 'node:url';
import { dbPool, requestToken, safeEmail, verifyJwt } from './v139/common.mjs';
import { sendTelegram, callTelegram } from './v139/delivery.mjs';
import { buildInfobipTtsRequest, infobipPublicStatus } from './v1396/infobip.mjs';

const originalCreateServer = http.createServer.bind(http);
const RUNTIME_VERSION = '14.1.1-notifications';
const INTERVAL_MS = Math.max(15_000, Number(process.env.CREWCHECK_NOTIFICATION_INTERVAL_MS || 30_000));
let schedulerRunning = false;
let lastCycle = null;
let lastWebhookCheck = null;

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
    return payload && email ? { email, admin: Boolean(payload.admin) } : null;
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

async function runSchedulerCycle() {
  if (schedulerRunning) return;
  schedulerRunning = true;
  const summary = { startedAt: new Date().toISOString(), selected: 0, sent: 0, failed: 0 };
  try {
    const db = await dbPool();
    if (!db) throw new Error('Banco indisponível para notificações.');
    await ensureNotificationTable(db);
    await db.query("UPDATE crewcheck_notification_jobs SET status='pending',locked_at=NULL WHERE status='processing' AND locked_at < DATE_SUB(NOW(3), INTERVAL 5 MINUTE)");
    const [rows] = await db.query("SELECT * FROM crewcheck_notification_jobs WHERE status='pending' AND scheduled_at <= NOW(3) AND scheduled_at >= DATE_SUB(NOW(3), INTERVAL 15 MINUTE) ORDER BY scheduled_at ASC LIMIT 50");
    summary.selected = rows.length;
    for (const job of rows) {
      const [claim] = await db.query("UPDATE crewcheck_notification_jobs SET status='processing',locked_at=NOW(3),attempts=attempts+1 WHERE id=? AND status='pending'", [job.id]);
      if (!claim.affectedRows) continue;
      let result;
      try { result = await deliverJob(job); }
      catch (error) { result = { ok: false, raw: String(error?.message || error) }; }
      if (result?.ok) {
        summary.sent += 1;
        await db.query("UPDATE crewcheck_notification_jobs SET status='sent',sent_at=NOW(3),last_error=NULL WHERE id=?", [job.id]);
      } else {
        summary.failed += 1;
        const retry = Number(job.attempts || 0) + 1 < 3;
        await db.query("UPDATE crewcheck_notification_jobs SET status=?,locked_at=NULL,last_error=? WHERE id=?", [retry ? 'pending' : 'failed', String(result?.raw || result?.message || 'Falha no envio').slice(0, 500), job.id]);
      }
    }
  } catch (error) {
    summary.error = String(error?.message || error).slice(0, 500);
  } finally {
    summary.finishedAt = new Date().toISOString();
    lastCycle = summary;
    schedulerRunning = false;
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
  const user = identity(req);
  if (!user) return sendJson(res, 401, { ok: false, message: 'Sessão expirada.' });
  const body = await readJson(req);
  const scheduledAt = new Date(body.scheduledAt || body.scheduled_at || '');
  if (Number.isNaN(scheduledAt.getTime())) return sendJson(res, 400, { ok: false, message: 'Informe data e hora válidas.' });
  if (scheduledAt.getTime() < Date.now() - 60_000) return sendJson(res, 400, { ok: false, message: 'O horário do despertador já passou.' });
  const channel = String(body.channel || 'telegram').toLowerCase();
  const jobKey = String(body.jobKey || body.job_key || `manual:${scheduledAt.toISOString()}:${channel}`).slice(0, 220);
  const message = String(body.message || 'Despertador CrewCheck: está na hora de iniciar sua preparação para a próxima programação.').trim().slice(0, 1000);
  const db = await dbPool();
  if (!db) return sendJson(res, 503, { ok: false, message: 'Banco indisponível.' });
  await ensureNotificationTable(db);
  await db.query(`INSERT INTO crewcheck_notification_jobs (email,job_key,scheduled_at,channel,chat_id,telegram_username,phone,message,status)
    VALUES(?,?,?,?,?,?,?,?, 'pending')
    ON DUPLICATE KEY UPDATE scheduled_at=VALUES(scheduled_at),channel=VALUES(channel),chat_id=VALUES(chat_id),telegram_username=VALUES(telegram_username),phone=VALUES(phone),message=VALUES(message),status='pending',attempts=0,locked_at=NULL,sent_at=NULL,last_error=NULL`,
    [user.email, jobKey, scheduledAt, channel, String(body.chatId || ''), String(body.telegramUsername || ''), String(body.phone || ''), message]);
  return sendJson(res, 200, { ok: true, scheduledAt: scheduledAt.toISOString(), channel, jobKey, message: 'Despertador agendado no servidor.' });
}

async function listJobs(req, res) {
  const user = identity(req);
  if (!user) return sendJson(res, 401, { ok: false, message: 'Sessão expirada.' });
  const db = await dbPool();
  if (!db) return sendJson(res, 503, { ok: false, message: 'Banco indisponível.' });
  await ensureNotificationTable(db);
  const [rows] = await db.query('SELECT id,job_key AS jobKey,scheduled_at AS scheduledAt,channel,status,attempts,sent_at AS sentAt,last_error AS lastError FROM crewcheck_notification_jobs WHERE email=? ORDER BY scheduled_at DESC LIMIT 100', [user.email]);
  return sendJson(res, 200, { ok: true, jobs: rows });
}

async function cancelJob(req, res) {
  const user = identity(req);
  if (!user) return sendJson(res, 401, { ok: false, message: 'Sessão expirada.' });
  const body = await readJson(req);
  const db = await dbPool();
  if (!db) return sendJson(res, 503, { ok: false, message: 'Banco indisponível.' });
  const [result] = await db.query("UPDATE crewcheck_notification_jobs SET status='cancelled',locked_at=NULL WHERE email=? AND (id=? OR job_key=?) AND status IN ('pending','processing')", [user.email, Number(body.id || 0), String(body.jobKey || '')]);
  return sendJson(res, 200, { ok: true, cancelled: result.affectedRows });
}

async function runtimeHealth(_req, res) {
  let database = false;
  try { const db = await dbPool(); if (db) { await ensureNotificationTable(db); database = true; } } catch {}
  return sendJson(res, 200, {
    ok: database && Boolean(lastWebhookCheck?.ok), version: RUNTIME_VERSION, database,
    scheduler: { running: schedulerRunning, intervalMs: INTERVAL_MS, lastCycle },
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
      if (path === '/api/alarm/schedule' && req.method === 'POST') return scheduleJob(req, res);
      if (path === '/api/alarm/scheduled' && req.method === 'GET') return listJobs(req, res);
      if (path === '/api/alarm/cancel' && req.method === 'POST') return cancelJob(req, res);
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
