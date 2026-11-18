// Outage recovery tooling (29/10): maintenance entry, name-only env inventory and the read-only
// post-cutover smoke. Local only: loopback servers, synthetic responses, no secret, no provider.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { smoke, releaseMatches } from './ops/post-cutover-smoke.mjs';
import { renderYamlNames, codeNames, serverSources, parseNameList, compareNames, CRITICAL, REQUIRED, PRESENCE_LOCKED } from './ops/env-names.mjs';

const notice = 'Sistema em manutenção. Estamos trabalhando para restabelecer o acesso.';

// 1. Maintenance entry: independent of the app, honest 503, never cached, exact notice.
const entry = fs.readFileSync('ops/maintenance/server.mjs', 'utf8'), html = fs.readFileSync('ops/maintenance/index.html', 'utf8');
assert.deepEqual([...entry.matchAll(/^import .* from '([^']+)';$/gm)].map(m => m[1]).sort(), ['node:fs', 'node:http', 'node:path', 'node:url'], 'node builtins only: no server.mjs, no app module');
assert.doesNotMatch(entry.slice(entry.indexOf('function routeOf')), /new URL\(req/, 'request targets are never parsed with URL (malformed targets cannot throw)');
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
  // Malformed request targets over a raw socket (fetch would normalize them): an answer, no crash.
  const raw = target => new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => socket.write(`GET ${target} HTTP/1.1\r\nHost: crewcheck.online\r\nConnection: close\r\n\r\n`));
    let data = ''; socket.on('data', d => { data += d; }); socket.on('end', () => resolve(data)); socket.on('error', reject);
  });
  for (const target of ['//%', '//[', '//%zz/api/x', '/%', '/api/%E0%A4%A', '*', 'http://[::1', '//' + 'a'.repeat(4000)]) {
    const answer = await raw(target);
    assert.match(answer, /^HTTP\/1\.1 (503|400) /, `answers ${JSON.stringify(target.slice(0, 20))}: ${answer.slice(0, 40)}`);
  }
  assert.equal(child.exitCode, null, 'the process is still running after malformed targets');
  assert.equal((await get('/')).status, 503, 'and keeps serving');

  // 2. Smoke: the maintenance entry passes only in maintenance mode.
  const asMaintenance = await smoke(base, { expectMaintenance: true });
  assert.equal(asMaintenance.ok, true, JSON.stringify(asMaintenance));
  const asApp = await smoke(base);
  assert.equal(asApp.ok, false, 'maintenance is never taken for the restored app');
} finally { child.kill('SIGTERM'); }

// Synthetic app and synthetic platform suspension (no network).
const respond = routes => async url => { const r = routes[new URL(url).pathname] || [404, 'text/plain', '', {}]; return new Response(r[2], { status: r[0], headers: { 'content-type': r[1], ...(r[3] || {}) } }); };
const sha = '39f3e84adca7ee047489a41385751a875d5a2248', other = '0123456789abcdef0123456789abcdef01234567';
const appWith = (healthRelease, releaseRoute = [200, 'application/json', JSON.stringify({ ok: true, release: healthRelease })]) => respond({
  '/api/health': [200, 'application/json', JSON.stringify({ ok: true, app: 'CrewCheck', release: healthRelease })], '/api/release': releaseRoute,
  '/': [200, 'text/html', '<!doctype html><div id="root"></div>'], '/sw.js': [200, 'text/javascript', 'self.addEventListener("fetch",()=>{})'], '/manifest.json': [200, 'application/json', '{}'] });
