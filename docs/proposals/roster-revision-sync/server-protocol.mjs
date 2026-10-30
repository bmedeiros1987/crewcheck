// PROPOSTA — implementação de referência, não usada em runtime. Exercitada apenas contra banco
// descartável por scripts/regression-roster-revision-sync-proposal.mjs.
//
// Protocolo de escrita por competência com geração monotônica (schema-draft.sql):
//  - toda escrita nomeia a geração que substitui (baseGeneration) e um client_operation_id
//    gravado no aparelho antes do envio;
//  - a linha da competência é travada (FOR UPDATE); geração diferente da base => 409 explícito;
//  - o mesmo operation id reenviado (ACK incerto) devolve o resultado gravado, sem nova escrita;
//  - conteúdo igual ao atual com base correta é no-op; conteúdo igual com base velha é conflito
//    (hash igual nunca autoriza escrita);
//  - exclusão também avança a geração (tombstone), então nada a ressuscita sem base atual;
//  - cliente legado (sem base/operation id) só cria competência inexistente; nunca sobrescreve;
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

function legacyOperationId(parts) {
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
  const { crewKey, rosterKey, rosterKind = 'operated', operation = 'import', roster = null, parserVersion = 'unknown', sourceKind = 'pdf_import' } = request || {};
  if (!email) return outcome(401, { code: 'AUTH_REQUIRED' });
  const verifiedCrewKey = typeof resolveVerifiedCrewKey === 'function' ? await resolveVerifiedCrewKey(email) : null;
  if (!verifiedCrewKey) return outcome(403, { code: 'CREW_IDENTITY_UNVERIFIED' });
  if (verifiedCrewKey !== crewKey) return outcome(403, { code: 'CREW_IDENTITY_NOT_BOUND' });
  if (!KINDS.has(rosterKind) || !['import', 'delete'].includes(operation) || !ROSTER_KEY.test(String(rosterKey || '')) || !/^ID:[A-Z0-9]{3,40}$/.test(String(crewKey || ''))) return outcome(400, { code: 'REQUEST_INVALID' });
  const legacy = request.baseGeneration === undefined || request.baseGeneration === null || !request.operationId;
  if (legacy && operation !== 'import') return outcome(428, { code: 'REVISION_PRECONDITION_REQUIRED' });
  if (!legacy && (!Number.isSafeInteger(request.baseGeneration) || request.baseGeneration < 0 || !UUID.test(String(request.operationId)))) return outcome(400, { code: 'REQUEST_INVALID' });
  if (operation === 'import') {
    const issue = rosterCompetenceIssue(roster, rosterKey, crewKey);
    if (issue) return outcome(422, { code: issue });
  }
  const contentHash = operation === 'import' ? rosterContentHash(roster) : null;
  const baseGeneration = legacy ? 0 : request.baseGeneration;
  const operationId = legacy ? legacyOperationId([email, crewKey, rosterKey, rosterKind, contentHash]) : String(request.operationId);
  const requestHash = sha256(stable({ crewKey, rosterKey, rosterKind, operation, baseGeneration, contentHash, parserVersion: String(parserVersion), schemaVersion: PROPOSAL_SCHEMA_VERSION, sourceKind: legacy ? 'legacy_create' : sourceKind }));
  const where = [email, crewKey, rosterKey, rosterKind];
  // InnoDB may abort one of two transactions racing for the same competence (deadlock); the whole
  // transaction rolled back, so it is retried as a unit. The replay check keeps retries idempotent.
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await writeOnce(db, { email, where, crewKey, rosterKey, rosterKind, operation, roster, parserVersion, sourceKind, legacy, contentHash, baseGeneration, operationId, requestHash });
    } catch (error) {
      if (!['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error?.code) || attempt >= 5) throw error;
    }
  }
}

async function writeOnce(db, { email, where, crewKey, rosterKey, rosterKind, operation, roster, parserVersion, sourceKind, legacy, contentHash, baseGeneration, operationId, requestHash }) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    // First lock is exclusive (insert or no-op update): no shared lock to upgrade, so concurrent
    // writers of one competence queue instead of deadlocking.
    await client.query('INSERT INTO crewcheck_roster_competences(owner_email,crew_key,roster_key,roster_kind) VALUES($1,$2,$3,$4) ON DUPLICATE KEY UPDATE generation=generation', where);
    const current = (await client.query('SELECT generation,state,content_hash FROM crewcheck_roster_competences WHERE owner_email=$1 AND crew_key=$2 AND roster_key=$3 AND roster_kind=$4 FOR UPDATE', where)).rows[0];
    // Replay is checked under the competence lock, so a duplicated send cannot race itself.
    const previous = (await client.query('SELECT generation,request_hash,crew_key,roster_key,roster_kind FROM crewcheck_roster_revisions WHERE owner_email=$1 AND client_operation_id=$2', [email, operationId])).rows[0];
    if (previous) {
      await client.query('ROLLBACK');
      if (previous.request_hash !== requestHash) return outcome(422, { code: 'OPERATION_ID_REUSED' });
      return outcome(200, { replay: true, generation: Number(previous.generation), current: competenceView(current) });
    }
    if (Number(current.generation) !== baseGeneration) {
      await client.query('ROLLBACK');
      return outcome(legacy ? 428 : 409, { code: legacy ? 'REVISION_PRECONDITION_REQUIRED' : 'ROSTER_REVISION_CONFLICT', current: competenceView(current) });
    }
    if ((operation === 'import' && current.state === 'live' && current.content_hash === contentHash) || (operation === 'delete' && current.state !== 'live')) {
      await client.query('ROLLBACK');
      return outcome(200, { unchanged: true, generation: Number(current.generation), current: competenceView(current) });
    }
    const generation = Number(current.generation) + 1, revisionId = crypto.randomUUID(), state = operation === 'import' ? 'live' : 'deleted';
    await client.query(`INSERT INTO crewcheck_roster_revisions(revision_id,owner_email,crew_key,roster_key,roster_kind,generation,base_generation,operation,content_hash,roster,parser_version,schema_version,source_kind,client_operation_id,request_hash)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [revisionId, email, crewKey, rosterKey, rosterKind, generation, baseGeneration, operation, contentHash, operation === 'import' ? JSON.stringify(canonicalRoster(roster)) : null, String(parserVersion).slice(0, 40), PROPOSAL_SCHEMA_VERSION, legacy ? 'legacy_create' : sourceKind, operationId, requestHash]);
    const updated = await client.query('UPDATE crewcheck_roster_competences SET generation=$1,state=$2,current_revision_id=$3,content_hash=$4 WHERE owner_email=$5 AND crew_key=$6 AND roster_key=$7 AND roster_kind=$8 AND generation=$9',
      [generation, state, revisionId, contentHash, ...where, baseGeneration]);
    if (updated.rowCount !== 1) throw Object.assign(new Error('competence generation moved under lock'), { code: 'GENERATION_INVARIANT' });
    await client.query('COMMIT');
    return outcome(200, { generation, revisionId, current: { generation, state, contentHash } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error?.code === 'ER_DUP_ENTRY') return outcome(422, { code: 'OPERATION_ID_REUSED' });
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
