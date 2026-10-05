import { createHash } from 'node:crypto';

const object = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const hash = value => createHash('sha256').update(value).digest('hex');
function canonical(value, depth = 0) {
  if (depth > 40) throw new Error('Unsupported roster depth');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(item => canonical(item, depth + 1));
  if (object(value) && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key], depth + 1)]));
  }
  throw new Error('Unsupported roster value');
}
export function operationalRosterContentDigest(roster) {
  if (!object(roster)) throw new Error('Invalid roster');
  const content = JSON.stringify(canonical(roster));
  if (Buffer.byteLength(content) > 4_500_000) throw new Error('Roster too large');
  return hash(`crewcheck:full-roster-json:v1\0${content}`);
}
function failure(status, code, message) {
  return { status, body: { ok: false, code, message, submissionAllowed: false } };
}
const unavailable = () => failure(503, 'DATABASE_OFFLINE', 'Não foi possível ler sua escala ativa agora.');
function publishedMetadataValid(roster) {
  const optionalBoolean = value => value === undefined || typeof value === 'boolean';
  const clock = value => {
    const match = typeof value === 'string' && value.trim().match(/^(\d{1,2}):(\d{2})$/);
    return Boolean(match && Number(match[1]) < 24 && Number(match[2]) < 60);
  };
  const optionalClock = value => {
    if (value === undefined || value === null || value === '') return true;
    return clock(value);
  };
  // Do not let substring extraction or an unverified explicit (+N) day offset
  // masquerade as a confirmed published clock. This slice accepts normalized
  // clocks only; canonical engine changes belong to its existing owner.
  return roster.days.every(day => object(day) && optionalClock(day.dutyReport) && optionalClock(day.dutyDebrief) &&
    optionalBoolean(day.isNextDay) && optionalBoolean(day.continuityInferred) &&
    Array.isArray(day.legs) && day.legs.every(leg => object(leg) && clock(leg.departureTime) && clock(leg.arrivalTime) &&
      optionalClock(leg.presentationTime) && optionalBoolean(leg.isNextDay)));
}

