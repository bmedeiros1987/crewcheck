import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(process.env.DEPARTURE_PLAYWRIGHT_PACKAGE || import.meta.url)('playwright');
const origin = process.env.DEPARTURE_TEST_ORIGIN || 'http://127.0.0.1:4197';
const browser = await chromium.launch({ ...(process.env.DEPARTURE_CHROMIUM_EXECUTABLE ? { executablePath: process.env.DEPARTURE_CHROMIUM_EXECUTABLE } : {}) });
const results = [];
const context = await browser.newContext({ serviceWorkers: 'block', timezoneId: 'America/Sao_Paulo' });
let routeError = false, meters = 500000, boardMode = 'pending', boardCalls = 0;
const pendingBoards = [];
await context.route('**/*', async request => {
  const url = new URL(request.request().url());
  if (url.origin !== origin) return request.abort();
  if (!url.pathname.startsWith('/api/')) return request.continue();
  const reply = payload => request.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) });
  if (url.pathname === '/api/maps/route-preview') return reply(routeError ? { ok: false, message: 'Falha sintética de rota' } : { ok: true, provider: 'Fixture offline', distanceMeters: meters, distanceText: `${meters / 1000} km`, durationSeconds: meters > 250000 ? 18000 : 1200, durationText: meters > 250000 ? '5 h' : '20 min', updatedAt: new Date().toISOString(), incidents: [] });
  if (url.pathname === '/api/airport-board') {
    boardCalls++;
    if (boardMode === 'pending') return pendingBoards.push(request);
    if (boardMode === 'error') return request.abort('failed');
    return reply({ ok: true, flights: [] });
  }
  return reply({ ok: true, enabled: false, flights: [], items: [], notices: [], data: [], user: null });
});
await context.addInitScript(() => {
  localStorage.setItem('crewcheck_demo_mode_seen', '1');
  localStorage.setItem('crewcheck:first-access-tour:v1434:disabled', '1');
  localStorage.setItem('crewcheck_manual_route_origin', '-23.43,-46.47');
  sessionStorage.setItem('crewcheck_demo_active', '1');
  if (!sessionStorage.getItem('crewcheck_initial_view')) sessionStorage.setItem('crewcheck_initial_view', 'departure');
});
const page = await context.newPage();
await page.clock.install({ time: new Date('2030-01-10T12:00:00Z') });
const departureLabel = () => page.locator('.cz-depart-when > strong');
const smartLabel = () => page.locator('.cz-smart-card .cz-smart-content > strong');
async function waitLabel(locator, expected, name) {
  await locator.waitFor();
  await page.waitForFunction(({ selector, expected }) => document.querySelector(selector)?.textContent === expected, { selector: name === 'smart' ? '.cz-smart-card .cz-smart-content > strong' : '.cz-depart-when > strong', expected });
  assert.equal(await locator.innerText(), expected);
}
async function capture(name) {
  results.push({ name, departure: await departureLabel().count() ? await departureLabel().innerText() : null, smart: await smartLabel().count() ? await smartLabel().innerText() : null, when: await page.locator('.cz-depart-when').count() ? await page.locator('.cz-depart-when').innerText() : null, boardCalls });
}
async function go(view) {
  await page.evaluate(view => sessionStorage.setItem('crewcheck_initial_view', view), view);
  await page.reload();
  if (view === 'cockpit') {
    await page.getByRole('button', { name: 'Personalizar início', exact: true }).click();
    await page.getByRole('radio', { name: /Personalizada/ }).click();
    await smartLabel().waitFor();
  } else await departureLabel().waitFor();
}
let searchKey, search;
async function setSearch(status) {
  await page.evaluate(({ key, previous, status }) => localStorage.setItem(key, JSON.stringify({ ...previous, status, checkedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 1800000).toISOString() })), { key: searchKey, previous: search, status });
}
try {
  await page.goto(origin + '/app');
  await waitLabel(departureLabel(), 'Consultando voo', 'departure');
  assert.equal(await page.getByText('planeje o deslocamento aéreo no dia anterior.', { exact: false }).count(), 0);
  await capture('Departure: active lookup');
  boardMode = 'error';
  await Promise.all(pendingBoards.splice(0).map(request => request.abort('failed')));
  await page.waitForFunction(() => document.body.innerText.includes('Radar temporariamente indisponível'));
  [searchKey, search] = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(key => key.startsWith('crewcheck_positioning_search:'));
    return [key, JSON.parse(localStorage.getItem(key))];
  });
  assert.equal(search.status, 'error');
  assert.equal(Date.parse(search.expiresAt) - Date.parse(search.checkedAt), 1800000);
  await capture('Departure: terminal Radar error');
  assert.equal(await departureLabel().innerText(), 'Dia anterior', 'terminal Radar error must retain previous-day plan');
  assert.match(await page.locator('.cz-depart-when').innerText(), /10 de janeiro de 2030/);
  routeError = true;
  await page.clock.fastForward(65000);
  await page.waitForFunction(() => document.querySelector('[data-departure-route-state="stale"]'));
  assert.equal(await departureLabel().innerText(), 'Dia anterior');
  await capture('Departure: stale route retains terminal-error fallback');
  routeError = false;
  const callsAfterError = boardCalls;
  const remaining = await page.evaluate(expires => Date.parse(expires) - Date.now(), search.expiresAt);
  await page.clock.fastForward(remaining - 60000);
  await go('departure');
  await waitLabel(departureLabel(), 'Dia anterior', 'departure');
  assert.equal(boardCalls, callsAfterError, '30-minute error cache must prevent repeat lookup');
  await capture('Departure: error cache at minute 29');
  await go('cockpit');
  await waitLabel(smartLabel(), 'Dia anterior', 'smart');
  await capture('Home SmartCard: cached error');
  await page.clock.fastForward(120000);
  await go('cockpit');
  await waitLabel(smartLabel(), 'Confirmar posicionamento', 'smart');
  await capture('Home SmartCard: expired cache, lookup not yet started');
  for (const [status, expected] of [['checking', 'Confirmar posicionamento'], ['none', 'Dia anterior'], ['error', 'Dia anterior']]) {
    await setSearch(status);
    await go('cockpit');
    await waitLabel(smartLabel(), expected, 'smart');
    await capture(`Home SmartCard: ${status}`);
  }
  // A confirmed same-day record must still win over the conservative fallback.
  await page.evaluate(({ search, searchKey }) => {
    const record = { eventId: search.eventId, flightNumber: 'CC900', origin: 'GRU', destination: 'BSB', departureAt: '2030-01-11T06:00:00Z', arrivalAt: '2030-01-11T08:00:00Z', status: 'Programado', source: 'Fixture offline', confirmed: true, checkedAt: new Date().toISOString(), expiresAt: '2030-01-11T12:00:00Z' };
    localStorage.setItem(`crewcheck_positioning_flight:${search.eventId}`, JSON.stringify(record));
    localStorage.setItem(searchKey, JSON.stringify({ ...search, status: 'found', expiresAt: '2030-01-11T10:00:00Z' }));
  }, { search, searchKey });
  await go('cockpit');
  await waitLabel(smartLabel(), 'CC900', 'smart');
  await capture('Home SmartCard: confirmed same-day flight');
  await go('departure');
  await waitLabel(departureLabel(), 'CC900', 'departure');
  await capture('Departure: confirmed same-day flight');
  meters = 12000;
  await go('departure');
  await page.waitForFunction(() => document.querySelector('.cz-depart-detail')?.textContent.includes('20 min'));
  assert.notEqual(await departureLabel().innerText(), 'Dia anterior');
  await capture('Departure: nearby route requires no previous-day flight');
  await go('cockpit');
  await page.waitForFunction(() => document.querySelector('.cz-smart-content')?.textContent.includes('20 min'));
  assert.notEqual(await smartLabel().innerText(), 'Dia anterior');
  await capture('Home SmartCard: nearby route');
  console.log('PASS: full app Departure and Home SmartCard; loading, error cache 30min/expiry, none, confirmed success, stale and nearby route');
} finally {
  fs.writeFileSync(process.env.POSITIONING_EVIDENCE_FILE || '/tmp/positioning-terminal-error-browser.json', JSON.stringify({ scope: 'Full app, fixed clock, synthetic demo/cache/flight/route, external network blocked', results }, null, 2));
  await browser.close();
}
