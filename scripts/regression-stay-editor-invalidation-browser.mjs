import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

// Actual PresentationStayManagerView in Chromium. Only the native stay-alarm host
// is replaced by an in-page recorder of invalidate() calls; storage, account,
// hydration and React lifecycle are the real ones. Synthetic roster/account only,
// no network beyond this local server, no native/device acceptance.
// Build output stays outside the checkout so nothing generated can be committed.
const output = path.resolve(process.env.STAY_INVALIDATION_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'stay-editor-invalidation-')));
fs.mkdirSync(output, { recursive: true });
const component = process.env.STAY_EDITOR_COMPONENT ? path.resolve(process.env.STAY_EDITOR_COMPONENT) : null;
fs.writeFileSync(path.join(output, 'host-recorder.js'), `
export function preparedStayAlarmAdapter() { return window.__stayHost || null; }
`);
const entry = `
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import PresentationStayManagerView from '@/components/v1391/PresentationStayManagerView';
import { loadStayEditor, persistStayEditor, stayEditorAccount } from '@/lib/stayEditorStore';
const base = Date.parse('2031-11-19T12:00:00Z');
window.__makeEvents = (shiftHours = 0, without = []) => [
  ['next', 24 + shiftHours, 'BSB', 'Hotel sintético em Brasília'],
  ['later', 96, 'FOR', 'Hotel sintético em Fortaleza'],
].filter(([id]) => !without.includes(id)).map(([id, hours, airport, hotel]) => {
  const start = new Date(base + hours * 3600000), end = new Date(start.getTime() + 12 * 3600000);
  return { id, kind: 'stay', date: start, origin: airport, destination: airport, hotel, presentation: '14:00',
    day: { date: start.toISOString().slice(0, 10) }, canonical: { startDateTime: start.toISOString(), endDateTime: end.toISOString() } };
});
window.__signature = event => [event.id, event.canonical?.startDateTime, event.canonical?.endDateTime, event.origin, event.destination].join('|');
window.__store = { load: loadStayEditor, persist: persistStayEditor, account: stayEditorAccount };
function App() {
  const [state, setState] = useState({ key: 0, events: window.__makeEvents() });
  useEffect(() => {
    window.__setEvents = events => setState(current => ({ ...current, events }));
    window.__remount = () => setState(current => ({ ...current, key: current.key + 1 }));
  }, []);
  return <PresentationStayManagerView key={state.key} events={state.events} initialStayId="next" embedded/>;
}
createRoot(document.getElementById('root')).render(<App/>);
`;
const redirect = {
  name: 'stay-host-recorder',
  setup(builder) {
    builder.onResolve({ filter: /(^|\/)lib\/stayAlarmHost$/ }, () => ({ path: path.join(output, 'host-recorder.js') }));
    if (component) builder.onResolve({ filter: /components\/v1391\/PresentationStayManagerView$/ }, () => ({ path: component }));
  },
};
await build({ stdin: { contents: entry, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, platform: 'browser', format: 'esm', jsx: 'automatic',
  tsconfig: 'tsconfig.json', outfile: path.join(output, 'harness.js'), loader: { '.css': 'empty', '.png': 'empty', '.svg': 'empty' }, plugins: [redirect],
  define: { 'process.env.NODE_ENV': '"test"', 'import.meta.env': JSON.stringify({ DEV: false, PROD: true, MODE: 'test', BASE_URL: '/' }) }, logLevel: 'error' });
fs.writeFileSync(path.join(output, 'index.html'), '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module" src="/harness.js"></script></body></html>');
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url || '/', 'http://localhost').pathname;
  const file = path.resolve(output, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(output + path.sep) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'text/html');
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const { chromium } = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || import.meta.url)('playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
const results = [];
try {
  async function open(name) {
    const context = await browser.newContext({ viewport: { width: 390, height: 3200 }, serviceWorkers: 'block' });
    const external = [], writes = [], errors = [];
    await context.addInitScript(() => {
      localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'stay-invalidation-test', email: 'synthetic@example.invalid', role: 'user' }));
      localStorage.setItem('crewcheck_auth_token', 'synthetic');
      window.__invalidations = [];
      window.__stayHost = {
        ready: () => true, permission: () => true, atomicReplace: true, acknowledgedCancel: true,
        authenticate: async () => ({ state: 'authenticated' }),
        invalidate: async () => { window.__invalidations.push(Date.now()); return { state: 'revoked' }; },
        replace: async () => ({ state: 'not-programmed', reason: 'synthetic-recorder' }),
        cancel: async input => ({ state: 'unknown', key: input?.key }),
      };
    });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { external.push(url.href); return route.abort(); }
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (route.request().method() !== 'GET') writes.push(`${route.request().method()} ${url.pathname}`);
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, stays: [], items: [], data: [] }) });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await page.getByRole('textbox', { name: 'Hotel', exact: true }).waitFor({ timeout: 15000 });
    await settle(page);
    return { name, context, page, external, writes, errors };
  }
  async function settle(page) {
    // Effects, async hydration and microtasks after each step.
    await page.evaluate(() => new Promise(resolve => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(resolve)), 250)));
  }
  // Inputs nested in their visible <label> text (some labels also wrap helper markup).
  const field = (page, text) => page.locator('label').filter({ hasText: text }).first().locator('input').first();
  const count = page => page.evaluate(() => window.__invalidations.length);
  async function reset(page) { await page.evaluate(() => { window.__invalidations.length = 0; }); }
  async function seed(page, { signatureShiftHours = 0 } = {}) {
    const stored = await page.evaluate(shift => {
      const [event] = window.__makeEvents(shift);
      const day = event.canonical.startDateTime.slice(0, 10);
      const current = window.__store.load();
      window.__store.persist({ ...current, lastEditedEventId: 'next', stays: { ...current.stays, next: {
        eventId: 'next', signature: window.__signature(event),
        draft: { hotelName: 'Hotel sintético em Brasília', airport: 'BSB', stayDate: day, room: '', presentationTime: '14:00', leadMinutes: '', shareSameHotel: false },
        timeZone: 'America/Sao_Paulo', apzDate: day, apzConfirmed: true, apzSource: 'manual', choice: { mode: 'relative', leadMinutes: 60 }, breakfastPlan: 'unknown',
        alarmState: 'not-programmed', transport: { transportProvider: '', transportLocation: '', pickupDate: '', pickupTime: '', pickupTimeZone: '' },
      } } }, window.__store.account());
      return window.__store.load().stays.next;
    }, signatureShiftHours);
    assert.equal(stored?.apzConfirmed, true, 'seeded saved stay must be accepted by the real store');
  }
  async function seedRecord(page, id, { apzDate, signature, alarmState = 'not-programmed' }) {
    await page.evaluate(({ id, apzDate, signature, alarmState }) => {
      const current = window.__store.load();
      window.__store.persist({ ...current, stays: { ...current.stays, [id]: {
        eventId: id, signature, draft: { hotelName: 'Hotel sintético salvo', airport: 'GRU', stayDate: apzDate, room: '', presentationTime: '09:00', leadMinutes: '', shareSameHotel: false },
        timeZone: 'America/Sao_Paulo', apzDate, apzConfirmed: true, apzSource: 'manual', choice: { mode: 'relative', leadMinutes: 60 }, breakfastPlan: 'unknown',
        alarmState, transport: { transportProvider: '', transportLocation: '', pickupDate: '', pickupTime: '', pickupTimeZone: '' },
      } } }, window.__store.account());
    }, { id, apzDate, signature, alarmState });
    assert.ok(await page.evaluate(id => Boolean(window.__store.load().stays[id]), id), `${id} accepted by the real store`);
  }
  async function remount(page) { await page.evaluate(() => window.__remount()); await page.getByRole('textbox', { name: 'Hotel', exact: true }).waitFor(); await settle(page); }
  async function finish(run, checks) {
    assert.deepEqual(run.errors, [], `${run.name}: no page errors`);
    assert.deepEqual(run.external, [], `${run.name}: no external requests`);
    assert.deepEqual(run.writes, [], `${run.name}: no HTTP writes`);
    results.push({ name: run.name, checks });
    await run.context.close();
  }

  // 1. Viewing a saved stay: mount, async hydration, remounts and same-canonical roster refreshes keep authority.
  {
    const run = await open('view-saved-stay'); const { page } = run;
    assert.equal(await count(page), 0, 'first mount without saved stay');
    await seed(page); await reset(page);
    await remount(page);
    assert.equal(await page.getByRole('textbox', { name: 'Hotel', exact: true }).inputValue(), 'Hotel sintético em Brasília', 'saved stay hydrated');
    assert.equal(await count(page), 0, 'mount + hydration of a saved stay is not an edit');
    await remount(page); await remount(page);
    assert.equal(await count(page), 0, 'repeated reopen keeps durable authority');
    await page.evaluate(() => window.__setEvents(window.__makeEvents())); await settle(page);
    assert.equal(await count(page), 0, 'same-canonical roster refresh (new references) keeps authority');
    // A transiently empty roster is unknown inventory, not removal; restoring it is not a change.
    await page.evaluate(() => window.__setEvents([])); await settle(page);
    await page.evaluate(() => window.__setEvents(window.__makeEvents())); await settle(page);
    assert.equal(await count(page), 0, 'empty roster while only viewing is unknown inventory, not removal');
    await page.getByRole('textbox', { name: 'Número do quarto', exact: true }).fill('1204'); await settle(page);
    await page.evaluate(() => window.__setEvents(window.__makeEvents())); await settle(page);
    assert.equal(await count(page), 0, 'room-only edit followed by same-canonical refresh keeps authority');
    await finish(run, ['mount', 'hydration', 'remount x3', 'same-canonical refresh', 'empty roster while viewing', 'room-only edit']);
  }
  // 1b. Switching between saved stays and past saved stays leaving the roster are not edits.
  {
    const run = await open('switch-and-past-saved-stays'); const { page } = run;
    await seed(page);
    const later = await page.evaluate(() => { const event = window.__makeEvents()[1]; return { signature: window.__signature(event), day: event.canonical.startDateTime.slice(0, 10) }; });
    await seedRecord(page, 'later', { apzDate: later.day, signature: later.signature });
    await seedRecord(page, 'past-trip', { apzDate: '2024-01-10', signature: 'past-trip|2024-01-10T10:00:00.000Z|2024-01-10T22:00:00.000Z|GRU|GRU' });
    await seedRecord(page, 'cancelled-trip', { apzDate: '2031-12-01', signature: 'cancelled-trip|x|y|GRU|GRU', alarmState: 'cancelled' });
    await remount(page); await reset(page);
    await remount(page); await remount(page);
    assert.equal(await count(page), 0, 'past or cancelled saved stays absent from the roster do not revoke on every mount');
    const program = page.locator('label').filter({ hasText: 'Programação' }).first().locator('select');
    await program.selectOption('later'); await settle(page);
    assert.equal(await page.getByRole('textbox', { name: 'Hotel', exact: true }).inputValue(), 'Hotel sintético salvo', 'switched to the other saved stay');
    await program.selectOption('next'); await settle(page);
    assert.equal(await count(page), 0, 'choosing another saved stay in the selector is not an edit');
    await finish(run, ['past saved stay absent', 'cancelled saved stay absent', 'selector next→later→next']);
  }
  {
    const run = await open('fresh-mount-vanished-current-saved-stay'); const { page } = run;
    await seed(page);
    await seedRecord(page, 'vanished-current', { apzDate: '2031-11-22', signature: 'vanished-current|2031-11-22T10:00:00.000Z|2031-11-22T22:00:00.000Z|GRU|GRU' });
    await reset(page); await remount(page);
    assert.ok(await count(page) >= 1, 'a current saved stay missing from the roster revokes on a fresh mount');
    await finish(run, ['fresh mount with current saved stay removed from roster']);
  }
  // 2. Real edits of alarm inputs revoke.
  for (const [name, edit] of [
    ['hotel-edit', page => page.getByRole('textbox', { name: 'Hotel', exact: true }).fill('Outro hotel sintético')],
    ['apz-time-edit', page => field(page, 'APZ no hotel (manual ou salva)').fill('15:30')],
    ['apz-date-edit', page => field(page, 'Data da APZ no hotel').fill('2031-11-21')],
    ['hotel-time-zone-edit', page => page.locator('label').filter({ hasText: /^Fuso do hotel/ }).first().locator('select').selectOption('America/Manaus')],
    ['default-lead-save', async page => {
      const summary = page.getByText('Alterar antecedência padrão', { exact: true });
      await summary.scrollIntoViewIfNeeded(); await summary.click();
      await field(page, 'Minutos do padrão · com café').fill('75');
      await field(page, 'Minutos do padrão · sem café').fill('45');
      const save = page.getByRole('button', { name: 'Salvar antecedência padrão', exact: true });
      await save.scrollIntoViewIfNeeded(); await save.click();
    }],
  ]) {
    const run = await open(name); const { page } = run;
    await seed(page); await remount(page); await reset(page);
    await edit(page); await settle(page);
    assert.ok(await count(page) >= 1, `${name}: a real edit revokes durable authority`);
    await finish(run, [name]);
  }
  // 3. Real roster changes revoke, including on a fresh mount.
  {
    const run = await open('canonical-change'); const { page } = run;
    await seed(page); await remount(page); await reset(page);
    await page.evaluate(() => window.__setEvents(window.__makeEvents(2))); await settle(page);
    assert.ok(await count(page) >= 1, 'canonical change of the saved stay revokes');
    await finish(run, ['canonical change while open']);
  }
  {
    const run = await open('removal'); const { page } = run;
    await seed(page); await remount(page); await reset(page);
    await page.evaluate(() => window.__setEvents(window.__makeEvents(0, ['next']))); await settle(page);
    assert.ok(await count(page) >= 1, 'removal of the saved stay revokes');
    await finish(run, ['removal while open']);
  }
  {
    const run = await open('fresh-mount-saved-mismatch'); const { page } = run;
    await seed(page, { signatureShiftHours: -3 }); await reset(page);
    await remount(page);
    assert.ok(await count(page) >= 1, 'fresh mount whose saved signature no longer matches the roster revokes');
    await finish(run, ['fresh mount with changed saved signature']);
  }
} finally {
  await browser.close();
  server.close();
}
fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
console.log(`PASS stay editor durable invalidation in Chromium: ${results.length} scenarios (view/hydration/remount keep authority; real edits, canonical change, removal and stale saved signature revoke; 0 external requests, 0 HTTP writes)`);