// context is produced exclusively by readExistingMainIdentity. No request body,
// query/header email, local cache, roster payload or consent is accepted here.
// SQL evaluates the DB-managed revision in the database session's time zone;
// the JS process never interprets an unqualified DATETIME string as local time.
export async function readOperationalBriefingPreview(context, { now = Date.now } = {}) {
  if (context?.ok !== true || typeof context.email !== 'string' || !context.email ||
      typeof context.publicId !== 'string' || !context.publicId || typeof context.db?.query !== 'function') {
    return failure(401, 'AUTH_REQUIRED', 'Faça login para consultar seu briefing.');
  }
  let rows;
  try {
    [rows] = await context.db.query(`SELECT p.email AS account_email,p.public_id AS account_public_id,
      r.id,r.owner_email,r.roster_key,r.roster,r.fingerprint,r.active,
      UNIX_TIMESTAMP(r.updated_at) AS revision_seconds
      FROM crewcheck_platform_profiles p
      LEFT JOIN crewcheck_platform_rosters r ON r.owner_email=p.email AND r.active=TRUE
      WHERE p.email=? AND p.public_id=?
      ORDER BY r.updated_at DESC,r.id DESC LIMIT 2`, [context.email, context.publicId]);
  } catch { return unavailable(); }
  const checkedAt = now();
  if (!Number.isFinite(checkedAt) || checkedAt <= 0 || checkedAt > 8_640_000_000_000_000 || !Array.isArray(rows)) return unavailable();
  if (!rows.length) return failure(401, 'AUTH_REQUIRED', 'Faça login para consultar seu briefing.');
  if (rows.length > 1) return failure(409, 'ACTIVE_ROSTER_AMBIGUOUS', 'Há mais de uma escala ativa. Confirme a escala antes de consultar o briefing.');
  const row = rows[0];
  if (!object(row)) return unavailable();
  if (row.account_email !== context.email || row.account_public_id !== context.publicId) return failure(401, 'AUTH_REQUIRED', 'Faça login para consultar seu briefing.');
  if (row.id === null || row.id === undefined) return failure(404, 'ACTIVE_ROSTER_MISSING', 'Importe e ative sua escala para consultar o briefing.');
  if (row.owner_email !== context.email || ![true, 1, '1'].includes(row.active) || typeof row.id !== 'string' ||
      !row.id || row.id.length > 160 || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(row.roster_key || '') ||
      !/^[a-f0-9]{64}$/.test(row.fingerprint || '')) {
    return failure(409, 'ACTIVE_ROSTER_UNVERIFIED', 'Não foi possível confirmar a identidade da escala ativa.');
  }
  const seconds = typeof row.revision_seconds === 'number' || (typeof row.revision_seconds === 'string' && /^\d+(?:\.\d+)?$/.test(row.revision_seconds))
    ? Number(row.revision_seconds) : NaN;
  const revision = Math.round(seconds * 1000);
  if (!Number.isFinite(revision) || revision <= 0 || revision > checkedAt || revision > 8_640_000_000_000_000) {
    return failure(409, 'ACTIVE_ROSTER_UNVERIFIED', 'Não foi possível confirmar a revisão da escala ativa.');
  }
  let roster, contentDigest;
  try {
    if (typeof row.roster === 'string' && Buffer.byteLength(row.roster) > 4_500_000) throw new Error('Roster too large');
    roster = typeof row.roster === 'string' ? JSON.parse(row.roster) : row.roster;
    if (!object(roster) || !Array.isArray(roster.days) || roster.days.length > 370 || !publishedMetadataValid(roster)) throw new Error('Invalid roster');
    contentDigest = operationalRosterContentDigest(roster);
  } catch { return failure(422, 'ACTIVE_ROSTER_INVALID', 'A escala ativa precisa de revisão antes de gerar o briefing.'); }
  const authority = { active: true, ownerScope: hash(JSON.stringify(['briefing-account-v1', context.email, context.publicId])),
    rosterId: row.id, rosterKey: row.roster_key, fingerprint: row.fingerprint,
    activeRevision: new Date(revision).toISOString(), checkedAt: new Date(checkedAt).toISOString() };
  let preview;
  try {
    const { buildOperationalBriefingPreview } = await import('./operational-briefing.mjs');
    preview = buildOperationalBriefingPreview({ authority, roster, now: checkedAt, previousPublication: null, weather: [] });
  } catch { return failure(503, 'BRIEFING_UNAVAILABLE', 'O briefing está temporariamente indisponível.'); }
  if (preview.status !== 'preview') return failure(422, 'BRIEFING_UNAVAILABLE', 'A escala ativa ainda não permite confirmar um briefing.');
  // Return only the next-duty preview, never the monthly comparison baseline,
  // profile/email, raw roster text or a client-editable authority/consent record.
  return { status: 200, body: { ok: true, submissionAllowed: false,
    briefing: { kind: preview.kind, generatedAt: preview.generatedAt, validUntil: preview.validUntil,
      duty: preview.duty, window: preview.window, weather: preview.weather,
      sourceLabel: preview.sourceLabel, unsupportedSources: preview.unsupportedSources,
      unsupportedChanges: preview.unsupportedChanges, previewFingerprint: preview.previewFingerprint || null },
    source: { kind: 'primary-active-roster', rosterId: row.id, rosterKey: row.roster_key,
      legacyFingerprint: row.fingerprint, contentDigest: { algorithm: 'sha256-canonical-json-v1', value: contentDigest },
      revisionAt: authority.activeRevision, checkedAt: authority.checkedAt },
    message: preview.window.state === 'no-upcoming-duty' ? 'Não há jornada de voo futura confirmada na escala ativa.'
      : preview.window.state === 'unsupported-duty' ? 'A próxima programação não é um voo; este briefing ainda não cobre essa atividade.'
        : preview.window.state === 'presentation-unconfirmed' ? 'A apresentação não está confirmada. Confira os horários publicados.'
          : 'Prévia calculada a partir da sua escala ativa.' } };
}
