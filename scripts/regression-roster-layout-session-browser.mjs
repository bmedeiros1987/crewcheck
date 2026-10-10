import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';

// Full prepared app, built-in fictional demo, fixture APIs; no real account/API.
const require = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || import.meta.url);
const { chromium } = require('playwright');
const dist = path.resolve('dist');
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/fixture-peer.html') return res.end('<title>Storage fixture</title>');
  const file = path.resolve(dist, '.' + (pathname === '/app' ? '/index.html' : pathname));
  if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}), args: ['--no-sandbox'] });
const results = [];
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  let maintenanceRequests = 0;
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/maintenance/status') maintenanceRequests++;
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, enabled: false, items: [], notices: [], data: [], user: null }) });
    }
    return route.continue();
  });
  const page = await context.newPage();
  await page.clock.install();
  await page.addInitScript(() => {
    localStorage.setItem('crewcheck_demo_mode_seen', '1');
    localStorage.setItem('crewcheck:first-access-tour:v1434:disabled', '1');
    sessionStorage.setItem('crewcheck_demo_active', '1');
    sessionStorage.setItem('crewcheck_initial_view', 'roster');
  });
  await page.goto(origin + '/app');
  const picker = page.getByRole('combobox', { name: 'Formato da escala', exact: true });
  await picker.waitFor();
  const peer = await context.newPage();
  await peer.goto(origin + '/fixture-peer.html');
  const sync = async () => { await page.waitForTimeout(100); };
  const expectLayout = async (expected, label) => {
    await page.waitForFunction(expected => document.querySelector('select[aria-label="Formato da escala"]')?.value === expected,expected);
    assert.equal(await picker.inputValue(), expected, label);
    results.push(label);
  };
  for (const layout of ['aims', 'calendar']) {
    await picker.selectOption(layout);
    if (layout === 'aims') {
      // The single AIMS mode uses the document overview.
      const activities = page.locator('.cc-doc-token button');
      await activities.nth(8).waitFor();
      assert.equal(await activities.count(), 9, 'real demo AIMS activities');
    }
    await page.clock.fastForward(1500);
    await peer.evaluate(() => localStorage.setItem('fixture:unrelated-refresh', String(Date.now())));
    await expectLayout(layout, `guest ${layout}: unrelated cross-tab storage preserves selection`);
    const before = maintenanceRequests;
    await page.clock.fastForward(65_000);
    await expectLayout(layout, `guest ${layout}: retained across minute timers`);
    assert(maintenanceRequests > before, 'maintenance minute interval exercised');
    assert.match(await page.locator('.cc-roster-layout-status').innerText(), /nesta sessão/);
    assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('crewcheck:roster-layout:')).length), 0, 'guest never persisted as an account');
    await page.getByRole('button', { name: 'Restaurar padrão', exact: true }).click();
    await expectLayout('cards', `guest ${layout}: explicit reset`);
  }
  const owner = async id => {
    await peer.evaluate(id => id ? localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id, name: id, email: `${id}@example.invalid` })) : localStorage.removeItem('crewcheck_auth_user'), id);
    await sync();
  };
  await owner('fixture-A');
  await expectLayout('cards', 'account A starts isolated');
  await picker.selectOption('aims');
  await owner('fixture-B');
  await expectLayout('cards', 'account B does not inherit A');
  await picker.selectOption('calendar');
  await page.clock.fastForward(65_000);
  await expectLayout('calendar', 'account B survives minute timers');
  await owner('fixture-A');
  await expectLayout('aims', 'account A restored');
  await peer.evaluate(() => localStorage.setItem('crewcheck:roster-layout:v1:fixture-A', JSON.stringify({ version: 1, layout: 'list', zoom: 'month' })));
  await expectLayout('list', 'same account preference sync');
  await peer.evaluate(() => localStorage.removeItem('crewcheck:roster-layout:v1:fixture-A'));
  await expectLayout('cards', 'same account storage reset');
  await owner('fixture-B');
  await expectLayout('calendar', 'account B preference untouched');
  await owner(null);
  await expectLayout('cards', 'logout does not inherit account B');
  await picker.selectOption('calendar');
  await peer.evaluate(() => localStorage.clear());
  await expectLayout('cards', 'storage clear resets visitor');
  console.log(JSON.stringify({ status: 'PASS', scope: 'full app, fictional demo, offline API fixtures, accelerated minute timers, synthetic account identities', results }, null, 2));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
