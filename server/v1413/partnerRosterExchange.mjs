import crypto from 'node:crypto';
import { parsePdfOnServer } from '../rosterParser.mjs';
import {
  cleanText,
  dbPool,
  env,
  flag,
  readBody,
  requestToken,
  safeEmail,
  sendJson,
  sha256,
  verifyJwt,
} from '../v139/common.mjs';
import { authenticatePartnerApi, writeRateHeaders } from './partnerGateApi.mjs';

const LINK_PREFIX = 'rlnk_';
const DEFAULT_LINK_DAYS = 30;
const MAX_LINK_DAYS = 90;
const MAX_ACTIVE_LINKS = 10;
const DEFAULT_MAX_PDF_BYTES = 8 * 1024 * 1024;
const MAX_CONFIGURED_PDF_BYTES = 20 * 1024 * 1024;
const PARSER_FAMILY = 'server-roster-parser-v3';

function rosterEncryptionKey() {
  const secret = env('CREWCHECK_PARTNER_ROSTER_ENCRYPTION_KEY', env('CREWCHECK_DATA_ENCRYPTION_KEY'));
  if (!secret) {
    throw Object.assign(new Error('Criptografia de escala de parceiro não configurada.'), {
      status: 503,
      code: 'ROSTER_ENCRYPTION_UNAVAILABLE',
    });
  }
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

export function partnerRosterParserVersion() {
  const commit = env('RENDER_GIT_COMMIT', env('GIT_COMMIT'))
    .replace(/[^a-f0-9]/gi, '')
    .slice(0, 12);
  return `${PARSER_FAMILY}@${commit || 'unknown'}`;
}

export function partnerRosterMaxPdfBytes() {
  const configured = Number(env('CREWCHECK_PARTNER_ROSTER_MAX_PDF_BYTES', String(DEFAULT_MAX_PDF_BYTES)));
  if (!Number.isFinite(configured)) return DEFAULT_MAX_PDF_BYTES;
  return Math.max(512_000, Math.min(MAX_CONFIGURED_PDF_BYTES, Math.floor(configured)));
}

export function normalizeRosterLinkToken(value = '') {
  const token = String(value || '').trim();
  return /^rlnk_[A-Za-z0-9_-]{32,}$/.test(token) ? token : '';
}

export function decodePartnerRosterPdf(dataBase64 = '') {
  const payload = String(dataBase64 || '').trim();
  if (!payload) return Buffer.alloc(0);
  const comma = payload.indexOf(',');
  const raw = payload.startsWith('data:') && comma >= 0 ? payload.slice(comma + 1) : payload;
  const compact = raw.replace(/\s+/g, '');
  if (!compact || !/^[A-Za-z0-9+/_=-]+$/.test(compact)) return Buffer.alloc(0);
  try {
    const normalized = compact.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(normalized, 'base64');
  } catch {
    return Buffer.alloc(0);
  }
}

export function encryptPartnerRosterPayload(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value || ''), 'utf8');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', rosterEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptPartnerRosterPayload(value) {
  const [version, ivRaw, tagRaw, dataRaw] = String(value || '').split('.');
  if (version !== 'v1' || !ivRaw || !tagRaw || !dataRaw) throw new Error('ROSTER_CIPHERTEXT_FORMAT');
  const decipher = crypto.createDecipheriv('aes-256-gcm', rosterEncryptionKey(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataRaw, 'base64url')), decipher.final()]);
}

function encryptJson(value) {
  return encryptPartnerRosterPayload(Buffer.from(JSON.stringify(value), 'utf8'));
}

function decryptJson(value) {
  return JSON.parse(decryptPartnerRosterPayload(value).toString('utf8'));
}

