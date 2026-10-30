// PROPOSTA — implementação de referência, não usada em runtime. Exercitada apenas contra banco
// descartável por scripts/regression-roster-revision-sync-proposal.mjs.
//
// Protocolo de escrita por competência com geração monotônica (schema-draft.sql):
//  - toda escrita nomeia a geração que substitui (baseGeneration) e um client_operation_id
//    gravado no aparelho antes do envio;
//  - a linha da competência é travada (FOR UPDATE); geração diferente da base => 409 explícito;
//  - toda decisão tomada sob a trava (aplicada, sem mudança, conflito, recusa) grava UM recibo do
//    operation id, na mesma transação da revisão e da competência; o reenvio (ACK incerto) devolve
//    a resposta ORIGINAL do recibo, nunca o estado atual; o mesmo id com outro pedido é recusado;
//  - conteúdo igual ao atual com base correta é no-op; conteúdo igual com base velha é conflito
//    (hash igual nunca autoriza escrita);
//  - exclusão também avança a geração (tombstone), então nada a ressuscita sem base atual;
//  - cliente legado (sem base/operation id) só cria competência inexistente; conteúdo idêntico ao
//    atual é no-op; sobre competência existente ou excluída recebe 428 e o envio fica PENDENTE
//    (mesma transação), aplicado só por confirmação explícita com geração vista; nunca às cegas;
//  - identidade = conta + tripulante VINCULADO À CONTA por uma fonte autoritativa server-side
//    (resolveVerifiedCrewKey, injetada) + competência + tipo planejada/operada. A matrícula escrita
//    no PDF só precisa coincidir com esse vínculo; sozinha nunca prova identidade. A fonte
//    autoritativa é PRÉ-CONDIÇÃO NÃO IMPLEMENTADA desta proposta: sem ela, nenhuma escrita;
//  - o hash de conteúdo cobre o roster canônico inteiro (base, função, companhia, nome, totais,
//    cobertura da fonte, todos os dias e trechos), após sanitização determinística e versionada;
//    só o ruído declarado (rawText) fica fora. Limites são recusados, nunca truncados;
//  - requestHash vincula ao operationId também versão do parser, do schema e a origem;
//  - escala incompleta é recusada antes de qualquer escrita, preservando a versão válida.
// Nenhuma decisão usa relógio (do cliente ou do servidor).
import crypto from 'node:crypto';

export const PROPOSAL_SCHEMA_VERSION = 1;
const ROSTER_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const KINDS = new Set(['planned', 'operated']);
const SOURCE_KINDS = new Set(['pdf_import', 'telegram', 'legacy_confirmed', 'legacy_backfill']);
const PLACEHOLDER_CREW_IDS = new Set(['000', '0000', '00000', '000000', 'UNKNOWN', 'NA', 'XXX']);

const sha256 = value => crypto.createHash('sha256').update(String(value)).digest('hex');
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function crewKeyFor(crewId) {
  const id = String(crewId || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return id.length >= 3 && id.length <= 40 && !PLACEHOLDER_CREW_IDS.has(id) ? `ID:${id}` : null;
}

// Deterministic, versioned canonical form. Every property is semantically relevant except the
// declared noise: rawText (free text extracted from the PDF, at any level). Nothing is truncated.
export const CONTENT_HASH_VERSION = 'roster-content-v1';
export const ROSTER_NOISE_KEYS = Object.freeze(['rawText']);
export function canonicalRoster(value) {
  if (Array.isArray(value)) return value.map(canonicalRoster);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).filter(key => !ROSTER_NOISE_KEYS.includes(key) && value[key] !== undefined).sort().map(key => [key, canonicalRoster(value[key])]));
  return value;
}
export function rosterContentHash(roster) {
  return sha256(stable({ version: CONTENT_HASH_VERSION, schemaVersion: PROPOSAL_SCHEMA_VERSION, roster: canonicalRoster(roster) }));
}

