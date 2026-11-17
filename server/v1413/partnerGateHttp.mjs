import { normalizeAirport, normalizePartnerFlight, readPartnerGate } from './partnerGateApi.mjs';

const reply = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(body));
  return true;
};

// Not registered in the application. All authority comes from trusted injected
// dependencies; neither env flags nor HTTP input install/enable those dependencies.
export function createPartnerGateHttpHandler(dependencies = {}) {
  return async function handlePartnerGate(req, res, url = new URL(req.url, 'http://localhost')) {
    const match = url.pathname.match(/^\/api\/v1\/flights\/([^/]+)\/gate$/i);
    if (!match) return false;
    if (req.method !== 'GET') {
      res.setHeader('allow', 'GET');
      return reply(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED' });
    }
    const { authorize, consumeRateLimit, resolveOccurrence, readRadar, resolveRights } = dependencies;
    if (dependencies.enabled !== true || [authorize, consumeRateLimit, resolveOccurrence, readRadar, resolveRights]
      .some(fn => typeof fn !== 'function')) {
      return reply(res, 503, { ok: false, code: 'PARTNER_EXPORT_DISABLED' });
    }
    try {
      const authorization = req.headers.authorization;
      const token = typeof authorization === 'string' && authorization.match(/^Bearer (ck_(?:live|test)_[A-Za-z0-9_-]{20,})$/i)?.[1];
      if (!token) return reply(res, 401, { ok: false, code: 'INVALID_API_KEY' });
      const identity = await authorize(token);
      if (identity?.active !== true || typeof identity.partnerId !== 'string' || !identity.partnerId.trim()) {
        return reply(res, 401, { ok: false, code: 'INVALID_API_KEY' });
      }
      if (!Array.isArray(identity.scopes) || !identity.scopes.includes('gates:read')) {
        return reply(res, 403, { ok: false, code: 'INSUFFICIENT_SCOPE' });
      }
      const partnerId = identity.partnerId.trim();
      const rate = await consumeRateLimit(identity);
      if (!rate || rate.allowed !== true) return reply(res, 429, { ok: false, code: 'RATE_LIMITED' });
      for (const [key, name] of [['limit','x-ratelimit-limit'], ['remaining','x-ratelimit-remaining'], ['reset','x-ratelimit-reset']]) {
        if (Number.isSafeInteger(rate[key]) && rate[key] >= 0) res.setHeader(name, String(rate[key]));
      }
      let rawFlight;
      try { rawFlight = decodeURIComponent(match[1]); } catch { return reply(res, 400, { ok: false, code: 'INVALID_FLIGHT' }); }
      const flight = normalizePartnerFlight(rawFlight);
      if (!flight) return reply(res, 400, { ok: false, code: 'INVALID_FLIGHT' });
      const query = {};
      for (const name of ['origin', 'destination']) {
        const raw = url.searchParams.get(name);
        if (url.searchParams.getAll(name).length > 1 || (raw !== null && !normalizeAirport(raw))) {
          return reply(res, 400, { ok: false, code: `INVALID_${name.toUpperCase()}` });
        }
        query[name] = raw === null ? '' : normalizeAirport(raw);
      }
      // Resolve current occurrence through a trusted server dependency, keeping
      // the optional origin/destination query contract from #579. Never trust a
      // caller's partnerId, rights or occurrenceKey query values.
      const occurrence = await resolveOccurrence({ partnerId, flight, ...query });
      if (!occurrence || normalizePartnerFlight(occurrence.flight) !== flight
        || !normalizeAirport(occurrence.origin) || !normalizeAirport(occurrence.destination)
        || (query.origin && normalizeAirport(occurrence.origin) !== query.origin)
        || (query.destination && normalizeAirport(occurrence.destination) !== query.destination)
        || typeof occurrence.occurrenceKey !== 'string' || !occurrence.occurrenceKey.trim()) {
        return reply(res, 503, { ok: false, code: 'OCCURRENCE_UNAVAILABLE' });
      }
      const result = await readPartnerGate({ flight, origin: occurrence.origin,
        destination: occurrence.destination, occurrenceKey: occurrence.occurrenceKey },
      { partnerId, readRadar, resolveRights, now: dependencies.now });
      return reply(res, result.code === 'RADAR_UNAVAILABLE' ? 502 : result.code ? 503 : 200, result);
    } catch {
      // Dependency failures do not leak tokens, provider errors or rights records.
      return reply(res, 503, { ok: false, code: 'PARTNER_API_UNAVAILABLE' });
    }
  };
}
