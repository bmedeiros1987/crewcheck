import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { build } from 'esbuild';

// Actual prepared HotelsView, Brand and BottomNav, with the exact Vite CSS.
// Only the event/account/API data and navigation event recorder are synthetic.
// This is browser component acceptance, not native Android/device acceptance.
const output = path.resolve('artifacts/hotel-controls');
fs.mkdirSync(output, { recursive: true });
const homePath = path.resolve('client/src/pages/Home.tsx');
const home = fs.readFileSync(homePath, 'utf8');
assert.ok(home.includes('className="cz-stay-context"') && home.includes('cc-hotel-catalog-disclosure'), 'Run after canonical preparation');
const ast = ts.createSourceFile('Home.tsx', home, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const rootProps = { className: 'cz-app', 'data-view': 'hotels', 'data-menu-open': 'false' };
let rootTag;
function collect(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'DEFAULT_VERSION' && ts.isStringLiteral(node.initializer)) rootProps['data-version'] = node.initializer.text;
  if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.attributes.properties.some(a => ts.isJsxAttribute(a) && a.name.text === 'data-ipad-layout-v14394')) {
    rootTag = node.tagName.getText(ast);
    for (const attr of node.attributes.properties) if (ts.isJsxAttribute(attr) && attr.name.text.startsWith('data-') && attr.initializer && ts.isStringLiteral(attr.initializer)) rootProps[attr.name.text] = attr.initializer.text;
  }
  ts.forEachChild(node, collect);
}
collect(ast);
assert.equal(rootTag, 'main');
assert.ok(rootProps['data-version']);
const functionNames = ['HotelsView', 'Brand', 'CrewCheckMark', 'BottomNav', 'pad2', 'safe', 'city', 'dateChip', 'rosterDayIso', 'hotelSearchLocation', 'openNearbyPlaces', 'searchCrewHotels', 'normalizedSearch', 'explicitStayReportLocation'];
const declarations = ast.statements.filter(n => (ts.isFunctionDeclaration(n) && functionNames.includes(n.name?.text))
  || (ts.isVariableStatement(n) && n.declarationList.declarations.some(d => d.name.getText(ast) === 'storage')));
