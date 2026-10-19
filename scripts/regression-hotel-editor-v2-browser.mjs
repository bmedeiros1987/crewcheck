import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { harness } from './fixtures/hotel-platform.mjs';
import { hotelOnlyPatch, hotelRemoteBaseline } from '../client/src/lib/hotelStayClient.mjs';

console.log('hotel-v2 browser: imports ready');
const output = path.resolve(process.env.HOTEL_V2_ARTIFACTS || 'artifacts/hotel-v2');
fs.mkdirSync(output, { recursive: true });
const helper = path.resolve('client/src/lib/hotelStayClient.mjs');
await build({ stdin: { contents: `
import React from 'react'; import {createRoot} from 'react-dom/client'; import {Toaster,toast} from 'sonner';
import Editor from '@/components/v1391/PresentationStayManagerView';
localStorage.setItem('fixture-owner','owner-A');
const event={id:'event-A',kind:'stay',title:'Synthetic stay',date:new Date('2030-01-01T10:00:00Z'),origin:'AAA',destination:'AAA',hotel:'Source A',canonical:{startDateTime:'2030-01-01T10:00:00Z',endDateTime:'2030-01-02T10:00:00Z'}};
const second={...event,id:'event-B',title:'Other synthetic stay',date:new Date('2030-01-03T10:00:00Z'),canonical:{startDateTime:'2030-01-03T10:00:00Z',endDateTime:'2030-01-04T10:00:00Z'}};
window.clearFixtureToasts=()=>toast.dismiss();
createRoot(document.getElementById('root')).render(<><Editor events={[event,second]} initialStayId="event-A" embedded/><Toaster/></>);
`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, outfile: path.join(output, 'app.js'), format: 'esm', jsx: 'automatic',
  alias: { '@': path.resolve('client/src'), '@shared': path.resolve('shared') },
  plugins: [{ name: 'synthetic-host-only', setup(api) {
    api.onResolve({ filter: /(?:authClient|stayAlarmHost|platformClient|\/v139\/api|\/v139\/Shell)$/ }, args => ({ path: args.path, namespace: 'synthetic' }));
    api.onLoad({ filter: /.*/, namespace: 'synthetic' }, args => {
      if (args.path.endsWith('authClient')) return { contents: `export const getToken=()=>localStorage.getItem('fixture-owner')?'synthetic-token':null;export const getStoredUser=()=>({id:localStorage.getItem('fixture-owner'),base:'AAA'});`, loader: 'js' };
      if (args.path.endsWith('stayAlarmHost')) return { contents: 'export const preparedStayAlarmAdapter=()=>null;', loader: 'js' };
      if (args.path.endsWith('/Shell')) return { contents: 'export const V139Header=()=>null;', loader: 'js' };
      if (args.path.endsWith('/api')) return { contents: 'export const v139Api=async()=>({address:null});', loader: 'js' };
      return { contents: `import {createHotelStayClient} from ${JSON.stringify(helper)};
const client=createHotelStayClient({storage:localStorage,capture:()=>{const owner=localStorage.getItem('fixture-owner');return {owner,token:'synthetic-token',isCurrent:()=>owner===localStorage.getItem('fixture-owner')}},request:async(url,options)=>{const response=await fetch(url,{...options,headers:{'Content-Type':'application/json'}});const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.message),{status:response.status});return data;}});
export const listPlatformStays=()=>client.list();export const updatePlatformStay=p=>client.update(p);`, loader: 'js', resolveDir: process.cwd() };
    });
  } }] });
console.log('hotel-v2 browser: bundle ready');
const require = createRequire(process.env.STAY_PLAYWRIGHT_PACKAGE || import.meta.url);
const browser = await require('playwright').chromium.launch({ headless: true, ...(process.env.STAY_CHROMIUM_PATH ? { executablePath: process.env.STAY_CHROMIUM_PATH } : {}) });
console.log('hotel-v2 browser: Chromium ready');
let db = harness(); const writes = [];
const server = createServer(async (req, res) => {
  try {
    let body = ''; for await (const chunk of req) body += chunk;
    if (req.url === '/api/platform/hotels/stays') {
      if (req.method !== 'GET') writes.push(JSON.parse(body));
      const result = await db.request(req.method, body ? JSON.parse(body) : {});
      res.writeHead(result.status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(result.body)); return;
    }
    const file = req.url === '/app.js' ? 'app.js' : req.url === '/app.css' ? 'app.css' : null;
    res.writeHead(200, { 'Content-Type': file?.endsWith('.js') ? 'text/javascript' : file?.endsWith('.css') ? 'text/css' : 'text/html' });
    res.end(file ? fs.readFileSync(path.join(output, file)) : '<!doctype html><html><head><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
  } catch (error) { res.writeHead(500); res.end(String(error)); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let page; const errors = []; const releaseGates = [];
try {
  page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, timezoneId: 'UTC' });
  page.setDefaultTimeout(12000); page.on('pageerror', error => errors.push(error.message));
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.goto(origin);
  console.log('hotel-v2 browser: page loaded');
  const hotel = page.getByRole('textbox', { name: 'Hotel', exact: true }); await hotel.waitFor();
  await hotel.fill('Local draft'); await page.getByRole('button', { name: 'Salvar alterações do pernoite', exact: true }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('crewcheck_stay_editor_v2:owner-A') || '{}').stays?.['event-A']?.draft?.hotelName === 'Local draft');
  assert.equal(writes.length, 0, 'Unbound local edits must not write remotely');
  const selection = page.getByRole('combobox', { name: 'Registro de hotel existente', exact: true });
  await selection.selectOption('stay-A');
  await page.getByRole('button', { name: 'Confirmar registro para esta programação e carregar hotel', exact: true }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('crewcheck_stay_editor_v2:owner-A') || '{}').stays?.['event-A']?.remoteBase?.rowVersion === '1');
  assert.equal(await hotel.inputValue(), 'Source A', 'Confirmation loads source value with its baseline');
  await hotel.fill('Manual browser hotel'); await page.getByRole('button', { name: 'Salvar alterações do pernoite', exact: true }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('crewcheck_stay_editor_v2:owner-A') || '{}').stays?.['event-A']?.remotePersisted === true);
  for (let i = 0; i < 2; i++) await db.sync({ roster: { year: 2030, month: 1, days: [{ date: '2030-01-01', hotel: 'Source A', airport: 'AAA' }] } });
  assert.equal(db.rows[0].hotel_name, 'Manual browser hotel'); assert.equal(db.rows.length, 1);
  await hotel.fill('Unsaved old device draft');
  await page.getByRole('button', { name: 'Salvar alterações do pernoite', exact: true }).click();
  await page.waitForFunction(() => { const row = JSON.parse(localStorage.getItem('crewcheck_stay_editor_v2:owner-A') || '{}').stays?.['event-A']; return row?.draft?.hotelName === 'Unsaved old device draft' && row.remotePersisted === true; });
  // Establish a locally saved draft baseline, then let a second device advance it.
  const remote = (await db.request()).body.stays[0];
  await db.request('PATCH', hotelOnlyPatch({ baseline: hotelRemoteBaseline(remote), latest: remote,
    hotelName: 'Second device hotel', contextRef: remote.contextRef, contextSignature: remote.contextSignature }));
  await page.reload(); await hotel.waitFor();
  assert.equal(await hotel.inputValue(), 'Unsaved old device draft');
  const before = writes.length;
  await page.getByRole('button', { name: 'Salvar alterações do pernoite', exact: true }).click();
  // Wait for the post-click fresh GET to finish, not a fixed sleep.
  await page.waitForFunction(() => !Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('Salvar alterações do pernoite'))?.disabled);
  assert.equal(writes.length, before); assert.equal(db.rows[0].hotel_name, 'Second device hotel');
  await page.getByRole('button', { name: 'Recarregar hotel do servidor', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('input[placeholder="Hotel de pernoite ou contingência"]')?.value === 'Second device hotel');
  await hotel.fill('Intentional after reload'); await page.getByRole('button', { name: 'Salvar alterações do pernoite', exact: true }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('crewcheck_stay_editor_v2:owner-A') || '{}').stays?.['event-A']?.remotePersisted === true);
  assert.equal(db.rows[0].hotel_name, 'Intentional after reload');
  assert.equal(db.rows[0].room_cipher, 'synthetic-room'); assert.equal(db.rows[0].share_same_hotel, true); assert.equal(db.rows[0].share_with_visitors, true);
  // Real callbacks with a deterministic network barrier: no timed sleeps.
  let nextGate = null;
  await page.route(origin + '/api/platform/hotels/stays', async route => {
    const gate = route.request().method() === 'GET' ? nextGate : null;
    if (gate) { nextGate = null; gate.seen(); await gate.wait; }
    return route.continue();
  });
  function holdNextGet() {
    let seen, release;
    const entered = new Promise(resolve => { seen = resolve; });
    const wait = new Promise(resolve => { release = resolve; });
    nextGate = { seen, wait }; releaseGates.push(release);
    return { entered, async finish() {
      const response = page.waitForResponse(response => response.url() === origin + '/api/platform/hotels/stays' && response.request().method() === 'GET');
      release(); await (await response).finished();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    } };
  }
  const room = page.getByRole('textbox', { name: 'Número do quarto', exact: true });
  const lead = page.getByRole('spinbutton', { name: 'Antecedência personalizada (minutos)', exact: true });
  async function editLocal(roomValue, leadValue) {
    await room.fill(roomValue);
    if (!await lead.isVisible()) await page.getByText('Configurar despertador', {exact:true}).click();
    await lead.fill(leadValue);
  }
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('crewcheck_stay_editor_v2:owner-A') || '{}').stays?.['event-A']);
  async function cancelCurrent() {
    const cancel = page.getByRole('button', { name: 'Cancelar despertador deste pernoite', exact: true });
    if (!await cancel.isVisible()) await page.getByText('Mais opções da edição', { exact: true }).click();
    await cancel.click();
  }
  // Original P2: edit fields only while reload is pending, with no cancellation
  // or navigation click that could independently invalidate the operation.
  if (!await lead.isVisible()) await page.getByText('Configurar despertador', {exact:true}).click();
  const storageBeforeEditOnly = await page.evaluate(() => localStorage.getItem('crewcheck_stay_editor_v2:owner-A'));
  await page.evaluate(() => window.clearFixtureToasts());
  let slow = holdNextGet();
  await page.getByRole('button', {name:'Recarregar hotel do servidor',exact:true}).click(); await slow.entered;
  await editLocal('Local room without other action','117'); await slow.finish();
  assert.equal(await room.inputValue(),'Local room without other action'); assert.equal(await lead.inputValue(),'117');
  assert.equal(await page.evaluate(() => localStorage.getItem('crewcheck_stay_editor_v2:owner-A')),storageBeforeEditOnly,'Late GET must not write a captured draft into local storage');
  await page.getByText(/A resposta remota foi descartada/).last().waitFor();
  await page.getByRole('button',{name:'Salvar alterações do pernoite',exact:true}).click();
  await page.waitForFunction(() => { const row=JSON.parse(localStorage.getItem('crewcheck_stay_editor_v2:owner-A')||'{}').stays?.['event-A']; return row?.draft?.room==='Local room without other action' && row.remotePersisted===true; });
  assert.equal((await stored()).choice.leadMinutes,117);
  console.log('PASS slow reload + field edits only preserves screen and does not rewrite storage');

  await page.evaluate(() => window.clearFixtureToasts());
  slow = holdNextGet();
  await page.getByRole('button', { name: 'Recarregar hotel do servidor', exact: true }).click(); await slow.entered;
  await editLocal('Local room during GET','123'); await cancelCurrent(); await slow.finish();
  assert.equal(await room.inputValue(), 'Local room during GET'); assert.equal(await lead.inputValue(), '123');
  let local = await stored(); assert.equal(local.draft.room, 'Local room during GET'); assert.equal(local.choice.leadMinutes, 123); assert.equal(local.alarmState, 'cancelled');
  await page.getByText(/A resposta remota foi descartada/).last().waitFor();
  console.log('PASS slow reload + room/lead edit + cancel preserves screen/storage');

  // Association write is accepted, then its mandatory GET readback is delayed.
  // Edits/cancellation during readback must not apply an old closure afterward.
  db = harness(); await page.evaluate(() => localStorage.removeItem('crewcheck_stay_editor_v2:owner-A')); await page.reload(); await hotel.waitFor();
  await selection.selectOption('stay-A'); await page.evaluate(() => window.clearFixtureToasts());
  slow = holdNextGet();
  await page.getByRole('button', { name: 'Confirmar registro para esta programação e carregar hotel', exact: true }).click(); await slow.entered;
  await editLocal('Local room during association','137'); await cancelCurrent(); await slow.finish();
  assert.equal(await room.inputValue(), 'Local room during association'); assert.equal(await lead.inputValue(), '137');
  local = await stored(); assert.equal(local.draft.room, 'Local room during association'); assert.equal(local.choice.leadMinutes, 137); assert.equal(local.alarmState, 'cancelled');
  await page.getByText(/A resposta remota foi descartada/).last().waitFor();
  assert.equal(local.remoteBase, undefined, 'Interrupted association cannot stamp a remote version onto the edited draft');
  assert.equal(db.rows[0].row_version, '1', 'Remote association may have completed; no false rollback or hotel edit');
  console.log('PASS slow association readback + room/lead edit + cancel preserves screen/storage');

  await page.reload(); await hotel.waitFor(); await selection.selectOption('stay-A');
  await page.getByRole('button', { name: 'Confirmar registro para esta programação e carregar hotel', exact: true }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('crewcheck_stay_editor_v2:owner-A') || '{}').stays?.['event-A']?.remoteBase?.rowVersion === '1');
  const program = page.getByRole('combobox', { name: 'Programação', exact: true });
  slow = holdNextGet(); await page.getByRole('button', { name: 'Recarregar hotel do servidor', exact: true }).click(); await slow.entered;
  await editLocal('Local room before navigation','149'); await program.selectOption('event-B'); await slow.finish();
  assert.equal(await program.inputValue(), 'event-B'); assert.equal(await room.inputValue(), '', 'Late A response cannot populate B');
  await program.selectOption('event-A'); assert.equal(await room.inputValue(), 'Local room before navigation'); assert.equal(await lead.inputValue(), '149');
  await cancelCurrent(); local = await stored(); assert.equal(local.draft.room, 'Local room before navigation'); assert.equal(local.choice.leadMinutes, 149);
  console.log('PASS slow reload + navigation preserves cached local edits and does not populate another stay');

  slow = holdNextGet(); await page.getByRole('button', { name: 'Recarregar hotel do servidor', exact: true }).click(); await slow.entered;
  await editLocal('Local room before account change','161'); await cancelCurrent();
  await page.evaluate(() => { localStorage.setItem('fixture-owner','owner-B'); window.dispatchEvent(new Event('crewcheck:auth-changed')); }); await slow.finish();
  local = await stored(); assert.equal(local.draft.room, 'Local room before account change'); assert.equal(local.choice.leadMinutes, 161);
  assert.equal(await page.evaluate(() => localStorage.getItem('crewcheck_stay_editor_v2:owner-B')), null);
  assert.equal(await room.inputValue(), '', 'Old account callback cannot restore A into B');
  console.log('PASS slow reload + account change preserves A storage without leaking to B');

  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(output, 'hotel-v2-synthetic.png'), fullPage: true });
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ ok: true, productionWrites: false, slowCallbackCases: ['reload-edit-only','reload-edit-cancel','association-edit-cancel','navigation','account-change'], hotelRows: db.rows.length, actions: writes.map(item => item.action), pageErrors: errors }, null, 2));
  console.log('PASS actual editor -> actual client -> literal v2 route -> real mysqlAdapter/synthetic DB; sync/reopen/stale/reload');
} catch (error) {
  console.error('Page errors:', errors);
  if (page) { await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}); fs.writeFileSync(path.join(output,'failure.html'),await page.content()); }
  throw error;
} finally { for (const release of releaseGates) release(); await browser.close(); await new Promise(resolve => server.close(resolve)); }