// Refuses a roster that does not prove the whole competence: every civil day of the month must
// appear exactly once (carry-over days of other months are allowed). Nothing is written on refusal.
export function rosterCompetenceIssue(roster, rosterKey, crewKey) {
  const key = ROSTER_KEY.exec(String(rosterKey || ''));
  if (!key) return 'ROSTER_KEY_INVALID';
  const rosterCrewKey = crewKeyFor(roster?.crewId);
  if (!rosterCrewKey) return 'CREW_IDENTITY_REQUIRED';
  if (rosterCrewKey !== crewKey) return 'CREW_IDENTITY_MISMATCH';
  if (!Array.isArray(roster?.days) || roster.days.length > 370 || roster.days.some(day => Array.isArray(day?.legs) && day.legs.length > 16)) return 'ROSTER_LIMIT_EXCEEDED';
  const year = Number(key[1]), month = Number(key[2]);
  if (Number(roster?.year) !== year || Number(roster?.month) !== month) return 'ROSTER_PERIOD_MISMATCH';
  const length = new Date(Date.UTC(year, month, 0)).getUTCDate(), seen = new Map();
  for (const day of Array.isArray(roster?.days) ? roster.days : []) {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(day?.date || ''));
    if (!match) return 'ROSTER_DAY_INVALID';
    if (Number(match[3]) !== year || Number(match[2]) !== month) continue;
    const civil = Number(match[1]);
    if (civil < 1 || civil > length) return 'ROSTER_DAY_INVALID';
    seen.set(civil, (seen.get(civil) || 0) + 1);
  }
  for (let civil = 1; civil <= length; civil += 1) if (seen.get(civil) !== 1) return 'ROSTER_INCOMPLETE';
  return null;
}