function linkTokenMaterial() {
  const token = `${LINK_PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
  return { token, tokenHash: sha256(token), tokenPrefix: token.slice(0, 18) };
}

function userIdentity(req) {
  const payload = verifyJwt(requestToken(req));
  const email = safeEmail(payload?.email);
  if (!payload || !email) {
    throw Object.assign(new Error('Faça login para gerenciar a integração de escala.'), {
      status: 401,
      code: 'AUTH_REQUIRED',
    });
  }
  return { payload, email };
}

function safeFilename(value = '') {
  return cleanText(value || 'escala.pdf', 180).replace(/[\\/]+/g, '_') || 'escala.pdf';
}

function externalId(req, body = {}) {
  const raw = cleanText(body.externalId || req.headers['idempotency-key'] || '', 160);
  return raw && /^[A-Za-z0-9._:@+-]{1,160}$/.test(raw) ? raw : '';
}

function optionalDate(value) {
  if (!value) return null;
  const time = Date.parse(String(value));
  return Number.isFinite(time) ? new Date(time) : null;
}

function parseJson(value, fallback = null) {
  if (value && typeof value === 'object') return value;
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function summaryFromParse(roster = {}, diagnostics = {}) {
  const days = Array.isArray(roster?.days) ? roster.days : [];
  return {
    sourceFormat: cleanText(diagnostics?.sourceFormat, 40) || null,
    month: Number(roster?.month || 0) || null,
    year: Number(roster?.year || 0) || null,
    base: cleanText(roster?.base, 8) || null,
    rank: cleanText(roster?.rank, 40) || null,
    events: days.length,
    flights: Number(diagnostics?.flights || days.reduce((sum, day) => sum + (Array.isArray(day?.legs) ? day.legs.length : 0), 0)),
    confidence: cleanText(diagnostics?.confidence, 24) || null,
  };
}

function publicImportRow(row = {}) {
  return {
    id: String(row.id || ''),
    externalId: row.externalId || null,
    source: row.sourceName || 'partner',
    filename: row.filename || null,
    mimeType: row.mimeType || 'application/pdf',
    fileSha256: row.fileSha256 || null,
    fileSizeBytes: Number(row.fileSizeBytes || 0),
    parseStatus: row.parseStatus || 'received',
    parserVersion: row.parserVersion || null,
    summary: parseJson(row.summaryJson, null),
    sourceDocumentCreatedAt: row.sourceDocumentCreatedAt || null,
    receivedAt: row.receivedAt || null,
    parsedAt: row.parsedAt || null,
  };
}

export async function ensurePartnerRosterExchangeTables(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS crewcheck_partner_roster_links (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    owner_email VARCHAR(254) NOT NULL,
    token_prefix VARCHAR(24) NOT NULL,
    token_hash CHAR(64) NOT NULL,
    bound_api_key_id BIGINT UNSIGNED NULL,
    label VARCHAR(120) NULL,
    expected_crew_id VARCHAR(40) NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    expires_at TIMESTAMP(3) NOT NULL,
    last_used_at TIMESTAMP(3) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    revoked_at TIMESTAMP(3) NULL,
    UNIQUE KEY uq_partner_roster_link_hash (token_hash),
    KEY idx_partner_roster_link_owner (owner_email,active,expires_at),
    KEY idx_partner_roster_link_partner (bound_api_key_id,active)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await db.query(`CREATE TABLE IF NOT EXISTS crewcheck_partner_roster_imports (
    id CHAR(36) NOT NULL PRIMARY KEY,
    api_key_id BIGINT UNSIGNED NOT NULL,
    link_id BIGINT UNSIGNED NOT NULL,
    owner_email VARCHAR(254) NOT NULL,
    external_id VARCHAR(160) NOT NULL,
    source_name VARCHAR(120) NOT NULL,
    authorization_reference VARCHAR(180) NOT NULL,
    filename VARCHAR(180) NOT NULL,
    mime_type VARCHAR(80) NOT NULL DEFAULT 'application/pdf',
    file_sha256 CHAR(64) NOT NULL,
    file_size_bytes INT UNSIGNED NOT NULL,
    raw_ciphertext LONGTEXT NOT NULL,
    source_document_created_at TIMESTAMP(3) NULL,
    parse_status VARCHAR(32) NOT NULL DEFAULT 'received',
    parser_version VARCHAR(120) NULL,
    summary_json LONGTEXT NULL,
    parse_error VARCHAR(500) NULL,
    received_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    parsed_at TIMESTAMP(3) NULL,
    UNIQUE KEY uq_partner_roster_external (api_key_id,external_id),
    UNIQUE KEY uq_partner_roster_owner_file (owner_email,file_sha256),
    KEY idx_partner_roster_owner_received (owner_email,received_at),
    KEY idx_partner_roster_link_received (link_id,received_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await db.query(`CREATE TABLE IF NOT EXISTS crewcheck_partner_roster_parse_attempts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    import_id CHAR(36) NOT NULL,
    parser_version VARCHAR(120) NOT NULL,
    parse_status VARCHAR(32) NOT NULL,
    parsed_ciphertext LONGTEXT NULL,
    diagnostics_json LONGTEXT NULL,
    summary_json LONGTEXT NULL,
    parse_error VARCHAR(500) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_partner_roster_parse_import (import_id,id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

async function latestKnownCrewId(db, email) {
  try {
    const [rows] = await db.query(`SELECT JSON_UNQUOTE(JSON_EXTRACT(roster,'$.crewId')) AS crewId
      FROM crewcheck_platform_rosters
      WHERE owner_email=? AND active=1
      ORDER BY updated_at DESC LIMIT 1`, [email]);
    return cleanText(rows[0]?.crewId, 40) || null;
  } catch {
    return null;
  }
}

async function issueRosterLink(req, res, db) {
  const user = userIdentity(req);
  const body = await readBody(req, 50_000);
  const requestedDays = Number(body.expiresInDays || DEFAULT_LINK_DAYS);
  const expiresInDays = Number.isFinite(requestedDays)
    ? Math.max(1, Math.min(MAX_LINK_DAYS, Math.floor(requestedDays)))
    : DEFAULT_LINK_DAYS;
  const label = cleanText(body.label || 'Integração de escala', 120) || 'Integração de escala';
  await ensurePartnerRosterExchangeTables(db);
  const [counts] = await db.query(`SELECT COUNT(*) AS total FROM crewcheck_partner_roster_links
    WHERE owner_email=? AND active=1 AND expires_at>CURRENT_TIMESTAMP(3)`, [user.email]);
  if (Number(counts[0]?.total || 0) >= MAX_ACTIVE_LINKS) {
    return sendJson(res, 429, { ok: false, code: 'TOO_MANY_ROSTER_LINKS', message: 'Revogue um vínculo antigo antes de criar outro.' });
  }
  const material = linkTokenMaterial();
  const expectedCrewId = await latestKnownCrewId(db, user.email);
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60_000);
  const [result] = await db.query(`INSERT INTO crewcheck_partner_roster_links
    (owner_email,token_prefix,token_hash,label,expected_crew_id,expires_at)
    VALUES(?,?,?,?,?,?)`, [user.email, material.tokenPrefix, material.tokenHash, label, expectedCrewId, expiresAt]);
  return sendJson(res, 201, {
    ok: true,
    message: 'Vínculo criado. O token completo é exibido apenas nesta resposta e pode ser revogado a qualquer momento.',
    linkToken: material.token,
    link: {
      id: Number(result.insertId),
      label,
      tokenPrefix: material.tokenPrefix,
      expiresAt: expiresAt.toISOString(),
      partnerBound: false,
      crewIdentityPinned: Boolean(expectedCrewId),
      active: true,
    },
  });
}

async function listRosterLinks(req, res, db) {
  const user = userIdentity(req);
  await ensurePartnerRosterExchangeTables(db);
  const [rows] = await db.query(`SELECT l.id,l.label,l.token_prefix AS tokenPrefix,l.active,l.expires_at AS expiresAt,
    l.last_used_at AS lastUsedAt,l.created_at AS createdAt,l.revoked_at AS revokedAt,
    l.bound_api_key_id AS boundApiKeyId,l.expected_crew_id AS expectedCrewId,k.label AS partnerLabel,k.key_prefix AS partnerKeyPrefix
    FROM crewcheck_partner_roster_links l
    LEFT JOIN crewcheck_partner_api_keys k ON k.id=l.bound_api_key_id
    WHERE l.owner_email=? ORDER BY l.id DESC LIMIT 50`, [user.email]);
  return sendJson(res, 200, {
    ok: true,
    links: rows.map((row) => ({
      id: Number(row.id),
      label: row.label || null,
      tokenPrefix: row.tokenPrefix,
      active: Boolean(row.active) && (!row.expiresAt || Date.parse(row.expiresAt) > Date.now()),
      expiresAt: row.expiresAt,
      lastUsedAt: row.lastUsedAt,
      createdAt: row.createdAt,
      revokedAt: row.revokedAt,
      partnerBound: Boolean(row.boundApiKeyId),
      partnerLabel: row.partnerLabel || null,
      partnerKeyPrefix: row.partnerKeyPrefix || null,
      crewIdentityPinned: Boolean(row.expectedCrewId),
    })),
  });
}

async function revokeRosterLink(req, res, db, id) {
  const user = userIdentity(req);
  await ensurePartnerRosterExchangeTables(db);
  const [result] = await db.query(`UPDATE crewcheck_partner_roster_links
    SET active=0,revoked_at=CURRENT_TIMESTAMP(3)
    WHERE id=? AND owner_email=? AND active=1`, [Number(id), user.email]);
  return sendJson(res, result.affectedRows ? 200 : 404, result.affectedRows
    ? { ok: true, message: 'Vínculo de importação revogado.' }
    : { ok: false, code: 'ROSTER_LINK_NOT_FOUND', message: 'Vínculo ativo não localizado.' });
}

async function resolveRosterLink(connection, token, apiKeyId) {
  const tokenHash = sha256(token);
  const [rows] = await connection.query(`SELECT id,owner_email AS ownerEmail,bound_api_key_id AS boundApiKeyId,
    expected_crew_id AS expectedCrewId,active,expires_at AS expiresAt
    FROM crewcheck_partner_roster_links WHERE token_hash=? LIMIT 1 FOR UPDATE`, [tokenHash]);
  const link = rows[0];
  if (!link || !link.active || !link.expiresAt || Date.parse(link.expiresAt) <= Date.now()) {
    throw Object.assign(new Error('Vínculo de escala inválido, expirado ou revogado.'), { status: 403, code: 'INVALID_ROSTER_LINK' });
  }
  if (link.boundApiKeyId && Number(link.boundApiKeyId) !== Number(apiKeyId)) {
    throw Object.assign(new Error('Este vínculo já está associado a outro parceiro.'), { status: 403, code: 'ROSTER_LINK_PARTNER_MISMATCH' });
  }
  if (!link.boundApiKeyId) {
    await connection.query('UPDATE crewcheck_partner_roster_links SET bound_api_key_id=? WHERE id=? AND bound_api_key_id IS NULL', [apiKeyId, link.id]);
  }
  return { ...link, boundApiKeyId: Number(link.boundApiKeyId || apiKeyId) };
}

async function findDuplicateImport(connection, credentialId, ownerEmail, idempotencyId, fileHash) {
  const [byExternal] = await connection.query(`SELECT id,file_sha256 AS fileSha256,parse_status AS parseStatus
    FROM crewcheck_partner_roster_imports WHERE api_key_id=? AND external_id=? LIMIT 1`, [credentialId, idempotencyId]);
  if (byExternal[0]) {
    if (String(byExternal[0].fileSha256) !== String(fileHash)) {
      throw Object.assign(new Error('O mesmo externalId já foi usado para outro arquivo.'), { status: 409, code: 'IDEMPOTENCY_CONFLICT' });
    }
    return byExternal[0];
  }
  const [byFile] = await connection.query(`SELECT id,file_sha256 AS fileSha256,parse_status AS parseStatus
    FROM crewcheck_partner_roster_imports WHERE owner_email=? AND file_sha256=? LIMIT 1`, [ownerEmail, fileHash]);
  return byFile[0] || null;
}

async function importRow(db, id, ownerEmail = null, apiKeyId = null) {
  const clauses = ['id=?'];
  const params = [id];
  if (ownerEmail) { clauses.push('owner_email=?'); params.push(ownerEmail); }
  if (apiKeyId) { clauses.push('api_key_id=?'); params.push(apiKeyId); }
  const [rows] = await db.query(`SELECT id,external_id AS externalId,source_name AS sourceName,filename,mime_type AS mimeType,
    file_sha256 AS fileSha256,file_size_bytes AS fileSizeBytes,parse_status AS parseStatus,parser_version AS parserVersion,
    summary_json AS summaryJson,source_document_created_at AS sourceDocumentCreatedAt,received_at AS receivedAt,parsed_at AS parsedAt,
    raw_ciphertext AS rawCiphertext,link_id AS linkId,owner_email AS ownerEmail,api_key_id AS apiKeyId
    FROM crewcheck_partner_roster_imports WHERE ${clauses.join(' AND ')} LIMIT 1`, params);
  return rows[0] || null;
}

async function recordParseAttempt(db, record, link = {}) {
  const version = partnerRosterParserVersion();
  let parseStatus = 'parse_failed';
  let parsedCiphertext = null;
  let diagnostics = null;
  let summary = null;
  let parseError = null;
  let detectedCrewId = '';
  try {
    const parsed = await parsePdfOnServer({ filename: record.filename, dataBase64: record.dataBase64 });
    const roster = parsed?.roster || {};
    diagnostics = parsed?.diagnostics || {};
    if (!Array.isArray(roster?.days) || !roster.days.length) throw new Error('ROSTER_WITHOUT_EVENTS');
    detectedCrewId = cleanText(roster?.crewId, 40);
    const expectedCrewId = cleanText(link?.expectedCrewId, 40);
    if (expectedCrewId && !detectedCrewId) parseStatus = 'identity_unverified';
    else if (expectedCrewId && detectedCrewId !== expectedCrewId) parseStatus = 'identity_mismatch';
    else parseStatus = 'parsed';
    parsedCiphertext = encryptJson({ roster, diagnostics });
    summary = summaryFromParse(roster, diagnostics);
    if (!expectedCrewId && detectedCrewId) {
      await db.query(`UPDATE crewcheck_partner_roster_links SET expected_crew_id=?
        WHERE id=? AND expected_crew_id IS NULL`, [detectedCrewId, record.linkId]);
    }
  } catch (error) {
    parseStatus = 'parse_failed';
    parseError = cleanText(error?.code || error?.message || 'PARSER_ERROR', 500) || 'PARSER_ERROR';
  }
  await db.query(`INSERT INTO crewcheck_partner_roster_parse_attempts
    (import_id,parser_version,parse_status,parsed_ciphertext,diagnostics_json,summary_json,parse_error)
    VALUES(?,?,?,?,?,?,?)`, [
    record.importId,
    version,
    parseStatus,
    parsedCiphertext,
    diagnostics ? JSON.stringify(diagnostics) : null,
    summary ? JSON.stringify(summary) : null,
    parseError,
  ]);
  await db.query(`UPDATE crewcheck_partner_roster_imports SET parse_status=?,parser_version=?,summary_json=?,parse_error=?,parsed_at=CURRENT_TIMESTAMP(3)
    WHERE id=?`, [parseStatus, version, summary ? JSON.stringify(summary) : null, parseError, record.importId]);
  return { parseStatus, parserVersion: version, summary, parseError, detectedCrewId: Boolean(detectedCrewId) };
}

async function createPartnerRosterImport(req, res, db) {
  const credential = await authenticatePartnerApi(req, db, 'rosters:write');
  writeRateHeaders(res, credential.rate);
  if (!flag('CREWCHECK_PARTNER_ROSTER_IMPORT_ENABLED', false)) {
    return sendJson(res, 503, { ok: false, code: 'PARTNER_ROSTER_IMPORT_DISABLED', message: 'A importação de escala por parceiros ainda não foi habilitada.' });
  }
  await ensurePartnerRosterExchangeTables(db);
  const maxBytes = partnerRosterMaxPdfBytes();
  const bodyLimit = Math.min(32_000_000, Math.ceil(maxBytes * 1.45) + 300_000);
  const body = await readBody(req, bodyLimit);
  const token = normalizeRosterLinkToken(body.linkToken);
  const idempotencyId = externalId(req, body);
  const authorizationReference = cleanText(body.authorizationReference || body.authorizationRef || '', 180);
  const filename = safeFilename(body.filename || body.sourceFileName);
  const mimeType = cleanText(body.mimeType || body.contentType || 'application/pdf', 80).toLowerCase();
  const sourceDocumentCreatedAt = optionalDate(body.sourceDocumentCreatedAt || body.documentCreatedAt);
  if (!token) return sendJson(res, 400, { ok: false, code: 'INVALID_ROSTER_LINK', message: 'Informe um linkToken CrewCheck válido.' });
  if (!idempotencyId) return sendJson(res, 400, { ok: false, code: 'IDEMPOTENCY_REQUIRED', message: 'Informe externalId ou o header Idempotency-Key.' });
  if (!authorizationReference) return sendJson(res, 400, { ok: false, code: 'AUTHORIZATION_REFERENCE_REQUIRED', message: 'Informe a referência de autorização do usuário para esta exportação.' });
  if (mimeType !== 'application/pdf') return sendJson(res, 415, { ok: false, code: 'PDF_REQUIRED', message: 'A integração aceita somente application/pdf.' });
  if ((body.sourceDocumentCreatedAt || body.documentCreatedAt) && !sourceDocumentCreatedAt) return sendJson(res, 400, { ok: false, code: 'INVALID_DOCUMENT_DATE', message: 'Data do documento inválida.' });
  const pdfBytes = decodePartnerRosterPdf(body.dataBase64 || body.sourceFileDataBase64);
  if (!pdfBytes.length || pdfBytes.subarray(0, 5).toString('utf8') !== '%PDF-') {
    return sendJson(res, 400, { ok: false, code: 'INVALID_PDF', message: 'O conteúdo recebido não é um PDF válido.' });
  }
  if (pdfBytes.length > maxBytes) {
    return sendJson(res, 413, { ok: false, code: 'PDF_TOO_LARGE', message: `PDF maior que o limite de ${maxBytes} bytes.` });
  }
  const fileHash = crypto.createHash('sha256').update(pdfBytes).digest('hex');
  const rawCiphertext = encryptPartnerRosterPayload(pdfBytes);
  const importId = crypto.randomUUID();
  const sourceName = cleanText(credential.label || credential.partnerEmail || 'partner', 120) || 'partner';
  const connection = await db.getConnection();
  let link;
  let duplicate = null;
  try {
    await connection.beginTransaction();
    link = await resolveRosterLink(connection, token, credential.id);
    duplicate = await findDuplicateImport(connection, credential.id, link.ownerEmail, idempotencyId, fileHash);
    if (!duplicate) {
      await connection.query(`INSERT INTO crewcheck_partner_roster_imports
        (id,api_key_id,link_id,owner_email,external_id,source_name,authorization_reference,filename,mime_type,file_sha256,file_size_bytes,raw_ciphertext,source_document_created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
        importId,
        credential.id,
        link.id,
        link.ownerEmail,
        idempotencyId,
        sourceName,
        authorizationReference,
        filename,
        mimeType,
        fileHash,
        pdfBytes.length,
        rawCiphertext,
        sourceDocumentCreatedAt,
      ]);
      await connection.query('UPDATE crewcheck_partner_roster_links SET last_used_at=CURRENT_TIMESTAMP(3) WHERE id=?', [link.id]);
    }
    await connection.commit();
  } catch (error) {
    try { await connection.rollback(); } catch {}
    throw error;
  } finally {
    connection.release();
  }
  if (duplicate) {
    const existing = await importRow(db, duplicate.id, null, credential.id);
    return sendJson(res, 200, { ok: true, duplicate: true, import: publicImportRow(existing || duplicate) });
  }
  const parse = await recordParseAttempt(db, {
    importId,
    linkId: link.id,
    filename,
    dataBase64: pdfBytes.toString('base64'),
  }, link);
  const stored = await importRow(db, importId, null, credential.id);
  const accepted = parse.parseStatus !== 'parsed';
  return sendJson(res, accepted ? 202 : 201, {
    ok: true,
    stored: true,
    parsed: parse.parseStatus === 'parsed',
    message: parse.parseStatus === 'parsed'
      ? 'PDF raw preservado e interpretado pelo parser CrewCheck.'
      : 'PDF raw preservado. A interpretação ficou em quarentena para revisão/reprocessamento.',
    import: publicImportRow(stored),
  });
}

