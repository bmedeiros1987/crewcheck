// Candidate v2 contract. No DB/environment access and no activation side effects.
const fail = (code) => { throw Object.assign(new Error(code), { code, status: 409 }); };
const json = value => { if (typeof value !== 'string') return value; try { return JSON.parse(value); } catch { return null; } };
const text = (value, max) => typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : fail('INVALID_HOTEL_INPUT');
export const HOTEL_SCHEMA_COLUMNS = ['binding_id', 'binding_evidence', 'manual_hotel_override', 'hotel_source_snapshot', 'row_version'];
export function hotelSchemaReady(columns) {
  return HOTEL_SCHEMA_COLUMNS.every(name => columns.includes(name));
}
export function hotelVersion(value) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value) || BigInt(value) > 18446744073709551615n) fail('INVALID_HOTEL_VERSION');
  return value;
}
const nextVersion = row => { const next = BigInt(hotelVersion(String(row.row_version))) + 1n; if (next > 18446744073709551615n) fail('HOTEL_VERSION_EXHAUSTED'); return String(next); };
function binding(row) {
  const evidence = json(row.binding_evidence);
  return row.binding_id && evidence?.schemaVersion === 1 && evidence.bindingId === row.binding_id
    && evidence.stayId === row.id && evidence.owner === row.owner_email
    && evidence.source === 'account-owner-association' && evidence.confirmed === true ? evidence : null;
}
function override(row) {
  const value = json(row.manual_hotel_override);
  return binding(row) && value?.schemaVersion === 1 && value.bindingId === row.binding_id
    && value.actor === 'account-owner' && value.source === 'manual' && typeof value.hotelName === 'string' && value.hotelName.trim() ? value : null;
}
export function hotelProjection(row) {
  return { id: row.id, bindingId: binding(row) ? row.binding_id : null,
    contextRef: binding(row)?.contextRef || null, contextSignature: binding(row)?.contextSignature || null,
    rowVersion: hotelVersion(String(row.row_version ?? '0')),
    state: binding(row) ? 'bound' : 'legacy-unbound', manualOverride: Boolean(override(row)),
    hotelName: override(row)?.hotelName || row.hotel_name,
    reviewRequired: !binding(row) || Boolean(row.manual_hotel_override && !override(row)) };
}
function owned(row, owner, expectedVersion) {
  if (!row || row.owner_email !== owner) fail('HOTEL_NOT_FOUND');
  if (hotelVersion(expectedVersion) !== hotelVersion(String(row.row_version))) fail('HOTEL_VERSION_CONFLICT');
}
// Explicit association to this exact existing row; never infer from date, NULL or name.
export function associateHotel(row, { owner, rosterKey, expectedVersion, confirmation, occurrenceRef, source, contextRef, contextSignature, at }) {
  owned(row, owner, expectedVersion);
  if (binding(row) || row.binding_id || confirmation !== 'associate-this-existing-stay') fail('HOTEL_BINDING_REVIEW_REQUIRED');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(rosterKey || '') || (row.roster_key != null && row.roster_key !== rosterKey)) fail('HOTEL_ROSTER_REVIEW_REQUIRED');
  const bindingId = row.id;
  return { ...row, roster_key: rosterKey, binding_id: bindingId, binding_evidence: {
    schemaVersion: 1, bindingId, stayId: row.id, owner, source: 'account-owner-association', confirmed: true,
    occurrenceRef: text(occurrenceRef, 180), occurrenceSource: text(source, 64), associatedAt: text(at, 40),
    ...(contextRef ? { contextRef: text(contextRef, 180), contextSignature: text(contextSignature, 1000) } : {}),
  }, row_version: nextVersion(row) };
}
export function patchHotel(row, { owner, expectedVersion, bindingId, hotelName, clearOverride = false, contextRef, contextSignature, at }) {
  owned(row, owner, expectedVersion);
  if (!binding(row) || bindingId !== row.binding_id) fail('HOTEL_BINDING_REVIEW_REQUIRED');
  if (binding(row).contextRef && (contextRef !== binding(row).contextRef || contextSignature !== binding(row).contextSignature)) fail('HOTEL_CONTEXT_CONFLICT');
  const source = json(row.hotel_source_snapshot);
  if (clearOverride && (!source || source.schemaVersion !== 1 || source.bindingId !== bindingId
    || source.occurrenceRef !== binding(row).occurrenceRef || source.source !== binding(row).occurrenceSource || !source.hotelName)) fail('HOTEL_SOURCE_REVIEW_REQUIRED');
  const name = clearOverride ? source.hotelName : text(hotelName, 180);
  return { ...row, hotel_name: name, manual_hotel_override: clearOverride ? null : {
    schemaVersion: 1, hotelName: name, actor: 'account-owner', editedAt: text(at, 40),
    basedOnRowVersion: expectedVersion, bindingId, source: 'manual',
  }, row_version: nextVersion(row) };
}
// No insert/delete branch. An unresolved source observation cannot create a duplicate.
export function reconcileHotels(rows, observations, { owner, rosterKey }) {
  const updates = [], pending = [];
  const ids = new Set();
  const sourceKey = item => JSON.stringify([item.source, item.occurrenceRef]);
  const counts = new Map();
  for (const item of observations) counts.set(sourceKey(item), (counts.get(sourceKey(item)) || 0) + 1);
  for (const observation of observations) {
    const matches = rows.filter(row => row.owner_email === owner && row.roster_key === rosterKey
      && binding(row)?.occurrenceRef === observation.occurrenceRef
      && binding(row)?.occurrenceSource === observation.source);
    if (!observation.occurrenceRef || !observation.source || counts.get(sourceKey(observation)) !== 1 || matches.length !== 1 || ids.has(matches[0]?.id)) {
      pending.push({ reason: 'stable-binding-required' }); continue;
    }
    const row = matches[0], prior = json(row.hotel_source_snapshot);
    ids.add(row.id);
    if (row.hotel_source_snapshot && (!prior || prior.schemaVersion !== 1 || prior.bindingId !== row.binding_id
      || prior.source !== observation.source || prior.occurrenceRef !== observation.occurrenceRef)) {
      pending.push({ id: row.id, reason: 'invalid-source-snapshot' }); continue;
    }
    // Opaque source revisions have no ordering. Only a matching expected snapshot
    // may advance one; a repeated observation is a no-op, stale replay is pending.
    const hotelName = text(observation.hotelName, 180), revision = text(observation.revision, 180);
    if (prior?.revision === revision) {
      if (prior.hotelName !== hotelName) pending.push({ id: row.id, reason: 'source-revision-collision' });
      continue;
    }
    if ((prior?.revision ?? null) !== observation.expectedSourceRevision) { pending.push({ id: row.id, reason: 'source-revision-conflict' }); continue; }
    const snapshot = { schemaVersion: 1, bindingId: row.binding_id, hotelName, revision,
      occurrenceRef: observation.occurrenceRef, source: observation.source };
    // A corrupt override cannot silently become a provider value.
    if (row.manual_hotel_override && !override(row)) { pending.push({ id: row.id, reason: 'invalid-override' }); continue; }
    updates.push({ previousVersion: hotelVersion(String(row.row_version)), row: { ...row,
      hotel_source_snapshot: snapshot, hotel_name: override(row)?.hotelName || hotelName,
      row_version: nextVersion(row) } });
  }
  for (const row of rows.filter(row => row.owner_email === owner && row.roster_key === rosterKey)) {
    if (!binding(row)) pending.push({ id: row.id, reason: 'legacy-binding-required' });
    else if (!ids.has(row.id)) pending.push({ id: row.id, reason: 'source-not-observed' });
  }
  return { updates, pending, status: pending.length ? 'review-required' : 'reconciled' };
}
