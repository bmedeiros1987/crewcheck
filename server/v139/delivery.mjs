import net from 'node:net';
import tls from 'node:tls';
import { cleanText, dbPool, env, flag, parseJsonColumn, safeEmail } from './common.mjs';

async function postJson(url, apiKey, payload, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: 'POST', signal: controller.signal, headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(payload) });
    const raw = await response.text().catch(() => '');
    return { ok: response.ok, status: response.status, raw };
  } catch (error) {
    return { ok: false, status: 0, raw: cleanText(error?.name === 'AbortError' ? 'Tempo limite ao acessar o provedor de e-mail.' : error?.message || 'Falha de conexão com o provedor de e-mail.', 500) };
  } finally { clearTimeout(timer); }
}

const defaultLogoUrl = 'https://crewcheck.online/favicon-512x512.png';
const defaultBcc = 'bmedeiros1987@gmail.com';

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

export function crewCheckEmailSignature() {
  const logoUrl = env('CREWCHECK_EMAIL_LOGO_URL', defaultLogoUrl);
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:680px;margin-top:28px;border-radius:18px;overflow:hidden;background:#06162f;color:#fff;font-family:Arial,sans-serif"><tr><td style="padding:22px 24px;border-bottom:1px solid rgba(255,255,255,.14)"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="padding-right:16px"><img src="${escapeHtml(logoUrl)}" width="64" height="64" alt="CrewCheck" style="display:block;border-radius:16px"></td><td><div style="font-size:26px;font-weight:800;line-height:1">CrewCheck</div><div style="margin-top:8px;font-size:12px;letter-spacing:2px;color:#eb4ab3">INTELIGÊNCIA OPERACIONAL PARA PROFISSIONAIS DA AVIAÇÃO</div></td></tr></table></td></tr><tr><td style="padding:22px 24px"><div style="font-size:18px;font-weight:800">Bruno Saraiva de Medeiros</div><div style="margin-top:4px;color:#5fd4ff;font-weight:700">Founder &amp; CEO</div><div style="margin-top:14px;font-size:14px;line-height:1.7;color:#dbe7f5">Bruno Medeiros Tecnologia<br><a href="https://crewcheck.online" style="color:#5fd4ff;text-decoration:none">crewcheck.online</a><br>Brasília – DF | Brasil</div><div style="margin-top:18px;padding-top:14px;border-top:1px solid rgba(255,255,255,.14);font-size:12px;letter-spacing:1.2px;color:#d6b1ff">TRANSFORMANDO COMPLEXIDADE OPERACIONAL EM DECISÕES INTELIGENTES.</div></td></tr></table>`;
}

function optionalEmail(message, key, fallback) {
  if (Object.hasOwn(message, key) && (message[key] === false || message[key] === null || message[key] === '')) return '';
  return safeEmail(Object.hasOwn(message, key) ? message[key] : fallback);
}

function normalizeMessage(message) {
  const replyTo = optionalEmail(message, 'replyTo', env('CREWCHECK_EMAIL_REPLY_TO', env('EMAIL_FROM')));
  const bcc = optionalEmail(message, 'bcc', env('CREWCHECK_EMAIL_BCC', defaultBcc));
  const appendSignature = message.appendSignature !== false;
  const html = appendSignature ? `${message.html || `<div style="white-space:pre-wrap">${escapeHtml(message.text)}</div>`}${crewCheckEmailSignature()}` : message.html;
  const text = appendSignature ? `${message.text || ''}\n\nBruno Saraiva de Medeiros\nFounder & CEO | Bruno Medeiros Tecnologia\nCrewCheck — Inteligência Operacional para Profissionais da Aviação\nhttps://crewcheck.online` : message.text;
  return { ...message, html, text, replyTo, bcc };
}

async function sendEmailSenderApi(message) {
  const { to, subject, text, html, replyTo, bcc } = message;
  const apiUrl = env('EMAILSENDER_API_URL');
  const apiKey = env('EMAILSENDER_API_KEY', env('EMAIL_SENDER_API_KEY'));
  const fromEmail = env('EMAILSENDER_FROM', env('EMAIL_FROM', env('MAILERSEND_FROM')));
  const fromName = env('EMAILSENDER_FROM_NAME', env('EMAIL_FROM_NAME', 'CrewCheck'));
  if (!apiUrl || !apiKey || !fromEmail) return { ok: false, configured: false, provider: 'emailsender-api', raw: 'EMAILSENDER_API_URL, chave ou remetente não configurado.' };
  const payload = { from: { email: fromEmail, name: fromName }, to: [{ email: to }], subject, text, html };
  if (replyTo) payload.reply_to = { email: replyTo };
  if (bcc) payload.bcc = [{ email: bcc }];
  const result = await postJson(apiUrl, apiKey, payload);
  return { ...result, configured: true, provider: 'emailsender-api' };
}

