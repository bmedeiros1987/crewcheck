const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const { build } = require('esbuild');
// Actual prepared Home weather hooks, ownership/controller/notice modules, Pulse,
// header/footer and shipping CSS. All flight/account/provider data are synthetic.
// --bundle-only performs no browser launch and is not browser acceptance.
async function readingScaleProof(page, phase) {
  return page.evaluate(phase => {
    const root = document.documentElement, font = element => element ? parseFloat(getComputedStyle(element).fontSize) : null;
    return { phase, rootFontPx: font(root), textScale: Number(getComputedStyle(root).getPropertyValue('--cc-text-scale')),
      declaredTextSize: root.dataset.crewTextSize, triggerFontPx: font(document.querySelector('.cc-pulse-compact-details-trigger strong')),
      detailFontPx: [...document.querySelectorAll('.cc-pulse-popover strong,.cc-pulse-popover small')].map(font) };
  }, phase);
}
function assertReadingScale(proof, expected, requirePulse = false, requireDetails = false) {
  assert.equal(proof.textScale, expected, 'Use the actual application text-scale custom property');
  assert.equal(proof.declaredTextSize, String(expected * 100));
  assert.ok(Number.isFinite(proof.rootFontPx) && proof.rootFontPx > 0);
  if (requirePulse) assert.equal(proof.triggerFontPx, proof.rootFontPx * expected, 'Rendered Pulse title must have the requested computed size');
  if (requireDetails) {
    assert.ok(proof.detailFontPx.length >= 2, 'Require actual title and observation text');
    for (const size of proof.detailFontPx) assert.equal(size, proof.rootFontPx * expected, 'Rendered weather details must have the requested computed size');
  }
}
const bundleOnly = process.argv.includes('--bundle-only');
assert.ok(process.argv.slice(2).every(arg => arg === '--bundle-only'));
const output = path.resolve(process.env.WEATHER_PULSE_ARTIFACTS || 'artifacts/weather-pulse-lifecycle');
fs.mkdirSync(output, { recursive: true });
const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const ast = ts.createSourceFile('Home.tsx', home, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['Brand', 'BottomNav', 'CrewCheckMark', 'airportIcao', 'useWeatherLandingMonitor', 'useOperationalWeatherPulse'];
const declarations = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)
  || ts.isVariableStatement(node) && node.declarationList.declarations.some(decl => decl.name.getText(ast) === 'storage'));
