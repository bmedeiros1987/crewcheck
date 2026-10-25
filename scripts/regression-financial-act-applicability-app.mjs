import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { guardStaticHtml } from '../server/static-html-guard.mjs';

// Actual compiled app and its production stylesheet, not the component fixture.
// Every account, token, roster and local action below is synthetic and offline.
const { chromium } = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || import.meta.url)('playwright');
const out = path.resolve('artifacts/financial-ui/shared-act-app');
fs.mkdirSync(out, { recursive: true });
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const html = fs.readFileSync('dist/index.html'); // Missing build is a failure, never a skip.
const cssPaths = [...html.toString().matchAll(/href=["']([^"']+\.css(?:\?[^"']*)?)["']/g)].map(match => path.join('dist', match[1].split('?')[0].replace(/^\//, '')));
assert(cssPaths.length > 0, 'compiled HTML must load a production stylesheet');
const css = cssPaths.map(file => ({ file, sha256: digest(fs.readFileSync(file)) }));
const source = fs.readFileSync('server.mjs', 'utf8');
const ast = ts.createSourceFile('server.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const serve = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'serveStatic');
assert(serve, 'actual production static handler must exist');
const scope = vm.createContext({ guardStaticHtml, fs, path, Buffer, distDir: path.resolve('dist'), sendJson: (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); } });
vm.runInContext(serve.getText(ast) + '\nglobalThis.respond = serveStatic;', scope);
const server = http.createServer((req, res) => scope.respond(req, res, new URL(req.url, 'http://localhost')));
const owner = 'synthetic-shared-act-app';
const key = 'crewcheck_financial_act_applicability_v1:' + owner;
function seed({ owner }) {
  const NativeDate = Date, instant = Date.parse('2026-10-18T15:00:00Z');
  globalThis.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [instant])); } static now() { return instant; } };
  if (localStorage.getItem('synthetic-shared-act-seeded')) return;
  localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: owner, email: 'synthetic@example.invalid', name: 'SYNTHETIC ACT', role: 'user' }));
  localStorage.setItem('crewcheck_auth_token', 'synthetic-only');
  localStorage.setItem('crewcheck:first-access-tour:v1434:disabled', '1');
  sessionStorage.setItem('crewcheck:first-access-tour:v1434:session-seen', '1');
  localStorage.setItem('crewcheck_demo_mode_seen', '1');
  localStorage.setItem('crewcheck:financial-privacy:v2:' + owner, 'shown');
  const days = Array.from({ length: 31 }, (_, i) => ({ date: String(i + 1).padStart(2, '0') + '/10/2026', dayOfWeek: 'SYN', type: 'DO', pairingCode: 'DO', dutyReport: null, dutyDebrief: null, legs: [], dutyHours: 0, flyingHours: 0, isNextDay: false, hotel: null, base: 'GRU', rawText: 'SYNTHETIC QA ONLY' }));
  const leg = (flightNumber, origin, destination, departureTime, arrivalTime) => ({ flightNumber, origin, destination, departureTime, arrivalTime, workType: 'OP', duration: 120, aircraftType: 'SYN' });
  days[19] = { ...days[19], type: 'FLIGHT', pairingCode: 'SYN-DOM', dutyReport: '08:00', dutyDebrief: '17:00', dutyReportSource: 'published', dutyDebriefSource: 'published', legs: [leg('SYN1001', 'GRU', 'BSB', '10:00', '12:00'), leg('SYN1002', 'BSB', 'GRU', '14:00', '16:00')], dutyHours: 9, flyingHours: 4 };
  days[22] = { ...days[22], type: 'FLIGHT', pairingCode: 'SYN-INT', base: 'JFK', dutyReport: '11:00', dutyDebrief: '21:30', dutyReportSource: 'published', dutyDebriefSource: 'published', legs: [leg('SYNUSD', 'JFK', 'GRU', '13:00', '21:00')], dutyHours: 10.5, flyingHours: 8 };
  const roster = { crewName: 'SYNTHETIC ACT', crewId: 'SYNTHETIC', base: 'GRU', rank: 'CC', airline: 'LA', month: 10, year: 2026, days, rawText: 'SYNTHETIC — NO REAL ROSTER' };
  localStorage.setItem('crewcheck_roster_choice_v1_' + owner, JSON.stringify({ owner, roster, selection: 'explicit', cacheSchema: 'p0-operational-date-anchor-v2', sourceFileName: 'Synthetic ACT only' }));
  localStorage.setItem('synthetic-shared-act-seeded', '1');
}
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true });
const cases = [], blocked = [], errors = [];
try {
  for (const width of [390, 1440]) for (const role of ['cabin', 'pilot']) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, timezoneId: 'America/Sao_Paulo', serviceWorkers: 'block' });
    await context.addInitScript(seed, { owner });
    await context.route('**/*', route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname.startsWith('/api/')) {
        blocked.push({ path: url.pathname, method: request.method() });
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, state: 'unavailable', code: 'SYNTHETIC_OFFLINE' }) });
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const saved = () => page.evaluate(key => localStorage.getItem(key), key);
    const open = async () => {
      await page.goto(origin + '/app');
      await page.locator('.cz-app').waitFor();
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'perdiem' })));
      await page.locator('.cc-payment-overview').waitFor();
      await page.locator('[data-financial-act-context]').waitFor();
    };
    await open();
    assert.equal(await saved(), null, 'opening the compiled app never enrolls its parsed airline/profile');
    const control = page.locator('[data-financial-act-context]');
    assert.match(await control.innerText(), /Empresa e ACT ainda não confirmados/);
    await control.getByText('Confirmar ou revisar aplicação financeira do ACT', { exact: true }).click();
    assert.equal(await control.getByLabel(/^Empregador/).count(), 1);
    assert.equal(await control.getByLabel(/^Perfil do ACT/).count(), 1);
    assert.equal(await control.getByLabel(/^Empregador/).inputValue(), '');
    assert.equal(await control.getByLabel(/^Perfil do ACT/).inputValue(), '');
    const before = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith('crewcheck_financial_')).sort().map(key => [key, localStorage.getItem(key)])));
    await control.getByLabel(/^Empregador/).selectOption('TAM_LINHAS_AEREAS_SA');
    await control.getByLabel(/^Perfil do ACT/).selectOption(role);
    await control.getByLabel(/Declaro que meu vínculo/).check();
    const prepare = control.getByRole('button', { name: 'Preparar declaração sem gravar', exact: true });
    await prepare.click();
    assert.equal(await saved(), null);
    const prefix = `${role}-${width}`;
    await control.screenshot({ path: path.join(out, prefix + '-review.png') });
    await control.getByRole('button', { name: 'Cancelar prévia', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith('crewcheck_financial_')).sort().map(key => [key, localStorage.getItem(key)]))), before, 'preview/cancel does not change financial storage');
    await prepare.click();
    await control.getByRole('button', { name: 'Confirmar e salvar declaração nesta conta', exact: true }).click();
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key) || 'null')?.revision === 1, key);
    const journal = JSON.parse(await saved());
    assert.equal(journal.ownerId, owner); assert.equal(journal.events[0].role, role);
    assert.equal(journal.events[0].from, '2026-01-01');
    assert.doesNotMatch(await saved(), /synthetic-only|token|amount|109\.44/, 'journal contains applicability, not credentials or tariff backfill');
    await open();
    assert.equal(JSON.parse(await saved()).revision, 1, 'reload preserves one-time selection without rewriting');
    await page.getByRole('button', { name: 'Extrato', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.cc-payment-overview')?.dataset.financialScreen === 'statement');
    const minimum = page.locator('[data-allowance-minimum-reference]');
    await minimum.waitFor();
    assert.match(await minimum.innerText(), /separada da previsão empresarial/);
    assert.match(await minimum.innerText(), /não entram no total empresarial completo/);
    await minimum.getByText('Itens e fontes da referência mínima', { exact: true }).click();
    assert.match(await minimum.innerText(), /28,70/);
    assert.match(await minimum.innerText(), /US\$|USD/);
    assert.equal(await page.locator('.cc-per-diem-items > [data-financial-currency="USD"]').count(), 0, 'minimum rows must not enter the ordinary enterprise table');
    const domestic = page.locator('.cc-per-diem-items > [data-financial-currency="BRL"]');
    assert(await domestic.count() > 0);
    assert.match(await domestic.filter({ hasText: 'Almoço' }).first().innerText(), /109,44/);
    assert.match(await page.locator('.cc-per-diem-summary').innerText(), /pendentes/);
    await minimum.screenshot({ path: path.join(out, prefix + '-minimum.png') });
    await page.getByRole('button', { name: 'Ocultar valores financeiros', exact: true }).click();
    assert.doesNotMatch(await minimum.innerText(), /28,70/);
    await minimum.screenshot({ path: path.join(out, prefix + '-hidden.png') });
    await page.getByRole('button', { name: 'Mostrar valores financeiros', exact: true }).click();
    assert.match(await minimum.innerText(), /28,70/);
    await control.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, prefix + '-app.png'), fullPage: false });
    const layout = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth, styles: [...document.styleSheets].filter(sheet => sheet.href).map(sheet => sheet.href), minHeight: getComputedStyle(document.querySelector('[data-financial-act-context] select')).minHeight, rootFontSize: getComputedStyle(document.documentElement).fontSize }));
    assert(layout.width <= layout.viewport + 1, 'actual app has no horizontal overflow');
    assert(layout.styles.some(url => /\/assets\/.*\.css/.test(url)), 'real compiled stylesheet was loaded');
    assert.equal(parseFloat(layout.minHeight), 2.75 * parseFloat(layout.rootFontSize), 'ACT production CSS rule is active');
    cases.push({ width, role, layout, revision: journal.revision });
    await context.close();
  }
  assert.deepEqual(errors, []);
  assert.equal(blocked.filter(request => request.path.startsWith('/api/platform/finance/') && request.method !== 'GET').length, 0, 'incomplete minimum estimate never becomes a persisted complete forecast');
  const screenshots = fs.readdirSync(out).filter(name => name.endsWith('.png')).map(name => ({ name, sha256: digest(fs.readFileSync(path.join(out, name))) }));
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ synthetic: true, headSha: process.env.GITHUB_EVENT_PATH ? JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')).pull_request?.head?.sha ?? null : null, checkoutSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), htmlSha256: digest(html), css, cases, screenshots, blocked, errors }, null, 2));
  console.log('PASS actual compiled app/CSS ACT controls: both roles, mobile/desktop, no auto enrollment, preview/cancel zero writes, explicit saved selection/reload, native minimum separation, incomplete totals and privacy');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
