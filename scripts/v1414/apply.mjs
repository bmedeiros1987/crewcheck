import fs from 'node:fs';

const runtimePath = 'server/telegram-fast-ack.mjs';
if (fs.existsSync(runtimePath)) {
  let source = fs.readFileSync(runtimePath, 'utf8');

  source = source.replace(
    "import { sendTelegram, callTelegram } from './v139/delivery.mjs';",
    "import { sendTelegram, callTelegram, telegramLink } from './v139/delivery.mjs';"
  );
  source = source.replace(/const RUNTIME_VERSION = '[^']+';/, "const RUNTIME_VERSION = '14.1.4-telegram-alarm-hardening';");

  const delivery = `async function deliverJob(job) {
  const raw = String(job.channel || 'telegram').toLowerCase().trim();
  const aliases = {
    both: 'telegram+phone-call',
    phone: 'phone-call',
    infobip: 'phone-call',
    all: 'telegram+telegram-call+phone-call',
  };
  const normalized = aliases[raw] || raw;
  const channels = [...new Set(normalized.split('+').map((item) => item.trim()).filter(Boolean))];
  const results = [];

  for (const channel of channels) {
    try {
      if (channel === 'telegram') {
        results.push({ channel, ...(await sendTelegram(job.chat_id, job.message)) });
      } else if (channel === 'telegram-call') {
        results.push({ channel, ...(await callTelegram(job.telegram_username, job.message)) });
      } else if (channel === 'phone-call') {
        results.push({ channel, ...(await sendInfobipPhone(job.phone, job.message)) });
      } else {
        results.push({ channel, ok: false, configured: false, raw: 'Canal inválido.' });
      }
    } catch (error) {
      results.push({ channel, ok: false, configured: true, raw: String(error?.message || error) });
    }
  }

  const successful = results.filter((item) => item?.ok);
  return {
    ok: successful.length > 0,
    configured: results.some((item) => item?.configured),
    provider: normalized,
    results,
    raw: successful.length ? '' : results.map((item) => item?.raw || item?.message || item.channel).join(' | '),
  };
}
`;
  source = source.replace(/async function deliverJob\(job\) \{[\s\S]*?\n\}\n\nasync function runSchedulerCycle/, `${delivery}\nasync function runSchedulerCycle`);

  const schedule = `async function scheduleJob(req, res) {
  const user = identity(req);
  if (!user) return sendJson(res, 401, { ok: false, message: 'Sessão expirada.' });
  const body = await readJson(req);
  const scheduledAt = new Date(body.scheduledAt || body.scheduled_at || '');
  if (Number.isNaN(scheduledAt.getTime())) return sendJson(res, 400, { ok: false, message: 'Informe data e hora válidas.' });
  if (scheduledAt.getTime() < Date.now() - 60_000) return sendJson(res, 400, { ok: false, message: 'O horário do despertador já passou.' });

  const aliases = { both: 'telegram+phone-call', phone: 'phone-call', infobip: 'phone-call', all: 'telegram+telegram-call+phone-call' };
  const requested = String(body.channel || 'telegram').toLowerCase().trim();
  const channel = aliases[requested] || requested;
  const allowed = new Set([
    'telegram', 'telegram-call', 'phone-call',
    'telegram+telegram-call', 'telegram+phone-call', 'telegram-call+phone-call',
    'telegram+telegram-call+phone-call'
  ]);
  if (!allowed.has(channel)) return sendJson(res, 400, { ok: false, message: 'Combinação de despertador inválida.' });

  const jobKey = String(body.jobKey || body.job_key || \`manual:\${scheduledAt.toISOString()}:\${channel}\`).slice(0, 220);
  const message = String(body.message || 'Despertador CrewCheck: está na hora de iniciar sua preparação para a próxima programação.').trim().slice(0, 1000);
  const db = await dbPool();
  if (!db) return sendJson(res, 503, { ok: false, message: 'Banco indisponível.' });
  await ensureNotificationTable(db);

  const linked = await telegramLink(db, user.email).catch(() => null);
  const chatId = String(body.chatId || linked?.chatId || '').trim();
  const telegramUsername = String(body.telegramUsername || linked?.username || '').trim().replace(/^@/, '');
  const phone = String(body.phone || body.mobile || '').trim();
  const channels = channel.split('+');

  if (channels.includes('telegram') && !chatId) return sendJson(res, 400, { ok: false, message: 'Vincule o Telegram antes de ativar esta opção.' });
  if (channels.includes('telegram-call') && !telegramUsername) return sendJson(res, 400, { ok: false, message: 'Cadastre um nome de usuário no Telegram para receber ligação.' });
  if (channels.includes('phone-call') && !phone) return sendJson(res, 400, { ok: false, message: 'Informe um telefone com DDI para receber ligação VoIP.' });

  await db.query(\`INSERT INTO crewcheck_notification_jobs (email,job_key,scheduled_at,channel,chat_id,telegram_username,phone,message,status)
    VALUES(?,?,?,?,?,?,?,?, 'pending')
    ON DUPLICATE KEY UPDATE scheduled_at=VALUES(scheduled_at),channel=VALUES(channel),chat_id=VALUES(chat_id),telegram_username=VALUES(telegram_username),phone=VALUES(phone),message=VALUES(message),status='pending',attempts=0,locked_at=NULL,sent_at=NULL,last_error=NULL\`,
    [user.email, jobKey, scheduledAt, channel, chatId, telegramUsername, phone, message]);

  return sendJson(res, 200, { ok: true, scheduledAt: scheduledAt.toISOString(), channel, jobKey, message: 'Despertador agendado no servidor.' });
}
`;
  source = source.replace(/async function scheduleJob\(req, res\) \{[\s\S]*?\n\}\n\nasync function listJobs/, `${schedule}\nasync function listJobs`);

  fs.writeFileSync(runtimePath, source, 'utf8');
  console.log('[v1414] Telegram e Despertador Inteligente endurecidos; combinações completas habilitadas.');
}

