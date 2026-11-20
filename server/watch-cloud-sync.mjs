import crypto from 'node:crypto';

// CrewWatch cloud sync: the phone publishes the same allow-listed projection it already
// sends over Bluetooth, and the paired watch downloads it directly, so the watch keeps
// working when the phone is away. OFF unless WATCH_CLOUD_SYNC_ENABLED is exactly 'true'.
//
//   POST   /api/watch/cloud/pair      (account)  -> new watch credential; replaces the old one
//   PUT    /api/watch/cloud/snapshot  (account)  -> store the sanitized projection
//   GET    /api/watch/cloud/snapshot  (watch)    -> projection, ETag / 304, 204 when none
//   DELETE /api/watch/cloud           (account)  -> forget credential and projection (logout)
//
// One watch per account. The credential is "cw1.<ownerKey>.<secret>"; only a SHA-256 of
// the secret is stored. Device and projection live in separate rows so a pairing and a
// publish never overwrite each other.

export const WATCH_CLOUD_MAX_SNAPSHOT_BYTES = 16 * 1024;
// The phone clock may run slightly ahead; beyond this the projection is from the future.
export const WATCH_CLOUD_MAX_CLOCK_SKEW_MS = 5 * 60_000;
// Same maximum window the phone uses to build the projection (watchContext.validWindow).
export const WATCH_CLOUD_MAX_VALIDITY_MS = 6 * 60 * 60_000;
const STATES = new Set(['OFF_DUTY', 'LEAVE_SOON', 'REPORTING', 'BOARDING', 'IN_FLIGHT', 'CONNECTION', 'OVERNIGHT', 'CHANGED', 'UNKNOWN']);
const FIELDS = [['contextId', 80], ['headline', 42], ['primaryTime', 12], ['detail', 96], ['presentationTime', 12], ['presentationPlace', 42],
  ['leaveTime', 12], ['trafficDetail', 64], ['currentFlight', 16], ['currentRoute', 32], ['gate', 18], ['boardingTime', 12], ['eta', 12],
  ['connection', 16], ['nextFlight', 16], ['nextDetail', 64], ['overnight', 24], ['hotelPickup', 64],
  // Gate provenance (gate rule, #1281): the watch's gate detail and its local notifications need it.
  ['gateSource', 12], ['gateNote', 64],
  // Account that owns the projection: the watch drops a former account's roster (any path).
  ['account', 32]];
const SCHEDULE_FIELDS = [['id', 80], ['kind', 12], ['time', 12], ['title', 24], ['route', 32], ['presentation', 12], ['gate', 18], ['detail', 64]];
const PROHIBITED = ['cpf', 'email', 'phone', 'crewName', 'hotelRoom', 'roomNumber', 'token', 'accessToken', 'refreshToken', 'authorization'];

const clean = (value, max) => typeof value === 'string' || typeof value === 'number'
  ? String(value).replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
const copy = (source, target, [key, max]) => { const value = clean(source[key], max); if (value && value.toLowerCase() !== 'null') target[key] = value; };

/**
 * Same allow-list as the phone's CrewCheckWatchPublisher.sanitize, plus the time limits the
 * watch enforces on cloud data (no future generation, validity of at most 6 h); null when
 * rejected.
 */
export function sanitizeWatchSnapshot(source, now = Date.now()) {
  if (!source || typeof source !== 'object' || Array.isArray(source) || source.schemaVersion !== 1) return null;
  if (PROHIBITED.some(key => Object.hasOwn(source, key))) return null;
  const generatedAt = source.generatedAtEpochMs, validUntil = source.validUntilEpochMs;
  if (!Number.isSafeInteger(generatedAt) || generatedAt <= 0 || !Number.isSafeInteger(validUntil) || validUntil < generatedAt) return null;
  if (generatedAt > now + WATCH_CLOUD_MAX_CLOCK_SKEW_MS || validUntil - generatedAt > WATCH_CLOUD_MAX_VALIDITY_MS) return null;
  const state = clean(source.state, 24).toUpperCase();
  const out = { schemaVersion: 1 };
  copy(source, out, FIELDS[0]);
  Object.assign(out, { generatedAtEpochMs: generatedAt, validUntilEpochMs: validUntil, state: STATES.has(state) ? state : 'UNKNOWN' });
  for (const field of FIELDS.slice(1)) copy(source, out, field);
  out.remoteStand = source.remoteStand === true;
  out.changed = source.changed === true;
  out.source = 'canonical-roster';
  if (Array.isArray(source.schedule)) {
    const schedule = source.schedule.slice(0, 8).filter(item => item && typeof item === 'object').map(item => {
      const row = {}; for (const field of SCHEDULE_FIELDS) copy(item, row, field); return row;
    }).filter(row => Object.keys(row).length);
    if (schedule.length) out.schedule = schedule;
  }
  return Buffer.byteLength(JSON.stringify(out)) <= WATCH_CLOUD_MAX_SNAPSHOT_BYTES ? out : null;
}

