import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
const require=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||import.meta.url),{chromium}=require('playwright');
// Same actual PublishedSequenceCard/canonical fixture below; only its HTTP boundary
// is fictional. Never follow tel: or send an API request outside this test page.
function installContactTransport() {
  const contact = window.contactFixture = {
    value: { schema: 'crewcheck.escala-contact.v1', dialString: '01141746343', revision: 0, updatedAt: null },
    mode: 'ok', hold: false, held: [], requests: [], forwarded: [], unexpected: [],
  };
  window.fetch = async (url, init = {}) => {
    if (url !== '/api/operational/escala-contact' || (init.method || 'GET') !== 'GET') {
      contact.unexpected.push(String(url)); throw Error('Unexpected contact fixture request');
    }
    contact.requests.push({ url, method: init.method || 'GET', token: init.headers?.authorization });
    const status = contact.mode === 'denied' ? 403 : contact.mode === 'unavailable' ? 503 : 200;
    const payload = status === 200 ? { ok: true, contact: structuredClone(contact.value) } : { ok: false };
    if (contact.hold) await new Promise(resolve => contact.held.push(resolve));
    return { ok: status === 200, status, json: async () => payload };
  };
  window.contactSession = (owner, token = owner) => {
    window.dispatchEvent(new Event('crewcheck:auth-will-change'));
    if (owner) { localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: owner })); localStorage.setItem('crewcheck_auth_token', token); }
    else { localStorage.removeItem('crewcheck_auth_user'); localStorage.removeItem('crewcheck_auth_token'); }
    window.dispatchEvent(new Event('crewcheck:auth-changed'));
  };
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href^="tel:"]');
    if (link) { if (!event.defaultPrevented) contact.forwarded.push(link.getAttribute('href')); event.preventDefault(); }
  });
}
async function checkIntegratedContact(page, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.reload();
  const card = page.locator('[data-published-sequence]');
  const phone = () => card.getByRole('link', { name: 'Escala', exact: true });
  const disabled = () => card.getByRole('button', { name: 'Escala', exact: true });
  const ready = dial => page.waitForFunction(dial => document.querySelector('[data-published-sequence] a[aria-label="Escala"]')?.getAttribute('href') === 'tel:' + dial, dial);
  async function layout() {
    const metrics = await card.evaluate(el => {
      const box = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
      return { card: box(el), title: box(el.querySelector('h3')), icon: box(el.querySelector('[aria-label="Escala"]')), overflow: document.documentElement.scrollWidth - innerWidth };
    });
    assert(metrics.icon.width >= 44 && metrics.icon.height >= 44, '44px contact target at ' + width);
    assert(metrics.title.right <= metrics.icon.x + 1, 'heading and icon do not overlap at ' + width);
    assert(metrics.icon.right <= metrics.card.right && metrics.icon.bottom <= metrics.card.bottom, 'contact remains inside real card');
    assert(metrics.overflow <= 1, 'no horizontal viewport overflow at ' + width);
  }
  await ready('01141746343');
  assert.equal(await phone().count(), 1); assert.equal(await phone().textContent(), '');
  assert.equal(await phone().getAttribute('title'), 'Escala');
  assert.doesNotMatch(await card.innerText(), /01141746343/);
  assert.deepEqual(await page.evaluate(() => contactFixture.forwarded), [], 'mount never launches a dialer');
  await layout();
  // Real keyboard navigation and activation, not HTMLElement.click or a focus shortcut.
  await page.locator('#keyboard-start').click();
  await page.keyboard.press('Tab');
  assert.equal(await phone().evaluate(el => document.activeElement === el), true);
  assert.equal(await phone().evaluate(el => el.matches(':focus-visible') && getComputedStyle(el).outlineStyle !== 'none'), true, 'keyboard focus is visible');
  await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(() => contactFixture.forwarded), ['tel:01141746343']);
  // Token replacement without an auth event must fence a still-focused rendered link.
  await page.evaluate(() => localStorage.setItem('crewcheck_auth_token', 'replacement-without-event'));
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => contactFixture.forwarded.length), 1, 'stale keyboard activation is suppressed');
  await page.evaluate(() => contactSession(null));
  await disabled().waitFor(); assert.equal(await disabled().isDisabled(), true); assert.equal(await phone().count(), 0);
  const requests = await page.evaluate(() => contactFixture.requests.length);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(() => document.body.textContent.includes('Contato da Escala indisponível.'));
  assert.equal(await page.evaluate(() => contactFixture.requests.length), requests, 'signed out card does not fetch');
  await layout();
  // A held read from A must not reactivate the icon in a denied B session.
  await page.evaluate(() => { contactFixture.hold = true; contactSession('synthetic-A', 'new-A'); });
  await page.waitForFunction(() => contactFixture.held.length === 1);
  assert.equal(await disabled().isDisabled(), true); assert.equal(await phone().count(), 0);
  await page.evaluate(() => { contactFixture.hold = false; contactFixture.mode = 'denied'; contactSession('synthetic-B'); });
  await page.waitForFunction(() => document.body.textContent.includes('Contato da Escala indisponível.'));
  await page.evaluate(() => contactFixture.held.splice(0).forEach(resolve => resolve()));
  // Drain the held fetch/json and React update before checking the old response.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await phone().count(), 0); assert.equal(await disabled().isDisabled(), true);
  await page.evaluate(() => { contactFixture.mode = 'unavailable'; window.dispatchEvent(new Event('focus')); });
  await page.waitForFunction(() => document.body.textContent.includes('Contato da Escala indisponível.'));
  assert.equal(await phone().count(), 0); await layout();
  await page.evaluate(() => {
    contactFixture.mode = 'ok'; contactFixture.value = { ...contactFixture.value, dialString: '+551141746344', revision: 1, updatedAt: '2032-01-02T03:04:05.000Z' };
    contactSession('synthetic-B', 'new-B');
  });
  await ready('+551141746344'); assert.doesNotMatch(await card.innerText(), /551141746344/); await layout();
  await page.locator('#keyboard-start').click();
  await page.keyboard.press('Tab');
  assert.equal(await phone().evaluate(el => document.activeElement === el), true);
  await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(() => contactFixture.forwarded), ['tel:01141746343', 'tel:+551141746344']);
  assert.deepEqual(await page.evaluate(() => contactFixture.unexpected), []);
  assert.equal(await page.evaluate(() => contactFixture.requests.every(req => req.method === 'GET')), true);
  const output = process.env.ESCALA_CONTACT_QA_OUTPUT;
  if (output) { fs.mkdirSync(output, { recursive: true }); await page.screenshot({ path: output + '/escala-card-' + width + '.png', fullPage: true }); }
  console.log('PASS integrated PublishedSequenceCard ' + width + 'px: icon/name/hidden number, 44px layout, Tab + Enter, stale token, loading/denied/offline/signed-out/read-race; two intercepted handoffs, no actual call');
}
const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{PublishedSequenceCard}from'./client/src/components/PublishedSequenceCard';import{buildCanonicalRosterEvents,selectNextRosterEvent}from'./client/src/lib/canonicalRoster';import{publication,observePublication,reviewKey}from'./client/src/lib/rosterPublicationReview';
const day=(type,start,end)=>({date:'09/10/2030',type,pairingCode:type,dutyReport:start,dutyDebrief:end,legs:[],base:'BSB',dutyHours:null,flyingHours:null,isNextDay:false,hotel:null});
const events=days=>buildCanonicalRosterEvents({crewName:'Synthetic',crewId:'fixture',base:'BSB',rank:'CCM',month:10,year:2030,days});const root=createRoot(document.getElementById('root'));let active;
window.renderFixture=(mode='sequence')=>{let days=[day('HSB','02:00','02:40'),day('ASB','02:40','04:00')];if(mode==='activation-flight-only')days=[{...day('HSB','02:40','04:00'),legs:[{flightNumber:'QA456',origin:'BSB',destination:'GRU',departureTime:'02:40',arrivalTime:'04:00'}]}];if(mode==='activation-legs')days=[days[0],{...day('ASB','02:40','04:00'),legs:[{flightNumber:'QA456',origin:'BSB',destination:'GRU',departureTime:'02:40',arrivalTime:'04:00'}]}];if(mode==='meeting')days=[days[0],day('CRM','02:40','04:00')];if(mode==='reserve-shortened')days=[day('ASB','02:00','02:40')];if(mode==='overnight')days=[day('HSB','23:40','00:20'),{...day('ASB','00:20','02:00'),date:'10/10/2030'}];if(mode==='gap')days[1]=day('ASB','05:00','06:00');if(mode==='overlap')days[1]=day('ASB','02:30','04:00');if(mode==='rest')days=[days[0],day('DO','02:40','04:00'),day('ASB','05:00','06:00')];if(mode==='missing')days[0]=day('HSB',null,null);active=events(days);if(mode==='evolution')active.push({...active[1],id:'synthetic-flight',kind:'flight',flightNumber:'QA123',startDateTime:active[1].endDateTime,endDateTime:'2030-10-09T09:00:00Z'});const owner='synthetic-A';localStorage.setItem('crewcheck_auth_token',owner);localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:owner}));const previous=observePublication(owner,null,publication(events([day(mode==='reserve-shortened'?'ASB':'HSB','02:00','08:00')])));localStorage.setItem(reviewKey(owner),JSON.stringify(observePublication(owner,previous,publication(active))));root.render(<PublishedSequenceCard events={active} anchorId={active.find(event=>event.flightNumber==='HSB')?.id || active[0].id}/>)};
window.advanceFixture=now=>{const next=selectNextRosterEvent(active,new Date(now));root.render(<PublishedSequenceCard events={active} anchorId={next?.id || 'completed'}/>)};window.swapOwner=()=>{localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic-B'}));window.dispatchEvent(new Event('focus'))};window.staleVersion=()=>{let state=JSON.parse(localStorage.getItem(reviewKey('synthetic-A')));state.publication.revision='older';localStorage.setItem(reviewKey('synthetic-A'),JSON.stringify(state));window.dispatchEvent(new Event('focus'))};window.swapJourney=()=>root.render(<PublishedSequenceCard events={active} anchorId='absent'/>);window.renderFixture();`,resolveDir:process.cwd(),loader:'tsx'},outdir:'/tmp/standby-sequence-bundle',bundle:true,write:false,format:'iife',jsx:'automatic'});
const js=bundle.outputFiles.find(file=>file.path.endsWith('.js'))?.text||bundle.outputFiles[0].text;
const css=bundle.outputFiles.find(file=>file.path.endsWith('.css'))?.text||'';
const server=http.createServer((req,res)=>{res.setHeader('content-type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?js:'<meta name="viewport" content="width=device-width"><style>'+css+'</style><button id="keyboard-start">Início do teste de foco</button><div id="root"></div><script src="/fixture.js"></script>')});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try {browser=await chromium.launch({...(process.env.CREWCHECK_QA_CHROMIUM?{executablePath:process.env.CREWCHECK_QA_CHROMIUM}:{}),args:['--no-sandbox']});for (const timezoneId of ['UTC','America/Sao_Paulo','Asia/Tokyo']) {const context=await browser.newContext({viewport:{width:393,height:851},timezoneId,serviceWorkers:'block'});const origin=`http://127.0.0.1:${server.address().port}`;let externalRequests=0;await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();externalRequests++;return route.abort()});await context.addInitScript(installContactTransport);const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(origin);if(timezoneId==='UTC'){for(const width of [320,393,1280])await checkIntegratedContact(page,width);await page.setViewportSize({width:393,height:851});await page.reload();}await page.getByText('Indício de acionamento (inferido)',{exact:true}).waitFor();assert.equal(await page.locator('li').count(),2);await page.getByText(/Janela de sobreaviso encurtada/).waitFor();assert.match(await page.locator('li').first().textContent(),/02:00 → 02:40/);await page.screenshot({path:'/tmp/crewcheck-standby-sequence-mobile.png',fullPage:true});await page.evaluate(()=>window.swapOwner());await page.waitForFunction(()=>!document.body.textContent.includes('encurtada'));await page.evaluate(()=>window.renderFixture());await page.getByText(/Janela de sobreaviso encurtada/).waitFor();await page.evaluate(()=>window.staleVersion());await page.waitForFunction(()=>!document.body.textContent.includes('encurtada'));
for(const mode of ['gap','overlap','missing','rest']){await page.evaluate(mode=>window.renderFixture(mode),mode);await page.getByText('Acionamento não confirmado',{exact:true}).waitFor();if(mode==='rest')assert.equal(await page.locator('li').count(),1);if(mode==='missing'){assert.match(await page.locator('li').first().textContent(),/Horário publicado incompleto/);}}
await page.evaluate(()=>window.renderFixture('activation-legs'));await page.getByText('QA456',{exact:true}).waitFor();assert.equal(await page.locator('li').count(),2);assert.match(await page.locator('li').nth(1).textContent(),/QA456/);
await page.evaluate(()=>window.renderFixture('activation-flight-only'));await page.waitForFunction(()=>!document.querySelector('[data-published-sequence]'));
await page.evaluate(()=>window.renderFixture('meeting'));await page.getByText('Acionamento não confirmado',{exact:true}).waitFor();assert.equal(await page.locator('li').count(),1);assert.doesNotMatch(await page.locator('article').textContent(),/CRM/);
await page.evaluate(()=>window.renderFixture('reserve-shortened'));await page.getByText('Acionamento não confirmado',{exact:true}).waitFor();assert.doesNotMatch(await page.locator('article').textContent(),/sobreaviso encurtada|Indício de acionamento/);
await page.evaluate(()=>window.renderFixture('evolution'));
for(const now of ['2030-10-09T05:10:00Z','2030-10-09T05:41:00Z','2030-10-09T07:01:00Z']){await page.evaluate(now=>window.advanceFixture(now),now);await page.getByText('Indício de acionamento (inferido)',{exact:true}).waitFor();assert.equal(await page.locator('li').count(),3);await page.getByText(/Janela de sobreaviso encurtada/).waitFor();assert.match(await page.locator('li').first().textContent(),/HSB/);}
await page.evaluate(()=>window.advanceFixture('2030-10-09T09:01:00Z'));await page.waitForFunction(()=>!document.querySelector('[data-published-sequence]'));
await page.evaluate(()=>window.renderFixture('overnight'));await page.getByText('Indício de acionamento (inferido)',{exact:true}).waitFor();assert.match(await page.locator('li').first().textContent(),/09\/10\/2030 · 23:40 → 10\/10\/2030 00:20/);assert.match(await page.locator('li').nth(1).textContent(),/10\/10\/2030 · 00:20 → 02:00/);await page.screenshot({path:'/tmp/crewcheck-standby-midnight-'+timezoneId.replaceAll('/','-')+'.png',fullPage:true});await page.evaluate(()=>window.swapJourney());await page.waitForFunction(()=>!document.querySelector('[data-published-sequence]'));assert.deepEqual(errors,[]);assert.equal(externalRequests,0);assert.deepEqual(await page.evaluate(()=>contactFixture.unexpected),[]);await context.close();console.log('PASS actual React component '+timezoneId+': fixed BRT published clocks and midnight dates; mobile, shortened history, account/focus, stale publication, gaps, overlap, missing time, rest boundary, journey swap; no external requests');}
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
if(!process.argv.includes('--raw')){const home=fs.readFileSync('client/src/pages/Home.tsx','utf8');assert.equal((home.match(/<PublishedSequenceCard events=/g)||[]).length,2,'both prepared Home presentations wired');assert(home.includes("isHomeStandby(event) ? 'Início do sobreaviso'"));}
