const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const { createRequire } = require('node:module');
const path = require('node:path');
const { tmpdir } = require('node:os');
const { pathToFileURL } = require('node:url');
const vm = require('node:vm');

const root = path.resolve(process.env.CREWCHECK_QA_ROOT || path.join(__dirname, '..'));
const sha = process.env.CREWCHECK_QA_SHA || '';
const baseline = process.env.CREWCHECK_QA_BASELINE_SHA === '1d241f98e16833fe232e46baa12b2dc363fc5023';
assert.match(sha, /^[a-f0-9]{40}$/, 'pass the source SHA of the prepared app and its dist');
const appRequire = createRequire(path.join(root, 'package.json'));
const temporary = fs.mkdtempSync(path.join(tmpdir(), 'crewcheck-allowance-flow-'));
const day = year => year + '-02-05T15:00:00Z';
const longDuty = '06:00 LA 4101 07:00 BSB GRU 08:30 (320) LA 4102 14:00 GRU BSB 16:00 (320) 17:00';
const routine = '08:00 LA 4101 09:00 BSB GRU 10:30 (320) LA 4102 11:30 GRU BSB 13:00 (320) 13:30';
const actor = name => ({ id: 'allowance-fixture-' + name.toLowerCase(), name: 'SYNTHETIC CREW ' + name,
  email: 'allowance-' + name.toLowerCase() + '@example.invalid', token: 'loopback-roster-fixture-' + name, role: 'user' });
const A = actor('A'), B = actor('B');
const withoutToken = ({ token: _unused, ...user }) => user;

async function fixtures() {
  const { build } = await import(pathToFileURL(appRequire.resolve('vite')).href);
  await build({ configFile: false, logLevel: 'silent', build: { lib: {
    entry: {
      parser: path.join(root, 'client/src/lib/aimsParser.ts'),
      policy: path.join(root, 'client/src/lib/nextFinancialPayment.ts'),
      periods: path.join(root, 'client/src/lib/financialHistoryPeriods.ts'),
    },
    formats: ['es'], fileName: (_format, name) => name + '.mjs',
  }, outDir: temporary, minify: false, emptyOutDir: false } });
  const load = name => import(pathToFileURL(path.join(temporary, name + '.mjs')).href);
  const { parseAimsRoster } = await load('parser');
  const { nextAllowancePayment } = await load('policy');
  const { nominalFinancialDays } = await load('periods');
  const publish = (user, month, { year = 2032, missingPrior = false, priorDuty = false } = {}) => {
    const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const tag = month === 1 ? 'Jan' : 'Feb';
    const mm = String(month).padStart(2, '0');
    const bp = user === A ? '00000001' : '00000002';
    const rows = Array.from({ length: count }, (_, i) => i + 1)
      .filter(n => !(missingPrior && month === 1 && n === 27))
      .map(n => {
        const activity = priorDuty && month === 1 && n === 30 ? longDuty
          : n >= 15 && n <= 19 ? routine : n === 27 && month === 1 ? 'DO' : 'VC';
        return String(n).padStart(2, '0') + tag + ' ' + activity;
      });
    const roster = parseAimsRoster([
      'Escala de Tripulante Convertida para padrão AIMS',
      'Tripulante: ' + user.name + ' -BP:' + bp + ' -Base: BSB -01/' + mm + '/' + year + ' até' + count + '/' + mm + '/' + year,
      ...rows,
    ].join('\n'));
    assert.equal(roster.month, month);
    assert.equal(roster.year, year);
    assert.ok(roster.crewId && roster.aimsFlightSourceCoverage, 'AIMS parsing supplies identity and provenance');
    return roster;
  };
  const jan = publish(A, 1), feb = publish(A, 2), janIncomplete = publish(A, 1, { missingPrior: true });
  const janPositive = publish(A, 1, { priorDuty: true });
  const janKnownDate = publish(A, 1, { year: 2026, priorDuty: true });
  const febKnownDate = publish(A, 2, { year: 2026 });
  const febB = publish(B, 2);
  assert.notEqual(febB.crewId, feb.crewId);
  assert.ok(!nominalFinancialDays([janIncomplete]).includes('2032-01-27'));
  assert.ok(janPositive.days.some(item => item.date === '30/01/2032' && item.legs.length === 2));
  const policy = (rosters, year, rows = []) => nextAllowancePayment(rows, [],
    rosters.map(r => r.year + '-' + String(r.month).padStart(2, '0')), new Date(day(year)), nominalFinancialDays(rosters), rosters);
  const zero = policy([jan, feb], 2032);
  assert.deepEqual([zero.range.start, zero.range.end], ['2032-01-28', '2032-02-03']);
  assert.deepEqual(zero.totals, { BRL: 0 });
  assert.deepEqual(zero.expectedPaymentDates, {});
  assert.equal(policy([janIncomplete, feb], 2032).totals, null);
  assert.equal(policy([feb], 2032).totals, null);
  const syntheticLine = year => ({ iso: year + '-01-30', label: 'Synthetic policy control',
    currency: 'BRL', value: 17, convertedBRL: 17, source: 'fixture-only test of date policy' });
  // These lines test the dates in Node. The browser receives rosters only.
  const future = policy([janPositive, feb], 2032, [syntheticLine(2032)]);
  assert.equal(future.totals.BRL, 17);
  assert.deepEqual(future.expectedPaymentDates, {});
  assert.equal(policy([janKnownDate, febKnownDate], 2026, [syntheticLine(2026)]).expectedPaymentDates.BRL, '2026-02-05');
  return { jan, feb, janIncomplete, janPositive, janKnownDate, febKnownDate, febB };
}