export function legacyOperationId(parts) {
  const hex = sha256(parts.join('|'));
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
const outcome = (status, body) => ({ status, ...body });
const competenceView = row => ({ generation: Number(row?.generation || 0), state: row?.state || 'absent', contentHash: row?.content_hash || null });

// resolveVerifiedCrewKey(email) -> 'ID:...' | null is the authoritative server-side binding of the
// account to one crew member (not implemented in production; injected by tests). The crewKey in
// the request and the crewId printed in the PDF must both match it.
export async function writeRosterRevision(db, request, { resolveVerifiedCrewKey } = {}) {
  const email = String(request?.email || '').trim().toLowerCase();
  const { crewKey, rosterKey, rosterKind = 'operated', operation = 'import', parserVersion = 'unknown', sourceKind = 'pdf_import' } = request || {};
  if (!email) return outcome(401, { code: 'AUTH_REQUIRED' });
  const verifiedCrewKey = typeof resolveVerifiedCrewKey === 'function' ? await resolveVerifiedCrewKey(email) : null;
  if (!verifiedCrewKey) return outcome(403, { code: 'CREW_IDENTITY_UNVERIFIED' });
  if (verifiedCrewKey !== crewKey) return outcome(403, { code: 'CREW_IDENTITY_NOT_BOUND' });
  if (!KINDS.has(rosterKind) || !['import', 'delete'].includes(operation) || !ROSTER_KEY.test(String(rosterKey || '')) || !/^ID:[A-Z0-9]{3,40}$/.test(String(crewKey || ''))) return outcome(400, { code: 'REQUEST_INVALID' });
  const legacy = request.baseGeneration === undefined || request.baseGeneration === null || !request.operationId;
  if (legacy && (operation !== 'import' || request.confirmSubmissionId)) return outcome(428, { code: 'REVISION_PRECONDITION_REQUIRED' });
  if (!legacy && (!Number.isSafeInteger(request.baseGeneration) || request.baseGeneration < 0 || !UUID.test(String(request.operationId)) || !SOURCE_KINDS.has(sourceKind))) return outcome(400, { code: 'REQUEST_INVALID' });
  // Confirming a pending legacy submission: the content is the stored submission, never the request.
  let roster = request?.roster ?? null, submissionId = null;
  if (request.confirmSubmissionId) {
    submissionId = String(request.confirmSubmissionId);
    if (operation !== 'import' || sourceKind !== 'legacy_confirmed' || !UUID.test(submissionId)) return outcome(400, { code: 'REQUEST_INVALID' });
    const stored = (await db.query('SELECT crew_key,roster_key,roster_kind,roster FROM crewcheck_roster_legacy_submissions WHERE owner_email=$1 AND submission_id=$2', [email, submissionId])).rows[0];
    if (!stored || stored.crew_key !== crewKey || stored.roster_key !== rosterKey || stored.roster_kind !== rosterKind) return outcome(404, { code: 'SUBMISSION_NOT_FOUND' });
    roster = typeof stored.roster === 'string' ? JSON.parse(stored.roster) : stored.roster;
  } else if (sourceKind === 'legacy_confirmed') return outcome(400, { code: 'REQUEST_INVALID' });
  // A content refusal is decided under the lock and recorded like any other decision, so its
  // operation id stays bound to this request. Unauthenticated, unbound or malformed requests are
  // refused before any lock and record nothing (they cannot be keyed to a competence safely).
  const issue = operation === 'import' ? rosterCompetenceIssue(roster, rosterKey, crewKey) : null;
  const contentHash = operation === 'import' && !issue ? rosterContentHash(roster) : null;
  const baseGeneration = legacy ? 0 : request.baseGeneration;
  const requestDigest = issue ? sha256(stable(canonicalRoster(roster))) : contentHash;
  // A legacy id derives from everything the request hash binds, so distinct legacy requests never collide.
  const operationId = legacy ? legacyOperationId([email, crewKey, rosterKey, rosterKind, requestDigest, String(parserVersion)]) : String(request.operationId);
  const requestHash = sha256(stable({ crewKey, rosterKey, rosterKind, operation, baseGeneration, contentHash: requestDigest, parserVersion: String(parserVersion), schemaVersion: PROPOSAL_SCHEMA_VERSION, sourceKind: legacy ? 'legacy_create' : sourceKind, submissionId }));
  const where = [email, crewKey, rosterKey, rosterKind];
  // InnoDB may abort one of two transactions racing for the same competence (deadlock), and two
  // transactions deciding one operation id on DISTINCT competences collide on the receipt key
  // (duplicate). The whole transaction rolled back, so it is retried as a unit; on retry the receipt
  // written by the winner decides (replay or OPERATION_ID_REUSED).
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await writeOnce(db, { email, where, crewKey, rosterKey, rosterKind, operation, roster, parserVersion, sourceKind, legacy, issue, contentHash, baseGeneration, operationId, requestHash, submissionId });
    } catch (error) {
      if (!['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT', 'ER_DUP_ENTRY'].includes(error?.code) || attempt >= 5) throw error;
    }
  }
}

const storedResponse = value => (typeof value === 'string' ? JSON.parse(value) : value);

