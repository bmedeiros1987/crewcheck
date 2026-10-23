import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

// Entire unmodified Vite build and production worker, never an extracted screen.
// Only the local HTTP auth response and pre-existing saved account are fixtures.
const dist = path.resolve(process.env.CREWCIERGE_PWA_DIST || 'dist');
const output = path.resolve(process.env.CREWCIERGE_PWA_EVIDENCE || fs.mkdtempSync(path.join(os.tmpdir(), 'crewcierge-pwa-')));
fs.mkdirSync(output, { recursive: true });
const require = createRequire(process.env.CREWCHECK_PLAYWRIGHT_PACKAGE || import.meta.url);
const { chromium } = require('playwright');
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const worker = fs.readFileSync(path.join(dist, 'sw.js'), 'utf8');
assert.ok(!worker.includes('__CREWCHECK_UPDATE_BUILD_ID__'), 'Use the complete stamped production build');
const report = { scope: 'Complete Vite App + real service worker, synthetic retained session; browser only, not physical device',
  sourceSha: process.env.CREWCIERGE_PWA_SOURCE_SHA || process.env.GITHUB_SHA || 'local-unrecorded',
  htmlSha256: createHash('sha256').update(html).digest('hex'), workerSha256: createHash('sha256').update(worker).digest('hex'),
  steps: [], errors: [], externalBlocked: [], requests: [], offlineResponses: [] };
