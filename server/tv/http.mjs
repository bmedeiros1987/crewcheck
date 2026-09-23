import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createDeviceService } from './devices.mjs';
import { createPilotStore } from './pilot-store.mjs';
import { readPilotPolicy } from './pilot-policy.mjs';
import { createTvHandler } from './routes.mjs';
import { buildUberPhoneHandoff, tvAirportMobilityPoint } from './mobility.mjs';
import { airlineVisualFor } from './airline-visual.mjs';
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
function tvNextFlightOrigin(snapshot, nowMs) {
  if (!snapshot || snapshot.privacy !== 'private' || !Array.isArray(snapshot.days)) return null;
  const flight = snapshot.days.flatMap(day => Array.isArray(day.activities) ? day.activities : [])
    .filter(activity => activity?.kind === 'flight' && Number.isFinite(Date.parse(activity.endAt)) && Date.parse(activity.endAt) > nowMs)
    .sort((a,b) => Date.parse(a.startAt) - Date.parse(b.startAt))[0];
  return tvAirportCode(flight?.origin);
}
function tvFlightDigits(value) {
  const match=String(value||'').toUpperCase().match(/(\d{2,5})$/);
  return match ? match[1] : '';
}
function tvNextFlight(snapshot, nowMs) {
  if (!snapshot || snapshot.privacy !== 'private' || !Array.isArray(snapshot.days)) return null;
  return snapshot.days.flatMap(day => Array.isArray(day.activities) ? day.activities : [])
    .filter(activity => activity?.kind === 'flight' && activity.flight && Number.isFinite(Date.parse(activity.endAt)) && Date.parse(activity.endAt) > nowMs)
    .sort((a,b) => Date.parse(a.startAt) - Date.parse(b.startAt))[0] || null;
}
async function tvTrafficContext(origin, flight, routeOrigin, now) {
  if (!flight?.origin || !routeOrigin) return null;
  const airport=tvAirportMobilityPoint(flight.origin);
  const latitude=Number(routeOrigin.latitude), longitude=Number(routeOrigin.longitude);
  if (!airport || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  let timer;
  try {
    const endpoint=new URL(origin + '/api/maps/route-preview');
    endpoint.searchParams.set('origin',`${latitude},${longitude}`);
    endpoint.searchParams.set('destination',`${airport.lat},${airport.lon}`);
    endpoint.searchParams.set('mode','driving');
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('traffic_timeout')),4500);});
    const response=await Promise.race([fetch(endpoint,{headers:{Accept:'application/json'}}),timeout]);
    if (!response?.ok) return null;
    const payload=await response.json();
    if (!payload?.ok) return null;
    const durationText=String(payload.durationInTrafficText||payload.durationText||'').trim().slice(0,48)||null;
    const delayText=String(payload.trafficDelayText||'').trim().slice(0,48)||null;
    const incidents=Array.isArray(payload.incidents)?payload.incidents.length:null;
    if (!durationText && !delayText) return null;
    return {
      value:{
        durationText,
        delayText,
        status: payload.hasRoadClosure ? 'Via com bloqueio' : delayText ? 'Trânsito com impacto' : 'Rota atualizada',
        incidents,
      },
      source:'crewcheck-route-preview',
      observedAt:now.toISOString(),
      expiresAt:new Date(now.getTime()+3*60*1000).toISOString(),
    };
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function tvGateContext(origin, flight, now) {
  if (!flight?.flight || !flight?.origin || !flight?.destination) return null;
  let timer;
  try {
    const endpoint=new URL(origin + '/api/radar-flight');
    endpoint.searchParams.set('flight',flight.flight);
    endpoint.searchParams.set('origin',flight.origin);
    endpoint.searchParams.set('destination',flight.destination);
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('radar_timeout')),3800);});
    const response=await Promise.race([fetch(endpoint,{headers:{Accept:'application/json'}}),timeout]);
    if (!response?.ok) return null;
    const payload=await response.json();
    const gate=String(payload?.gate||'').trim().slice(0,24);
    if (!payload?.ok || !gate || Number(payload.quality||0)<35) return null;
    const expectedDigits=tvFlightDigits(flight.flight), actualDigits=tvFlightDigits(payload.flight);
    if (expectedDigits && actualDigits && expectedDigits!==actualDigits) return null;
    const returnedOrigin=tvAirportCode(payload.origin), returnedDestination=tvAirportCode(payload.destination);
    if (returnedOrigin && returnedOrigin!==tvAirportCode(flight.origin)) return null;
    if (returnedDestination && returnedDestination!==tvAirportCode(flight.destination)) return null;
    return {
      value:{label:gate,remoteStand:null},
      source:'crewcheck-radar',
      observedAt:now.toISOString(),
      expiresAt:new Date(now.getTime()+5*60*1000).toISOString(),
    };
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function tvAttachCrewDetails(snapshot, roster, allowed) {
  if (!allowed || snapshot?.privacy !== 'private' || !Array.isArray(roster?.days)) return {};
  const details = {};
  const activities = (snapshot.days || []).flatMap(day => Array.isArray(day.activities) ? day.activities : []);
  for (const activity of activities) {
    if (activity?.kind !== 'flight' || !activity.journeyId || !activity.flight) continue;
    const day = roster.days.find(item => {
      const [dd,mm,yyyy] = String(item?.date || '').split('/');
      return dd && mm && yyyy && `${yyyy}-${mm}-${dd}` === activity.date;
    });
    if (!day || !Array.isArray(day.legs)) continue;
    const leg = day.legs.find(item => String(item?.flightNumber || '').trim().toUpperCase() === String(activity.flight).trim().toUpperCase());
    if (!leg || !Array.isArray(leg.crew)) continue;
    const current = details[activity.journeyId] ||= { crew: [] };
    const seen = new Set(current.crew.map(item => `${item.role}|${item.name}`));
    for (const member of leg.crew.slice(0, 16)) {
      const name = String(member?.name || '').trim().slice(0, 100);
      const role = String(member?.role || '').trim().slice(0, 24);
      if (!name) continue;
      const key = `${role}|${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      current.crew.push({ role: role || 'Tripulante', name });
    }
  }
  return details;
}

function mergeJourneyDetails(...sources) {
  const merged = {};
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    for (const [key, value] of Object.entries(source)) {
      if (!value || typeof value !== 'object') continue;
      merged[key] = { ...(merged[key] || {}), ...value };
    }
  }
  return merged;
}

function tvAttachStayDetails(snapshot, stays, allowed) {
  if (!allowed || snapshot?.privacy !== 'private' || !Array.isArray(stays)) return {};
  const details = {};
  const activities = (snapshot.days || []).flatMap(day => Array.isArray(day.activities) ? day.activities : []);
  for (const activity of activities) {
    if (activity?.kind !== 'stay' || !activity.journeyId) continue;
    const date=String(activity.date||'').slice(0,10);
    const airport=tvAirportCode(activity.destination)||tvAirportCode(activity.origin);
    const matches=stays.filter(stay=>String(stay?.stay_date||'').slice(0,10)===date);
    const stay=matches.find(item=>!airport||tvAirportCode(item?.airport)===airport)||matches[0];
    if (!stay?.hotel_name) continue;
    details[activity.journeyId]={
      hotel:{
        name:String(stay.hotel_name).trim().slice(0,180),
        room:null,
        transport:null,
      },
    };
  }
  return details;
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
        const preferences = auth.preferences || { audience: 'owner', share: {} };
        const audience = ['owner','family','visitor'].includes(preferences.audience) ? preferences.audience : 'owner';
        // Family/visitor projection is redacted before any enrichment. Client
        // visibility is never treated as a privacy boundary.
        const effectivePrivacy = audience === 'owner' ? auth.privacy : 'family';
        const snapshot = projectRoster(data.roster, {
          deviceId: auth.deviceId, snapshotId: randomUUID(), sourceVersion: data.sourceVersion,
          month: `${data.roster.year}-${String(data.roster.month).padStart(2, '0')}`,
          privacy: effectivePrivacy,
          // Family/visitor may receive the scheduled route only when explicitly
          // allowed. Flight number and ground metadata remain redacted.
          routeVisibility:
            audience === 'owner'
              ? 'flight'
              : preferences.share?.operational !== false
                ? 'route'
                : 'none',
          generatedAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + 60000).toISOString(), now,
        });
        snapshot.audience = audience;
        snapshot.sharePermissions = {
          operational: preferences.share?.operational !== false,
          weather: preferences.share?.weather !== false,
          hotel: audience === 'owner' && preferences.share?.hotel === true,
          crew: audience === 'owner' && preferences.share?.crew === true,
          finance: audience === 'owner' && preferences.share?.finance === true,
          mobility: audience === 'owner' && preferences.share?.mobility === true,
        };
        snapshot.journeyDetails = mergeJourneyDetails(
          tvAttachStayDetails(
            snapshot,
            data.stays,
            snapshot.sharePermissions.hotel === true,
          ),
          tvAttachCrewDetails(
            snapshot,
            data.roster,
            snapshot.sharePermissions.crew === true,
          ),
        );
        snapshot.mobility = null;
        if (snapshot.profile) {
          snapshot.profile.airlineVisual = airlineVisualFor(
            snapshot.profile.airline,
            process.env.CREWCHECK_TV_AIRLINE_VISUALS_JSON || '',
          );
        }
        const settings = policy();
        const base = audience === 'owner' && effectivePrivacy === 'private' && snapshot.sharePermissions.weather ? tvAirportCode(data.roster.base) : null;
        const stay = audience === 'owner' && snapshot.sharePermissions.weather ? tvNextStayAirport(snapshot, now.getTime()) : null;
        const targets = [{ role: 'base', airport: base }, ...(stay && stay !== base ? [{ role: 'stay', airport: stay }] : [])];
        const weatherContexts = (await Promise.all(targets.map(target => tvWeatherContext(settings.origin, target.airport, target.role, now)))).filter(Boolean);
        snapshot.weatherContexts = weatherContexts;
        const primary = weatherContexts.find(item => item.role === 'base') || weatherContexts[0] || null;
        snapshot.weather = primary ? {
          value: { airport: primary.airport, temperature: primary.temperature, label: primary.label },
          source: primary.source, observedAt: primary.observedAt, expiresAt: primary.expiresAt,
        } : null;
        const mobilityAirport = audience === 'owner' && effectivePrivacy === 'private' ? tvNextFlightOrigin(snapshot, now.getTime()) : null;
        snapshot.mobility = buildUberPhoneHandoff({
          clientId: process.env.UBER_CLIENT_ID,
          airport: mobilityAirport,
          audience,
          allowed: snapshot.sharePermissions.mobility === true,
        });
        const nextFlight = audience === 'owner' && effectivePrivacy === 'private' && snapshot.sharePermissions.operational ? tvNextFlight(snapshot, now.getTime()) : null;
        snapshot.gate = nextFlight ? await tvGateContext(settings.origin, nextFlight, now) : null;
        const routeOrigin = audience === 'owner' && effectivePrivacy === 'private' && preferences.share?.traffic === true
          ? auth.context?.routeOrigin || null
          : null;
        snapshot.traffic = nextFlight && routeOrigin ? await tvTrafficContext(settings.origin, nextFlight, routeOrigin, now) : null;
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
    const accountRoute = ['/api/tv/approve', '/api/tv/revoke', '/api/tv/devices', '/api/tv/preferences', '/api/tv/context'].includes(url.pathname);
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