assert.equal((await smoke('https://synthetic.invalid', { fetchImpl: appWith(sha), expectedRelease: sha })).ok, true);
assert.equal((await smoke('https://synthetic.invalid', { fetchImpl: appWith(sha), expectedRelease: sha.slice(0, 12) })).ok, true, 'unambiguous prefix');
assert.equal((await smoke('https://synthetic.invalid', { fetchImpl: appWith(sha, [404, 'text/plain', '']), expectedRelease: sha })).ok, true, '/api/release optional');
const mismatch = await smoke('https://synthetic.invalid', { fetchImpl: appWith(other), expectedRelease: sha });
assert.equal(mismatch.ok, false, 'another release never passes the cutover gate');
assert.deepEqual(mismatch.results.filter(r => !r.ok).map(r => r.name), ['/api/health reports the expected release', '/api/release agrees when served']);
assert.equal((await smoke('https://synthetic.invalid', { fetchImpl: appWith(sha, [200, 'application/json', JSON.stringify({ release: other })]), expectedRelease: sha })).ok, false, 'routes disagreeing');
assert.equal((await smoke('https://synthetic.invalid', { fetchImpl: appWith(sha, [200, 'text/html', '<html>']), expectedRelease: sha })).ok, false, 'SPA fallback is not a release');
assert.equal((await smoke('https://synthetic.invalid', { fetchImpl: appWith(sha) })).ok, false, 'no expected release, no pass');
assert.equal((await smoke('https://synthetic.invalid', { fetchImpl: appWith('local'), expectedRelease: sha })).ok, false, "a build without commit ('local')");
for (const [reported, expected, ok] of [[sha, sha, true], [sha, sha.slice(0, 7), true], [sha, sha.slice(0, 6), false], [sha, 'ABCDEF1', false], [sha.slice(0, 12), sha.slice(0, 12), false], ['', sha, false]])
  assert.equal(releaseMatches(reported, expected), ok, `${reported} vs ${expected}`);
const suspended = respond({ '/api/health': [503, 'text/html', '<title>Service Suspended</title>', { 'x-render-routing': 'suspend' }], '/': [503, 'text/html', 'Service Suspended', { 'x-render-routing': 'suspend' }] });
const s1 = await smoke('https://synthetic.invalid', { fetchImpl: suspended });
assert.equal(s1.ok, false); assert.equal(s1.results[0].ok, false, 'platform suspension detected first');
assert.equal((await smoke('https://synthetic.invalid', { fetchImpl: suspended, expectMaintenance: true })).ok, false);
const healthOnly = respond({ '/api/health': [200, 'application/json', JSON.stringify({ ok: true, app: 'CrewCheck' })] });
assert.equal((await smoke('https://synthetic.invalid', { fetchImpl: healthOnly, expectedRelease: sha })).ok, false, 'health alone is not enough');

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
// Old vs new presence, never values: only truly required names are demanded; optional
// derivation-sensitive names must keep their old presence (absent stays absent).
const old = ['DATABASE_URL', 'CREWCHECK_AUTH_SECRET', 'TELEGRAM_BOT_TOKEN', 'MYSQL_SSL_MODE'];
let report = compareNames(old, [...old]);
assert.equal(report.ok, true, 'optional salts and keys absent on both sides is correct');
assert.deepEqual([report.requiredMissing, report.presenceChanged, report.missingFromOld], [[], [], []]);
report = compareNames(old, [...old, 'CREWCHECK_DATA_ENCRYPTION_KEY']);
assert.equal(report.ok, false, 'adding an unset derivation key changes stored ciphertexts');
assert.deepEqual(report.presenceChanged, [{ name: 'CREWCHECK_DATA_ENCRYPTION_KEY', old: 'unset', new: 'set' }]);
report = compareNames([...old, 'CREWCHECK_AUDIT_HASH_SALT'], old);
assert.deepEqual([report.ok, report.presenceChanged[0]], [false, { name: 'CREWCHECK_AUDIT_HASH_SALT', old: 'set', new: 'unset' }]);
report = compareNames(old, old.filter(n => n !== 'CREWCHECK_AUTH_SECRET'));
assert.deepEqual([report.ok, report.requiredMissing], [false, ['CREWCHECK_AUTH_SECRET']]);
report = compareNames(old, old.filter(n => n !== 'TELEGRAM_BOT_TOKEN'));
assert.deepEqual([report.ok, report.missingFromOld], [false, ['TELEGRAM_BOT_TOKEN']], 'configuration the old service had is not dropped');
report = compareNames(old, [...old, 'NODE_VERSION']);
assert.deepEqual([report.ok, report.addedOnNew], [true, ['NODE_VERSION']], 'a non-sensitive addition is reported, not failed');
assert.deepEqual(compareNames([], ['DATABASE_URL']).requiredMissing, ['CREWCHECK_AUTH_SECRET']);
assert(!PRESENCE_LOCKED.some(n => REQUIRED.includes(n)));

console.log('PASS ops recovery: maintenance entry independent/honest 503/no-store/exact notice and survives malformed targets, smoke pins the expected release and tells app, maintenance and platform suspension apart, env names compared old vs new by presence only');
