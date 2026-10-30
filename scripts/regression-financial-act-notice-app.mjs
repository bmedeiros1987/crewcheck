import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { guardStaticHtml } from '../server/static-html-guard.mjs';

// Actual compiled app (prepared Home caller + production CSS), synthetic account/roster, offline.
// The ACT notice follows the displayed period's items that wait on the owner's declaration — not
// the mere existence of a declaration event:
//  - absent / revoked / expired / declaration for another month -> short notice "Confirme seus dados
//    para calcular as diárias" + "Revisar dados", details collapsed, the period's dates and cause;
//  - valid declaration, account manual value or explicit manual zero -> no notice, only a discreet
//    collapsed control (a valid own value needs no redundant ACT);
//  - unreadable/invalid local declaration -> short error status, data preserved;
//  - pending stays pending (no amount), explicit zero stays R$ 0,00;
//  - account switch: the next account sees its own state, the previous journal is untouched;
//  - Portuguese and English (static translator), 390 px, no overflow; never promises that the
//    confirmation resolves APZ, ledger or other pending items. Screenshots in artifacts/.
const { chromium } = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || import.meta.url)('playwright');
const out = path.resolve('artifacts/financial-ui/act-notice');
fs.mkdirSync(out, { recursive: true });
assert.match(fs.readFileSync('client/src/pages/Home.tsx', 'utf8'), /account-active-reconciliation-fenced-v1/, 'run after node scripts/v139/apply.mjs and a web build');
fs.readFileSync('dist/index.html'); // Missing build is a failure, never a skip.
const source = fs.readFileSync('server.mjs', 'utf8');
const ast = ts.createSourceFile('server.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const serve = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'serveStatic');
assert(serve, 'actual production static handler must exist');
const scope = vm.createContext({ guardStaticHtml, fs, path, Buffer, distDir: path.resolve('dist'), sendJson: (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); } });
vm.runInContext(serve.getText(ast) + '\nglobalThis.respond = serveStatic;', scope);
const server = http.createServer((req, res) => scope.respond(req, res, new URL(req.url, 'http://localhost')));

const OWNER_A = 'synthetic-act-notice-a', OWNER_B = 'synthetic-act-notice-b';
const journalKey = owner => 'crewcheck_financial_act_applicability_v1:' + encodeURIComponent(owner);
const manualKey = owner => 'crewcheck_financial_settings_v1:' + encodeURIComponent(owner) + ':crewcheck_perdiem_rate_domestic';
const active = (revision, from, through) => ({ revision, from, through, confirmed: true, source: 'owner_financial_confirmation', active: true, employer: 'TAM_LINHAS_AEREAS_SA', role: 'cabin', coverage: 'clause_1_2_included' });
const revoke = (revision, from, through) => ({ revision, from, through, confirmed: true, source: 'owner_financial_confirmation', active: false });
const journal = (owner, events) => JSON.stringify({ schema: 1, ownerId: owner, revision: events.length, events });
const STATES = {
  absent: { notice: true, cause: 'act_missing', causeText: /Empresa e ACT não confirmados para estas datas\./ },
  confirmed: { notice: false, journal: owner => journal(owner, [active(1, '2026-01-01', '2027-11-30')]), amount: /109,44/ },
  manual: { notice: false, manual: '120', amount: /120,00/ },
  zero: { notice: false, manual: '0', amount: /R\$\s?0,00/ },
  revoked: { notice: true, journal: owner => journal(owner, [active(1, '2026-01-01', '2027-11-30'), revoke(2, '2026-10-01', '2027-11-30')]), cause: 'act_revoked', causeText: /Aplicação do ACT revogada para estas datas\./ },
  expired: { notice: true, journal: owner => journal(owner, [active(1, '2026-01-01', '2026-09-30')]), cause: 'act_expired', causeText: /Declaração do ACT fora do período destas datas\./ },
  otherMonth: { notice: true, journal: owner => journal(owner, [active(1, '2026-11-01', '2027-11-30')]), cause: 'act_missing', causeText: /Empresa e ACT não confirmados para estas datas\./ },
  invalid: { error: true, journal: () => '{corrupt' },
};