export const watchCloudEnabled = (env = process.env) => env.WATCH_CLOUD_SYNC_ENABLED === 'true';
export const watchOwnerKey = email => crypto.createHash('sha256').update('crewcheck-watch:' + String(email || '').trim().toLowerCase()).digest('hex').slice(0, 32);
const sha256 = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const deviceKey = owner => `watch-cloud:v1:device:${owner}`;
const snapshotKey = owner => `watch-cloud:v1:snapshot:${owner}`;

export function parseWatchCredential(header = '') {
  const match = /^Bearer\s+cw1\.([0-9a-f]{32})\.([A-Za-z0-9_-]{43})$/.exec(String(header).trim());
  return match ? { owner: match[1], secret: match[2] } : null;
}

const sameHash = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length
  && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Route handler. Dependencies are injected so the server keeps its own auth, storage and
 * JSON helpers: identity(req) -> { email } | null, db { get, put, delete }. db.get must
 * throw when storage is unavailable (and resolve null only for a missing row): an outage
 * answers 503, never the 401 that makes the watch forget its credential.
 */
export function createWatchCloudHandler({ identity, db, sendJson, readJsonBody, env = process.env, now = Date.now, randomSecret = () => crypto.randomBytes(32).toString('base64url') }) {
  const recent = new Map();
  const limited = (key, windowMs) => {
    const at = now(), last = recent.get(key) || 0;
    if (at - last < windowMs) return true;
    recent.set(key, at);
    if (recent.size > 2000) for (const [k, t] of recent) if (at - t > 600_000) recent.delete(k);
    return false;
  };
  const account = req => { const who = identity(req); return who?.email ? watchOwnerKey(who.email) : null; };

  return async function handleWatchCloud(req, res, url) {
    if (!watchCloudEnabled(env)) return sendJson(res, 404, { ok: false, reason: 'disabled' });
    try { return await route(req, res, url); }
    catch { if (!res.headersSent) return sendJson(res, 503, { ok: false, reason: 'storage-unavailable' }); }
  };

  async function route(req, res, url) {
    const path = url.pathname;

    if (path === '/api/watch/cloud/snapshot' && req.method === 'GET') {
      const credential = parseWatchCredential(req.headers.authorization);
      if (!credential) return sendJson(res, 401, { ok: false, reason: 'unpaired' });
      if (limited('get:' + credential.owner, 10_000)) return sendJson(res, 429, { ok: false, retryAfterSeconds: 10 });
      const device = await db.get(deviceKey(credential.owner));
      if (!device?.tokenHash || !sameHash(device.tokenHash, sha256(credential.secret))) return sendJson(res, 401, { ok: false, reason: 'unpaired' });
      const stored = await db.get(snapshotKey(credential.owner));
      if (!stored?.snapshot || !stored.etag) { res.writeHead(204, { 'cache-control': 'no-store' }); return res.end(); }
      const etag = `"${stored.etag}"`;
      if (String(req.headers['if-none-match'] || '') === etag) { res.writeHead(304, { etag, 'cache-control': 'no-store' }); return res.end(); }
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', etag });
      return res.end(JSON.stringify({ ok: true, snapshot: stored.snapshot }));
    }

    const owner = account(req);
    if (!owner) return sendJson(res, 401, { ok: false, reason: 'login-required' });

    if (path === '/api/watch/cloud/pair' && req.method === 'POST') {
      if (limited('pair:' + owner, 30_000)) return sendJson(res, 429, { ok: false, retryAfterSeconds: 30 });
      const secret = randomSecret();
      if (!await db.put(deviceKey(owner), { v: 1, tokenHash: sha256(secret), pairedAt: now() })) return sendJson(res, 503, { ok: false, reason: 'storage-unavailable' });
      return sendJson(res, 200, { ok: true, credential: `cw1.${owner}.${secret}` });
    }
    if (path === '/api/watch/cloud/snapshot' && req.method === 'PUT') {
      if (limited('put:' + owner, 15_000)) return sendJson(res, 429, { ok: false, retryAfterSeconds: 15 });
      const body = await readJsonBody(req, 32 * 1024);
      const snapshot = sanitizeWatchSnapshot(body?.snapshot, now());
      if (!snapshot) return sendJson(res, 400, { ok: false, reason: 'invalid-snapshot' });
      // Nobody can read it without a paired watch; tell the phone to pair (again).
      if (!(await db.get(deviceKey(owner)))?.tokenHash) return sendJson(res, 409, { ok: false, reason: 'not-paired' });
      // The server knows the account; it is authoritative over whatever the page sent.
      snapshot.account = owner;
      const etag = sha256(JSON.stringify(snapshot)).slice(0, 32);
      if (!await db.put(snapshotKey(owner), { v: 1, snapshot, etag, storedAt: now() })) return sendJson(res, 503, { ok: false, reason: 'storage-unavailable' });
      return sendJson(res, 200, { ok: true, etag });
    }
    if (path === '/api/watch/cloud' && req.method === 'DELETE') {
      const removed = await db.delete(deviceKey(owner)) && await db.delete(snapshotKey(owner));
      return sendJson(res, removed ? 200 : 503, { ok: removed });
    }
    return sendJson(res, 405, { ok: false, reason: 'method-not-allowed' });
  }
}
