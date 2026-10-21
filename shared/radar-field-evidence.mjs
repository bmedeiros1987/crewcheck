import { radarFlightId, radarSourceEpoch } from './gate-query-day.mjs';

// Per-field operational proof for radar answers outside the app. A field counts
// only with a source-owned observation instant: today the custom source's opt-in
// crewcheck.departure-gate-update.v1 proof (exported as `gateUpdate`, gate only).
// HTTP/cache/receipt clocks, generic "updated" stamps and aircraft-signal times
// are never observation proof. The app consumer (client/src/lib/nextFlightGate.ts)
// keeps its own decision; this mirrors it (normalization, observed <= receipt <=
// now, at most 30 min, no conflict) and adds the published-occurrence check.
export const RADAR_FIELD_FRESH_MS = 30 * 60 * 1000;
export const RADAR_EVIDENCE_FIELDS = Object.freeze(['gate', 'status', 'registration']);
const GAP_LABELS = Object.freeze({
  'source-observation-missing': 'fonte sem horário de observação deste campo',
  'source-conflict': 'fontes divergentes',
  'source-observation-stale': 'observação da fonte com mais de 30 min',
  'source-observation-invalid': 'horário de observação da fonte inválido',
  'source-value-mismatch': 'prova da fonte não corresponde ao valor',
  'occurrence-unverified': 'voo, rota ou data não comprovados',
});
// Same vocabulary as the app's normalizeBoardingGate/cleanStatus/cleanRegistration.
const EMPTY_VALUES = /^(|—|-|–|N\/?A|NA|TBD|TBA|UNKNOWN|NULL|UNDEFINED|A CONFIRMAR|NÃO INFORMADO|NAO INFORMADO|NÃO INFORMADA|NAO INFORMADA|SEM PORTÃO|SEM PORTAO)$/;
const POSITION_VALUES = /^(POSIÇÃO|POSICAO|POSITION|POS|STAND|STD|BOX|PARKING|PRK|SPOT|ESTANDE|BAY)(?=[\s\d.:#-]|$)/;
const text = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const upper = value => text(value).toUpperCase();
export function normalizeRadarGate(value) {
  const raw = upper(value).replace(/^(PORTÃO|PORTAO|GATE|PTO\.?)\s*/, '');
  return EMPTY_VALUES.test(raw) || /CONFIRMAR|INFORMAD/.test(raw) || POSITION_VALUES.test(raw) || raw.length > 12 ? '' : raw;
}
const cleanStatus = value => { const raw = text(value); return raw && raw.length <= 80 && !EMPTY_VALUES.test(raw.toUpperCase()) && !/aguardando|monitorando|n[aã]o confirmado/i.test(raw) ? raw : ''; };
const cleanRegistration = value => { const raw = upper(value); return raw.length >= 3 && raw.length <= 16 && /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(raw) && !EMPTY_VALUES.test(raw) && !/CONFIRM|INFORMAD/.test(raw) ? raw : ''; };
const NORMALIZE = Object.freeze({ gate: normalizeRadarGate, status: cleanStatus, registration: cleanRegistration });

export function radarEvidenceGapLabel(reason) {
  return GAP_LABELS[reason] || '';
}

function gateProof(item) {
  const proof = item?.gateUpdate;
  return proof && proof.provider === 'custom' && proof.kind === 'departure-gate-update' && proof.version === 1 ? proof : null;
}

// Shared admission of one field at `now`; returns { value, observedAt } or { reason }.
function admitField(item, field, now) {
  const value = NORMALIZE[field](item?.[field]);
  if (!value) return {};
  if (Array.isArray(item.operationalConflicts) && item.operationalConflicts.includes(field)) return { reason: 'source-conflict' };
  const proof = field === 'gate' ? gateProof(item) : null;
  if (!proof) return { reason: 'source-observation-missing' };
  if (normalizeRadarGate(proof.gate) !== value) return { reason: 'source-value-mismatch' };
  const observed = radarSourceEpoch(proof.sourceUpdatedAt), receipt = Number(item.sourceReceivedAt);
  if (!Number.isFinite(observed) || observed <= 0 || observed > now || !Number.isFinite(receipt) || observed > receipt || receipt > now) return { reason: 'source-observation-invalid' };
  if (now - observed > RADAR_FIELD_FRESH_MS) return { reason: 'source-observation-stale' };
  return { value, observedAt: observed, proof };
}

/**
 * Sanitized reason per unproven field, attached to the public radar payload.
 * No new evidence object is emitted: the gate proof already travels as
 * `gateUpdate`, so the app's decision is unchanged.
 */
export function radarFieldEvidenceGaps(item, now = Date.now()) {
  const operationalEvidenceGaps = {};
  if (!item?.ok || !Number.isFinite(now)) return { operationalEvidenceGaps };
  for (const field of RADAR_EVIDENCE_FIELDS) {
    const admitted = admitField(item, field, now);
    if (admitted.reason) operationalEvidenceGaps[field] = admitted.reason;
  }
  return { operationalEvidenceGaps };
}

/**
 * Server-side admission for Telegram/Concierge surfaces. Returns only fields whose
 * proof is current for the exact published occurrence; every other field is ''
 * with a sanitized reason. `observedAt` carries the source instant of accepted fields.
 */
export function verifiedRadarFields(payload, identity, now = Date.now()) {
  const fields = { gate: '', status: '', registration: '' }, gaps = {}, observedAt = {};
  if (!payload?.ok || payload.querySuppressed || !Number.isFinite(now)) return { ...fields, gaps, observedAt };
  const present = RADAR_EVIDENCE_FIELDS.filter(field => NORMALIZE[field](payload[field]));
  const planned = radarSourceEpoch(identity?.scheduledDepartureUtc);
  const sameRoute = value => upper(value?.origin) === upper(identity.origin) && upper(value?.destination) === upper(identity.destination);
  if (!identity || !radarFlightId(identity.flight) || radarFlightId(payload.flight) !== radarFlightId(identity.flight) || !sameRoute(payload)
    || !Number.isFinite(planned) || radarSourceEpoch(payload.scheduledDepartureUtc) !== planned) {
    for (const field of present) gaps[field] = 'occurrence-unverified';
    return { ...fields, gaps, observedAt };
  }
  for (const field of present) {
    const admitted = admitField(payload, field, now);
    if (admitted.reason) { gaps[field] = admitted.reason; continue; }
    const proof = admitted.proof;
    if (radarFlightId(proof.flight) !== radarFlightId(identity.flight) || !sameRoute(proof) || radarSourceEpoch(proof.scheduledDepartureUtc) !== planned) {
      gaps[field] = 'occurrence-unverified'; continue;
    }
    fields[field] = admitted.value;
    observedAt[field] = new Date(admitted.observedAt).toISOString();
  }
  return { ...fields, gaps, observedAt };
}