assert.equal(declarations.length, functionNames.length + 1, 'Use exact prepared components and their real local helpers');
fs.writeFileSync(path.join(output, 'prepared-components.tsx'), declarations.map(n => n.getText(ast)).join('\n'));
const cssPath = 'client/src/components/v1391/menu-personalization.css';
fs.copyFileSync(cssPath, path.join(output, 'source.css'));
const index = fs.readFileSync('dist/index.html', 'utf8');
const links = [...index.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/g)].map(m => m[0]).join('\n');
assert.ok(links, 'Use actual prepared production CSS, not a mock stylesheet');
const entry = `
import React, {useState,useEffect,useMemo} from 'react';
import {createPortal} from 'react-dom';
import {Search,Hotel,LocateFixed,Plus,Check,MapPin,X,Save,ChevronRight,UserRound,Dumbbell,WashingMachine,Pill,Bell,Send,Menu,Home as HomeIcon,CalendarDays,Navigation} from 'lucide-react';
import {toast} from 'sonner';
import {airportCity} from '@/lib/airports';
import {orderStayDisplay} from '@/lib/stayDisplayOrder';
import {listPlatformStays,updatePlatformStay,findHotelCompanions} from '@/lib/platformClient';
import {CREW_HOTEL_CATALOG} from '@/data/crewHotels';
import {saveNearbyPlacesOrigin} from '@/lib/nearbyPlacesOrigin';
import {setPendingNavigationContext} from '@/lib/navigationContext';
import CrewCheckPulse from '@/components/pulse/CrewCheckPulse';
import {InternalHeaderFrame} from '@/components/navigation/InternalHeaderFrame';
import {OperationalLayoutSafety} from '@/components/navigation/OperationalLayoutSafety';
import {createRoot} from 'react-dom/client';
import {setCrewCheckThemePreference} from '@/lib/themeRuntime';
${declarations.map(n => n.getText(ast)).join('\n')}
const now=Date.now();
const event=(id,hours,airport,hotel,presentation)=>{const start=new Date(now+hours*3600000),end=new Date(start.getTime()+12*3600000);return {id,kind:'stay',date:start,origin:airport,destination:airport,hotel,presentation,day:{date:start.toISOString().slice(0,10)},canonical:{startDateTime:start.toISOString(),endDateTime:end.toISOString()}}};
const events=[event('next',24,'BSB','Hotel sintético em Brasília','14:00'),event('manual',96,'JDO','','00:40'),event('long',160,'GRU','Hotel com nome longo para verificar o limite do seletor em uma tela estreita','09:00')];
window.hotelNavigation=[];
window.addEventListener('crewcheck:set-view',e=>window.hotelNavigation.push(e.detail));
window.applyHotelTheme=setCrewCheckThemePreference;
function App(){return <><main {...${JSON.stringify(rootProps)}}><OperationalLayoutSafety/><InternalHeaderFrame><Brand back/></InternalHeaderFrame><HotelsView events={events}/></main><BottomNav view="hotels" setView={view=>window.hotelNavigation.push(view)} openMenu={()=>window.hotelNavigation.push('menu')}/></>}
createRoot(document.getElementById('root')).render(<App/>);
`;
await build({ stdin: { contents: entry, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, platform: 'browser', format: 'esm', jsx: 'automatic', tsconfig: 'tsconfig.json', outfile: path.join(output, 'harness.js'), loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"test"', 'import.meta.env': JSON.stringify({ DEV: false, PROD: true, MODE: 'test', BASE_URL: '/' }) } });
fs.writeFileSync(path.join(output, 'index.html'), `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">${links}</head><body><div id="root"></div><script type="module" src="/harness.js"></script></body></html>`);
fs.cpSync('dist/assets', path.join(output, 'assets'), { recursive: true });
if (fs.existsSync('dist/icons')) fs.cpSync('dist/icons', path.join(output, 'icons'), { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url || '/', 'http://localhost').pathname;
  const file = path.resolve(output, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(output + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
const require = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || import.meta.url);
const engines = require('playwright');
const results = [];
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
async function settle(page) { await page.evaluate(async () => { await document.fonts.ready; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }); }
async function inspect(page, name) {
  const select = page.getByLabel('Pernoite que deseja atualizar', { exact: true });
  await select.selectOption('manual');
  await select.evaluate(el => el.scrollIntoView({ block: 'center' }));
  await select.focus();
  await settle(page);
  const metrics = await page.locator('.cz-stay-context').evaluate(panel => {
    const select = panel.querySelector('select'), button = panel.querySelector(':scope > button');
    const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const s = rect(select), b = rect(button), p = rect(panel);
    const focus = getComputedStyle(select);
    return { select: s, button: b, panel: p, gap: b.y - s.bottom, focusWidth: parseFloat(focus.outlineWidth) || 0, focusOffset: parseFloat(focus.outlineOffset) || 0, textFits: button.scrollWidth <= button.clientWidth + 1 && button.scrollHeight <= button.clientHeight + 1, pageOverflow: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  fs.writeFileSync(path.join(output, `${name}-metrics.json`), JSON.stringify(metrics, null, 2));
  await page.screenshot({ path: path.join(output, `${name}-selector-focused.png`), animations: 'disabled' });
  assert.ok(metrics.gap >= 12 - .5, `${name}: selector/reset need separate rows and 12px clearance, got ${metrics.gap}`);
  assert.ok(metrics.gap > metrics.focusWidth + metrics.focusOffset, `${name}: focus ring intersects reset`);
  assert.ok(metrics.select.height >= 44 && metrics.button.height >= 44, `${name}: 44px touch targets`);
  assert.ok(metrics.button.x >= metrics.panel.x && metrics.button.right <= metrics.panel.right, `${name}: reset stays inside panel`);
  assert.ok(metrics.textFits && !metrics.pageOverflow, `${name}: no clipped text or horizontal overflow`);
  await select.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Voltar à sugestão da escala', 'Keyboard reaches reset after selector');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Voltar à sugestão da escala', exact: true }).waitFor({ state: 'detached' });
  assert.equal(await select.inputValue(), 'next', 'Reset restores canonical recommendation');
  await select.selectOption('long');
  await settle(page);
  assert.equal(await select.inputValue(), 'long', 'Long option remains selectable');
  const longOption = await page.locator('.cz-stay-context').evaluate(panel => {
    const select = panel.querySelector('select'), button = panel.querySelector(':scope > button');
    const p = panel.getBoundingClientRect(), s = select.getBoundingClientRect(), b = button.getBoundingClientRect();
    return { contained: s.left >= p.left && s.right <= p.right && b.left >= p.left && b.right <= p.right,
      gap: b.top - s.bottom, pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      resetTextFits: button.scrollWidth <= button.clientWidth + 1 && button.scrollHeight <= button.clientHeight + 1 };
  });
  assert.ok(longOption.contained && longOption.resetTextFits && !longOption.pageOverflow && longOption.gap >= 11.5, `${name}: long option does not push controls outside the panel`);
  await page.getByRole('button', { name: 'Voltar à sugestão da escala', exact: true }).click();
  for (let i = 0; i < 2; i++) {
    const disclosure = page.locator('.cc-hotel-catalog-disclosure > summary');
    await disclosure.click();
    await page.getByRole('button', { name: 'Informar manualmente', exact: true }).click();
    await page.getByRole('textbox', { name: 'Nome do hotel', exact: true }).fill('Hotel sintético de teste');
    await page.getByRole('button', { name: i ? 'Fechar cadastro' : 'Cancelar', exact: true }).click();
    await page.locator('.cz-manual-hotel-form').waitFor({ state: 'detached' });
    await disclosure.click();
  }
  await page.locator('.cc-stay-more > summary').last().click();
  await page.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight));
  await settle(page);
  const lastAction = page.locator('.cz-hotel-stay-card').last().getByRole('button', { name: 'Farmácias', exact: true });
  const end = await lastAction.boundingBox();
  const nav = await page.locator('body > nav.cz-bottom-nav').boundingBox();
  assert.ok(end && nav && end.y + end.height <= nav.y - 4, `${name}: last action can scroll clear of fixed navigation`);
  await page.screenshot({ path: path.join(output, `${name}-scrolled.png`), animations: 'disabled' });
  await page.locator('.cc-stay-more > summary').last().click();
  await page.getByRole('button', { name: 'Voltar ao FlightDeck', exact: true }).click();
  assert.equal(await page.evaluate(() => window.hotelNavigation.at(-1)), 'cockpit', 'Actual Brand retains Back event');
  results.push({ name, metrics, longOption, checks: ['spacing', 'focus clearance', 'keyboard reset', 'long option', 'repeated manual edit/cancel/close', 'footer scroll clearance', 'Brand Back event'] });
}
try {
  for (const engine of ['chromium', 'webkit']) {
    const browser = await engines[engine].launch({ headless: true });
    try {
      for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
        const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, reducedMotion: 'reduce', serviceWorkers: 'block' });
        const errors = [], writes = [];
        await context.addInitScript(() => { localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'hotel-layout-test', email: 'synthetic@example.invalid', role: 'user' })); localStorage.setItem('crewcheck_auth_token', 'synthetic'); });
        await context.route('**/*', route => {
          const u = new URL(route.request().url());
          if (u.origin !== origin) return route.abort();
          if (!u.pathname.startsWith('/api/')) return route.continue();
          if (route.request().method() !== 'GET') writes.push({ path: u.pathname, method: route.request().method() });
          return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, stays: [], items: [], data: [] }) });
        });
        const page = await context.newPage();
        page.on('pageerror', error => { errors.push(error.message); console.error('Browser exception:', error.message); });
        await page.goto(origin);
        await page.getByRole('heading', { name: 'Hotéis e pernoites', exact: true }).waitFor({ timeout: 15000 }).catch(async error => { await page.screenshot({ path: path.join(output, `${engine}-startup-error.png`) }); throw error; });
        for (const theme of ['light', 'dark']) {
          await page.evaluate(theme => window.applyHotelTheme(theme), theme);
          await inspect(page, `${engine}-${viewport.width}x${viewport.height}-${theme}`);
        }
        if (viewport.width === 390) {
          await page.setViewportSize({ width: 844, height: 390 });
          await inspect(page, `${engine}-rotate-landscape`);
          await page.setViewportSize({ width: 390, height: 844 });
          const disclosure = page.locator('.cc-hotel-catalog-disclosure > summary');
          await disclosure.click();
          await page.getByRole('button', { name: 'Informar manualmente', exact: true }).click();
          const input = page.getByRole('textbox', { name: 'Nome do hotel', exact: true });
          await input.focus();
          await page.setViewportSize({ width: 390, height: 420 });
          await input.fill('Teclado simulado pela redução do viewport');
          await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
          await page.setViewportSize({ width: 390, height: 844 });
          await disclosure.click();
          await inspect(page, `${engine}-keyboard-resize-restored`);
        }
        assert.deepEqual(errors, [], 'Actual component renders without browser exceptions');
        assert.deepEqual(writes, [], 'No mutation/API save/notification from test interactions');
        await context.close();
      }
    } finally { await browser.close(); }
  }
} finally {
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), scope: 'Actual prepared HotelsView/Brand/BottomNav and full Vite CSS, synthetic event/API/account data. Rotation and keyboard-height simulation; physical Android overlays and nonzero safe-area emulation are not claimed.', results }, null, 2));
  await new Promise(resolve => server.close(resolve));
}
assert.equal(results.length, 16, 'Complete Chromium/WebKit viewport/theme/rotation/keyboard matrix');
console.log('PASS: all 16 prepared hotel control layout and interaction cases');
