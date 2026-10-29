// Outage recovery tooling (29/10): maintenance entry, name-only env inventory and the read-only
// post-cutover smoke. Local only: loopback servers, synthetic responses, no secret, no provider.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { smoke } from './ops/post-cutover-smoke.mjs';
import { renderYamlNames, codeNames, serverSources, parseNameList, missingCritical, CRITICAL } from './ops/env-names.mjs';

const notice = 'Sistema em manutenção. Estamos trabalhando para restabelecer o acesso.';

// 1. Maintenance entry: independent of the app, honest 503, never cached, exact notice.
const entry = fs.readFileSync('ops/maintenance/server.mjs', 'utf8'), html = fs.readFileSync('ops/maintenance/index.html', 'utf8');
assert.deepEqual([...entry.matchAll(/^import .* from '([^']+)';$/gm)].map(m => m[1]).sort(), ['node:fs', 'node:http', 'node:path', 'node:url'], 'node builtins only: no server.mjs, no app module');
assert.doesNotMatch(entry, /process\.env\.(?!PORT\b)|setInterval|setTimeout|fetch\(|DATABASE|TOKEN|SECRET/, 'no secret, timer, outbound call or database');
assert(html.includes(notice) && html.includes('lang="pt-BR"') && html.includes('name="robots" content="noindex"'));
assert.doesNotMatch(html, /https?:\/\/|<script|<link|<img/i, 'self-contained: no external resource or script');
assert.doesNotMatch(html.replace(notice, ''), /minuto|hora|prazo|em breve|dados|seguro|intact/i, 'no promised time or data state');

const env = { PATH: process.env.PATH, PORT: '0' };
const port = await new Promise((resolve, reject) => {
  const probe = http.createServer().listen(0, '127.0.0.1', () => { const p = probe.address().port; probe.close(() => resolve(p)); });
  probe.on('error', reject);
});
const child = spawn(process.execPath, ['ops/maintenance/server.mjs'], { env: { ...env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
let stderr = ''; child.stderr.on('data', d => { stderr += d; });
await new Promise((resolve, reject) => { child.stdout.on('data', d => { if (String(d).includes('listening')) resolve(); }); child.on('exit', code => reject(Error(`exited ${code}: ${stderr}`))); });
const base = `http://127.0.0.1:${port}`;
try {
  const get = async (path, method = 'GET') => { const r = await fetch(base + path, { method }); return { status: r.status, type: r.headers.get('content-type'), cache: r.headers.get('cache-control'), robots: r.headers.get('x-robots-tag'), retry: r.headers.get('retry-after'), text: await r.text() }; };
  for (const path of ['/', '/?app=1', '/escala', '/sw.js', '/manifest.json', '/index.html']) {
    const r = await get(path);
    assert.equal(r.status, 503, path); assert.match(r.type, /text\/html/, path); assert.equal(r.cache, 'no-store', path);
    assert.equal(r.robots, 'noindex'); assert.equal(r.retry, null, 'no Retry-After: no promised time'); assert(r.text.includes(notice), path);
  }
  for (const path of ['/api/health', '/api/telegram/webhook', '/api/anything']) {
    const r = await get(path);
    assert.equal(r.status, 503, path); assert.match(r.type, /application\/json/); assert.equal(r.cache, 'no-store');
    assert.deepEqual(JSON.parse(r.text), { ok: false, maintenance: true, message: notice });
  }
  const post = await fetch(base + '/api/telegram/webhook', { method: 'POST', body: '{"update_id":1}' });
  assert.equal(post.status, 503, 'a webhook delivery is refused (provider retries), never accepted and dropped');
  const health = await get('/__maintenance/health');
  assert.equal(health.status, 200); assert.deepEqual(JSON.parse(health.text), { ok: true, maintenance: true });
  const head = await get('/', 'HEAD'); assert.equal(head.status, 503); assert.equal(head.text, '');

  // 2. Smoke: the maintenance entry passes only in maintenance mode.
  const asMaintenance = await smoke(base, { expectMaintenance: true });
  assert.equal(asMaintenance.ok, true, JSON.stringify(asMaintenance));
  const asApp = await smoke(base);
  assert.equal(asApp.ok, false, 'maintenance is never taken for the restored app');
} finally { child.kill('SIGTERM'); }

// Synthetic app and synthetic platform suspension (no network).
const respond = routes => async url => { const r = routes[new URL(url).pathname] || [404, 'text/plain', '', {}]; return new Response(r[2], { status: r[0], headers: { 'content-type': r[1], ...(r[3] || {}) } }); };
const app = respond({ '/api/health': [200, 'application/json', JSON.stringify({ ok: true, app: 'CrewCheck' })], '/': [200, 'text/html', '<!doctype html><div id="root"></div>'],
  '/sw.js': [200, 'text/javascript', 'self.addEventListener("fetch",()=>{})'], '/manifest.json': [200, 'application/json', '{}'] });
assert.equal((await smoke('https://synthetic.invalid', { fetchImpl: app })).ok, true);
const suspended = respond({ '/api/health': [503, 'text/html', '<title>Service Suspended</title>', { 'x-render-routing': 'suspend' }], '/': [503, 'text/html', 'Service Suspended', { 'x-render-routing': 'suspend' }] });
const s1 = await smoke('https://synthetic.invalid', { fetchImpl: suspended });
assert.equal(s1.ok, false); assert.equal(s1.results[0].ok, false, 'platform suspension detected first');
assert.equal((await smoke('https://synthetic.invalid', { fetchImpl: suspended, expectMaintenance: true })).ok, false);
const healthOnly = respond({ '/api/health': [200, 'application/json', JSON.stringify({ ok: true, app: 'CrewCheck' })] });
assert.equal((await smoke('https://synthetic.invalid', { fetchImpl: healthOnly })).ok, false, 'health alone is not enough');

// 3. Env inventory by name only.
const render = renderYamlNames(fs.readFileSync('render.yaml', 'utf8'));
assert(render.secret.includes('DATABASE_URL') && render.secret.includes('CREWCHECK_AUTH_SECRET'));
assert(render.generated.includes('CREWCHECK_SCHEDULER_SECRET') && render.declared.includes('NODE_VERSION'));
const sources = serverSources(process.cwd());
const read = codeNames(sources);
for (const name of ['CREWCHECK_AUDIT_HASH_SALT', 'CREWCHECK_DATA_ENCRYPTION_KEY', 'CREWCHECK_GOOGLE_TOKEN_ENCRYPTION_KEY', 'DATABASE_URL', 'CREWCHECK_AUTH_SECRET']) assert(read.includes(name), `scanner sees ${name} (env(), envAny([]), process.env)`);
const known = new Set([...render.secret, ...render.declared, ...render.generated, ...read, ...fs.readFileSync('.env.example', 'utf8').match(/^[A-Z][A-Z0-9_]+/gm)]);
assert.deepEqual(CRITICAL.filter(n => !known.has(n)), [], 'every critical name exists in render.yaml, the code or .env.example (no typo)');
assert.throws(() => parseNameList('DATABASE_URL=mysql://x'), /Only variable names/);
assert.throws(() => parseNameList('TELEGRAM_BOT_TOKEN: abc'), /Only variable names/);
assert.throws(() => parseNameList('lowercase'), /Only variable names/);
assert.deepEqual(parseNameList('# from dashboard\nDATABASE_URL\n\nMYSQL_SSL_MODE\n'), ['DATABASE_URL', 'MYSQL_SSL_MODE']);
const missing = missingCritical(['DATABASE_URL', 'MYSQL_SSL_MODE']);
assert(missing.keepSame.includes('CREWCHECK_AUTH_SECRET') && !missing.keepSame.includes('DATABASE_URL') && missing.publicUrls.length === 3);
assert.deepEqual(missingCritical(CRITICAL), { keepSame: [], providerBound: [], publicUrls: [] });

console.log('PASS ops recovery: maintenance entry independent/honest 503/no-store/exact notice, smoke tells app, maintenance and platform suspension apart, env inventory by name only');