function staticServer() {
  const ts = appRequire('typescript');
  const filename = path.join(root, 'server.mjs');
  const ast = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const handlers = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === 'serveStatic');
  assert.equal(handlers.length, 1);
  const context = vm.createContext({ fs, path, Buffer, distDir: path.join(root, 'dist'),
    guardStaticHtml: appRequire('./server/static-html-guard.mjs').guardStaticHtml,
    sendJson(res, status, body) { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); } });
  vm.runInContext(handlers[0].getText(ast) + '\nglobalThis.respond=serveStatic;', context);
  return http.createServer((req, res) => {
    assert.ok(!req.url.startsWith('/api/'), 'API must be intercepted by the browser fixture');
    context.respond(req, res, new URL(req.url, 'http://localhost'));
  });
}

function initialStorage({ users, initial, clock }) {
  const NativeDate = Date, time = NativeDate.parse(clock);
  globalThis.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [time])); } static now() { return time; } };
  for (const item of users) {
    const owner = item.user.id;
    localStorage.setItem('crewcheck_roster_choice_v1_' + owner, JSON.stringify({
      owner, roster: item.active, selection: 'explicit', cacheSchema: 'p0-operational-date-anchor-v2',
      sourceFileName: 'Synthetic active roster',
    }));
    localStorage.setItem('crewcheck:home-layout:v1:' + owner, JSON.stringify({ version: 1, mode: 'standard',
      order: ['summary', 'finance', 'next', 'limits', 'smart'], visible: ['summary', 'finance', 'next', 'limits', 'smart'] }));
    localStorage.setItem('crewcheck_financial_settings_v1:' + owner + ':crewcheck_perdiem_rate_domestic', '17');
  }
  localStorage.setItem('crewcheck_auth_user', JSON.stringify(initial.user));
  localStorage.setItem('crewcheck_auth_token', initial.token);
  localStorage.setItem('crewcheck_language', 'pt');
  localStorage.setItem('crewcheck:first-access-tour:v1434:disabled', '1');
  sessionStorage.setItem('crewcheck:first-access-tour:v1434:session-seen', '1');
  localStorage.setItem('crewcheck_demo_mode_seen', '1');
}

