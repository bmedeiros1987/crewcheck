import crypto from 'node:crypto';
import { cleanText, dbPool, env, isAdminEmail, readBody, requireIdentity, safeEmail, sendJson, sha256 } from '../v139/common.mjs';
import { sendSystemEmail } from '../v139/delivery.mjs';

const PUBLIC_SUPPORT_EMAIL = 'suporte@crewcheck.com.br';
const TICKET_CATEGORIES = new Set(['erro', 'sugestao', 'escala', 'saida', 'health', 'telegram', 'guardian', 'cobranca', 'privacidade', 'outro']);
const TICKET_PRIORITIES = new Set(['baixa', 'normal', 'alta', 'urgente']);
const METRIC_KINDS = new Set(['app_open', 'roster_import', 'route_calculation', 'health_refresh', 'guardian_qr', 'support_ticket', 'visitor_access']);

function id(prefix = 'CC') {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function encryptionKey() {
  const secret = env('CREWCHECK_DATA_ENCRYPTION_KEY', env('CREWCHECK_AUTH_SECRET', env('JWT_SECRET')));
  if (!secret) throw Object.assign(new Error('Criptografia do Guardian não configurada.'), { status: 503 });
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptPayload(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

function decryptPayload(value) {
  const packed = Buffer.from(String(value || ''), 'base64url');
  if (packed.length < 29) throw new Error('Cartão Guardian inválido.');
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const encrypted = packed.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8'));
}

async function ensureTables(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS crewcheck_guardian_cards (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    owner_email VARCHAR(254) NOT NULL,
    token_hash CHAR(64) NOT NULL,
    payload_cipher MEDIUMTEXT NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    revoked_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    last_opened_at DATETIME(3) NULL,
    open_count INT NOT NULL DEFAULT 0,
    UNIQUE KEY uq_guardian_token (token_hash),
    KEY idx_guardian_owner (owner_email, expires_at, revoked_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await db.query(`CREATE TABLE IF NOT EXISTS crewcheck_support_tickets (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    requester_email VARCHAR(254) NOT NULL,
    category VARCHAR(40) NOT NULL,
    priority VARCHAR(20) NOT NULL,
    subject VARCHAR(180) NOT NULL,
    message TEXT NOT NULL,
    expected_result TEXT NULL,
    actual_result TEXT NULL,
    reproduction_steps TEXT NULL,
    diagnostics JSON NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'open',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    KEY idx_support_status (status, created_at),
    KEY idx_support_requester (requester_email, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await db.query(`CREATE TABLE IF NOT EXISTS crewcheck_aggregate_metrics (
    day_key DATE NOT NULL,
    event_kind VARCHAR(60) NOT NULL,
    event_count BIGINT NOT NULL DEFAULT 0,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (day_key, event_kind)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

async function addMetric(db, kind, amount = 1) {
  const metric = METRIC_KINDS.has(kind) ? kind : '';
  if (!metric) return;
  await db.query(`INSERT INTO crewcheck_aggregate_metrics (day_key,event_kind,event_count)
    VALUES (UTC_DATE(),?,?) ON DUPLICATE KEY UPDATE event_count=event_count+VALUES(event_count)`, [metric, Math.max(1, Math.min(1000, Number(amount) || 1))]);
}

function guardianPayload(body, identity) {
  const contact = body?.emergencyContact || {};
  return {
    schema: 'crewcheck-guardian-v1',
    displayName: cleanText(body?.displayName || identity?.profile?.display_name || identity?.payload?.name || 'Tripulante', 120),
    crewId: cleanText(body?.crewId || identity?.profile?.public_id || '', 40),
    bloodType: cleanText(body?.bloodType, 8),
    allergies: cleanText(body?.allergies, 600),
    medications: cleanText(body?.medications, 600),
    conditions: cleanText(body?.conditions, 600),
    criticalNotes: cleanText(body?.criticalNotes, 1000),
    emergencyContact: {
      name: cleanText(contact?.name, 120),
      relationship: cleanText(contact?.relationship, 80),
      phone: cleanText(contact?.phone, 40),
    },
    issuedAt: new Date().toISOString(),
    issuer: 'CrewCheck Guardian',
    verified: true,
    privacy: 'Acesso temporário autorizado pelo titular. Não substitui avaliação médica.',
  };
}

async function createGuardian(req, res) {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const body = await readBody(req, 120_000);
  const db = identity.db;
  await ensureTables(db);
  const token = crypto.randomBytes(32).toString('base64url');
  const cardId = id('CCG');
  const hours = Math.max(1, Math.min(24 * 30, Number(body?.validHours) || 72));
  const payload = guardianPayload(body, identity);
  await db.query(`INSERT INTO crewcheck_guardian_cards
    (id,owner_email,token_hash,payload_cipher,expires_at) VALUES (?,?,?,?,DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? HOUR))`,
    [cardId, identity.email, sha256(token), encryptPayload(payload), hours]);
  await addMetric(db, 'guardian_qr');
  const base = env('CREWCHECK_PUBLIC_URL', env('TELEGRAM_PUBLIC_BASE_URL', 'https://crewcheck.online')).replace(/\/$/, '');
  sendJson(res, 201, { ok: true, id: cardId, token, url: `${base}/guardian?token=${encodeURIComponent(token)}`, expiresInHours: hours, message: 'QR Guardian criado com validade temporária e dados criptografados.' });
}

async function revokeGuardian(req, res) {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const cardId = cleanText(new URL(req.url, 'http://localhost').searchParams.get('id'), 64);
  if (!cardId) return sendJson(res, 400, { ok: false, message: 'Cartão Guardian não informado.' });
  await ensureTables(identity.db);
  await identity.db.query('UPDATE crewcheck_guardian_cards SET revoked_at=UTC_TIMESTAMP(3) WHERE id=? AND owner_email=?', [cardId, identity.email]);
  sendJson(res, 200, { ok: true, message: 'Acesso do QR Guardian revogado.' });
}

async function readGuardian(req, res, url) {
  const token = String(url.searchParams.get('token') || '').trim();
  if (token.length < 20) return sendJson(res, 404, { ok: false, message: 'Cartão Guardian não encontrado.' });
  const db = await dbPool();
  if (!db) return sendJson(res, 503, { ok: false, message: 'Guardian temporariamente indisponível.' });
  await ensureTables(db);
  const [rows] = await db.query(`SELECT id,payload_cipher,expires_at FROM crewcheck_guardian_cards
    WHERE token_hash=? AND revoked_at IS NULL AND expires_at>UTC_TIMESTAMP(3) LIMIT 1`, [sha256(token)]);
  const row = rows?.[0];
  if (!row) return sendJson(res, 404, { ok: false, message: 'Este QR expirou, foi revogado ou não existe.' });
  try {
    const card = decryptPayload(row.payload_cipher);
    await db.query('UPDATE crewcheck_guardian_cards SET open_count=open_count+1,last_opened_at=UTC_TIMESTAMP(3) WHERE id=?', [row.id]);
    return sendJson(res, 200, { ok: true, card, expiresAt: row.expires_at, readOnly: true });
  } catch {
    return sendJson(res, 500, { ok: false, message: 'Não foi possível abrir este cartão protegido.' });
  }
}

function diagnosticsPayload(body, req) {
  const supplied = body?.diagnostics && typeof body.diagnostics === 'object' ? body.diagnostics : {};
  return {
    appVersion: cleanText(supplied.appVersion, 30),
    platform: cleanText(supplied.platform, 80),
    screen: cleanText(supplied.screen, 100),
    network: cleanText(supplied.network, 40),
    userAgentFamily: cleanText(String(req.headers['user-agent'] || '').split(/[\s/]/).slice(0, 4).join(' '), 120),
  };
}

function ticketMachineText(ticket) {
  return [
    'CREWCHECK_SUPPORT_TICKET_V1',
    `ticket_id: ${ticket.id}`,
    `category: ${ticket.category}`,
    `priority: ${ticket.priority}`,
    `requester: ${ticket.requesterEmail}`,
    `subject: ${ticket.subject}`,
    `created_at: ${ticket.createdAt}`,
    '',
    '[MESSAGE]', ticket.message,
    '', '[EXPECTED_RESULT]', ticket.expectedResult || 'Não informado',
    '', '[ACTUAL_RESULT]', ticket.actualResult || 'Não informado',
    '', '[REPRODUCTION_STEPS]', ticket.reproductionSteps || 'Não informado',
    '', '[DIAGNOSTICS_JSON]', JSON.stringify(ticket.diagnostics),
    '', '[HANDLING_INSTRUCTION]',
    'Classifique o problema, identifique a provável área do CrewCheck, sugira a primeira resposta e preserve o número do ticket em toda comunicação.',
  ].join('\n');
}

async function createSupportTicket(req, res) {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const body = await readBody(req, 220_000);
  const category = TICKET_CATEGORIES.has(String(body?.category || '').toLowerCase()) ? String(body.category).toLowerCase() : 'outro';
  const priority = TICKET_PRIORITIES.has(String(body?.priority || '').toLowerCase()) ? String(body.priority).toLowerCase() : 'normal';
  const subject = cleanText(body?.subject, 180);
  const message = cleanText(body?.message, 8000);
  if (subject.length < 4 || message.length < 10) return sendJson(res, 400, { ok: false, message: 'Informe um assunto e descreva o que aconteceu.' });
  const ticketId = id('CCS');
  const createdAt = new Date().toISOString();
  const diagnostics = diagnosticsPayload(body, req);
  const ticket = {
    id: ticketId,
    category,
    priority,
    requesterEmail: identity.email,
    subject,
    message,
    expectedResult: cleanText(body?.expectedResult, 4000),
    actualResult: cleanText(body?.actualResult, 4000),
    reproductionSteps: cleanText(body?.reproductionSteps, 5000),
    diagnostics,
    createdAt,
  };
  await ensureTables(identity.db);
  await identity.db.query(`INSERT INTO crewcheck_support_tickets
    (id,requester_email,category,priority,subject,message,expected_result,actual_result,reproduction_steps,diagnostics)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, [ticketId, identity.email, category, priority, subject, message, ticket.expectedResult || null, ticket.actualResult || null, ticket.reproductionSteps || null, JSON.stringify(diagnostics)]);
  await addMetric(identity.db, 'support_ticket');

  const inbox = safeEmail(env('CREWCHECK_SUPPORT_INBOX', env('CREWCHECK_ADMIN_EMAIL', 'bmedeiros1987@gmail.com'))) || 'bmedeiros1987@gmail.com';
  const machineText = ticketMachineText(ticket);
  const internal = await sendSystemEmail({
    to: inbox,
    subject: `[CrewCheck ${ticketId}] ${category.toUpperCase()} · ${subject}`,
    text: machineText,
    replyTo: identity.email,
    bcc: false,
  });
  if (internal.ok) await addMetric(identity.db, 'support_ticket');
  await sendSystemEmail({
    to: identity.email,
    subject: `Recebemos seu chamado ${ticketId}`,
    text: `Seu chamado foi registrado.\n\nNúmero: ${ticketId}\nAssunto: ${subject}\nPrioridade: ${priority}\n\nResponda a este e-mail mantendo o número do ticket no assunto.\n\nCanal público: ${PUBLIC_SUPPORT_EMAIL}`,
    replyTo: PUBLIC_SUPPORT_EMAIL,
    bcc: false,
  }).catch(() => undefined);
  sendJson(res, 201, { ok: true, ticketId, emailAccepted: Boolean(internal.ok), supportEmail: PUBLIC_SUPPORT_EMAIL, message: internal.ok ? 'Chamado enviado ao suporte.' : 'Chamado salvo. A entrega por e-mail será tentada novamente pelo suporte.' });
}

async function telemetry(req, res) {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const body = await readBody(req, 12_000);
  const kind = String(body?.kind || '').toLowerCase();
  if (!METRIC_KINDS.has(kind)) return sendJson(res, 400, { ok: false, message: 'Métrica não reconhecida.' });
  await ensureTables(identity.db);
  await addMetric(identity.db, kind);
  sendJson(res, 200, { ok: true });
}

async function scalar(db, sql, params = [], fallback = 0) {
  try {
    const [rows] = await db.query(sql, params);
    const row = rows?.[0] || {};
    const value = Object.values(row)[0];
    return Number(value || 0);
  } catch {
    return fallback;
  }
}

async function adminOverview(req, res) {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  if (!identity.admin && !isAdminEmail(identity.email)) return sendJson(res, 403, { ok: false, message: 'Acesso exclusivo do administrador.' });
  const db = identity.db;
  await ensureTables(db);
  const [users, rosters, activeRosters, visitors, ticketsOpen, guardianActive, accesses30d, accessesToday, emails, emailFailures, databaseBytes, tableCount] = await Promise.all([
    scalar(db, 'SELECT COUNT(*) total FROM crewcheck_platform_profiles'),
    scalar(db, 'SELECT COUNT(*) total FROM crewcheck_platform_rosters'),
    scalar(db, 'SELECT COUNT(*) total FROM crewcheck_platform_rosters WHERE active=1'),
    scalar(db, "SELECT COUNT(*) total FROM crewcheck_platform_visitors WHERE status<>'revoked'"),
    scalar(db, "SELECT COUNT(*) total FROM crewcheck_support_tickets WHERE status IN ('open','in_progress')"),
    scalar(db, 'SELECT COUNT(*) total FROM crewcheck_guardian_cards WHERE revoked_at IS NULL AND expires_at>UTC_TIMESTAMP(3)'),
    scalar(db, "SELECT COALESCE(SUM(event_count),0) total FROM crewcheck_aggregate_metrics WHERE event_kind IN ('app_open','visitor_access') AND day_key>=UTC_DATE()-INTERVAL 30 DAY"),
    scalar(db, "SELECT COALESCE(SUM(event_count),0) total FROM crewcheck_aggregate_metrics WHERE event_kind IN ('app_open','visitor_access') AND day_key=UTC_DATE()"),
    scalar(db, "SELECT COUNT(*) total FROM crewcheck_email_events WHERE event_type IN ('sent','delivered','opened','clicked')"),
    scalar(db, "SELECT COUNT(*) total FROM crewcheck_email_events WHERE event_type IN ('bounced','hard_bounced','soft_bounced','failed','rejected','spam_complaint')"),
    scalar(db, 'SELECT COALESCE(SUM(data_length+index_length),0) total FROM information_schema.tables WHERE table_schema=DATABASE()'),
    scalar(db, 'SELECT COUNT(*) total FROM information_schema.tables WHERE table_schema=DATABASE()'),
  ]);
  let trends = [];
  try {
    const [rows] = await db.query(`SELECT DATE_FORMAT(day_key,'%Y-%m-%d') day,event_kind,SUM(event_count) count
      FROM crewcheck_aggregate_metrics WHERE day_key>=UTC_DATE()-INTERVAL 13 DAY
      GROUP BY day_key,event_kind ORDER BY day_key ASC,event_kind ASC`);
    trends = rows.map((row) => ({ day: row.day, kind: row.event_kind, count: Number(row.count || 0) }));
  } catch {}
  sendJson(res, 200, {
    ok: true,
    privacyMode: 'aggregate-only',
    generatedAt: new Date().toISOString(),
    cards: { users, rosters, activeRosters, visitors, ticketsOpen, guardianActive, accesses30d, accessesToday, emails, emailFailures, databaseBytes, tableCount },
    trends,
    dataPolicy: 'Nenhum nome, e-mail, escala, localização ou dado de saúde é exibido nesta dashboard.',
  });
}

export async function handleV14316ControlRoute(req, res, url) {
  if (url.pathname === '/api/guardian/card' && req.method === 'GET') { await readGuardian(req, res, url); return true; }
  if (url.pathname === '/api/guardian/card' && req.method === 'POST') { await createGuardian(req, res); return true; }
  if (url.pathname === '/api/guardian/card' && req.method === 'DELETE') { await revokeGuardian(req, res); return true; }
  if (url.pathname === '/api/support/tickets' && req.method === 'POST') { await createSupportTicket(req, res); return true; }
  if (url.pathname === '/api/control/telemetry' && req.method === 'POST') { await telemetry(req, res); return true; }
  if (url.pathname === '/api/admin/overview' && req.method === 'GET') { await adminOverview(req, res); return true; }
  return false;
}

export { PUBLIC_SUPPORT_EMAIL, addMetric, ensureTables };