async function sendMailerSend(message) {
  const { to, subject, text, html, replyTo, bcc } = message;
  const apiKey = env('MAILERSEND_API_KEY');
  const fromEmail = env('MAILERSEND_FROM', env('EMAIL_FROM'));
  const fromName = env('MAILERSEND_FROM_NAME', env('EMAIL_FROM_NAME', 'CrewCheck'));
  if (!apiKey || !fromEmail) return { ok: false, configured: false, provider: 'mailersend', raw: 'MAILERSEND_API_KEY ou remetente não configurado.' };
  const payload = { from: { email: fromEmail, name: fromName }, to: [{ email: to }], subject, text, html };
  if (replyTo) payload.reply_to = { email: replyTo };
  if (bcc) payload.bcc = [{ email: bcc }];
  const result = await postJson('https://api.mailersend.com/v1/email', apiKey, payload);
  return { ...result, configured: true, provider: 'mailersend' };
}

function smtpResponseReader(socket) {
  let buffer = ''; const queue = []; let wake = null;
  socket.on('data', (chunk) => { buffer += chunk.toString('utf8'); const lines = buffer.split(/\r?\n/); buffer = lines.pop() || ''; for (const line of lines) if (line) queue.push(line); if (wake) { const current = wake; wake = null; current(); } });
  return async function read(expected, timeoutMs = 10_000) {
    const deadline = Date.now() + timeoutMs;
    while (true) {
      const finalIndex = queue.findIndex((line) => /^\d{3} /.test(line));
      if (finalIndex >= 0) { const lines = queue.splice(0, finalIndex + 1); const response = lines.join('\n'); const code = Number(lines.at(-1)?.slice(0, 3)); if (!expected.includes(code)) throw new Error(response || `SMTP ${code}`); return response; }
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error('SMTP timeout');
      await new Promise((resolve, reject) => { const timer = setTimeout(() => { if (wake === wrapped) wake = null; reject(new Error('SMTP timeout')); }, remaining); const wrapped = () => { clearTimeout(timer); resolve(); }; wake = wrapped; });
    }
  };
}
async function smtpCommand(socket, read, command, expected) { if (command) socket.write(`${command}\r\n`); return read(expected); }
function smtpPlainMessage({ fromEmail, fromName, to, bcc, replyTo, subject, text }) {
  const safeSubject = cleanText(subject, 180).replace(/[\r\n]/g, ' '); const safeFromName = cleanText(fromName, 120).replace(/["\r\n]/g, ''); const body = String(text || '').replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
  return [`From: "${safeFromName}" <${fromEmail}>`, `To: <${to}>`, bcc ? `Bcc: <${bcc}>` : '', replyTo ? `Reply-To: <${replyTo}>` : '', `Subject: ${safeSubject}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: 8bit', '', body].filter(Boolean).join('\r\n');
}
async function sendSmtp(message) {
  const host = env('SMTP_HOST'); const user = env('SMTP_USER'); const pass = env('SMTP_PASS'); const port = Number(env('SMTP_PORT', '587')); const secure = flag('SMTP_SECURE', port === 465); const fromEmail = safeEmail(env('SMTP_FROM', env('EMAIL_FROM', user))); const fromName = env('SMTP_FROM_NAME', env('EMAIL_FROM_NAME', 'CrewCheck'));
  if (!host || !user || !pass || !fromEmail || flag('CREWCHECK_EMAIL_DISABLE_SMTP', false)) return { ok: false, configured: false, provider: 'smtp', raw: 'SMTP não configurado ou desativado.' };
  let socket;
  try {
    socket = secure ? tls.connect({ host, port, servername: host, rejectUnauthorized: !flag('SMTP_ALLOW_SELF_SIGNED', false) }) : net.createConnection({ host, port });
    await new Promise((resolve, reject) => { socket.once(secure ? 'secureConnect' : 'connect', resolve); socket.once('error', reject); socket.setTimeout(15_000, () => reject(new Error('SMTP timeout'))); });
    let read = smtpResponseReader(socket); await read([220]); await smtpCommand(socket, read, `EHLO ${env('SMTP_HELO_NAME', 'crewcheck.online')}`, [250]);
    if (!secure && !flag('SMTP_SKIP_STARTTLS', false)) { await smtpCommand(socket, read, 'STARTTLS', [220]); socket = tls.connect({ socket, servername: host, rejectUnauthorized: !flag('SMTP_ALLOW_SELF_SIGNED', false) }); await new Promise((resolve, reject) => { socket.once('secureConnect', resolve); socket.once('error', reject); }); read = smtpResponseReader(socket); await smtpCommand(socket, read, `EHLO ${env('SMTP_HELO_NAME', 'crewcheck.online')}`, [250]); }
    await smtpCommand(socket, read, 'AUTH LOGIN', [334]); await smtpCommand(socket, read, Buffer.from(user).toString('base64'), [334]); await smtpCommand(socket, read, Buffer.from(pass).toString('base64'), [235]); await smtpCommand(socket, read, `MAIL FROM:<${fromEmail}>`, [250]); await smtpCommand(socket, read, `RCPT TO:<${message.to}>`, [250, 251]); if (message.bcc) await smtpCommand(socket, read, `RCPT TO:<${message.bcc}>`, [250, 251]); await smtpCommand(socket, read, 'DATA', [354]); socket.write(`${smtpPlainMessage({ ...message, fromEmail, fromName })}\r\n.\r\n`); await read([250]); socket.write('QUIT\r\n'); socket.end(); return { ok: true, configured: true, provider: 'smtp' };
  } catch (error) { try { socket?.destroy(); } catch {} return { ok: false, configured: true, provider: 'smtp', raw: cleanText(error?.message || 'Falha SMTP.', 500) }; }
}

function logEmailAttempt(result) {
  console.info('[crewcheck:email]', `provider=${result?.provider || 'unknown'}`, `configured=${Boolean(result?.configured)}`, `ok=${Boolean(result?.ok)}`, `status=${Number(result?.status || 0) || 'n/a'}`);
}

export async function sendSystemEmail(message) {
  const normalized = normalizeMessage(message);
  const attempts = [];
  // MailerSend is the canonical primary provider because it is the production path already proven to deliver CrewCheck mail reliably.
  // EmailSender API is retained only as a secondary provider, followed by SMTP as the final controlled fallback.
  for (const provider of [sendMailerSend, sendEmailSenderApi]) {
    const result = await provider(normalized);
    attempts.push(result);
    logEmailAttempt(result);
    if (result.ok) return { ...result, attempts };
  }
  if (flag('CREWCHECK_EMAIL_FALLBACK_ENABLED', true)) {
    const result = await sendSmtp(normalized);
    attempts.push(result);
    logEmailAttempt(result);
    if (result.ok) return { ...result, attempts };
  }
  const failed = [...attempts].reverse().find((item) => item.configured && (item.raw || item.status)) || [...attempts].reverse().find((item) => item.raw) || attempts.at(-1) || { provider: 'none', configured: false };
  console.warn('[crewcheck:email]', 'delivery_failed=true', `attempts=${attempts.map((item) => item.provider || 'unknown').join(',') || 'none'}`);
  return { ...failed, ok: false, attempts };
}

export function telegramToken() { return env('TELEGRAM_BOT_TOKEN', env('CREWCHECK_TELEGRAM_BOT_TOKEN')); }
export async function sendTelegram(chatId, text) { const token = telegramToken(); if (!token || !chatId) return { ok: false, configured: Boolean(token), provider: 'telegram' }; try { const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: String(chatId), text: String(text).slice(0, 3900), disable_web_page_preview: true }) }); const payload = await response.json().catch(() => ({})); return { ok: Boolean(response.ok && payload.ok !== false), configured: true, provider: 'telegram' }; } catch { return { ok: false, configured: true, provider: 'telegram' }; } }
export async function telegramLink(db, email) { for (const key of [`link-email:${email}`, `profile:${email}`]) { const [rows] = await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? LIMIT 1', [key]); const payload = parseJsonColumn(rows[0]?.payload, null); if (payload?.chatId || payload?.username) return payload; } return null; }
export async function callTelegram(username, text) { const user = String(username || '').trim().replace(/^@/, ''); if (!flag('CALLMEBOT_TELEGRAM_CALL_ENABLED', true) || !user) return { ok: false, configured: Boolean(user), provider: 'telegram-call' }; try { const url = new URL('https://api.callmebot.com/start.php'); url.searchParams.set('user', `@${user}`); url.searchParams.set('text', cleanText(text, 240)); url.searchParams.set('lang', env('CALLMEBOT_TELEGRAM_LANG', 'pt-BR-Standard-A')); url.searchParams.set('rpt', '1'); url.searchParams.set('cc', 'missed'); url.searchParams.set('timeout', '45'); const response = await fetch(url); const raw = await response.text().catch(() => ''); return { ok: response.ok && !/(error|invalid|unauthor)/i.test(raw), configured: true, provider: 'telegram-call' }; } catch { return { ok: false, configured: true, provider: 'telegram-call' }; } }
export async function callUsageAllowed(db, email) { const [profiles] = await db.query('SELECT plan FROM crewcheck_platform_profiles WHERE email=? LIMIT 1', [email]); const plan = String(profiles[0]?.plan || 'free'); const limit = plan === 'premium_unlimited' ? Number(env('CREWCHECK_UNLIMITED_CALL_LIMIT', '60')) : plan === 'free' ? Number(env('CREWCHECK_FREE_CALL_LIMIT', '1')) : Number(env('CREWCHECK_PREMIUM_CALL_LIMIT', '20')); const month = new Date().toISOString().slice(0, 7); const [usage] = await db.query('SELECT used FROM crewcheck_platform_usage WHERE email=? AND month_key=? AND usage_kind=? LIMIT 1', [email, month, 'password_reset_call']); return { allowed: Number(usage[0]?.used || 0) < limit, limit, month }; }
export async function consumeCallUsage(db, email, usage) { await db.query(`INSERT INTO crewcheck_platform_usage(email,month_key,usage_kind,used,limit_value) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE used=used+1,limit_value=VALUES(limit_value),updated_at=CURRENT_TIMESTAMP(3)`, [email, usage.month, 'password_reset_call', 1, usage.limit]); }
export async function databaseForDelivery() { return dbPool(); }