function seed({ owner, other, language, journalRaw, manual, throwOnJournal }) {
  const NativeDate = Date, instant = Date.parse('2026-10-18T15:00:00Z');
  globalThis.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [instant])); } static now() { return instant; } };
  if (throwOnJournal) {
    const get = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) { if (String(key).startsWith('crewcheck_financial_act_applicability_v1:')) throw new Error('synthetic storage failure'); return get.call(this, key); };
  }
  if (localStorage.getItem('synthetic-act-notice-seeded')) return;
  localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: owner, email: 'synthetic@example.invalid', name: 'SYNTHETIC ACT', role: 'user' }));
  localStorage.setItem('crewcheck_auth_token', 'synthetic-only');
  localStorage.setItem('crewcheck:first-access-tour:v1434:disabled', '1');
  sessionStorage.setItem('crewcheck:first-access-tour:v1434:session-seen', '1');
  localStorage.setItem('crewcheck_demo_mode_seen', '1');
  localStorage.setItem('crewcheck_language', language);
  const days = Array.from({ length: 31 }, (_, i) => ({ date: String(i + 1).padStart(2, '0') + '/10/2026', dayOfWeek: 'SYN', type: 'DO', pairingCode: 'DO', dutyReport: null, dutyDebrief: null, legs: [], dutyHours: 0, flyingHours: 0, isNextDay: false, hotel: null, base: 'GRU', rawText: 'SYNTHETIC QA ONLY' }));
  const leg = (flightNumber, origin, destination, departureTime, arrivalTime) => ({ flightNumber, origin, destination, departureTime, arrivalTime, workType: 'OP', duration: 120, aircraftType: 'SYN' });
  days[19] = { ...days[19], type: 'FLIGHT', pairingCode: 'SYN-DOM', dutyReport: '08:00', dutyDebrief: '17:00', dutyReportSource: 'published', dutyDebriefSource: 'published', legs: [leg('SYN1001', 'GRU', 'BSB', '10:00', '12:00'), leg('SYN1002', 'BSB', 'GRU', '14:00', '16:00')], dutyHours: 9, flyingHours: 4 };
  const roster = { crewName: 'SYNTHETIC ACT', crewId: 'SYNTHETIC', base: 'GRU', rank: 'CC', airline: 'LA', month: 10, year: 2026, days, rawText: 'SYNTHETIC — NO REAL ROSTER' };
  for (const id of [owner, other]) {
    localStorage.setItem('crewcheck_roster_choice_v1_' + id, JSON.stringify({ owner: id, roster, selection: 'explicit', cacheSchema: 'p0-operational-date-anchor-v2', sourceFileName: 'Synthetic ACT only' }));
    localStorage.setItem('crewcheck:financial-privacy:v2:' + id, 'shown');
  }
  if (journalRaw) localStorage.setItem('crewcheck_financial_act_applicability_v1:' + encodeURIComponent(owner), journalRaw);
  if (manual !== undefined) localStorage.setItem('crewcheck_financial_settings_v1:' + encodeURIComponent(owner) + ':crewcheck_perdiem_rate_domestic', manual);
  localStorage.setItem('synthetic-act-notice-seeded', '1');
}

const TEXT = {
  pt: { notice: 'Confirme seus dados para calcular as diárias.', review: 'Revisar dados', summary: 'Confirmar ou revisar aplicação financeira do ACT', error: 'Não foi possível ler seus dados de diárias neste aparelho.', dates: 'Datas pendentes neste período:' },
  en: { notice: 'Confirm your details to calculate allowances.', review: 'Review details', summary: 'Confirm or review the ACT financial application', error: 'Could not read your allowance details on this device.', dates: 'Pending dates in this period:' },
};
const PROMISE = /APZ|ledger|razão financeira|resolve(rá|m)? (todas|tudo)|all pending|resolves (all|every)/i;

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
const results = [], errors = [], blocked = [];
async function openApp(language, args) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, locale: language === 'en' ? 'en-US' : 'pt-BR', timezoneId: 'America/Sao_Paulo', serviceWorkers: 'block' });
  await context.addInitScript(seed, { owner: OWNER_A, other: OWNER_B, language, ...args });
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname.startsWith('/api/')) { blocked.push({ path: url.pathname, method: request.method() }); return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, code: 'SYNTHETIC_OFFLINE' }) }); }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/app');
  await page.locator('.cz-app').waitFor();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'perdiem' })));
  await page.locator('.cc-payment-overview').waitFor();
  await page.locator('[data-financial-act-context]').waitFor();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(250);
  return { context, page };
}
const textOf = async locator => ((await locator.innerText()) || '').replace(/\s+/g, ' ').trim();

