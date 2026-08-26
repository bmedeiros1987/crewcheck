import crypto from 'node:crypto';
import {
  cleanText,
  dbPool,
  env,
  requestToken,
  safeEmail,
  sendJson,
  sha256,
  verifyJwt,
} from '../v139/common.mjs';
import { decryptPartnerRosterPayload, ensurePartnerRosterExchangeTables } from './partnerRosterExchange.mjs';

function userIdentity(req) {
  const token = requestToken(req);
  const payload = verifyJwt(token);
  const email = safeEmail(payload?.email);
  if (!payload || !email) {
    throw Object.assign(new Error('Faça login para ativar a escala importada.'), {
      status: 401,
      code: 'AUTH_REQUIRED',
    });
  }
  return { token, payload, email };
}

function parseJson(value, fallback = null) {
  if (value && typeof value === 'object') return value;
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function rosterFingerprint(roster = {}) {
  return sha256(JSON.stringify({
    year: roster?.year,
    month: roster?.month,
    crewId: roster?.crewId,
    days: roster?.days,
  }));
}

function rosterKey(roster = {}) {
  const year = Number(roster?.year || 0);
  const month = Number(roster?.month || 0);
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) return '';
  return `${year}-${String(month).padStart(2, '0')}`;
}

function sourceName(row = {}) {
  const partner = cleanText(row.sourceName || 'parceiro', 80) || 'parceiro';
  const filename = cleanText(row.filename || 'escala.pdf', 100) || 'escala.pdf';
  return cleanText(`Partner raw · ${partner} · ${filename}`, 180);
}

