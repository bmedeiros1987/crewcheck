/* Actual deletion handlers and forecast helpers in sandboxed Chromium.
 * User authentication and deletion responses come from a loopback HTTP fixture. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { createRequire } = require('node:module');
const { build } = require('esbuild');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const cookieName = 'crewcheck_qa_session';
const ownerA = 'Forecast-QA-A';
const ownerB = 'Forecast-QA-B';
const tokenKey = 'crewcheck_auth_token';
const userKey = 'crewcheck_auth_user';
const draftPrefix = 'crewcheck:financial-forecast:draft:v1:';
const ownerPrefix = owner => draftPrefix + encodeURIComponent(owner) + ':';
const markerKey = 'forecast-qa-unrelated-storage';
const cacheMarker = owner => `crewcheck_financial_calculation_cache_v1:${encodeURIComponent(owner)}:2032-01:qa`;

function extractHandler(file, matches) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const handlers = [];
  function visit(node) {
    if (matches(node, ast)) handlers.push(node.getText(ast));
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.equal(handlers.length, 1, `exactly one deletion handler in ${file}`);
  return handlers[0];
}

async function bundleBrowserFixture() {
  const settings = extractHandler('client/src/pages/Home.tsx', node =>
    ts.isFunctionDeclaration(node) && node.name?.text === 'deleteAccount');
  const publicPage = extractHandler('client/src/pages/InfoPage.tsx', (node, ast) =>
    ts.isArrowFunction(node) && ts.isJsxExpression(node.parent)
      && node.getText(ast).includes("fetch('/api/platform/account/delete'"));
  const result = await build({
    stdin: {
      sourcefile: 'forecast-delete-browser-fixture.ts',
      resolveDir: root,
      loader: 'ts',
      contents: `
        import { captureAuthSession, expireSession, getStoredUser, getToken, login } from './client/src/lib/authClient';
        import { deleteCrewCheckAccount } from './client/src/lib/platformClient';
        import { financialRateOwner, financialRateSession } from './client/src/lib/financialStatementLearning';
        import { eraseFinancialCalculationCache } from './client/src/lib/financialCalculationCache';
        import { FORECAST_DRAFT_PREFIX, eraseDeletedOwnerForecastDrafts, readLatestForecastDraft, saveForecastDraft } from './client/src/lib/financialForecastDrafts';
        const context = () => ({ guard: captureAuthSession(), session: financialRateSession() });
        const messages = [];
        const storageEvents = [];
        const toast = { error: value => messages.push(value), message: value => messages.push(value) };
        window.addEventListener('storage', event => storageEvents.push(event.key));
        ${settings}
        const deleteFromPublicPage = (${publicPage});
        const qa = window.forecastQA = {
          auth: () => ({ owner: getStoredUser()?.id || null, hasToken: Boolean(getToken()) }),
          login: async owner => { await login(owner.toLowerCase() + '@example.invalid', 'fixture-password'); },
          expireSession,
          save: (kind, values) => saveForecastDraft(kind, values, null, context()),
          read: kind => readLatestForecastDraft(kind, context()),
          messages, storageEvents, done: false,
        };
        const onSettings = location.pathname === '/settings';
        const button = document.getElementById('delete-account');
        button.hidden = location.pathname === '/login';
        button.textContent = onSettings ? 'Excluir conta' : 'Excluir agora no app';
        button.addEventListener('click', async () => {
          try { await (onSettings ? deleteAccount() : deleteFromPublicPage()); }
          finally { qa.done = true; }
        });
      `,
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    logLevel: 'silent',
  });
  return result.outputFiles[0].text;
}

const userFor = owner => ({ id: owner, name: owner, email: owner.toLowerCase() + '@example.invalid', role: 'user' });
const tokenFor = owner => 'fixture-bearer-' + owner;
const readJson = async request => {
  let input = '';
  for await (const chunk of request) {
    input += chunk;
    assert.ok(input.length < 4096, 'loopback fixture request is small');
  }
  return JSON.parse(input);
};

function createFixtureServer(bundle) {
  let state;
  const cookie = (value, expiry = '') => `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax${expiry}`;
  const send = (response, status, value, headers = {}) => {
    response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers });
    response.end(JSON.stringify(value));
  };
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    try {
      if (request.method === 'GET' && ['/settings', '/info', '/login'].includes(url.pathname)) {
        response.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'content-security-policy': "default-src 'none'; script-src 'self'; connect-src 'self'",
          'cache-control': 'no-store',
        });
        response.end('<!doctype html><html lang="pt-BR"><title>Fixture de exclusão de conta</title><button id="delete-account" type="button"></button><script defer src="/fixture.js"></script></html>');
      } else if (request.method === 'GET' && url.pathname === '/fixture.js') {
        response.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8' });
        response.end(bundle);
      } else if (request.method === 'POST' && url.pathname === '/api/auth/login') {
        const body = await readJson(request);
        const owner = [ownerA, ownerB].find(candidate => userFor(candidate).email === body.email);
        assert.ok(owner && !state.deleted.has(owner) && body.password === 'fixture-password');
        assert.equal(request.headers.authorization, undefined, 'public login carries no prior bearer');
        send(response, 200, { ok: true, token: tokenFor(owner), user: userFor(owner) }, { 'set-cookie': cookie(owner) });
      } else if (request.method === 'POST' && url.pathname === '/api/platform/account/delete') {
        const body = await readJson(request);
        const bearer = [ownerA, ownerB].find(owner => request.headers.authorization === 'Bearer ' + tokenFor(owner));
        const cookieOwner = [ownerA, ownerB].find(owner => request.headers.cookie?.split(/;\s*/).includes(`${cookieName}=${owner}`));
        assert.equal(body.confirmation, 'EXCLUIR');
        assert.equal(cookieOwner, ownerA, 'only fixture A may request deletion');
        assert.ok(!state.deleted.has(ownerA), 'no replay of a confirmed deletion');
        assert.equal(bearer, state.mode === 'cookie-only' ? undefined : ownerA);
        if (!bearer) assert.equal(request.headers.authorization, undefined);
        state.requests.push({ bearer: Boolean(bearer), cookie: Boolean(cookieOwner) });
        if (state.mode === 'unconfirmed') {
          send(response, 200, { ok: true, deleted: false });
        } else {
          state.deleted.add(ownerA);
          send(response, 200, { ok: true, deleted: true, message: 'Conta excluída.' }, { 'set-cookie': cookie('', '; Max-Age=0') });
        }
      } else {
        send(response, 404, { ok: false });
      }
    } catch (error) {
      state.errors.push(error);
      send(response, 500, { ok: false });
    }
  });
  return {
    server,
    reset(mode) {
      state = { mode, requests: [], deleted: new Set(), errors: [] };
      return state;
    },
  };
}

