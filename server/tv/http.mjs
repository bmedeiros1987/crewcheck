import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createDeviceService } from './devices.mjs';
import { createPilotStore } from './pilot-store.mjs';
import { readPilotPolicy } from './pilot-policy.mjs';
import { createTvHandler } from './routes.mjs';
const execFileAsync = promisify(execFile);

// Only the already-existing Render preview is activated. Main remains unchanged.
// The compiled canonical projector is prepared once, never from user input.
export function createTvHttpBridge({ getDatabase, authenticateAccount, loadActiveRoster, readBody }) {
  let ready;
  const policy = () => readPilotPolicy();
  async function prepare() {
    const settings = policy();
    if (!settings.enabled) throw new Error('pilot_unavailable');
    if (settings.bootstrap) {
      const cwd = fileURLToPath(new URL('../../', import.meta.url));
      await execFileAsync(process.execPath, ['scripts/tv-server-build.mjs'], { cwd, timeout: 45000, maxBuffer: 1000000 });
    }
    const { projectRoster } = await import('../../dist/tv-server/core.mjs');
    const store = createPilotStore(getDatabase);
    // Explicit, preview-only opt-in. Creates a separate bounded registry and does
    // not touch main's existing TV registry, accounts, rosters or operational data.
    if (settings.bootstrap) await store.initialize();
    await store.check();
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
        return projectRoster(data.roster, {
          deviceId: auth.deviceId, snapshotId: randomUUID(), sourceVersion: data.sourceVersion,
          month: `${data.roster.year}-${String(data.roster.month).padStart(2, '0')}`,
          privacy: auth.privacy, generatedAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + 60000).toISOString(), now,
        });
      },
      news: async () => ({ generatedAt: new Date().toISOString(), stale: true, items: [] }),
    });
    return { handler, store };
  }
  return async (req, res, url) => {
    if (!url.pathname.startsWith('/api/tv/')) return false;
    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', Vary: 'Origin' });
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
        await store.check();
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
