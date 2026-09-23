import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

const hash = value => createHash('sha256').update(String(value)).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const SESSION_LEASE_MS = 86400000;
const TRUSTED_LEASE_MS = 365 * 86400000;
const DEFAULT_PREFERENCES = Object.freeze({
  audience: 'owner',
  share: {
    operational: true,
    weather: true,
    hotel: false,
    crew: false,
    finance: false,
    mobility: false,
    traffic: false,
  },
});
function normalizePreferences(value = {}) {
  const audience = ['owner','family','visitor'].includes(value?.audience) ? value.audience : 'owner';
  const source = value?.share && typeof value.share === 'object' ? value.share : {};
  return {
    audience,
    share: {
      operational: source.operational !== false,
      weather: source.weather !== false,
      hotel: source.hotel === true,
      crew: source.crew === true,
      finance: source.finance === true,
      mobility: source.mobility === true,
      traffic: source.traffic === true,
    },
  };
}

function sanitizeFinite(value, min = -1_000_000, max = 1_000_000) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : null;
}
function sanitizeJourneyContext(value, preferences) {
  if (preferences.audience !== 'owner' || !value || Array.isArray(value) || typeof value !== 'object') return {};
  const result = {};
  for (const [rawKey, raw] of Object.entries(value).slice(0, 12)) {
    const key = String(rawKey || '').trim();
    if (!key || key.length > 160 || !raw || Array.isArray(raw) || typeof raw !== 'object') continue;
    const entry = {};
    if (preferences.share.finance === true && raw.finance && typeof raw.finance === 'object' && !Array.isArray(raw.finance)) {
      const estimated = sanitizeFinite(raw.finance.estimated);
      const perDiem = sanitizeFinite(raw.finance.perDiem);
      const production = sanitizeFinite(raw.finance.production);
      if (estimated !== null || perDiem !== null || production !== null) {
        entry.finance = {
          currency: /^[A-Z]{3}$/.test(String(raw.finance.currency || '').trim().toUpperCase())
            ? String(raw.finance.currency).trim().toUpperCase()
            : 'BRL',
          estimated,
          perDiem,
          production,
          note: String(raw.finance.note || '').trim().slice(0, 180) || null,
        };
      }
    }
    if (Object.keys(entry).length) result[key] = entry;
  }
  return result;
}

export class TvError extends Error {
  constructor(status, code) { super(code); this.status = status; }
}