const thirteenth = owner => ({ year: '2032', start: '', end: '', avos: '', amount: '', basis: 'full_year_equivalent', source: `${owner} 13 QA`, tax: '', loan: '', advance: '' });
const vacation = owner => ({ acquisitionStart: '2031-01-01', acquisitionEnd: '2031-12-31', split: false, starts: ['', ''], basis: 'monthly_average', amounts: ['', ''], source: `${owner} férias QA`, retentions: ['', ''], consigned: ['', ''], advances: ['', ''] });
const kinds = ['thirteenth', 'vacation'];

async function loginAndSeed(page, owner) {
  await page.evaluate(owner => window.forecastQA.login(owner), owner);
  for (const [kind, values] of [['thirteenth', thirteenth(owner)], ['vacation', vacation(owner)]]) {
    const result = await page.evaluate(({ kind, values }) => window.forecastQA.save(kind, values), { kind, values });
    assert.equal(result.status, 'saved');
    assert.equal(result.record.ownerId, owner);
  }
}

function inspectDrafts(page, owner) {
  return page.evaluate(prefix => Object.fromEntries(Object.keys(localStorage).sort()
    .filter(key => key.startsWith(prefix)).map(key => [key, localStorage.getItem(key)])), ownerPrefix(owner));
}

async function checkAuth(page, owner, hasToken) {
  assert.deepEqual(await page.evaluate(() => window.forecastQA.auth()), { owner, hasToken });
}