for (const name of names) assert.equal(declarations.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name).length, 1, name);
assert.match(home, /useOperationalWeatherPulse\(bundle, events\)/);
assert.ok(home.includes('data-ipad-layout-v14394'), 'Full canonical preparation is required');
const components = declarations.map(node => node.getText(ast)).join('\n');
assert.ok(!components.includes('getCurrentPosition'), 'No automatic geolocation in either weather hook');
const icons = ast.statements.filter(node => ts.isImportDeclaration(node) && node.moduleSpecifier.text === 'lucide-react').map(node => node.getText(ast)).join('\n');
const rootProps = { className: 'cz-app', 'data-view': 'cockpit', 'data-menu-open': 'false' };
function collect(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'DEFAULT_VERSION' && node.initializer && ts.isStringLiteral(node.initializer)) rootProps['data-version'] = node.initializer.text;
  if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.attributes.properties.some(attr => ts.isJsxAttribute(attr) && attr.name.text === 'data-ipad-layout-v14394'))
    for (const attr of node.attributes.properties) if (ts.isJsxAttribute(attr) && attr.name.text.startsWith('data-') && attr.initializer && ts.isStringLiteral(attr.initializer)) rootProps[attr.name.text] = attr.initializer.text;
  ts.forEachChild(node, collect);
}
collect(ast); rootProps['data-view'] = 'cockpit'; rootProps['data-menu-open'] = 'false';
const NOW = Date.parse('2032-02-02T17:30:00Z');
const entry = `
import React,{useState,useEffect,useMemo,useRef} from 'react';
import {createRoot} from 'react-dom/client'; import {createPortal} from 'react-dom';
${icons}
import {alertText} from '@/lib/alertExperienceText';
import {isFinancialSetting,readFinancialSetting,writeFinancialSetting} from '@/lib/financialSettingStore';
import {readAccountNotificationSetting} from '@/lib/notificationPreferences';
import {alertAccount,ALERT_REVIEW_EVENT,readAlertReviews} from '@/lib/alertReviewStore';
import {startupKey,startupOwner,beginRosterChoice} from '@/lib/rosterStartup';
import {createOperationalWeatherContextReader,weatherContextRefreshEvent} from '@/lib/operationalWeatherContext';
import {operationalWeatherController,WEATHER_PREFERENCE_EVENT} from '@/lib/operationalWeatherController';
import {WEATHER_LANDING_SCOPE} from '@/lib/operationalWeatherNotices';
import {reviewedWeatherStation} from '@shared/weather-station-overrides.mjs';
import {currentCrewCheckPulseState,reconcileCrewCheckPulse,publishCrewCheckPulse} from '@/components/pulse/pulseRuntime';
import CrewCheckPulse from '@/components/pulse/CrewCheckPulse';
import {InternalHeaderFrame} from '@/components/navigation/InternalHeaderFrame';
import {OperationalLayoutSafety} from '@/components/navigation/OperationalLayoutSafety';
import {peekPendingNavigationContext} from '@/lib/navigationContext';
${components}
const base=${NOW};
const make=(revision=0,kind='recent')=>{
 const dep=kind==='overnight'?Date.parse('2032-02-03T02:30:00Z'):base-120*60000;
 const arr=kind==='overnight'?Date.parse('2032-02-03T04:00:00Z'):base-5*60000;
 const makeEvent=(id,origin,destination,departure,arrival,overnight=false)=>({id,kind:'flight',flightNumber:id==='qa-today'?'TEST1':'TEST2',origin,destination,
  canonical:{kind:'flight',journeyId:'qa-journey-'+id,startDateTime:new Date(departure).toISOString(),endDateTime:new Date(arrival).toISOString(),
   leg:{departureTime:overnight?'23:30':'12:30',arrivalTime:overnight?'01:00 (+1)':'14:25'}}});
 const today=makeEvent('qa-today','BSB','BPS',dep,arr,kind==='overnight');
 const tomorrow=makeEvent('qa-tomorrow','BSB','VCP',base+24*3600000,base+25*3600000);
 const events=kind==='future'?[tomorrow]:[today,tomorrow];
 const roster={year:2032,month:2,days:[{date:'02/02/2032',fixtureRevision:revision,legs:events.map(e=>({flightNumber:e.flightNumber,origin:e.origin,destination:e.destination,departureTime:e.canonical.leg.departureTime,arrivalTime:e.canonical.leg.arrivalTime}))}]};
 return {bundle:{roster,source:'Synthetic-'+revision+'.pdf'},events};
};
const kind=new URLSearchParams(location.search).get('case')||'recent';
let initial=make(0,kind);
const saveChoice=value=>localStorage.setItem(startupKey(),JSON.stringify({owner:startupOwner(),selection:'explicit',roster:value.bundle.roster,sourceFileName:value.bundle.source}));
saveChoice(initial);
const stagedChoice=new URLSearchParams(location.search).get('stage')==='source-before-props'?beginRosterChoice():null;
let stagedModel=null;
window.weatherNavigation=[]; window.addEventListener('crewcheck:set-view',e=>window.weatherNavigation.push(e.detail));
function App(){
 const [model,setModel]=useState(initial); useWeatherLandingMonitor(); useOperationalWeatherPulse(model.bundle,model.events);
 useEffect(()=>{window.weatherFixture={
  state:()=>currentCrewCheckPulseState(),reviews:()=>readAlertReviews(),navigation:()=>({events:window.weatherNavigation,pending:peekPendingNavigationContext()}),
  clock:value=>{window.weatherNow=value;window.dispatchEvent(new Event('focus'));},
  preference:enabled=>storage.set('crewcheck_weather_hourly',enabled?'1':'0'),
  sourceBeforeProps:()=>{stagedModel={...initial,bundle:{...initial.bundle,source:'Different-synthetic-source.pdf'}};saveChoice(stagedModel);stagedChoice.finish();},
  commitSource:()=>setModel(stagedModel),
  source:()=>{window.dispatchEvent(new Event('crewcheck:roster-choice-start'));const next=make(1,kind);saveChoice(next);setModel(next);window.dispatchEvent(new Event('crewcheck:roster-choice-finished'));},
  account:()=>{window.dispatchEvent(new Event('crewcheck:auth-will-change'));localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic-other-weather-owner'}));localStorage.setItem('crewcheck_auth_token','synthetic-other-token');const next=make(2,kind);saveChoice(next);setModel(next);window.dispatchEvent(new Event('crewcheck:auth-changed'));},
  other:()=>{publishCrewCheckPulse({id:'qa-gate',title:'Synthetic gate',category:'gate'});publishCrewCheckPulse({id:'qa-sos',title:'Synthetic SOS',priority:'critica',dismissible:false});}
 }; requestAnimationFrame(()=>requestAnimationFrame(()=>window.weatherReady=true));},[]);
 return <><main {...${JSON.stringify(rootProps)}}><OperationalLayoutSafety/><InternalHeaderFrame><Brand pulse global/></InternalHeaderFrame>
 <section className="cz-toolbox"><h1>Synthetic weather lifecycle</h1><p>Only mocked official observations; no production roster.</p></section></main>
 <BottomNav view="cockpit" setView={view=>window.weatherNavigation.push(view)} openMenu={()=>window.weatherNavigation.push('menu')}/></>;
}
createRoot(document.getElementById('root')).render(<App/>);
`;
fs.writeFileSync(path.join(output, 'prepared-weather-components.tsx'), components);
fs.writeFileSync(path.join(output, 'synthetic-entry.tsx'), entry);
(async () => {
  const bundle = await build({ metafile: true, stdin: { contents: entry, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, platform: 'browser', format: 'esm', jsx: 'automatic',
    nodePaths: (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean),
    tsconfig: 'tsconfig.json', outfile: path.join(output, 'harness.js'), loader: { '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"test"', 'import.meta.env': JSON.stringify({ DEV: false, PROD: true, MODE: 'test', BASE_URL: '/' }) } });
  if (bundleOnly) { console.log('Prepared weather lifecycle bundle compiled; browser NOT run.'); return; }
  const dist = path.resolve('dist'), index = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const styles = [...index.matchAll(/<link\b[^>]*>/gi)].map(match => match[0]).filter(tag => /\brel=["']stylesheet["']/i.test(tag))
    ;
  const publicFontStylesheets = [];
  let localStyles = 0;
  for (const tag of styles) {
    const href = tag.match(/\bhref=["']([^"']+)/)?.[1]?.replaceAll('&amp;', '&'); assert.ok(href);
    if (/^(?:https?:)?\/\//.test(href)) {
      const url = new URL(href);
      assert.equal(url.origin, 'https://fonts.googleapis.com'); assert.equal(url.pathname, '/css2');
      assert.equal(url.searchParams.get('family'), 'Inter:wght@400;500;600;700;800;900');
      assert.equal(url.searchParams.get('display'), 'swap'); assert.deepEqual([...url.searchParams.keys()].sort(), ['display', 'family']);
      publicFontStylesheets.push(url.href);
    } else { assert.ok(href.startsWith('/')); localStyles++; }
  }
  assert.ok(localStyles > 0, 'Require actual Vite-built local stylesheets');
  fs.writeFileSync(path.join(output, 'index.html'), `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">${styles.join('\n')}</head><body><div id="root"></div><script type="module" src="/harness.js"></script></body></html>`);
  fs.cpSync(path.join(dist, 'assets'), path.join(output, 'assets'), { recursive: true });
  if (fs.existsSync(path.join(dist, 'icons'))) fs.cpSync(path.join(dist, 'icons'), path.join(output, 'icons'), { recursive: true });
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url || '/', 'http://localhost').pathname, file = path.resolve(output, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (request.method !== 'GET' || !file.startsWith(output + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const origin = `http://127.0.0.1:${server.address().port}`;
  const engines = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || __filename)('playwright'), results = [];
  const viewports = [{ width: 320, height: 740, theme: 'light', scale: 1, motion: 'no-preference' },
    { width: 390, height: 844, theme: 'dark', scale: 2, motion: 'reduce' }, { width: 1440, height: 1000, theme: 'light', scale: 1, motion: 'no-preference' }];
  let browser;
  try {
    for (const engine of ['chromium', 'webkit']) {
      browser = await engines[engine].launch({ headless: true });
      for (const viewport of viewports) for (const scenario of ['recent', 'future', 'overnight', 'source-race', 'account-race', 'source-before-props']) {
        const name = `${engine}-${viewport.width}-${viewport.theme}-${viewport.scale * 100}-${scenario}`;
        const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, colorScheme: viewport.theme, reducedMotion: viewport.motion, timezoneId: 'America/Sao_Paulo', isMobile: viewport.width <= 430, hasTouch: viewport.width <= 768, serviceWorkers: 'block' });
        const page = await context.newPage(), errors = [], forbidden = [], requests = [], held = [], publicFontRequests = [], declaredFontUrls = new Set(), readingProofs = [];
        let logicalNow = scenario === 'overnight' ? Date.parse('2032-02-03T03:30:00Z') : NOW;
        await page.addInitScript(({ now, theme, scale }) => {
          window.weatherNow = now; const NativeDate = Date;
          class FixtureDate extends NativeDate { constructor(...args) { super(...(args.length ? args : [window.weatherNow])); } static now() { return window.weatherNow; } }
          window.Date = FixtureDate; window.weatherSideEffects = { notifications: 0, permissions: 0, geolocation: 0 };
          class FixtureNotification { static permission = 'denied'; static requestPermission() { window.weatherSideEffects.permissions++; return Promise.resolve('denied'); } constructor() { window.weatherSideEffects.notifications++; } }
          window.Notification = FixtureNotification;
          Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition() { window.weatherSideEffects.geolocation++; } } });
          localStorage.setItem('crewcheck_auth_token', 'synthetic-weather-token'); localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'synthetic-weather-owner' }));
          localStorage.setItem('crewcheck_weather_hourly', '1'); localStorage.setItem('crewcheck_device_notifications', '0');
          // Same existing account preference format as the real runtime, no API grant.
          const digest = value => { const text = JSON.stringify(value); let a = 2166136261, b = 3335557771; for (let i = 0; i < text.length; i++) { a = Math.imul(a ^ text.charCodeAt(i), 16777619); b = Math.imul(b ^ text.charCodeAt(i), 2246822519); } return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0'); };
          localStorage.setItem('crewcheck:notification-preferences:v1:synthetic-weather-owner', JSON.stringify({ ownerId: 'synthetic-weather-owner', revision: 1, preferences: { settings: { crewcheck_pulse_enabled: true } } }));
          window.weatherFixtureOwner = digest(['account', 'synthetic-weather-owner']);
          document.addEventListener('DOMContentLoaded', () => { document.documentElement.dataset.crewTextSize = String(scale * 100); document.documentElement.style.setProperty('--cc-text-scale', String(scale)); document.documentElement.classList.toggle('dark', theme === 'dark'); document.documentElement.dataset.crewTheme = theme; });
        }, { now: logicalNow, theme: viewport.theme, scale: viewport.scale });
        page.on('pageerror', error => errors.push(String(error)));
        const reply = () => {
          const at = logicalNow - 10 * 60_000, date = new Date(at), group = [date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes()].map(value => String(value).padStart(2, '0')).join('');
          return { stations: Object.fromEntries(['SBPS', 'SBBR'].map(icao => [icao, { icao, metar: `METAR ${icao} ${group}Z 02015G30KT 9000 -RA BKN042`, taf: `TAF ${icao} synthetic`,
            provider: { metar: 'aviationweather' }, available: { metar: true }, official: { metar: true }, observationTimeSource: { metar: { field: 'obsTime', value: at / 1000 } }, monitoring: { severity: 2, hazards: [] } }])) };
        };
        await page.route('**/*', async route => {
          const request = route.request(), url = new URL(request.url());
          // Same narrowly allowlisted shipping Inter resources as the existing
          // weather-theme browser gate; never a weather/provider/auth request.
          if (request.method() === 'GET' && publicFontStylesheets.includes(url.href)) {
            publicFontRequests.push(url.href);
            const response = await route.fetch({ maxRedirects: 0 }); assert.equal(response.url(), url.href); assert.ok(response.ok());
            const css = await response.text();
            for (const match of css.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g)) {
              const font = new URL(match[1], url.href); assert.equal(font.origin, 'https://fonts.gstatic.com');
              assert.ok(!font.username && !font.password && !font.hash);
              assert.ok(/^\/s\/inter\/v\d+\/[A-Za-z0-9_-]+\.woff2$/.test(font.pathname) || font.pathname === '/l/font');
              declaredFontUrls.add(font.href);
            }
            assert.ok(declaredFontUrls.size); await route.fulfill({ response, body: css }); return;
          }
          if (request.method() === 'GET' && declaredFontUrls.has(url.href)) { publicFontRequests.push(url.href); await route.continue(); return; }
          if (url.origin === origin && url.pathname === '/api/aviation-weather') {
            assert.equal(request.method(), 'GET'); const airports = url.searchParams.get('airports').split(',');
            assert.ok(airports.length <= 2 && new Set(airports).size === airports.length); assert.ok(!airports.includes('SBKP'), 'Tomorrow station is not eligible');
            requests.push({ airports, at: logicalNow });
            if (scenario.endsWith('-race')) { held.push(route); return; }
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reply()) }); return;
          }
          if (url.origin === origin && request.method() === 'GET' && !url.pathname.startsWith('/api/')) { await route.continue(); return; }
          forbidden.push({ method: request.method(), origin: url.origin, path: url.pathname }); await route.abort();
        });
        try {
          const kind = ['future', 'overnight'].includes(scenario) ? scenario : 'recent';
          await page.goto(`${origin}/?case=${kind}&stage=${scenario}`, { waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.weatherReady === true);
          const loadedFonts = await page.evaluate(async () => { await document.fonts.load('400 16px Inter'); await document.fonts.ready; return [...document.fonts].filter(face => face.family.replace(/["']/g, '') === 'Inter' && face.status === 'loaded').length; });
          if (publicFontStylesheets.length) assert.ok(loadedFonts > 0, 'Shipping Inter must load, not fallback geometry');
          if (scenario === 'future') {
            assert.equal(requests.length, 0); assert.equal(await page.evaluate(() => window.weatherFixture.state().message), null);
          } else if (scenario === 'source-before-props') {
            assert.equal(requests.length, 0);
            await page.evaluate(() => window.weatherFixture.sourceBeforeProps());
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            assert.equal(requests.length, 0, 'New selection must not spend quota using old committed source');
            assert.equal(await page.evaluate(() => window.weatherFixture.state().message), null);
            await page.evaluate(() => window.weatherFixture.commitSource());
            await page.waitForFunction(() => window.weatherFixture.state().message?.category === 'weather');
            assert.equal(requests.length, 1); assert.deepEqual(requests[0].airports, ['SBPS']);
            await page.locator('.cc-pulse-compact-details-trigger').waitFor({ state: 'visible' });
            const proof = await readingScaleProof(page, 'source-props-committed'); readingProofs.push(proof); assertReadingScale(proof, viewport.scale, true);
          } else if (scenario.endsWith('-race')) {
            await page.waitForFunction(() => window.weatherFixture !== undefined);
            for (let i = 0; i < 100 && held.length === 0; i++) await page.waitForTimeout(10);
            assert.equal(held.length, 1);
            await page.evaluate(kind => window.weatherFixture[kind](), scenario === 'source-race' ? 'source' : 'account');
            for (const route of held) { try { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reply()) }); } catch { /* Browser may already acknowledge abort. */ } }
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            assert.equal(await page.evaluate(() => window.weatherFixture.state().message), null); assert.equal(requests.length, 1);
          } else {
            await page.waitForFunction(() => window.weatherFixture.state().message?.category === 'weather');
            assert.equal(requests.length, 1); assert.deepEqual(requests[0].airports, ['SBPS']);
            const trigger = page.locator('.cc-pulse-compact-details-trigger'); await trigger.focus(); await page.keyboard.press('Enter');
            await page.locator('.cc-pulse-popover').waitFor({ state: 'visible' });
            await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); await Promise.all(document.getAnimations().filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime) && animation.playState !== 'finished').map(animation => animation.finished.catch(() => {}))); });
            const proof = await readingScaleProof(page, 'details-open'); readingProofs.push(proof); assertReadingScale(proof, viewport.scale, true, true);
            const message = await page.evaluate(() => window.weatherFixture.state().message);
            assert.equal(message.action.context.programId, 'qa-today'); assert.equal(message.action.context.airportCode, 'BPS');
            assert.match(message.detail, /rajadas 30 kt/);
            const geometry = await page.locator('.cc-pulse-popover').evaluate(element => { const r = element.getBoundingClientRect(); const footer = document.querySelector('body > nav.cz-bottom-nav').getBoundingClientRect(); return { x: r.x, right: r.right, bottom: r.bottom, footerTop: footer.top, viewport: innerWidth }; });
            assert.ok(geometry.x >= -1 && geometry.right <= geometry.viewport + 1 && geometry.bottom <= geometry.footerTop + 1, 'Weather details remain readable above footer');
            await page.screenshot({ path: path.join(output, `${name}-details.png`), fullPage: true });
            await page.locator('.cc-pulse-action').click();
            const nav = await page.evaluate(() => window.weatherFixture.navigation()); assert.equal(nav.pending.programId, 'qa-today'); assert.equal(nav.pending.airportCode, 'BPS'); assert.equal(nav.pending.targetView, 'weather');
            if (scenario === 'recent') {
              logicalNow = NOW + 40 * 60_000; await page.evaluate(value => window.weatherFixture.clock(value), logicalNow);
              assert.ok(await page.evaluate(() => window.weatherFixture.state().message));
              logicalNow++; await page.evaluate(value => window.weatherFixture.clock(value), logicalNow);
              await page.waitForFunction(() => window.weatherFixture.state().message === null); assert.equal(requests.length, 1);
              assert.equal(await page.evaluate(() => window.weatherFixture.reviews().length), 0, 'Expiry is not dismissal');
            } else {
              await page.evaluate(() => window.weatherFixture.preference(false)); await page.waitForFunction(() => window.weatherFixture.state().message === null);
              await page.evaluate(() => window.weatherFixture.preference(true)); assert.equal(requests.length, 1, 'Toggle cannot reset quota');
            }
          }
          const menu = page.locator('body > nav.cz-bottom-nav button[data-crewcheck-menu-trigger="true"]'); await menu.focus(); await page.keyboard.press('Enter');
          assert.ok((await page.evaluate(() => window.weatherNavigation)).includes('menu'));
          assert.deepEqual(await page.evaluate(() => window.weatherSideEffects), { notifications: 0, permissions: 0, geolocation: 0 });
          assert.deepEqual(forbidden, []); assert.deepEqual(errors, []);
          await page.screenshot({ path: path.join(output, `${name}-final.png`), fullPage: true });
          const reducedMotion = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
          assert.equal(reducedMotion, viewport.motion === 'reduce');
          const proof = await readingScaleProof(page, 'final'); readingProofs.push(proof); assertReadingScale(proof, viewport.scale);
          results.push({ name, requests, reducedMotion, publicFontRequests, loadedFonts, readingProofs, passed: true }); console.log('PASS', name);
        } catch (error) {
          fs.writeFileSync(path.join(output, `${name}-failure.json`), JSON.stringify({ error: String(error), requests, forbidden, errors, readingProofs, state: await page.evaluate(() => window.weatherFixture?.state()).catch(() => null) }, null, 2));
          await page.screenshot({ path: path.join(output, `${name}-failure.png`), fullPage: true }); throw error;
        } finally { await context.close(); }
      }
      await browser.close(); browser = null;
    }
  } finally {
    if (browser) await browser.close(); await new Promise(resolve => server.close(resolve));
    const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    let commit = null; try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch {}
    const sources = Object.fromEntries(Object.keys(bundle.metafile.inputs).filter(file => !file.includes('node_modules') && !file.startsWith('..') && fs.existsSync(file)).map(file => [file, sha(file)]));
    fs.writeFileSync(path.join(output, 'artifact.json'), JSON.stringify({ commit, syntheticOnly: true, sourceSha256: sources, preparedHomeSha256: sha('client/src/pages/Home.tsx'), harnessSha256: sha(__filename), results }, null, 2));
  }
  assert.equal(results.length, 36); console.log('All 36 actual weather lifecycle browser cases passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