async function partnerImportStatus(req, res, db, id) {
  const credential = await authenticatePartnerApi(req, db, 'rosters:write');
  writeRateHeaders(res, credential.rate);
  await ensurePartnerRosterExchangeTables(db);
  const row = await importRow(db, id, null, credential.id);
  return sendJson(res, row ? 200 : 404, row
    ? { ok: true, import: publicImportRow(row) }
    : { ok: false, code: 'ROSTER_IMPORT_NOT_FOUND', message: 'Importação não localizada.' });
}

async function listUserImports(req, res, db) {
  const user = userIdentity(req);
  await ensurePartnerRosterExchangeTables(db);
  const limit = Math.max(1, Math.min(100, Number(new URL(req.url, 'http://localhost').searchParams.get('limit') || 30)));
  const [rows] = await db.query(`SELECT id,external_id AS externalId,source_name AS sourceName,filename,mime_type AS mimeType,
    file_sha256 AS fileSha256,file_size_bytes AS fileSizeBytes,parse_status AS parseStatus,parser_version AS parserVersion,
    summary_json AS summaryJson,source_document_created_at AS sourceDocumentCreatedAt,received_at AS receivedAt,parsed_at AS parsedAt
    FROM crewcheck_partner_roster_imports WHERE owner_email=? ORDER BY received_at DESC LIMIT ?`, [user.email, limit]);
  return sendJson(res, 200, { ok: true, imports: rows.map(publicImportRow) });
}