try {
  for (const language of ['pt', 'en']) {
    const T = TEXT[language];
    for (const [name, state] of Object.entries(STATES)) {
      const { context, page } = await openApp(language, { journalRaw: state.journal?.(OWNER_A), manual: state.manual });
      const control = page.locator('[data-financial-act-context]');
      const shown = await textOf(control);
      const details = control.locator(':scope > details');
      if (state.error) {
        assert.equal(await control.getAttribute('data-financial-act-context'), 'unavailable', `${name}: error state`);
        assert.ok(shown.includes(T.error), `${name}/${language}: short error status (${shown})`);
      } else if (state.notice) {
        assert.ok(shown.startsWith(T.notice), `${name}/${language}: short notice first (${shown.slice(0, 80)})`);
        assert.ok(await control.getByRole('button', { name: T.review, exact: true }).isVisible(), `${name}/${language}: review button`);
        assert.equal(await details.evaluate(node => node.open), false, `${name}/${language}: details collapsed by default`);
        assert.ok(Number(await control.getAttribute('data-financial-act-pending')) > 0, `${name}: period items wait on the declaration`);
        await page.locator('[data-financial-act-context]').screenshot({ path: path.join(out, `${name}-${language}-collapsed.png`) });
        await control.getByRole('button', { name: T.review, exact: true }).click();
        assert.equal(await details.evaluate(node => node.open), true, `${name}/${language}: review opens the details`);
        const opened = await textOf(control);
        assert.ok(opened.includes(T.dates) && /20\/10/.test(opened), `${name}/${language}: dates of this period`);
        assert.deepEqual(await control.locator('[data-act-cause]').evaluateAll(nodes => nodes.map(node => node.dataset.actCause)), [state.cause], `${name}: cause`);
        if (language === 'pt') assert.match(await textOf(control.locator('[aria-label="Pendências deste período"]')), state.causeText, `${name}: cause text`);
        assert.doesNotMatch(await textOf(control.locator('[aria-label="Pendências deste período"]')), PROMISE, `${name}: no promise beyond the ACT reference`);
        // Pending is not zero: no amount for the waiting items, and the summary says pending.
        assert.doesNotMatch(await textOf(page.locator('.cc-per-diem-summary')), /R\$\s?0,00/, `${name}: pending is never R$ 0,00`);
      } else {
        assert.equal(await control.getAttribute('class'), 'cc-act-discreet', `${name}/${language}: discreet control`);
        assert.equal(Number(await control.getAttribute('data-financial-act-pending')), 0, `${name}: nothing waits on the declaration`);
        assert.ok(!shown.includes(T.notice), `${name}/${language}: no notice`);
        assert.equal(await details.evaluate(node => node.open), false, `${name}/${language}: collapsed`);
        assert.ok(shown.includes(T.summary), `${name}/${language}: control label (${shown})`);
        await page.getByRole('button', { name: language === 'en' ? 'Statement' : 'Extrato', exact: true }).click().catch(() => {});
        await page.waitForTimeout(200);
        assert.match(await textOf(page.locator('.cc-per-diem-items')), state.amount, `${name}: amount shown (${state.amount})`);
      }
      if (language === 'en') {
        // Visible interface text outside the marked Portuguese originals (closed details: summary only).
        const own = await control.evaluate(node => { const texts = []; const walk = n => { if (n.nodeType === 3) { const v = n.nodeValue.trim(); if (v) texts.push(v); return; } if (n.nodeType !== 1 || n.getAttribute('lang') === 'pt-BR' || ['SCRIPT', 'STYLE', 'OPTION'].includes(n.tagName)) return; if (n.tagName === 'DETAILS' && !n.open) { const summary = n.querySelector(':scope > summary'); if (summary) walk(summary); return; } n.childNodes.forEach(walk); }; walk(node); return texts.join(' | '); });
        assert.doesNotMatch(own, /\b(Confirme|Revisar|Datas|Declaração|Empresa|Não foi possível|Detalhes)\b/, `${name}/en: visible labels outside marked pt-BR text are English (${own})`);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert(overflow <= 1, `${name}/${language}: no horizontal overflow (${overflow})`);
      await control.scrollIntoViewIfNeeded();
      await page.locator('[data-financial-act-context]').screenshot({ path: path.join(out, `${name}-${language}.png`) });
      results.push({ name, language, shown: shown.slice(0, 160) });
      await context.close();
    }
    // Storage that throws while reading the declaration: short error, nothing written.
    {
      const { context, page } = await openApp(language, { throwOnJournal: true });
      const control = page.locator('[data-financial-act-context]');
      assert.equal(await control.getAttribute('data-financial-act-context'), 'unavailable', 'storage error state');
      assert.ok((await textOf(control)).includes(T.error), `storage error/${language}`);
      await control.screenshot({ path: path.join(out, `storage-error-${language}.png`) });
      results.push({ name: 'storageError', language });
      await context.close();
    }
    // Account switch: A confirmed (discreet), then B signs in: B sees its own notice, A's journal untouched.
    {
      const raw = STATES.confirmed.journal(OWNER_A);
      const { context, page } = await openApp(language, { journalRaw: raw });
      assert.equal(await page.locator('[data-financial-act-context]').getAttribute('class'), 'cc-act-discreet', 'A: discreet');
      await page.evaluate(([b]) => { window.dispatchEvent(new Event('crewcheck:auth-will-change')); localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: b, email: 'synthetic-b@example.invalid', name: 'SYNTHETIC B', role: 'user' })); localStorage.setItem('crewcheck_auth_token', 'synthetic-only-b'); window.dispatchEvent(new Event('crewcheck:auth-changed')); }, [OWNER_B]);
      await page.goto(origin + '/app');
      await page.locator('.cz-app').waitFor();
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'perdiem' })));
      await page.locator('[data-financial-act-context]').waitFor();
      await page.waitForTimeout(250);
      const control = page.locator('[data-financial-act-context]');
      assert.ok((await textOf(control)).startsWith(T.notice), `account switch/${language}: B sees its own notice`);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), journalKey(OWNER_A)), raw, 'A journal unchanged');
      assert.equal(await page.evaluate(key => localStorage.getItem(key), journalKey(OWNER_B)), null, 'B not enrolled');
      await control.screenshot({ path: path.join(out, `account-switch-${language}.png`) });
      results.push({ name: 'accountSwitch', language });
      await context.close();
    }
  }
  assert.deepEqual(errors, []);
  // Every /api call is answered locally (503); nothing reaches a server. No financial write is even attempted.
  assert.deepEqual(blocked.filter(request => request.method !== 'GET' && /financ|allowance|per-?diem|ledger/i.test(request.path)), [], 'no financial write attempted');
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ synthetic: true, results, blocked: blocked.length }, null, 2));
  console.log(`PASS ACT notice on the compiled app (prepared Home caller, synthetic, offline): absent/revoked/expired/other-month -> short notice + "Revisar dados", collapsed details with this period's dates and cause, no promise beyond the ACT reference, pending never R$ 0,00; confirmed/manual/explicit zero -> discreet control only (109,44 / 120,00 / R$ 0,00); invalid or throwing storage -> short error; account switch keeps A's journal and shows B's own notice; PT and EN; 390 px, no overflow; ${results.length} views, screenshots in artifacts/financial-ui/act-notice.`);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
