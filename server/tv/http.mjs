import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createDeviceService } from './devices.mjs';
import { createPilotStore } from './pilot-store.mjs';
import { readPilotPolicy } from './pilot-policy.mjs';
import { createTvHandler } from './routes.mjs';
const execFileAsync = promisify(execFile);
const safeCodes = new Set(['ERR_MODULE_NOT_FOUND','ERR_PACKAGE_PATH_NOT_EXPORTED','ENOENT','EACCES','ECONNREFUSED','ETIMEDOUT','ER_TABLEACCESS_DENIED_ERROR','ER_DBACCESS_DENIED_ERROR','ER_ACCESS_DENIED_ERROR','ER_PARSE_ERROR','ER_NO_SUCH_TABLE','ER_BAD_FIELD_ERROR']);
async function prepareStep(stage, action) {
  try { return await action(); }
  catch (error) {
    // Fixed stage names and bounded codes only. Never print message/stack,
    // SQL, child stderr, environment, account identity or device credentials.
    console.warn('[tv:prepare] '+JSON.stringify({stage,code:safeCodes.has(error?.code)?error.code:'preparation_failed',exitCode:typeof error?.code==='number'?error.code:null}));
    throw error;
  }
}

const tvWeatherCache = new Map();
function tvAirportCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}
function tvNextStayAirport(snapshot, nowMs) {
  if (!snapshot || snapshot.privacy !== 'private' || !Array.isArray(snapshot.days)) return null;
  const stays = snapshot.days.flatMap(day => Array.isArray(day.activities) ? day.activities : [])
    .filter(activity => activity?.kind === 'stay' && Number.isFinite(Date.parse(activity.endAt)) && Date.parse(activity.endAt) > nowMs)
    .sort((a,b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  const stay = stays[0];
  return tvAirportCode(stay?.destination) || tvAirportCode(stay?.origin);
}
async function tvWeatherContext(origin, airport, role, now) {
  if (!airport) return null;
  const key = airport;
  const cached = tvWeatherCache.get(key);
  if (cached && cached.until > now.getTime()) return { ...cached.value, role };
  let timer;
  try {
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('weather_timeout')), 4500); });
    const response = await Promise.race([
      fetch(origin + '/api/weather/airport?airport=' + encodeURIComponent(airport), { headers: { Accept: 'application/json' } }),
      timeout,
    ]);
    if (!response?.ok) return null;
    const payload = await response.json();
    if (!payload || payload.ok !== true || tvAirportCode(payload.airport) !== airport || !Number.isFinite(Number(payload.temperature))) return null;
    const observedAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
    const value = {
      role,
      airport,
      city: typeof payload.city === 'string' ? payload.city.slice(0, 80) : null,
      temperature: Number(payload.temperature),
      label: typeof payload.condition === 'string' ? payload.condition.slice(0, 80) : 'Condição atual',
      wind: Number.isFinite(Number(payload.wind)) ? Number(payload.wind) : null,
      rainChance: Number.isFinite(Number(payload.rainChance)) ? Number(payload.rainChance) : null,
      source: 'crewcheck-weather/airport',
      observedAt,
      expiresAt,
    };
    tvWeatherCache.set(key, { value: { ...value, role: 'base' }, until: now.getTime() + 5 * 60 * 1000 });
    if (tvWeatherCache.size > 24) {
      for (const [cacheKey, entry] of tvWeatherCache) if (entry.until <= now.getTime()) tvWeatherCache.delete(cacheKey);
    }
    return value;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function createTvHttpBridge({ getDatabase, authenticateAccount, loadActiveRoster, readBody }) {
  let ready;
  const policy = () => readPilotPolicy();
  async function prepare() {
    const settings = policy();
    if (!settings.enabled) throw new Error('pilot_unavailable');
    if (settings.bootstrap) {
      const cwd = fileURLToPath(new URL('../../', import.meta.url));
      await prepareStep('projection-build', () => execFileAsync(process.execPath, ['scripts/tv-server-build.mjs'], { cwd, timeout: 45000, maxBuffer: 1000000 }));
    }
    const { projectRoster } = await prepareStep('projection-import', () => import('../../dist/tv-server/core.mjs'));
    const store = createPilotStore(getDatabase);
    if (settings.bootstrap) await prepareStep('registry-init', () => store.initialize());
    await prepareStep('registry-check', () => store.check());
    const devices = createDeviceService({ store, pairingOrigin: settings.origin, accountAllowed: user => policy().allows(user) });
    const handler = createTvHandler({
      enabled: true,
      devices,
      authenticateAccount: async token => {
        const user = await authenticateAccount(token);
        return policy().allows(user) ? user : null;
      },
      rateLimit: async (ip, path) => store.transaction(state => {
        state.limits ??= {};
        const now = Date.now();
        for (const [key, value] of Object.entries(state.limits)) if (value.until <= now) delete state.limits[key];
        const key = createHash('sha256').update(`${ip}:${path}`).digest('hex');
        if (!state.limits[key] && Object.keys(state.limits).length >= 10000) return false;
        const bucket = state.limits[key] ??= { count: 0, until: now + 60000 };
        return ++bucket.count <= (path.endsWith('/pair') || path.endsWith('/approve') ? 10 : 60);
      }),
      loadProjection: async auth => {
        if (!policy().allows(auth.userId)) return null;
        const data = await loadActiveRoster(auth.userId);
        if (!data?.roster || !policy().allows(auth.userId)) return null;
        const now = new Date();
        const snapshot = projectRoster(data.roster, {
          deviceId: auth.deviceId, snapshotId: randomUUID(), sourceVersion: data.sourceVersion,
          month: `${data.roster.year}-${String(data.roster.month).padStart(2, '0')}`,
          privacy: auth.privacy, generatedAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + 60000).toISOString(), now,
        });
        const settings = policy();
        const base = auth.privacy === 'private' ? tvAirportCode(data.roster.base) : null;
        const stay = tvNextStayAirport(snapshot, now.getTime());
        const targets = [{ role: 'base', airport: base }, ...(stay && stay !== base ? [{ role: 'stay', airport: stay }] : [])];
        const weatherContexts = (await Promise.all(targets.map(target => tvWeatherContext(settings.origin, target.airport, target.role, now)))).filter(Boolean);
        snapshot.weatherContexts = weatherContexts;
        const primary = weatherContexts.find(item => item.role === 'base') || weatherContexts[0] || null;
        snapshot.weather = primary ? {
          value: { airport: primary.airport, temperature: primary.temperature, label: primary.label },
          source: primary.source, observedAt: primary.observedAt, expiresAt: primary.expiresAt,
        } : null;
        return snapshot;
      },
      news: async () => ({ generatedAt: new Date().toISOString(), stale: true, items: [] }),
    });
    return { handler, store };
  }
  return async (req, res, url) => {
    if (!url.pathname.startsWith('/api/tv/')) return false;
    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-CrewCheck-Server-Time': String(Date.now()), 'Access-Control-Expose-Headers': 'X-CrewCheck-Server-Time', Vary: 'Origin' });
      res.end(status === 204 ? undefined : JSON.stringify(body));
    };
    const settings = policy();
    if (!settings.enabled) { send(404, { error: 'unavailable' }); return true; }
    const origin = String(req.headers.origin || '');
    const accountRoute = ['/api/tv/approve', '/api/tv/revoke', '/api/tv/devices'].includes(url.pathname);
    if (!settings.allowsOrigin(origin, accountRoute)) { send(403, { error: 'origin_not_allowed' }); return true; }
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      send(204, null); return true;
    }
    try {
      if (!ready) ready = prepare().catch(error => { ready = null; throw error; });
      const { handler, store } = await ready;
      if (!policy().enabled) { send(403, { error: 'pilot_not_authorized' }); return true; }
      if (req.method === 'GET' && url.pathname === '/api/tv/status') {
        await prepareStep('registry-status', () => store.check());
        send(200, { schemaVersion: 1, available: true, mode: 'restricted-pilot', pairing: true, news: false, commit: process.env.RENDER_GIT_COMMIT || null });
        return true;
      }
      const token = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1] || '';
      const body = req.method === 'POST' ? await readBody(req, 4096) : {};
      const result = await handler({ method: req.method, path: url.pathname, token, body, ip: req.socket.remoteAddress || 'unknown' });
      if (!policy().enabled) send(403, { error: 'pilot_not_authorized' });
      else send(result.status, result.body);
    } catch {
      send(503, { error: 'temporarily_unavailable' });
    }
    return true;
  };
}