async function userImportDetail(req, res, db, id) {
  const user = userIdentity(req);
  await ensurePartnerRosterExchangeTables(db);
  const row = await importRow(db, id, user.email, null);
  if (!row) return sendJson(res, 404, { ok: false, code: 'ROSTER_IMPORT_NOT_FOUND', message: 'Importação não localizada.' });
  const result = { ok: true, import: publicImportRow(row), data: null };
  if (row.parseStatus === 'parsed') {
    const [attempts] = await db.query(`SELECT parsed_ciphertext AS parsedCiphertext FROM crewcheck_partner_roster_parse_attempts
      WHERE import_id=? AND parse_status='parsed' AND parsed_ciphertext IS NOT NULL ORDER BY id DESC LIMIT 1`, [row.id]);
    if (attempts[0]?.parsedCiphertext) result.data = decryptJson(attempts[0].parsedCiphertext);
  }
  return sendJson(res, 200, result);
}

async function latestUserImport(req, res, db) {
  const user = userIdentity(req);
  await ensurePartnerRosterExchangeTables(db);
  const [rows] = await db.query(`SELECT id FROM crewcheck_partner_roster_imports
    WHERE owner_email=? AND parse_status='parsed' ORDER BY received_at DESC LIMIT 1`, [user.email]);
  if (!rows[0]) return sendJson(res, 404, { ok: false, code: 'ROSTER_IMPORT_NOT_FOUND', message: 'Nenhuma escala importada por parceiro está pronta.' });
  return userImportDetail(req, res, db, rows[0].id);
}

