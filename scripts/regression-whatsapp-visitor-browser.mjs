import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import { createRequire } from 'node:module';

// Built app and actual production login/JWT/logout helpers, fictional DB and API data.
// This does not start server.mjs, verify native DB/auth throttle, or contact providers.
const source = fs.readFileSync('server/platform.mjs', 'utf8');
const section = (a, b) => {
  const start = source.indexOf(a), end = source.indexOf(b, start);
  assert.ok(start >= 0 && end > start, a);
  return source.slice(start, end);
};
let visitor;
const db = { async query(sql, params) {
  if (sql.startsWith('SELECT * FROM crewcheck_platform_visitors WHERE email=')) return { rows: params[0] === visitor.email ? [visitor] : [] };
  if (sql.startsWith('UPDATE crewcheck_platform_visitors SET last_login_at=')) return { rows: [] };
  throw new Error('UNEXPECTED_FIXTURE_SQL');
} };
const canonical = vm.createContext({ crypto, Buffer, Date, process: { env: { CREWCHECK_AUTH_SECRET: 'fictional-browser-only-secret' } },
  pool: async () => db, checkAuthThrottle: async () => 'fixture', recordAuthFailure: async () => {}, clearAuthFailures: async () => {} });
vm.runInContext(section('function env(', 'function safeEqual(') + section('function b64Json(', 'function mainIdentity(') +
  section('function visitorIdentity(', 'function databaseConnectionString(') + section('function passwordHash(', 'async function sendSystemEmail(') +
  section('async function handleVisitorLogin(', 'async function handleVisitorData(') + section('async function handleVisitorLogout(', 'function emergencyLocation('), canonical);
visitor = { id: 'fictional-browser-visitor', owner_email: 'owner@example.invalid', email: 'visitor@example.invalid',
  password_hash: canonical.passwordHash('fictional-password-123'), status: 'active' };
let gate = true, revoked = false, linkCalls = 0, unlinkCalls = 0;
const componentOnly = process.argv.includes('--component-only');
const dist = path.resolve(componentOnly ? 'artifacts/visitor-browser-component' : 'dist');
if (componentOnly) {
  const { build } = await import('esbuild');
  fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
  await build({ stdin: { contents: "import React from 'react';import {createRoot} from 'react-dom/client';import Page from './client/src/pages/VisitorAccessPage.tsx';createRoot(document.getElementById('root')).render(React.createElement(Page));", resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, outfile: path.join(dist, 'assets/app.js'), jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' }, logLevel: 'error' });
  fs.writeFileSync(path.join(dist, 'index.html'), '<html lang="pt"><div id="root"></div><script src="/assets/app.js"></script></html>');
}
assert.ok(fs.existsSync(path.join(dist, 'index.html')), 'safe full build required');
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://fixture.invalid');
    if (url.pathname === '/api/platform/visitor/login') return await canonical.handleVisitorLogin(req, res);
    if (url.pathname === '/api/platform/visitor/logout') return await canonical.handleVisitorLogout(req, res);
    if (url.pathname.startsWith('/api/')) {
      if (!url.pathname.startsWith('/api/platform/visitor/')) return canonical.sendJson(res, 200, {});
      const identity = canonical.visitorIdentity(req);
      if (!identity) return canonical.sendJson(res, 401, { message: 'Acesso de visitante expirado.' });
      if (revoked) return canonical.sendJson(res, 403, { message: 'Acesso revogado.' });
      if (url.pathname.endsWith('/data')) return canonical.sendJson(res, 200, { ok: true, whatsappAvailable: gate,
        visitor: { displayName: 'Visitante fictício', permissions: { roster: true } }, owner: { display_name: 'Titular fictício' }, roster: { days: [] }, stays: [] });
      if (url.pathname.endsWith('/link/start')) {
        const body = await canonical.readBody(req);
        assert.equal(body.consentConcierge, true); linkCalls++;
        return canonical.sendJson(res, 200, { code: 'visitante_fictional-browser-code', openUrl: 'https://wa.me/15550000000?text=fictional', expiresInMinutes: 10 });
      }
      if (url.pathname.endsWith('/link/unlink')) { unlinkCalls++; return canonical.sendJson(res, 200, { ok: true }); }
      return canonical.sendJson(res, 404, {});
    }
    const filename = url.pathname.startsWith('/assets/') ? path.join(dist, path.basename('assets'), path.basename(url.pathname)) : path.join(dist, 'index.html');
    res.setHeader('content-type', filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(fs.readFileSync(filename));
  } catch { canonical.sendJson(res, 500, { message: 'FIXTURE_FAILURE' }); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const require = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || import.meta.url);
const { chromium } = require('playwright');
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: 'pt-BR' });
  let external = 0;
  await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : (external++, route.abort()));
  const page = await context.newPage();
  await page.goto(origin + '/visitor');
  await page.locator('input[type=email]').fill(visitor.email);
  await page.locator('input[type=password]').fill('wrong-password');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByText('E-mail ou senha inválidos.', { exact: true }).waitFor();
  await page.locator('input[type=password]').fill('fictional-password-123');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByRole('button', { name: 'Vincular WhatsApp', exact: true }).waitFor();
  const cookie = (await context.cookies()).find(c => c.name === 'crewcheck_visitor_token');
  assert.ok(cookie?.httpOnly); assert.equal(cookie.sameSite, 'Lax');
  assert.equal(canonical.verifyJwt(decodeURIComponent(cookie.value)).ownerEmail, visitor.owner_email);
  await page.getByRole('button', { name: 'Vincular WhatsApp', exact: true }).click();
  await page.getByText('visitante_fictional-browser-code', { exact: true }).waitFor();
  assert.equal(linkCalls, 1); assert.equal(external, 0, 'handoff does not send or open external URL');
  await page.getByRole('button', { name: 'Desvincular WhatsApp', exact: true }).click();
  await page.waitForFunction(() => !document.body.textContent.includes('visitante_fictional-browser-code'));
  assert.equal(unlinkCalls, 1);
  gate = false; await page.reload();
  await page.getByText('Visitante fictício', { exact: false }).first().waitFor();
  assert.equal(await page.getByRole('button', { name: 'Vincular WhatsApp', exact: true }).count(), 0);
  gate = true; revoked = true; await page.reload();
  await page.getByText('Acesso revogado.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Vincular WhatsApp', exact: true }).count(), 0);
  revoked = false;
  await page.request.post(origin + '/api/platform/visitor/logout');
  await page.reload(); await page.locator('input[type=email]').waitFor();
  assert.equal((await context.cookies()).some(c => c.name === 'crewcheck_visitor_token'), false);
  assert.equal(external, 0);
  console.log(`PASS ${componentOnly ? 'actual visitor component harness (full app build unproved)' : 'built full app visitor page'}: wrong/correct password through canonical login/JWT, HttpOnly cookie, consent/handoff/unlink, gate OFF, revoked fixture and logout; fictional DB/data API and throttle; no external requests, native DB/full server unproved`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