const entry = (id, roster, active = false, revision = '2032-02-04T10:00:00Z') => ({
  id, roster, summary: { id, crewId: roster.crewId, crewName: roster.crewName, month: roster.month, year: roster.year,
    checksum: 'fixture-' + id, createdAt: revision, isActive: active, sourceFileName: id + '.pdf' },
});
const cycle = year => '28/01/' + year + ' a 03/02/' + year;
const normalize = text => text.replace(/\u00a0|\u202f/g, ' ').replace(/\s+/g, ' ').trim();
const prepare = (user, active, entries) => ({ user: withoutToken(user), token: user.token, active, entries });
const home = page => page.locator('.cc-home-finance .cc-home-brl-estimate');
const hero = page => page.getByRole('region', { name: 'Próximo pagamento previsto', exact: true });
const view = (page, name) => page.evaluate(name => dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: name })), name);
async function openAllowances(page) {
  await page.locator('.cc-home-finance').getByRole('button', { name: /Diárias/ }).click();
  await hero(page).waitFor();
}
async function viewPayment(page) {
  await page.getByRole('button', { name: 'Detalhes do pagamento', exact: true }).click();
  await page.locator('.cc-payment-overview[data-financial-screen="payment"]').waitFor();
}
async function settleAllowanceSources(page, gate, owner, ids, conflict) {
  await page.getByRole('button', { name: 'Extrato', exact: true }).click();
  await page.locator('.cc-payment-overview[data-financial-screen="statement"]').waitFor();
  await gate.reads(owner, ['', ...ids]);
  const ready = page.locator('.cc-financial-range[data-financial-content-ready="true"]');
  await ready.waitFor();
  if (conflict) await ready.getByText('Revisões ambíguas em 2032-01: não somadas.', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Resumo financeiro', exact: true }).click();
  await page.locator('.cc-payment-overview[data-financial-screen="overview"]').waitFor();
}
async function inspectNext(page, target, year, expectation, check) {
  const locator = target === 'home' ? home(page) : hero(page);
  await locator.waitFor();
  if (expectation !== 'pending') {
    // Allow both real callers to complete asynchronous coverage in a fixed candidate.
    const ready = target === 'home' ? page.locator('.cc-home-finance .cc-home-brl-estimate[data-estimate-state="available"]')
      : locator.locator('.cc-payment-value[data-complete="true"]').first();
    await ready.waitFor({ timeout: 4000 }).catch(() => {});
  }
  const text = normalize(await locator.innerText());
  const value = await (target === 'home' ? locator.locator('strong').first()
    : locator.locator('.cc-payment-value strong').first()).innerText();
  const amount = normalize(value).match(/^R\$\s*([\d.,]+)$/)?.[1] ?? null;
  const complete = target === 'home' ? await locator.getAttribute('data-estimate-state') === 'available'
    : await locator.locator('.cc-payment-value[data-complete="true"]').count() > 0;
  check(target + ' cycle', () => assert.ok(text.includes(cycle(year)), text));
  check(target + ' receipt wording', () => assert.match(text, /recebimento não confirmado/i));
  if (expectation === 'zero') {
    check(target + ' proven zero', () => { assert.equal(amount, '0,00', text); assert.equal(complete, true); },
      baseline && target === 'home' && amount === null && !complete && /Não calculável/i.test(text));
    check(target + ' no credit date for zero', () => assert.doesNotMatch(text, /Crédito previsto ·|Data a confirmar/i));
  } else if (expectation === 'pending') {
    check(target + ' incomplete evidence stays pending', () => {
      assert.equal(complete, false, text);
      assert.notEqual(amount, '0,00', text);
    });
  } else {
    check(target + ' previous positive credit', () => {
      assert.ok(amount && Number(amount.replaceAll('.', '').replace(',', '.')) > 0, text);
      assert.equal(complete, true, text);
    }, baseline && target === 'home' && amount === null && !complete && /Não calculável/i.test(text));
    if (target === 'detail') check(target + ' expected date policy', () => {
      assert.match(text, year === 2026 ? /Crédito previsto · 05\/02\/2026/ : /Data a confirmar/);
    });
  }
  return { amount, complete, text };
}

async function browserSuite(f) {
  assert.ok(fs.existsSync(path.join(root, 'dist/index.html')), 'build the exact candidate first');
  const browserRequire = process.env.MENU_PLAYWRIGHT_PACKAGE ? createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE) : appRequire;
  const { chromium } = browserRequire('playwright');
  const server = staticServer();
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true,
    channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL || undefined,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const results = [];
  let externalBlocked = 0, writesRefused = 0;
  async function scenario(name, { year = 2032, active, entries, late = false }, run) {
    const result = { name, failures: [] };
    const check = (label, fn, knownBaseline = false) => {
      try { fn(); }
      catch (error) { result.failures.push({ label, message: error.message, knownBaseline }); }
    };
    const context = await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo',
      viewport: { width: 390, height: 920 }, serviceWorkers: 'block' });
    const delivered = new Set();
    const inventory = entries.map(item => ({ ...item, summary: { ...item.summary, isActive: item.roster === active } }));
    const users = [prepare(A, active, inventory), prepare(B, f.febB, [entry('qa-b-feb', f.febB, true)])];
    await context.addInitScript(initialStorage, { users, initial: users[0], clock: day(year) });
    let signal, release;
    const requested = new Promise(resolve => { signal = resolve; });
    const wait = new Promise(resolve => { release = resolve; });
    let observedLate;
    await context.route('**/*', async route => {
      const req = route.request();
      const url = new URL(req.url());
      if (url.origin !== origin) { externalBlocked++; return route.abort(); }
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (req.method() !== 'GET') { writesRefused++; return route.fulfill({ status: 503, json: { ok: false } }); }
      const user = users.find(user => req.headers().authorization === 'Bearer ' + user.token);
      if (url.pathname === '/api/auth/me' && user) {
        return route.fulfill({ json: { ok: true, authenticated: true, user: user.user } });
      }
      if (url.pathname === '/api/rosters' && user) {
        await route.fulfill({ json: { ok: true, rosters: user.entries.map(item => item.summary) } });
        delivered.add(user.user.id + ':');
        return;
      }
      if (url.pathname === '/api/rosters/active' && user) {
        return route.fulfill({ json: { ok: true, roster: user.entries.find(item => item.summary.isActive)?.summary ?? null } });
      }
      const id = url.pathname === '/api/rosters/open' ? url.searchParams.get('id')
        : /^\/api\/rosters\/(qa-[\w-]+)$/.exec(url.pathname)?.[1];
      const item = user?.entries?.find(item => item.id === id);
      if (item) {
        if (late && user.user.id === A.id && item.id === 'qa-a-jan') {
          observedLate = req;
          signal();
          await wait;
        }
        await route.fulfill({ json: { ok: true, data: { roster: item.roster, compliance: null, gym: [] } } });
        delivered.add(user.user.id + ':' + id);
        return;
      }
      return route.fulfill({ status: 503, json: { ok: false, enabled: false, items: [], data: [] } });
    });
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(8000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin + '/app');
      await home(page).waitFor();
      const reads = async (owner, ids) => {
        const deadline = performance.now() + 7000;
        while (!ids.every(id => delivered.has(owner.id + ':' + id))) {
          assert.ok(performance.now() < deadline, 'fixture history reads were not completed: ' + ids.join(', '));
          await new Promise(resolve => setTimeout(resolve, 25));
        }
      };
      await run(page, check, result, { requested, release, delayed: () => observedLate, reads });
      check('no page errors', () => assert.deepEqual(errors, []));
    } catch (error) {
      result.failures.push({ label: 'flow did not finish', message: error.message });
    } finally {
      release();
      await context.close();
      results.push(result);
    }
  }
  const sources = (jan = f.jan, feb = f.feb) => [entry('qa-a-jan', jan), entry('qa-a-feb', feb, true)];
  const observeBoth = (year, expectation, prior = 'present') => async (page, check, info, gate) => {
    info.home = await inspectNext(page, 'home', year, expectation, check);
    await openAllowances(page);
    const expectedReads = ['qa-a-feb', ...(prior === 'present' ? ['qa-a-jan'] : [])];
    if (expectation === 'pending') await settleAllowanceSources(page, gate, A, expectedReads, prior === 'conflict');
    else await gate.reads(A, ['', ...expectedReads]);
    info.detail = await inspectNext(page, 'detail', year, expectation, check);
    if (expectation === 'positive' && info.home.amount && info.detail.amount) {
      check('same computed amount on both screens', () => assert.equal(info.home.amount, info.detail.amount));
    }
  };
  try {
    await scenario('covered across January/February', { active: f.feb, entries: sources() }, observeBoth(2032, 'zero'));
    await scenario('prior day absent', { active: f.feb, entries: sources(f.janIncomplete) }, observeBoth(2032, 'pending'));
    await scenario('prior month absent', { active: f.feb, entries: [entry('qa-a-feb', f.feb, true)] }, observeBoth(2032, 'pending', 'missing'));
    await scenario('conflicting latest revisions', { active: f.feb,
      entries: [...sources(), entry('qa-a-jan-conflict', f.janPositive)] }, observeBoth(2032, 'pending', 'conflict'));
    await scenario('previous credit during vacation', { active: f.feb, entries: sources(f.janPositive) }, observeBoth(2032, 'positive'));
    await scenario('previous credit with supported bank calendar', { year: 2026, active: f.febKnownDate,
      entries: sources(f.janKnownDate, f.febKnownDate) }, observeBoth(2026, 'positive'));

    await scenario('active roster and statement filter are independent', { active: f.jan, entries: sources() }, async (page, check, info) => {
      info.coldJanuary = await inspectNext(page, 'home', 2032, 'zero', check);
      await openAllowances(page);
      await page.getByRole('button', { name: 'Extrato', exact: true }).click();
      const statement = page.getByRole('region', { name: 'Previsão da escala', exact: true });
      const competence = page.getByLabel('Competência de referência', { exact: true });
      await page.getByLabel('Filtro financeiro', { exact: true }).selectOption('month');
      const filterCases = [
        ['2032-01', '01/01/2032 a 31/01/2032'], ['2032-02', '01/02/2032 a 29/02/2032'],
      ];
      for (const [month, dates] of filterCases) {
        await competence.selectOption(month);
        await statement.getByText(dates, { exact: false }).first().waitFor();
        const statementText = normalize(await statement.innerText());
        check('statement uses ' + month + ' without claiming credit', () => {
          assert.ok(statementText.includes(dates));
          assert.doesNotMatch(statementText, /Crédito previsto|Dia do voo|28\/01\/2032 a 03\/02\/2032/);
        });
        await viewPayment(page);
        info['afterFilter-' + month] = await inspectNext(page, 'detail', 2032, 'zero', check);
        if (month === '2032-01') await page.getByRole('button', { name: 'Extrato', exact: true }).click();
      }
      await view(page, 'database');
      const february = page.locator('.cc-history-card-v14339').filter({ hasText: 'qa-a-feb.pdf' });
      await february.getByRole('button', { name: /Abrir escala/ }).click();
      await home(page).waitFor();
      await page.waitForFunction(id => JSON.parse(localStorage.getItem('crewcheck_roster_choice_v1_' + id) ?? '{}').roster?.month === 2, A.id);
      info.changedActive = await inspectNext(page, 'home', 2032, 'zero', check);
      await openAllowances(page);
      info.detailAfterActiveChange = await inspectNext(page, 'detail', 2032, 'zero', check);
    });

    await scenario('late response from replaced account is discarded', { active: f.feb, entries: sources(f.janPositive), late: true },
      async (page, check, info, gate) => {
        await openAllowances(page);
        let timeout;
        try {
          await Promise.race([gate.requested, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('A January was never requested')), 7000); })]);
        } finally { clearTimeout(timeout); }
        await page.evaluate(({ user, token }) => {
          dispatchEvent(new Event('crewcheck:auth-will-change'));
          localStorage.setItem('crewcheck_auth_user', JSON.stringify(user));
          localStorage.setItem('crewcheck_auth_token', token);
          dispatchEvent(new Event('crewcheck:auth-changed'));
        }, { user: withoutToken(B), token: B.token });
        await home(page).waitFor();
        await openAllowances(page);
        await gate.reads(B, ['', 'qa-b-feb']);
        await hero(page).waitFor();
        gate.release();
        const response = await gate.delayed().response();
        assert.ok(response, 'the held response is delivered to the in-flight A request');
        await response.finished();
        // Allow committed renders after processing the held response, then inspect both entries in B.
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        info.detailB = await inspectNext(page, 'detail', 2032, 'pending', check);
        await view(page, 'cockpit');
        info.homeB = await inspectNext(page, 'home', 2032, 'pending', check);
        check('B gets no A amount', () => assert.deepEqual([info.detailB.amount, info.homeB.amount], [null, null]));
      });
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
  const failures = results.flatMap(item => item.failures);
  const report = { sha, browser: browser.version(), mode: 'compiled app, sandbox required, synthetic roster APIs',
    passed: results.filter(item => item.failures.length === 0).length,
    knownBaselineFailures: failures.filter(failure => failure.knownBaseline === true).length,
    unexpectedFailures: failures.filter(failure => failure.knownBaseline !== true).length,
    results, externalBlocked, writesRefused };
  console.log(JSON.stringify(report, null, 2));
  assert.ok(results.every(item => item.failures.length === 0), 'one or more browser acceptance assertions failed');
}

fixtures().then(async data => {
  if (process.argv.includes('--fixture-check')) {
    console.log(JSON.stringify({ sha, fixtureParserAndPolicy: 'PASS', browserRun: false,
      policy2032: 'credit date unknown', policy2026: '2026-02-05', scenarios: 8 }));
  } else await browserSuite(data);
}).catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => fs.rmSync(temporary, { recursive: true, force: true }));