export function createDeviceService({ store, now = Date.now, pairingOrigin, accountAllowed = () => true }) {
  if (new URL(pairingOrigin).protocol !== 'https:') throw new Error('HTTPS pairing origin required');
  const requireAccount = userId => {
    if (!userId) throw new TvError(401, 'authentication_required');
    if (!accountAllowed(userId)) throw new TvError(403, 'pilot_not_authorized');
  };
  const leaseFor = trusted => now() + (trusted ? TRUSTED_LEASE_MS : SESSION_LEASE_MS);
  return {
    async begin(platform, trusted = false) {
      if (!['android-tv', 'samsung-tizen', 'lg-webos'].includes(platform)) throw new TvError(400, 'invalid_platform');
      const deviceCode = secret(), userCode = randomBytes(5).toString('hex').toUpperCase();
      const persistent = trusted === true;
      await store.transaction(state => {
        state.pairings ??= {}; state.devices ??= {};
        for (const [key, p] of Object.entries(state.pairings)) if (p.expiresAt <= now()) delete state.pairings[key];
        if (Object.keys(state.pairings).length >= 1000) throw new TvError(429, 'pairing_capacity');
        state.pairings[hash(deviceCode)] = { userCode, platform, trusted: persistent, expiresAt: now() + 300000, lastPoll: 0 };
      });
      return { deviceCode, userCode, expiresIn: 300, interval: 5, trusted: persistent, verificationUri: `${pairingOrigin}/tv-pair?code=${userCode}` };
    },
    async approve(userId, userCode, privacy = 'family') {
      requireAccount(userId);
      if (typeof userCode !== 'string' || !/^[A-F0-9]{10}$/.test(userCode)) throw new TvError(400, 'invalid_pairing');
      if (!['family', 'private'].includes(privacy)) throw new TvError(400, 'invalid_privacy');
      return store.transaction(state => {
        requireAccount(userId);
        const p = Object.values(state.pairings ?? {}).find(p => equal(p.userCode, userCode));
        if (!p || p.expiresAt <= now() || p.userId) throw new TvError(400, 'invalid_pairing');
        p.userId = userId; p.privacy = privacy;
        return { ok: true };
      });
    },
    async poll(deviceCode) {
      if (typeof deviceCode !== 'string' || deviceCode.length !== 43) throw new TvError(400, 'invalid_device_code');
      return store.transaction(state => {
        const key = hash(deviceCode), p = state.pairings?.[key];
        if (!p || p.expiresAt <= now()) throw new TvError(410, 'pairing_expired');
        if (p.lastPoll && now() - p.lastPoll < 5000) throw new TvError(429, 'slow_down');
        p.lastPoll = now();
        if (!p.userId) return { pending: true };
        requireAccount(p.userId);
        for (const [id, d] of Object.entries(state.devices)) if (d.expiresAt <= now()) delete state.devices[id];
        if (Object.keys(state.devices).length >= 1000) throw new TvError(429, 'device_capacity');
        const token = secret(), deviceId = secret(), trusted = p.trusted === true, expiresAt = leaseFor(trusted);
        state.devices[deviceId] = { deviceId, userId: p.userId, privacy: p.privacy, platform: p.platform, trusted, tokenHash: hash(token), expiresAt, lastSeenAt: now(), scopes: ['tv:read'], revoked: false, preferences: normalizePreferences(DEFAULT_PREFERENCES) };
        delete state.pairings[key];
        return { deviceId, token, trusted, expiresAt: new Date(expiresAt).toISOString(), privacy: p.privacy };
      });
    },
    async authorize(token) {
      if (typeof token !== 'string' || token.length !== 43) throw new TvError(401, 'invalid_device');
      return store.transaction(state => {
        const d = Object.values(state.devices ?? {}).find(d => equal(d.tokenHash, hash(token)));
        if (!d || d.revoked || d.expiresAt <= now() || !d.scopes.includes('tv:read')) throw new TvError(401, 'invalid_device');
        requireAccount(d.userId);
        const context = d.context && Number(d.context.expiresAt || 0) > now() ? structuredClone(d.context) : null;
        if (!context && d.context) delete d.context;
        return { deviceId: d.deviceId, userId: d.userId, privacy: d.privacy, platform: d.platform, trusted: d.trusted === true, preferences: normalizePreferences(d.preferences), context };
      });
    },
    async heartbeat(token) {
      const auth = await this.authorize(token);
      return store.transaction(state => {
        const d = state.devices[auth.deviceId];
        requireAccount(auth.userId);
        if (!d || d.revoked || d.expiresAt <= now()) throw new TvError(401, 'invalid_device');
        d.lastSeenAt = now();
        if (d.trusted === true) d.expiresAt = leaseFor(true);
        return { ok: true, trusted: d.trusted === true, expiresAt: new Date(d.expiresAt).toISOString() };
      });
    },
    async updatePreferences(userId, deviceId, value) {
      requireAccount(userId);
      return store.transaction(state => {
        const d = state.devices?.[deviceId];
        if (!d || d.userId !== userId || d.revoked) throw new TvError(404, 'device_not_found');
        d.preferences = normalizePreferences(value);
        return { deviceId: d.deviceId, preferences: d.preferences };
      });
    },
    async preferencesFor(userId, deviceId) {
      requireAccount(userId);
      return store.transaction(state => {
        const d = state.devices?.[deviceId];
        if (!d || d.userId !== userId || d.revoked) throw new TvError(404, 'device_not_found');
        return { deviceId: d.deviceId, preferences: normalizePreferences(d.preferences) };
      });
    },
    async updateContext(userId, deviceId, value = {}) {
      requireAccount(userId);
      return store.transaction(state => {
        const d = state.devices?.[deviceId];
        if (!d || d.userId !== userId || d.revoked) throw new TvError(404, 'device_not_found');
        const preferences = normalizePreferences(d.preferences);
        if (preferences.audience !== 'owner') {
          delete d.context;
          throw new TvError(403, 'tv_context_not_authorized');
        }

        const requestedTtl = Math.max(60_000, Math.min(10 * 60_000, Number(value?.ttlMs || 5 * 60_000)));
        const context = { expiresAt: now() + requestedTtl };
        let accepted = false;

        if (preferences.share.traffic === true && value?.routeOrigin) {
          const latitude = Number(value.routeOrigin.latitude);
          const longitude = Number(value.routeOrigin.longitude);
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180)
            throw new TvError(400, 'invalid_route_origin');
          context.routeOrigin = {
            latitude,
            longitude,
            label: String(value.routeOrigin.label || 'Localização autorizada').trim().slice(0,80) || 'Localização autorizada',
          };
          accepted = true;
        }

        const journeyDetails = sanitizeJourneyContext(value?.journeyDetails, preferences);
        if (Object.keys(journeyDetails).length) {
          context.journeyDetails = journeyDetails;
          accepted = true;
        }

        if (!accepted) {
          delete d.context;
          throw new TvError(403, 'tv_context_not_authorized');
        }

        d.context = context;
        return {
          ok: true,
          deviceId: d.deviceId,
          expiresAt: new Date(context.expiresAt).toISOString(),
          routeOrigin: Boolean(context.routeOrigin),
          journeyDetails: Object.keys(context.journeyDetails || {}).length,
        };
      });
    },
    async revoke(userId, deviceId) {
      requireAccount(userId);
      return store.transaction(state => {
        const d = state.devices?.[deviceId];
        if (!d || d.userId !== userId) throw new TvError(404, 'device_not_found');
        d.revoked = true; d.tokenHash = ''; return { ok: true };
      });
    },
    async list(userId) {
      requireAccount(userId);
      return store.transaction(state => Object.values(state.devices ?? {}).filter(d => d.userId === userId).map(d => ({
        deviceId: d.deviceId,
        platform: d.platform,
        privacy: d.privacy,
        trusted: d.trusted === true,
        expiresAt: new Date(d.expiresAt).toISOString(),
        lastSeenAt: d.lastSeenAt,
        revoked: d.revoked,
        preferences: normalizePreferences(d.preferences),
        contextActive: Boolean(d.context && Number(d.context.expiresAt || 0) > now()),
      })));
    },
  };
}