const user = { id: 'synthetic-pwa-a', email: 'synthetic-pwa-a@example.test', name: 'Synthetic PWA', emailVerified: true, premiumAccess: true };
// Same normalizer used by the real PDF parser. Never hand-remove its preserved
// clock evidence to make the offline fixture pass.
const normalizerBundle = await build({ stdin: { contents: 'export {normalizeRosterDays} from "./client/src/lib/canonicalRoster.ts";', resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm' });
const { normalizeRosterDays } = await import('data:text/javascript;base64,' + Buffer.from(normalizerBundle.outputFiles[0].text).toString('base64'));
const roster = normalizeRosterDays({ year: 2032, month: 10, base: 'BSB', rank: 'CCM', days: [{ date: '10/10/2032', year: 2032, month: 10, dayNumber: 10, type: 'VOO', pairingCode: 'SYN', base: 'BSB', dutyReport: '07:25', dutyDebrief: '14:05', dutyReportSource: 'published', dutyDebriefSource: 'published', legs: [{ flightNumber: 'QA1', origin: 'BSB', destination: 'GRU', departureTime: '08:20', arrivalTime: '13:35', presentationTime: '07:25', workType: 'OP' }] }] });
assert.ok(roster.days[0].publishedClockEvidence);
const contentHash = createHash('sha256').update(JSON.stringify(roster)).digest('hex');
const key = 'crewcheck_roster_choice_v1_' + user.id;
// Fixture represents an already saved capture, not a capture stamped on read.
const selected = JSON.stringify({ owner: user.id, roster, selection: 'explicit', choiceIntent: '', sourceFileName: 'Synthetic saved publication', cacheSchema: 'p0-operational-date-anchor-v2', crewCiergeCapture: { capturedAt: new Date().toISOString(), revision: 'synthetic-saved-revision', contentHash } });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  report.requests.push({ path: url.pathname, method: req.method });
  res.setHeader('Cache-Control', 'no-store');
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET' && url.pathname === '/api/auth/me') res.end(JSON.stringify({ ok: true, authenticated: true, user }));
    else res.writeHead(503).end(JSON.stringify({ ok: false, message: 'Synthetic local fixture: service unavailable' }));
    return;
  }
  const requested = path.resolve(dist, '.' + url.pathname);
  if (!requested.startsWith(dist + path.sep) && requested !== dist) { res.writeHead(403).end(); return; }
  if (path.extname(requested) && !fs.existsSync(requested)) { res.writeHead(404).end(); return; }
  const file = fs.existsSync(requested) && fs.statSync(requested).isFile() ? requested : path.join(dist, 'index.html');
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let serverClosed = false, offline = false;
const browser = await chromium.launch({ headless: true, ...(process.env.CREWCHECK_CHROMIUM_EXECUTABLE ? { executablePath: process.env.CREWCHECK_CHROMIUM_EXECUTABLE } : {}),
  args: ['--disable-background-networking', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const context = await browser.newContext({ serviceWorkers: 'allow', timezoneId: process.env.TZ || 'UTC' });
// Routing only blocks foreign origins. It never fulfills navigation or assets.
await context.route('**/*', route => {
  if (new URL(route.request().url()).origin === origin) return route.continue();
  report.externalBlocked.push(new URL(route.request().url()).origin);
  return route.abort();
});
await context.addInitScript(({ user, key, selected }) => {
  window.__pwaFixtureFetches = [];
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url || String(input), location.href);
    window.__pwaFixtureFetches.push({ path: url.pathname, method: init?.method || input.method || 'GET' });
    return originalFetch(input, init);
  };
  if (!localStorage.getItem('__synthetic_pwa_seeded')) {
    localStorage.setItem('crewcheck_auth_token', 'synthetic-local-session-a');
    localStorage.setItem('crewcheck_auth_user', JSON.stringify(user));
    localStorage.setItem(key, selected);
    localStorage.setItem('__synthetic_pwa_seeded', '1');
  }
}, { user, key, selected });
const observe = async page => {
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('response', response => { if (offline && (response.request().isNavigationRequest() || /\/assets\/.*\.(js|css)$/.test(response.url()))) report.offlineResponses.push({ path: new URL(response.url()).pathname, status: response.status(), worker: response.fromServiceWorker() }); });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
};
const page = await context.newPage();
await observe(page);
const ready = async page => {
  await page.locator('main.cz-app').waitFor({ timeout: 30_000 });
  const later = page.getByRole('button', { name: 'Explorar depois', exact: true });
  if (await later.isVisible()) await later.click();
  // Existing app navigation event, no component extraction or test-only runtime.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'concierge' })));
  await page.getByRole('heading', { name: 'Concierge CrewCheck', exact: true }).waitFor({ timeout: 30_000 });
};
const ask = async (page, question, expected) => {
  const requestsBefore = await page.evaluate(() => window.__pwaFixtureFetches.length);
  await page.locator('textarea.cz-update-textarea').fill(question);
  await page.getByRole('button', { name: 'Consultar', exact: true }).click();
  const answer = page.getByRole('heading', { name: 'Resposta do Concierge' }).locator('..').locator('p');
  await answer.waitFor();
  await page.waitForFunction(expected => {
    const heading = [...document.querySelectorAll('h3')].find(h => h.textContent === 'Resposta do Concierge');
    return heading?.parentElement?.innerText.includes(expected)
      && [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Consultar' && !b.disabled);
  }, expected);
  assert.match(await answer.innerText(), new RegExp(expected));
  assert.equal(await page.evaluate(() => window.__pwaFixtureFetches.length), requestsBefore, 'Local question must not invoke fetch, restore or HTTP fallback');
  return answer.innerText();
};
try {
  await page.goto(origin + '/?view=concierge', { waitUntil: 'load' });
  await ready(page);
  await page.evaluate(async () => { await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(Error('Worker installation did not complete')), 30_000))]); });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const cache = await page.evaluate(async () => {
    const names = await caches.keys();
    const entries = [];
    for (const name of names) { const cache = await caches.open(name); entries.push({ name, urls: (await cache.keys()).map(r => new URL(r.url).pathname) }); }
    return entries;
  });
  assert.ok(cache.some(c => c.urls.includes('/index.html') && c.urls.some(u => u.startsWith('/assets/'))));
  const buildAssets = JSON.parse(worker.match(/const CREWCHECK_UPDATE_ASSETS=(\[[^\n]+\]);/)[1]);
  assert.ok(buildAssets.every(url => cache.some(c => c.urls.includes(url))), 'Complete stamped build assets must be cached');
  report.cache = cache;
  report.steps.push('Full application online local-only warmup; real stamped worker controls page and caches shell/assets');
  const before = await page.evaluate(key => localStorage.getItem(key), key);
  assert.equal(before, selected, 'Boot must not recapture saved roster');
  await context.setOffline(true);
  offline = true;
  await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  serverClosed = true;
  const requestCount = report.requests.length;
  await page.reload({ waitUntil: 'load' });
  await ready(page);
  assert.equal(await page.evaluate(() => navigator.onLine), false);
  const answer = await ask(page, 'q horas é a prx jornada?', '400 min');
  assert.match(answer, /Cache capturado/);
  assert.match(answer, /America\/Sao_Paulo/);
  await ask(page, 'qual APZ?', 'Você quer a apresentação no aeroporto');
  await ask(page, 'quanto vou receber?', 'Não entendi');
  assert.equal(await page.evaluate(key => localStorage.getItem(key), key), before);
  report.steps.push('Full offline reload with local server stopped, HTTP cache disabled; saved duty, APZ clarification and unsupported all local');
  await page.screenshot({ path: path.join(output, 'offline-reload.png'), fullPage: true });
  // Fresh document and empty sessionStorage: only persistent owner-bound cache.
  const cold = await context.newPage(); await observe(cold);
  await cold.goto(origin + '/?view=concierge&syntheticCold=1', { waitUntil: 'load' });
  await ready(cold);
  assert.equal(await cold.evaluate(() => sessionStorage.getItem('crewcheck_roster')), null);
  await ask(cold, 'Quando começa minha próxima jornada?', '400 min');
  report.steps.push('New offline tab boots complete App from real worker and owner-bound localStorage without sessionStorage');
  report.offlineBootFetchAttempts = await cold.evaluate(() => window.__pwaFixtureFetches);
  // Real app boot still probes local service endpoints; all fail offline. Never
  // mistake those server-independent failures for proof of zero boot attempts.
  assert.ok(report.offlineBootFetchAttempts.every(r => !/concierge|groq|openai/i.test(r.path)), 'Boot must not invoke Concierge or model transport offline');
  await page.close();
  const legacy = JSON.parse(before); delete legacy.crewCiergeCapture;
  const legacyRaw = JSON.stringify(legacy);
  await cold.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key, raw: legacyRaw });
  await cold.reload({ waitUntil: 'load' }); await ready(cold);
  await ask(cold, 'próxima jornada', 'indisponíveis');
  assert.equal(await cold.evaluate(key => localStorage.getItem(key), key), legacyRaw, 'Legacy cache remains undated after full offline boot/read');
  report.steps.push('Legacy capture absent: full offline reload reports unavailable and never dates cache on read');
  await cold.evaluate(() => {
    window.dispatchEvent(new Event('crewcheck:auth-will-change'));
    localStorage.setItem('crewcheck_auth_token', 'synthetic-local-session-b');
    localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'synthetic-pwa-b', name: 'Synthetic B', email: 'synthetic-pwa-b@example.test' }));
    window.dispatchEvent(new Event('crewcheck:auth-changed'));
  });
  await cold.reload({ waitUntil: 'load' }); await ready(cold);
  await ask(cold, 'próxima jornada', 'indisponíveis');
  assert.equal(await cold.evaluate(key => localStorage.getItem(key), key), legacyRaw);
  assert.equal(await cold.evaluate(() => localStorage.getItem('crewcheck_roster_choice_v1_synthetic-pwa-b')), null);
  report.steps.push('A→B full offline boot: no A answer, no cross-account selection write or fabricated data');
  await cold.evaluate(() => {
    window.dispatchEvent(new Event('crewcheck:auth-will-change'));
    localStorage.removeItem('crewcheck_auth_token');
    window.dispatchEvent(new Event('crewcheck:auth-expired'));
  });
  await cold.waitForURL(url => url.pathname === '/login');
  await cold.reload({ waitUntil: 'load' });
  assert.equal(new URL(cold.url()).pathname, '/login');
  assert.equal(await cold.getByRole('heading', { name: 'Resposta do Concierge' }).count(), 0);
  report.steps.push('Logout routes to login; full offline login reload retains no Concierge answer');
  const empty = await browser.newContext({ serviceWorkers: 'allow', offline: true });
  try {
    const fresh = await empty.newPage();
    await assert.rejects(fresh.goto(origin + '/', { waitUntil: 'load', timeout: 10_000 }));
    report.steps.push('Negative control: new browser context without worker/cache cannot install/boot first time offline');
  } finally { await empty.close(); }
  assert.ok(report.offlineResponses.some(r => r.worker && r.path === '/'));
  assert.ok(report.offlineResponses.some(r => r.worker && /\.js$/.test(r.path)));
  assert.ok(report.offlineResponses.every(r => r.worker && r.status === 200), 'All offline navigation/assets delivered by worker');
  assert.equal(report.requests.length, requestCount, 'Stopped local server receives no offline request');
  assert.deepEqual(report.errors, [], 'No complete-app runtime errors');
  report.passed = true;
  console.log('PASS complete PWA offline reload + new-tab boot, real worker/assets, saved account, local answers; server stopped and HTTP cache disabled');
} catch (error) {
  report.failure = String(error.stack || error);
  const visible = context.pages().find(p => !p.isClosed());
  await visible?.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
  fs.writeFileSync(path.join(output, 'failure-body.txt'), visible ? await visible.locator('body').innerText().catch(() => '') : '');
  throw error;
} finally {
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log('PWA evidence: ' + output);
  await browser.close();
  if (!serverClosed) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
}