const homePath = 'client/src/pages/Home.tsx';
if (fs.existsSync(homePath)) {
  let source = fs.readFileSync(homePath, 'utf8');

  source = source.replace(/function wakeupChannelLabel\(channel: string\): string \{[\s\S]*?\n\}/, `function wakeupChannelLabel(channel: string): string {
  const value = String(channel || '').toLowerCase();
  const labels: Record<string, string> = {
    telegram: 'Mensagem no Telegram',
    'telegram-call': 'Ligação via Telegram',
    'phone-call': 'Ligação VoIP',
    'telegram+telegram-call': 'Telegram + ligação via Telegram',
    'telegram+phone-call': 'Telegram + ligação VoIP',
    'telegram-call+phone-call': 'Ligação via Telegram + ligação VoIP',
    'telegram+telegram-call+phone-call': 'Todos os canais',
    both: 'Telegram + ligação VoIP',
  };
  return labels[value] || 'Despertador Inteligente';
}`);

  source = source.replace(
    '<option value="telegram">Somente Telegram</option><option value="telegram-call">Ligação via Telegram</option><option value="phone-call">Ligação telefônica Premium</option><option value="both">Ligação telefônica + Telegram</option>',
    '<option value="telegram">Somente Telegram</option><option value="telegram-call">Somente ligação via Telegram</option><option value="phone-call">Somente ligação VoIP</option><option value="telegram+telegram-call">Telegram + ligação via Telegram</option><option value="telegram+phone-call">Telegram + ligação VoIP</option><option value="telegram-call+phone-call">Ligação via Telegram + ligação VoIP</option><option value="telegram+telegram-call+phone-call">Todos os canais</option>'
  );

  source = source.replace(/function serverChannel\(\) \{[\s\S]*?\n  \}/, `function serverChannel() {
    if (channel === 'ligacao') return 'phone-call';
    if (channel === 'ambos' || channel === 'both') return 'telegram+phone-call';
    return channel;
  }`);

  source = source.replace(
    "(channel === 'phone-call' || channel === 'both')",
    "(channel.includes('phone-call'))"
  );

  fs.writeFileSync(homePath, source, 'utf8');
  console.log('[v1414] Interface do Despertador atualizada com todas as combinações.');
}