async function reprocessUserImport(req, res, db, id) {
  const user = userIdentity(req);
  await ensurePartnerRosterExchangeTables(db);
  const row = await importRow(db, id, user.email, null);
  if (!row) return sendJson(res, 404, { ok: false, code: 'ROSTER_IMPORT_NOT_FOUND', message: 'Importação não localizada.' });
  const [links] = await db.query('SELECT expected_crew_id AS expectedCrewId FROM crewcheck_partner_roster_links WHERE id=? LIMIT 1', [row.linkId]);
  const raw = decryptPartnerRosterPayload(row.rawCiphertext);
  const parse = await recordParseAttempt(db, {
    importId: row.id,
    linkId: row.linkId,
    filename: row.filename,
    dataBase64: raw.toString('base64'),
  }, links[0] || {});
  const refreshed = await importRow(db, row.id, user.email, null);
  return sendJson(res, 200, {
    ok: true,
    message: parse.parseStatus === 'parsed' ? 'PDF raw reprocessado com o parser CrewCheck atual.' : 'Nova tentativa registrada; o arquivo raw original permaneceu intacto.',
    import: publicImportRow(refreshed),
  });
}

export async function handlePartnerRosterExchangeRoute(req, res, url) {
  const partnerCollection = url.pathname === '/api/v1/roster-imports';
  const partnerItem = url.pathname.match(/^\/api\/v1\/roster-imports\/([0-9a-f-]{36})$/i);
  const userLinks = url.pathname === '/api/partner-roster-links';
  const userLinkItem = url.pathname.match(/^\/api\/partner-roster-links\/(\d+)$/);
  const userImports = url.pathname === '/api/partner-roster-imports';
  const userLatest = url.pathname === '/api/partner-roster-imports/latest';
  const userReprocess = url.pathname.match(/^\/api\/partner-roster-imports\/([0-9a-f-]{36})\/reprocess$/i);
  const userImportItem = url.pathname.match(/^\/api\/partner-roster-imports\/([0-9a-f-]{36})$/i);
  if (!partnerCollection && !partnerItem && !userLinks && !userLinkItem && !userImports && !userLatest && !userReprocess && !userImportItem) return false;

  try {
    const db = await dbPool();
    if (!db) return sendJson(res, 503, { ok: false, code: 'DATABASE_UNAVAILABLE', message: 'Banco de dados indisponível.' }), true;
    if (partnerCollection) {
      if (req.method !== 'POST') sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' });
      else await createPartnerRosterImport(req, res, db);
    } else if (partnerItem) {
      if (req.method !== 'GET') sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' });
      else await partnerImportStatus(req, res, db, partnerItem[1]);
    } else if (userLinks) {
      if (req.method === 'POST') await issueRosterLink(req, res, db);
      else if (req.method === 'GET') await listRosterLinks(req, res, db);
      else sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' });
    } else if (userLinkItem) {
      if (req.method !== 'DELETE') sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' });
      else await revokeRosterLink(req, res, db, userLinkItem[1]);
    } else if (userImports) {
      if (req.method !== 'GET') sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' });
      else await listUserImports(req, res, db);
    } else if (userLatest) {
      if (req.method !== 'GET') sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' });
      else await latestUserImport(req, res, db);
    } else if (userReprocess) {
      if (req.method !== 'POST') sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' });
      else await reprocessUserImport(req, res, db, userReprocess[1]);
    } else if (userImportItem) {
      if (req.method !== 'GET') sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' });
      else await userImportDetail(req, res, db, userImportItem[1]);
    }
  } catch (error) {
    const status = Number(error?.status || 500);
    if (error?.rate) writeRateHeaders(res, error.rate);
    sendJson(res, status >= 400 && status < 600 ? status : 500, {
      ok: false,
      code: error?.code || 'PARTNER_ROSTER_ERROR',
      message: status >= 500 ? 'O CrewCheck não conseguiu concluir esta operação agora.' : error?.message || 'Solicitação inválida.',
    });
  }
  return true;
}
