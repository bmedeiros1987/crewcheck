import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

// Actual React component, hook, auth reads and API client. All APIs/contacts are fictional;
// no application server, credentials, database or outbound network is used.
const require = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || import.meta.url);
const { chromium } = require('playwright');
const bundled = await build({
  stdin: { contents: `import React from 'react'; import { createRoot } from 'react-dom/client';
    import View from './client/src/components/v1391/EmergencyCenterView';
    let root; window.remount = () => { root?.unmount(); root = createRoot(document.getElementById('root')); root.render(<View/>); }; window.remount();`,
    resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
  plugins: [{ name: 'fixture-chrome', setup(builder) {
    builder.onResolve({ filter: /\.css$/ }, () => ({ path: 'css', namespace: 'fixture' }));
    builder.onResolve({ filter: /^@\/components\/v139\/Shell$/ }, () => ({ path: 'shell', namespace: 'fixture' }));
    builder.onResolve({ filter: /^sonner$/ }, () => ({ path: 'toast', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: name }) => ({ contents: name === 'css' ? '' : name === 'shell'
      ? 'export const V139Header = () => null;'
      : `const record = (type, text) => { window.toasts ||= []; window.toasts.push({type,text}); }; export const toast = { error:t=>record('error',t), success:t=>record('success',t), info:t=>record('info',t) };`, loader: 'js' }));
    builder.onResolve({ filter: /^@\// }, ({ path: name }) => ({ path: path.resolve('client/src', name.slice(2) + '.ts') }));
  } }],
});
const server = http.createServer((req, res) => {
  if (req.url === '/fixture.js') { res.setHeader('content-type', 'text/javascript'); return res.end(bundled.outputFiles[0].text); }
  res.setHeader('content-type', 'text/html'); res.end('<div id="root"></div><script src="/fixture.js"></script>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const fixtureAlert = (alertId, name) => ({ alertId, kind: 'security', createdAt: '2026-10-07T00:00:00Z', sent: 1, failed: 0, recipients: [{ name, source: 'saved-contact', ok: true }] });
const accounts = { A: [fixtureAlert('old-A', 'Recipient A old'), fixtureAlert('recent-A', 'Recipient A recent')], B: [fixtureAlert('only-B', 'Recipient B')] };
let failList = false, malformed = false, failClose = false, closeAlready = false, holdNext = false, held, releaseHeld;
const posts = [], gets = [];
const medical = { A: { allergies: 'Synthetic A', healthPlanProvider: 'Amil', healthPlanCode: 'S450' }, B: { allergies: 'Synthetic B' } };
const savedPreferences = { A: { includeLocation: false }, B: { includeLocation: false } };
const writes = [];
let holdWrite = '', writeStarted, releaseWrite;
try {
  browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}), args: ['--no-sandbox'] });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.addCookies([{ name: 'crewcheck_auth_token', value: 'B', url: origin }]);
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const bearer = request.headers().authorization?.replace('Bearer ', '');
    const cookie = request.headers().cookie?.match(/crewcheck_auth_token=([^;]+)/)?.[1];
    const token = bearer || cookie; // Match requestToken: Bearer takes precedence.
    const ok = payload => route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) });
    if (url.pathname.endsWith('/active')) {
      gets.push(token);
      const snapshot = structuredClone(accounts[token] || []);
      if (holdNext) { holdNext = false; held?.(); await new Promise(resolve => { releaseHeld = resolve; }); }
      if (failList) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, message: 'PRIVATE DATABASE DETAIL' }) });
      return ok({ ok: true, alerts: malformed ? 'invalid' : snapshot });
    }
    if (url.pathname.endsWith('/profile') || url.pathname.endsWith('/preferences')) {
      const resource = url.pathname.endsWith('/profile') ? 'profile' : 'preferences';
      if (request.method() === 'POST') {
        const body = request.postDataJSON(); writes.push({ token, bearer, cookie, resource, body });
        assert.ok(bearer, 'writes must never fall back to cookie identity');
        if (resource === 'profile') medical[token] = { ...body }; else savedPreferences[token] = { ...body };
        const snapshot = structuredClone(resource === 'profile' ? medical[token] : savedPreferences[token]);
        if (holdWrite === resource) { holdWrite = ''; writeStarted?.(); await new Promise(resolve => { releaseWrite = resolve; }); }
        return ok({ ok: true, saved: true, [resource]: snapshot, consentMedicalShare: Boolean(snapshot.consentMedicalShare) });
      }
      return ok({ ok: true, [resource]: resource === 'profile' ? medical[token] : savedPreferences[token], consentMedicalShare: false });
    }
    assert.match(url.pathname, /\/(cancel|assisted)$/, 'fixture must never send an SOS');
    const body = request.postDataJSON(); posts.push({ token, path: url.pathname, body });
    assert.equal(body.confirmed, true); assert.ok(body.alertId);
    if (failClose) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, message: 'PRIVATE CLOSE DETAIL' }) });
    const found = accounts[token]?.some(alert => alert.alertId === body.alertId);
    accounts[token] = (accounts[token] || []).filter(alert => alert.alertId !== body.alertId);
    return ok({ ok: true, [url.pathname.endsWith('/cancel') ? 'cancelled' : 'assisted']: found && !closeAlready, alertId: body.alertId });
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    if (!localStorage.getItem('crewcheck_auth_token')) {
      localStorage.setItem('crewcheck_auth_token', 'A');
      localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'A', email: 'a@fixture.invalid' }));
    }
  });
  const card = id => page.locator(`[data-alert-id="${id}"]`);
  const empty = () => page.getByText('Nenhum alerta ativo nesta conta.', { exact: true }).waitFor();
  const switchAccount = async token => {
    await page.evaluate(token => {
      localStorage.setItem('crewcheck_auth_token', token);
      localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: token, email: `${token.toLowerCase()}@fixture.invalid` }));
      window.dispatchEvent(new StorageEvent('storage', { key: 'crewcheck_auth_token' }));
    }, token);
  };
  const expectDialog = (id, recipient, accept) => new Promise((resolve, reject) => page.once('dialog', async dialog => {
    try {
      assert.match(dialog.message(), new RegExp(id)); assert.match(dialog.message(), /Data:/); assert.match(dialog.message(), new RegExp(recipient));
      assert.doesNotMatch(dialog.message(), /PRIVATE|Recipient B/); await (accept ? dialog.accept() : dialog.dismiss()); resolve();
    } catch (error) { reject(error); }
  }));
  await page.goto(origin); await card('old-A').waitFor(); await card('recent-A').waitFor();
  const allergies = page.getByRole('textbox', { name: 'Alergias', exact: true });
  const save = () => page.getByRole('button', { name: 'Salvar proteção e preferências', exact: true });
  await page.waitForFunction(() => document.querySelector('input[placeholder="Nenhuma ou descreva"]')?.value === 'Synthetic A');
  await save().click();
  await page.waitForFunction(() => window.toasts?.some(t => t.text === 'Preferências e perfil médico protegidos.'));
  assert.equal(writes.length, 2);
  assert.ok(writes.every(write => write.bearer === 'A' && write.cookie === 'B' && write.token === 'A'));
  assert.equal(medical.B.allergies, 'Synthetic B', 'Bearer A/cookie B must not write medical data to B');
  await page.reload(); await card('old-A').waitFor(); assert.equal(await page.locator('[data-alert-id]').count(), 2, 'reload restores both, no implicit newest');
  const declined = expectDialog('old-A', 'Recipient A old', false);
  await card('old-A').getByRole('button', { name: 'Estou bem / encerrar este alerta' }).click();
  await declined;
  await page.waitForFunction(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Atualizar alertas')?.disabled === false);
  assert.equal(posts.length, 0, 'rejecting confirmation does nothing');
  const cancelled = expectDialog('old-A', 'Recipient A old', true);
  await card('old-A').getByRole('button', { name: 'Estou bem / encerrar este alerta' }).click();
  await cancelled;
  await card('old-A').waitFor({ state: 'detached' }); await card('recent-A').waitFor();
  assert.deepEqual(posts[0], { token: 'A', path: '/api/platform/emergency/cancel', body: { alertId: 'old-A', confirmed: true } });
  await page.reload(); await card('recent-A').waitFor();
  const assisted = expectDialog('recent-A', 'Recipient A recent', true);
  await card('recent-A').getByRole('button', { name: 'Já estou sendo assistido' }).click(); await assisted; await empty();
  assert.equal(posts.length, 2); assert.equal(posts[1].body.alertId, 'recent-A'); assert.match(posts[1].path, /assisted$/);
  assert.equal(await page.getByRole('button', { name: 'Estou bem / encerrar este alerta' }).count(), 0, 'no alert has no silent close button');
  accounts.A = [fixtureAlert('already-A', 'Recipient A old')]; await page.reload(); await card('already-A').waitFor(); accounts.A = [];
  await card('already-A').getByRole('button', { name: 'Estou bem / encerrar este alerta' }).click(); await empty(); assert.equal(posts.length, 2, 'already closed preflight cannot close a different alert');
  await switchAccount('B'); await card('only-B').waitFor(); assert.doesNotMatch(await page.locator('body').innerText(), /Recipient A/);
  // Old responses cannot expose account A after a switch to B.
  accounts.A = [fixtureAlert('delayed-A', 'Recipient A old')]; holdNext = true;
  const started = new Promise(resolve => { held = resolve; }); await switchAccount('A'); await started;
  await switchAccount('B'); await card('only-B').waitFor(); releaseHeld();
  await page.waitForTimeout(100); assert.equal(await card('delayed-A').count(), 0); assert.doesNotMatch(await page.locator('body').innerText(), /Recipient A/);
  // Account switch while a close revalidation is pending cancels the action.
  await switchAccount('A'); await card('delayed-A').waitFor(); holdNext = true;
  const preflight = new Promise(resolve => { held = resolve; });
  await card('delayed-A').getByRole('button', { name: 'Estou bem / encerrar este alerta' }).click(); await preflight;
  await switchAccount('B'); await card('only-B').waitFor(); releaseHeld(); await page.waitForTimeout(100); assert.equal(posts.length, 2);
  for (const failure of ['http', 'malformed']) {
    failList = failure === 'http'; malformed = failure === 'malformed'; await page.evaluate(() => window.remount());
    await page.getByRole('alert').waitFor(); assert.doesNotMatch(await page.locator('body').innerText(), /PRIVATE|Recipient/);
    assert.equal(await page.locator('[data-alert-id]').count(), 0);
    failList = false; malformed = false; await page.getByRole('button', { name: 'Atualizar alertas' }).click(); await card('only-B').waitFor();
  }
  failClose = true;
  page.once('dialog', dialog => dialog.accept()); await card('only-B').getByRole('button', { name: 'Estou bem / encerrar este alerta' }).click();
  await page.waitForFunction(() => window.toasts.some(t => t.text.includes('Não consegui confirmar o encerramento')));
  await card('only-B').waitFor(); assert.doesNotMatch(JSON.stringify(await page.evaluate(() => window.toasts)), /PRIVATE/);
  failClose = false; closeAlready = true; const successes = await page.evaluate(() => window.toasts.filter(t => t.type === 'success').length);
  page.once('dialog', dialog => dialog.accept()); await card('only-B').getByRole('button', { name: 'Já estou sendo assistido' }).click(); await empty();
  assert.equal(await page.evaluate(() => window.toasts.filter(t => t.type === 'success').length), successes, 'race closure never claims a new notification');
  assert.ok(gets.includes('A') && gets.includes('B'), 'requests pin synthetic account authorization');
  assert.equal(posts.length, 4); assert.equal(posts[2].body.alertId, 'only-B'); assert.equal(posts[3].body.alertId, 'only-B');
  // Switch during either write: the already submitted write stays on A; its
  // response must not update B, start a second write, emit toast, or update Amil.
  for (const phase of ['profile', 'preferences']) {
    await switchAccount('A'); await page.waitForFunction(() => document.querySelector('input[placeholder="Nenhuma ou descreva"]')?.value.startsWith('Synthetic A'));
    await allergies.fill('Synthetic A ' + phase);
    await page.evaluate(() => { window.toasts = []; localStorage.setItem('crewcheck:amil-plan', 'B-marker'); });
    const before = writes.length; const unchangedB = structuredClone(medical.B);
    holdWrite = phase; const pendingSave = new Promise(resolve => { writeStarted = resolve; });
    await save().click(); await pendingSave;
    await switchAccount('B'); await page.waitForFunction(() => document.querySelector('input[placeholder="Nenhuma ou descreva"]')?.value === 'Synthetic B');
    releaseWrite(); await page.waitForTimeout(100);
    assert.equal(await allergies.inputValue(), 'Synthetic B'); assert.deepEqual(medical.B, unchangedB);
    assert.equal(writes.length - before, phase === 'profile' ? 1 : 2);
    assert.ok(writes.slice(before).every(write => write.token === 'A' && write.bearer === 'A'));
    assert.equal(await page.evaluate(() => localStorage.getItem('crewcheck:amil-plan')), 'B-marker');
    assert.deepEqual(await page.evaluate(() => window.toasts), []);
  }
  // A stale geolocation success or failure cannot alter B or clear B's busy state.
  await page.evaluate(() => {
    window.pendingLocations = [];
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition(success, failure) { window.pendingLocations.push({ success, failure }); } } });
  });
  const locationInput = page.getByRole('textbox', { name: 'Localização', exact: true });
  for (const outcome of ['success', 'failure']) {
    await switchAccount('A'); await page.waitForFunction(() => document.querySelector('input[placeholder="Nenhuma ou descreva"]')?.value.startsWith('Synthetic A'));
    await page.getByRole('button', { name: 'Usar localização atual' }).click();
    await switchAccount('B'); await page.waitForFunction(() => document.querySelector('input[placeholder="Nenhuma ou descreva"]')?.value === 'Synthetic B');
    await page.getByRole('button', { name: 'Usar localização atual' }).click();
    await page.evaluate(outcome => { window.toasts = []; const old = window.pendingLocations.shift(); outcome === 'success' ? old.success({ coords: { latitude: 1, longitude: 2 } }) : old.failure({}); }, outcome);
    await page.waitForTimeout(100); assert.equal(await locationInput.inputValue(), '');
    assert.equal(await page.getByRole('button', { name: 'Localizando…' }).isDisabled(), true);
    assert.deepEqual(await page.evaluate(() => window.toasts), []);
    await page.evaluate(() => window.pendingLocations.shift().success({ coords: { latitude: 3, longitude: 4 } }));
    await page.waitForFunction(() => document.querySelector('input[placeholder="Link do mapa, opcional"]')?.value.includes('3,4'));
  }
  accounts.B = [fixtureAlert('logout-B', 'Recipient B')];
  await page.getByRole('button', { name: 'Atualizar alertas' }).click(); await card('logout-B').waitFor();
  const requestsBeforeLogout = gets.length;
  await page.evaluate(() => { localStorage.removeItem('crewcheck_auth_token'); window.dispatchEvent(new Event('crewcheck:auth-expired')); });
  await page.getByRole('alert').waitFor(); assert.equal(await page.locator('[data-alert-id]').count(), 0);
  assert.doesNotMatch(await page.locator('body').innerText(), /Recipient B/);
  assert.equal(gets.length, requestsBeforeLogout, 'expired local session never falls back to a retained cookie');
  console.log('PASS: actual EmergencyCenter reload/navigation, exact ID closure and prior failures; Bearer A/cookie B writes, account switch during each save stage, stale geolocation success/failure and busy isolation; local fixtures only');
} finally {
  releaseHeld?.(); releaseWrite?.(); await browser?.close(); await new Promise(resolve => server.close(resolve));
}