async function recordReceipt(connection, { email, operationId, requestHash, where, outcomeName, response, generation, revisionId = null }) {
  await connection.query(`INSERT INTO crewcheck_roster_operation_receipts(owner_email,client_operation_id,request_hash,crew_key,roster_key,roster_kind,outcome,response,generation_at_decision,revision_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
  [email, operationId, requestHash, where[1], where[2], where[3], outcomeName, JSON.stringify(response), generation, revisionId]);
}

async function writeOnce(db, { email, where, crewKey, rosterKey, rosterKind, operation, roster, parserVersion, sourceKind, legacy, issue, contentHash, baseGeneration, operationId, requestHash, submissionId }) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    // First lock is exclusive (insert or no-op update): no shared lock to upgrade, so concurrent
    // writers of one competence queue instead of deadlocking.
    await client.query('INSERT INTO crewcheck_roster_competences(owner_email,crew_key,roster_key,roster_kind) VALUES($1,$2,$3,$4) ON DUPLICATE KEY UPDATE generation=generation', where);
    const current = (await client.query('SELECT generation,state,content_hash FROM crewcheck_roster_competences WHERE owner_email=$1 AND crew_key=$2 AND roster_key=$3 AND roster_kind=$4 FOR UPDATE', where)).rows[0];
    // Replay authority is the receipt, read after the competence lock (the snapshot starts here, so
    // a receipt committed by the previous lock holder is visible).
    const previous = (await client.query('SELECT request_hash,response FROM crewcheck_roster_operation_receipts WHERE owner_email=$1 AND client_operation_id=$2', [email, operationId])).rows[0];
    if (previous) {
      await client.query('ROLLBACK');
      if (previous.request_hash !== requestHash) return outcome(422, { code: 'OPERATION_ID_REUSED' });
      return { ...storedResponse(previous.response), replay: true };
    }
    // Write fence (rollback): read with a shared lock inside this transaction; a mode switch waits for
    // in-flight writers and every later writer sees it. A fenced write is not a decision: nothing is
    // recorded and the same operation id can be sent again once writes are allowed.
    const fence = (await client.query("SELECT mode FROM crewcheck_roster_write_fence WHERE scope='global' LOCK IN SHARE MODE")).rows[0]?.mode || 'read_only';
    if (fence === 'read_only') {
      await client.query('ROLLBACK');
      return outcome(503, { code: 'WRITES_FENCED', mode: fence });
    }
    const decision = { generation: Number(current.generation) };
    // Receipt, revision, competence change and submission state commit together or not at all.
    const decide = async (outcomeName, response, revisionId = null) => {
      if (submissionId && ['applied', 'unchanged'].includes(outcomeName)) {
        await client.query("UPDATE crewcheck_roster_legacy_submissions SET status='confirmed',resolved_operation_id=$1 WHERE owner_email=$2 AND submission_id=$3 AND status='pending'", [operationId, email, submissionId]);
      }
      await recordReceipt(client, { email, operationId, requestHash, where, outcomeName, response, generation: decision.generation, revisionId });
      await client.query('COMMIT');
      return response;
    };
    if (issue) return await decide('rejected', outcome(422, { code: issue }));
    if (submissionId) {
      // Locked after the competence (same order everywhere): only a still-pending submission can be confirmed.
      const pending = (await client.query('SELECT status FROM crewcheck_roster_legacy_submissions WHERE owner_email=$1 AND submission_id=$2 FOR UPDATE', [email, submissionId])).rows[0];
      if (pending?.status !== 'pending') return await decide('rejected', outcome(409, { code: 'SUBMISSION_NOT_PENDING', current: competenceView(current) }));
    }
    const sameAsCurrent = operation === 'import' && current.state === 'live' && current.content_hash === contentHash;
    const moved = Number(current.generation) !== baseGeneration;
    if (legacy && moved && !sameAsCurrent) {
      // Existing or deleted competence: the legacy content is kept as a pending submission, never applied.
      await client.query(`INSERT IGNORE INTO crewcheck_roster_legacy_submissions(owner_email,submission_id,crew_key,roster_key,roster_kind,content_hash,roster,generation_observed)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [email, operationId, crewKey, rosterKey, rosterKind, contentHash, JSON.stringify(canonicalRoster(roster)), Number(current.generation)]);
      return await decide('rejected', outcome(428, { code: 'REVISION_PRECONDITION_REQUIRED', pendingSubmissionId: operationId, current: competenceView(current) }));
    }
    const conflict = outcome(409, { code: 'ROSTER_REVISION_CONFLICT', current: competenceView(current) });
    if (moved && !legacy) return await decide('conflict', conflict);
    const noop = (operation === 'import' && current.state === 'live' && current.content_hash === contentHash) || (operation === 'delete' && current.state !== 'live');
    const unchanged = outcome(200, { unchanged: true, generation: Number(current.generation), current: competenceView(current) });
    if (noop) return await decide('unchanged', unchanged);
    const generation = Number(current.generation) + 1, revisionId = crypto.randomUUID(), state = operation === 'import' ? 'live' : 'deleted';
    await client.query(`INSERT INTO crewcheck_roster_revisions(revision_id,owner_email,crew_key,roster_key,roster_kind,generation,base_generation,operation,content_hash,roster,parser_version,schema_version,source_kind,client_operation_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [revisionId, email, crewKey, rosterKey, rosterKind, generation, baseGeneration, operation, contentHash, operation === 'import' ? JSON.stringify(canonicalRoster(roster)) : null, String(parserVersion).slice(0, 40), PROPOSAL_SCHEMA_VERSION, legacy ? 'legacy_create' : sourceKind, operationId]);
    const updated = await client.query('UPDATE crewcheck_roster_competences SET generation=$1,state=$2,current_revision_id=$3,content_hash=$4 WHERE owner_email=$5 AND crew_key=$6 AND roster_key=$7 AND roster_kind=$8 AND generation=$9',
      [generation, state, revisionId, contentHash, ...where, baseGeneration]);
    if (updated.rowCount !== 1) throw Object.assign(new Error('competence generation moved under lock'), { code: 'GENERATION_INVARIANT' });
    decision.generation = generation;
    return await decide('applied', outcome(200, { generation, revisionId, current: { generation, state, contentHash } }), revisionId);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// Listing is complete (no LIMIT) and includes tombstones, so a client can tell "deleted on the
// account" from "never uploaded" without guessing from absence.
export async function listRosterCompetences(db, email) {
  const rows = (await db.query('SELECT crew_key,roster_key,roster_kind,generation,state,content_hash FROM crewcheck_roster_competences WHERE owner_email=$1 AND generation>0 ORDER BY roster_key,crew_key,roster_kind', [String(email || '').trim().toLowerCase()])).rows;
  return { complete: true, competences: rows.map(row => ({ crewKey: row.crew_key, rosterKey: row.roster_key, rosterKind: row.roster_kind, ...competenceView(row) })) };
}

export async function readCurrentRoster(db, email, { crewKey, rosterKey, rosterKind = 'operated' }) {
  const row = (await db.query(`SELECT c.generation,c.state,c.content_hash,r.roster FROM crewcheck_roster_competences c
    LEFT JOIN crewcheck_roster_revisions r ON r.revision_id=c.current_revision_id
    WHERE c.owner_email=$1 AND c.crew_key=$2 AND c.roster_key=$3 AND c.roster_kind=$4`, [String(email || '').trim().toLowerCase(), crewKey, rosterKey, rosterKind])).rows[0];
  if (!row) return { generation: 0, state: 'absent', contentHash: null, roster: null };
  const roster = typeof row.roster === 'string' ? JSON.parse(row.roster) : row.roster;
  return { ...competenceView(row), roster: row.state === 'live' ? roster : null };
}

// Pending legacy submissions of the account (what an up-to-date client shows for an explicit choice).
export async function listLegacySubmissions(db, email) {
  const rows = (await db.query("SELECT submission_id,crew_key,roster_key,roster_kind,content_hash,generation_observed FROM crewcheck_roster_legacy_submissions WHERE owner_email=$1 AND status='pending' ORDER BY roster_key,submission_id", [String(email || '').trim().toLowerCase()])).rows;
  return rows.map(row => ({ submissionId: row.submission_id, crewKey: row.crew_key, rosterKey: row.roster_key, rosterKind: row.roster_kind, contentHash: row.content_hash, generationObserved: Number(row.generation_observed) }));
}

// Explicit dismissal keeps the row (status 'dismissed'); only a pending submission can be dismissed.
export async function dismissLegacySubmission(db, { email, submissionId }) {
  const result = await db.query("UPDATE crewcheck_roster_legacy_submissions SET status='dismissed' WHERE owner_email=$1 AND submission_id=$2 AND status='pending'", [String(email || '').trim().toLowerCase(), String(submissionId || '')]);
  return result.rowCount === 1 ? outcome(200, { dismissed: true }) : outcome(409, { code: 'SUBMISSION_NOT_PENDING' });
}

// Backfill rehearsal (proposal, never run against real data): additive and idempotent.
// Reads legacy rows (crewcheck_platform_rosters) by keyset cursor and, for each row:
//  - quarantines it when the account has no authoritative crew binding, the roster's crewId is
//    missing or differs from the binding, or the content is refused (e.g. incomplete month);
//  - otherwise creates the competence ONLY if absent: CAS on base generation 0 with a deterministic
//    operation id per legacy row + fingerprint. A competence with generation > 0 (live or tombstone)
//    is never overwritten or resurrected (409 → skipped_existing). A crash at any point is resumed
//    by running again: applied rows replay their receipt (already_done), nothing is duplicated.
// Only those are decisions about a row. Anything else (write fence, 5xx, an unexpected code) is not:
// the backfill PAUSES before that row — nothing quarantined, cursor left on the last row fully
// processed — and returns { paused }, so resuming from the returned cursor processes it again.
// afterRow(row, report, cursor) runs after each row is fully processed (to persist the cursor).
const CONTENT_REFUSALS = new Set(['ROSTER_KEY_INVALID', 'CREW_IDENTITY_REQUIRED', 'CREW_IDENTITY_MISMATCH', 'ROSTER_LIMIT_EXCEEDED', 'ROSTER_PERIOD_MISMATCH', 'ROSTER_DAY_INVALID', 'ROSTER_INCOMPLETE']);
const FENCE_SHARED = "SELECT mode FROM crewcheck_roster_write_fence WHERE scope='global' LOCK IN SHARE MODE";

// Quarantine is a write too: fenced like any other (only in normal mode), in its own transaction.
async function quarantineLegacyRow(db, { email, row, reason }) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const mode = (await client.query(FENCE_SHARED)).rows[0]?.mode || 'read_only';
    if (mode !== 'normal') {
      await client.query('ROLLBACK');
      return { code: 'WRITES_FENCED', status: 503, mode };
    }
    await client.query('INSERT IGNORE INTO crewcheck_roster_backfill_quarantine(owner_email,legacy_row_id,legacy_fingerprint,reason) VALUES($1,$2,$3,$4)', [email, String(row.id), String(row.fingerprint), reason]);
    await client.query('COMMIT');
    return null;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function backfillLegacyRosters(db, { resolveVerifiedCrewKey, batchSize = 50, cursor = null, afterRow = null } = {}) {
  const report = { created: 0, already_done: 0, skipped_existing: 0, quarantined: 0 };
  let position = cursor;
  for (;;) {
    const limit = Math.max(1, Math.min(500, Math.trunc(Number(batchSize)) || 50));
    const after = position ? 'WHERE (owner_email,roster_key,id) > ($1,$2,$3)' : '';
    const rows = (await db.query(`SELECT id,owner_email,roster_key,roster,fingerprint FROM crewcheck_platform_rosters ${after} ORDER BY owner_email,roster_key,id LIMIT ${limit}`,
      position ? [position.owner_email, position.roster_key, String(position.id)] : [])).rows;
    if (!rows.length) return { report, cursor: position };
    for (const row of rows) {
      const pause = ({ code, status = null, mode = null }) => ({ report, cursor: position, paused: { code, status, mode, legacyRowId: String(row.id) } });
      // Advisory (no lock): no row is started outside normal mode, e.g. during a rollback window. The
      // authoritative fence is the shared lock inside each write and each quarantine.
      const mode = (await db.query("SELECT mode FROM crewcheck_roster_write_fence WHERE scope='global'")).rows[0]?.mode || 'read_only';
      if (mode !== 'normal') return pause({ code: 'WRITES_FENCED', status: 503, mode });
      const email = String(row.owner_email || '').trim().toLowerCase();
      const roster = typeof row.roster === 'string' ? JSON.parse(row.roster) : row.roster;
      const binding = typeof resolveVerifiedCrewKey === 'function' ? await resolveVerifiedCrewKey(email) : null;
      const rosterCrewKey = crewKeyFor(roster?.crewId);
      let refusal = null;
      if (!binding) refusal = 'CREW_IDENTITY_UNVERIFIED';
      else if (!rosterCrewKey) refusal = 'CREW_IDENTITY_REQUIRED';
      else if (rosterCrewKey !== binding) refusal = 'CREW_IDENTITY_NOT_BOUND';
      else if (!ROSTER_KEY.test(String(row.roster_key || ''))) refusal = 'ROSTER_KEY_INVALID';
      else {
        const result = await writeRosterRevision(db, {
          email, crewKey: binding, rosterKey: String(row.roster_key), rosterKind: 'operated', operation: 'import', roster,
          baseGeneration: 0, operationId: legacyOperationId(['legacy_backfill', email, String(row.id), String(row.fingerprint)]),
          sourceKind: 'legacy_backfill', parserVersion: 'legacy-row',
        }, { resolveVerifiedCrewKey });
        if (result.status === 200 && result.replay) report.already_done += 1;
        else if (result.status === 200 && !result.unchanged) report.created += 1;
        else if (result.status === 200 || (result.status === 409 && result.code === 'ROSTER_REVISION_CONFLICT')) report.skipped_existing += 1;
        else if (result.status === 422 && CONTENT_REFUSALS.has(result.code)) refusal = result.code;
        else return pause({ code: String(result.code || `HTTP_${result.status}`), status: result.status, mode: result.mode ?? null });
      }
      if (refusal) {
        const fenced = await quarantineLegacyRow(db, { email, row, reason: refusal });
        if (fenced) return pause(fenced);
        report.quarantined += 1;
      }
      position = { owner_email: row.owner_email, roster_key: row.roster_key, id: row.id };
      if (afterRow) await afterRow(row, report, position);
    }
  }
}

// Rollback fence (proposal). Missing fence row means read_only: fail-closed by default.
export async function setWriteMode(db, mode) {
  if (!['normal', 'fenced_legacy', 'read_only'].includes(mode)) throw new Error('unknown write mode');
  await db.query("INSERT INTO crewcheck_roster_write_fence(scope,mode,fence_epoch) VALUES('global',$1,1) ON DUPLICATE KEY UPDATE mode=VALUES(mode),fence_epoch=fence_epoch+1", [mode]);
}

// Guard the OLD runtime writer must call inside its own transaction while rolled back, before ANY
// write to the account + month in the legacy table. It locks the fence (shared), every competence row
// and the legacy row of the account + month (FOR UPDATE; when absent, InnoDB's gap lock serialises
// two creators), and allows the write only in fenced_legacy mode and only as a CREATION: no
// competence ever managed (generation 0) AND no legacy row yet. So never an overwrite of a live
// competence, never the resurrection of a tombstone, and never a blind upsert on a legacy row that was
// not migrated (or was created earlier in the same window): those answer an error and change nothing.
export async function legacyRuntimeWriteGuard(client, { email, rosterKey }) {
  const owner = String(email || '').trim().toLowerCase();
  const fence = (await client.query(FENCE_SHARED)).rows[0]?.mode || 'read_only';
  if (fence !== 'fenced_legacy') return { allowed: false, code: fence === 'read_only' ? 'WRITES_FENCED' : 'NEW_PROTOCOL_ACTIVE' };
  const managed = (await client.query('SELECT generation,state FROM crewcheck_roster_competences WHERE owner_email=$1 AND roster_key=$2 AND generation>0 FOR UPDATE', [owner, rosterKey])).rows;
  if (managed.length) return { allowed: false, code: managed.some(row => row.state === 'deleted') ? 'TOMBSTONE_FENCED' : 'MANAGED_COMPETENCE_FENCED' };
  const legacyRows = (await client.query('SELECT id FROM crewcheck_platform_rosters WHERE owner_email=$1 AND roster_key=$2 FOR UPDATE', [owner, rosterKey])).rows;
  if (legacyRows.length) return { allowed: false, code: 'LEGACY_ROW_EXISTS_FENCED' };
  return { allowed: true };
}

// Divergences between the legacy table and the new system after a rollback window. Report only:
// nothing is resolved automatically when returning to normal. Both directions are read (legacy rows
// and every managed competence, MySQL has no FULL JOIN), and contents are compared with ONE hash
// family: rosterContentHash (canonical, versioned) computed from the legacy roster and from the
// competence's current revision. The legacy fingerprint (sha256 of the stored JSON text) is another
// family and is never compared. When a comparison is not possible the month is reported as
// 'indeterminate' with a reason, never as conformant. Kinds:
//   legacy_only, canonical_only, legacy_row_on_tombstone, content_differs, indeterminate.
// Not reported: same canonical content, and a tombstone with no legacy row.
const parsedJson = value => {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return undefined; }
};
export async function rollbackDivergenceReport(db) {
  const legacyRows = (await db.query('SELECT owner_email,roster_key,roster,fingerprint FROM crewcheck_platform_rosters ORDER BY owner_email,roster_key')).rows;
  const competenceRows = (await db.query(`SELECT c.owner_email,c.crew_key,c.roster_key,c.roster_kind,c.generation,c.state,c.content_hash,r.roster
    FROM crewcheck_roster_competences c LEFT JOIN crewcheck_roster_revisions r ON r.revision_id=c.current_revision_id
    WHERE c.generation>0 ORDER BY c.owner_email,c.roster_key,c.crew_key,c.roster_kind`)).rows;
  const groupOf = row => `${row.owner_email}\u0000${row.roster_key}`;
  const legacyByGroup = new Map(legacyRows.map(row => [groupOf(row), row]));
  const byGroup = new Map();
  for (const row of competenceRows) byGroup.set(groupOf(row), [...(byGroup.get(groupOf(row)) || []), row]);
  const divergences = [];
  const report = (row, kind, { competence = null, reason = null } = {}) => divergences.push({ ownerEmail: row.owner_email, rosterKey: row.roster_key, kind, crewKey: competence?.crew_key ?? null, rosterKind: competence?.roster_kind ?? null, reason });
  const indeterminate = (legacy, reason, { competence = null } = {}) => report(legacy, 'indeterminate', { competence, reason });
  for (const legacy of legacyRows) {
    const competences = byGroup.get(groupOf(legacy)) || [];
    const live = competences.filter(row => row.state === 'live');
    if (!competences.length) { report(legacy, 'legacy_only'); continue; }
    if (!live.length) { report(legacy, 'legacy_row_on_tombstone', { competence: competences[0] }); continue; }
    // The legacy table has one row per account + month, without crew or planned/operated: it maps to
    // a competence only when the month has exactly one managed competence.
    if (competences.length !== 1) { indeterminate(legacy, 'COMPETENCE_MAPPING_AMBIGUOUS'); continue; }
    const competence = live[0];
    const legacyRoster = parsedJson(legacy.roster);
    if (!legacyRoster || typeof legacyRoster !== 'object' || Array.isArray(legacyRoster)) { indeterminate(legacy, 'LEGACY_ROSTER_UNREADABLE'); continue; }
    const canonicalRosterValue = parsedJson(competence.roster);
    if (!canonicalRosterValue || typeof canonicalRosterValue !== 'object') { indeterminate(legacy, 'CANONICAL_ROSTER_UNREADABLE', { competence }); continue; }
    const canonicalHash = rosterContentHash(canonicalRosterValue);
    if (canonicalHash !== competence.content_hash) { indeterminate(legacy, 'CANONICAL_CONTENT_HASH_MISMATCH', { competence }); continue; }
    const legacyCrewKey = crewKeyFor(legacyRoster.crewId);
    if (!legacyCrewKey) { indeterminate(legacy, 'LEGACY_CREW_IDENTITY_REQUIRED', { competence }); continue; }
    if (legacyCrewKey !== competence.crew_key) { report(legacy, 'content_differs', { competence, reason: 'CREW_KEY_DIFFERS' }); continue; }
    const legacyHash = rosterContentHash(legacyRoster);
    if (legacyHash !== canonicalHash) report(legacy, 'content_differs', { competence });
  }
  for (const [group, competences] of byGroup) if (!legacyByGroup.has(group)) {
    for (const competence of competences) if (competence.state === 'live') report(competence, 'canonical_only', { competence });
  }
  return divergences.sort((a, b) => [a.ownerEmail, a.rosterKey, a.kind, a.crewKey || '', a.rosterKind || ''].join('\u0000').localeCompare([b.ownerEmail, b.rosterKey, b.kind, b.crewKey || '', b.rosterKind || ''].join('\u0000')));
}