export async function ensurePartnerRosterActivationTable(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS crewcheck_partner_roster_activations (
    id CHAR(36) NOT NULL PRIMARY KEY,
    import_id CHAR(36) NOT NULL,
    owner_email VARCHAR(254) NOT NULL,
    parser_version VARCHAR(120) NOT NULL,
    roster_key VARCHAR(20) NOT NULL,
    fingerprint CHAR(64) NOT NULL,
    platform_roster_id VARCHAR(64) NULL,
    activated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_partner_roster_activation_import (import_id,activated_at),
    KEY idx_partner_roster_activation_owner (owner_email,activated_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

async function activationCandidate(db, id, ownerEmail) {
  const [imports] = await db.query(`SELECT id,owner_email AS ownerEmail,source_name AS sourceName,filename,
    parse_status AS parseStatus,parser_version AS parserVersion
    FROM crewcheck_partner_roster_imports
    WHERE id=? AND owner_email=? LIMIT 1`, [id, ownerEmail]);
  const row = imports[0];
  if (!row) {
    throw Object.assign(new Error('Importação não localizada.'), { status: 404, code: 'ROSTER_IMPORT_NOT_FOUND' });
  }
  if (row.parseStatus !== 'parsed') {
    throw Object.assign(new Error('Somente uma importação validada como parsed pode ser ativada.'), {
      status: 409,
      code: 'ROSTER_IMPORT_NOT_READY',
    });
  }
  const [attempts] = await db.query(`SELECT id,parser_version AS parserVersion,parsed_ciphertext AS parsedCiphertext,
    summary_json AS summaryJson,created_at AS createdAt
    FROM crewcheck_partner_roster_parse_attempts
    WHERE import_id=? AND parse_status='parsed' AND parsed_ciphertext IS NOT NULL
    ORDER BY id DESC LIMIT 1`, [id]);
  const attempt = attempts[0];
  if (!attempt?.parsedCiphertext) {
    throw Object.assign(new Error('Snapshot interpretado não localizado.'), { status: 409, code: 'ROSTER_PARSED_SNAPSHOT_MISSING' });
  }
  let parsed;
  try {
    parsed = JSON.parse(decryptPartnerRosterPayload(attempt.parsedCiphertext).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Snapshot interpretado não pôde ser validado.'), { status: 503, code: 'ROSTER_DECRYPT_FAILED' });
  }
  const roster = parsed?.roster;
  if (!roster || !Array.isArray(roster.days) || !roster.days.length) {
    throw Object.assign(new Error('A interpretação não contém uma escala utilizável.'), { status: 409, code: 'ROSTER_EMPTY' });
  }
  const key = rosterKey(roster);
  if (!key) {
    throw Object.assign(new Error('Mês e ano da escala não puderam ser confirmados.'), { status: 409, code: 'ROSTER_PERIOD_REQUIRED' });
  }
  return {
    row,
    attempt,
    roster,
    diagnostics: parsed?.diagnostics || {},
    summary: parseJson(attempt.summaryJson, null),
    key,
    fingerprint: rosterFingerprint(roster),
  };
}

async function activateThroughCanonicalRosterSync(req, candidate) {
  const port = env('PORT', '4173');
  const base = env('CREWCHECK_PARTNER_ROSTER_ACTIVATION_BASE_URL', `http://127.0.0.1:${port}`).replace(/\/$/, '');
  const controller = new AbortController();
  const timeoutMs = Math.max(1500, Math.min(15_000, Number(env('CREWCHECK_PARTNER_ROSTER_ACTIVATION_TIMEOUT_MS', '8000')) || 8000));
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${base}/api/platform/rosters/sync`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${requestToken(req)}`,
        'content-type': 'application/json',
        accept: 'application/json',
        'x-crewcheck-internal': 'partner-roster-activation-v1',
      },
      body: JSON.stringify({
        roster: candidate.roster,
        compliance: {},
        gym: [],
        sourceName: sourceName(candidate.row),
      }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      const code = cleanText(payload?.code || `PLATFORM_ROSTER_SYNC_${response.status}`, 100) || 'PLATFORM_ROSTER_SYNC_FAILED';
      const error = new Error(cleanText(payload?.message || 'A ativação canônica da escala não foi confirmada.', 300));
      error.status = response.status >= 400 && response.status < 600 ? response.status : 502;
      error.code = code;
      throw error;
    }
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw Object.assign(new Error('A ativação canônica excedeu o tempo limite.'), { status: 504, code: 'ROSTER_ACTIVATION_TIMEOUT' });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function activateUserImport(req, res, db, id) {
  const user = userIdentity(req);
  await ensurePartnerRosterExchangeTables(db);
  await ensurePartnerRosterActivationTable(db);
  const candidate = await activationCandidate(db, id, user.email);

  // A API B2B nunca chama este caminho. Esta ação exige o JWT do próprio usuário
  // e delega a persistência ao endpoint canônico /api/platform/rosters/sync.
  const platform = await activateThroughCanonicalRosterSync(req, candidate);
  const platformRosterId = cleanText(platform?.saved?.id || platform?.roster?.id || '', 64) || null;
  await db.query(`INSERT INTO crewcheck_partner_roster_activations
    (id,import_id,owner_email,parser_version,roster_key,fingerprint,platform_roster_id)
    VALUES(?,?,?,?,?,?,?)`, [
    crypto.randomUUID(),
    candidate.row.id,
    user.email,
    candidate.attempt.parserVersion || candidate.row.parserVersion || 'unknown',
    candidate.key,
    candidate.fingerprint,
    platformRosterId,
  ]);

  return sendJson(res, 200, {
    ok: true,
    activated: true,
    importId: candidate.row.id,
    rosterKey: candidate.key,
    fingerprint: candidate.fingerprint,
    parserVersion: candidate.attempt.parserVersion || candidate.row.parserVersion || null,
    platformRosterId,
    roster: platform?.roster || null,
    message: 'Escala importada por parceiro ativada pelo próprio usuário através do fluxo canônico do CrewCheck.',
  });
}

export async function handlePartnerRosterActivationRoute(req, res, url) {
  const match = url.pathname.match(/^\/api\/partner-roster-imports\/([0-9a-f-]{36})\/activate$/i);
  if (!match) return false;
  try {
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' });
      return true;
    }
    const db = await dbPool();
    if (!db) {
      sendJson(res, 503, { ok: false, code: 'DATABASE_UNAVAILABLE', message: 'Banco de dados indisponível.' });
      return true;
    }
    await activateUserImport(req, res, db, match[1]);
  } catch (error) {
    const status = Number(error?.status || 500);
    sendJson(res, status >= 400 && status < 600 ? status : 500, {
      ok: false,
      code: error?.code || 'ROSTER_ACTIVATION_ERROR',
      message: status >= 500 ? 'O CrewCheck não conseguiu ativar esta escala agora.' : error?.message || 'Solicitação inválida.',
    });
  }
  return true;
}