async function checkCookie(context, page, origin, expected) {
  const cookies = (await context.cookies(origin)).filter(cookie => cookie.name === cookieName);
  assert.deepEqual(cookies.map(({ value, httpOnly }) => ({ value, httpOnly })), expected ? [{ value: expected, httpOnly: true }] : []);
  assert.equal(await page.evaluate(name => document.cookie.includes(name), cookieName), false, 'the test cookie is invisible to JavaScript');
}

async function runCase(browser, origin, fixture, endpoint, mode) {
  const state = fixture.reset(mode);
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const external = [];
  const errors = [];
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    external.push(url.origin);
    return route.abort();
  });
  try {
    const page = await context.newPage();
    const other = await context.newPage();
    for (const tab of [page, other]) tab.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + endpoint);
    await loginAndSeed(page, ownerB);
    await loginAndSeed(page, ownerA);
    await page.evaluate(key => localStorage.setItem(key, 'unchanged'), markerKey);
    await other.goto(origin + endpoint);
    await checkAuth(other, ownerA, true);
    assert.ok(await page.evaluate(() => isSecureContext && typeof navigator.locks?.request === 'function'), 'use native Web Locks on loopback');
    const beforeA = await inspectDrafts(other, ownerA);
    const beforeB = await inspectDrafts(other, ownerB);
    assert.equal(Object.keys(beforeA).length, 2);
    assert.equal(Object.keys(beforeB).length, 2);
    await checkCookie(context, page, origin, ownerA);

    if (mode === 'cookie-only') {
      await page.evaluate(keys => {
        for (const key of keys) localStorage.setItem(key, 'unattributed-local-cache-fixture');
        window.forecastQA.expireSession();
      }, [cacheMarker(ownerA), cacheMarker(ownerB)]);
      await checkAuth(page, ownerA, false);
      await checkCookie(context, page, origin, ownerA);
    }
    if (['blocked-drafts', 'blocked-auth-and-drafts'].includes(mode)) {
      await page.evaluate(({ prefix, authKey, blockAuth }) => {
        const original = Storage.prototype.removeItem;
        Storage.prototype.removeItem = function removeItem(key) {
          if (key.startsWith(prefix) || (blockAuth && key === authKey)) {
            throw new DOMException('Fixture storage restricted', 'SecurityError');
          }
          return original.call(this, key);
        };
      }, { prefix: ownerPrefix(ownerA), authKey: tokenKey, blockAuth: mode === 'blocked-auth-and-drafts' });
    }

    const dialogs = [];
    page.on('dialog', dialog => {
      dialogs.push({ type: dialog.type(), text: dialog.message() });
      return dialog.type() === 'prompt' ? dialog.accept(mode === 'missing-confirmation' ? 'MANTER' : 'EXCLUIR') : dialog.accept();
    });
    await page.locator('#delete-account').click();
    const redirects = ['success', 'blocked-drafts', 'cookie-only'].includes(mode);
    if (redirects) await page.waitForURL(origin + '/login');
    else await page.waitForFunction(() => window.forecastQA.done);
    const alertExpected = mode === 'blocked-drafts' || mode === 'cookie-only'
      || (endpoint === '/info' && ['success', 'unconfirmed'].includes(mode));
    assert.deepEqual(dialogs.map(dialog => dialog.type), alertExpected ? ['confirm', 'prompt', 'alert'] : ['confirm', 'prompt']);
    if (['blocked-drafts', 'cookie-only'].includes(mode)) assert.match(dialogs.at(-1).text, /limpeza.*pendente/);
    if (mode === 'unconfirmed') {
      const message = endpoint === '/info' ? dialogs.at(-1).text : await page.evaluate(() => window.forecastQA.messages.at(-1));
      assert.match(message, /Não foi possível confirmar a exclusão/);
    }

    const confirmed = redirects || mode === 'blocked-auth-and-drafts';
    assert.deepEqual(state.requests, mode === 'missing-confirmation' ? [] : [{ bearer: mode !== 'cookie-only', cookie: true }]);
    assert.equal(state.deleted.has(ownerA), confirmed);
    assert.deepEqual(state.errors, []);
    await checkCookie(context, page, origin, confirmed ? null : ownerA);
    if (mode === 'blocked-auth-and-drafts') {
      // The current document must fail closed despite leftover storage. No old
      // bearer is sent after deletion, and this in-memory fence is not a reload claim.
      await checkAuth(page, ownerA, true);
      for (const kind of kinds) assert.equal(await page.evaluate(kind => window.forecastQA.read(kind).status, kind), 'stale');
      const save = await page.evaluate(values => window.forecastQA.save('thirteenth', values), { ...thirteenth(ownerA), year: '2033' });
      assert.equal(save.status, 'stale');
    }
    if (['success', 'blocked-drafts'].includes(mode)) {
      await other.waitForFunction(({ tokenKey, userKey }) =>
        [tokenKey, userKey].every(key => window.forecastQA.storageEvents.includes(key)), { tokenKey, userKey });
    }
    for (const tab of [page, other]) {
      assert.deepEqual(await inspectDrafts(tab, ownerA), mode === 'success' ? {} : beforeA);
      assert.deepEqual(await inspectDrafts(tab, ownerB), beforeB);
    }
    await other.reload();
    await checkAuth(other, redirects ? null : ownerA, !redirects);
    if (redirects) {
      for (const kind of kinds) assert.equal(await other.evaluate(kind => window.forecastQA.read(kind).status, kind), 'stale');
    }
    if (mode === 'cookie-only') {
      const values = await other.evaluate(keys => keys.map(key => localStorage.getItem(key)), [cacheMarker(ownerA), cacheMarker(ownerB)]);
      assert.deepEqual(values, ['unattributed-local-cache-fixture', 'unattributed-local-cache-fixture']);
    }
    assert.deepEqual(await inspectDrafts(other, ownerA), mode === 'success' ? {} : beforeA);
    assert.deepEqual(await inspectDrafts(other, ownerB), beforeB);
    assert.equal(await other.evaluate(key => localStorage.getItem(key), markerKey), 'unchanged');
    await other.evaluate(owner => window.forecastQA.login(owner), ownerB);
    await checkCookie(context, other, origin, ownerB);
    for (const [kind, values] of [['thirteenth', thirteenth(ownerB)], ['vacation', vacation(ownerB)]]) {
      const record = await other.evaluate(kind => window.forecastQA.read(kind), kind);
      assert.equal(record.status, 'found');
      assert.equal(record.record.ownerId, ownerB);
      assert.deepEqual(record.record.values, values);
    }
    assert.deepEqual(external, [], 'the browser requests no external resources');
    assert.deepEqual(errors, []);
    console.log(`PASS ${endpoint} ${mode}`);
  } finally {
    await context.close();
  }
}

async function main() {
  const bundle = await bundleBrowserFixture();
  if (process.argv.includes('--build-only')) {
    console.log('PASS browser fixture bundle with the current deletion handlers; Chromium not run');
    return;
  }
  const { chromium } = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || __filename)('playwright');
  const fixture = createFixtureServer(bundle);
  await new Promise((resolve, reject) => {
    fixture.server.once('error', reject);
    fixture.server.listen(0, '127.0.0.1', resolve);
  });
  const origin = `http://127.0.0.1:${fixture.server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({
      chromiumSandbox: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
      channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL || undefined,
    });
    for (const endpoint of ['/settings', '/info']) {
      for (const mode of ['missing-confirmation', 'unconfirmed', 'success', 'blocked-drafts', 'blocked-auth-and-drafts']) {
        await runCase(browser, origin, fixture, endpoint, mode);
      }
    }
    await runCase(browser, origin, fixture, '/info', 'cookie-only');
    console.log('PASS 11 two-tab browser cases; actual client handlers and drafts, synthetic deletion API and HttpOnly cookie only');
  } finally {
    try { await browser?.close(); }
    finally { await new Promise(resolve => fixture.server.close(resolve)); }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
