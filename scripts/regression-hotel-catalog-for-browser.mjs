import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { build } from 'esbuild';

// Actual prepared HotelsView, Brand and BottomNav, with the exact Vite CSS.
// Empty roster and synthetic account/API data; no private schedules or real saves.
// This is browser component acceptance, not native Android/device acceptance.
const output = path.resolve('artifacts/hotel-catalog-for');
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
import PresentationStayManagerView from '@/components/v1391/PresentationStayManagerView';
import {isFinancialSetting,readFinancialSetting,writeFinancialSetting} from '@/lib/financialSettingStore';
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
window.hotelNavigation=[];
window.addEventListener('crewcheck:set-view',e=>window.hotelNavigation.push(e.detail));
window.applyHotelTheme=setCrewCheckThemePreference;
function App(){return <><main {...${JSON.stringify(rootProps)}}><OperationalLayoutSafety/><InternalHeaderFrame><Brand back/></InternalHeaderFrame>{location.pathname === '/presentation' ? <PresentationStayManagerView events={[]}/> : <HotelsView events={[]}/>}</main><BottomNav view="hotels" setView={view=>window.hotelNavigation.push(view)} openMenu={()=>window.hotelNavigation.push('menu')}/></>}
createRoot(document.getElementById('root')).render(<App/>);
`;
await build({ stdin: { contents: entry, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, platform: 'browser', format: 'esm', jsx: 'automatic', tsconfig: 'tsconfig.json', outfile: path.join(output, 'harness.js'), loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"test"', 'import.meta.env': JSON.stringify({ DEV: false, PROD: true, MODE: 'test', BASE_URL: '/' }) } });
fs.writeFileSync(path.join(output, 'index.html'), `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">${links}</head><body><div id="root"></div><script type="module" src="/harness.js"></script></body></html>`);
fs.cpSync('dist/assets', path.join(output, 'assets'), { recursive: true });
if (fs.existsSync('dist/icons')) fs.cpSync('dist/icons', path.join(output, 'icons'), { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url || '/', 'http://localhost').pathname;
  const file = path.resolve(output, '.' + (['/', '/presentation'].includes(pathname) ? '/index.html' : pathname));
  if (!file.startsWith(output + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
const require = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || import.meta.url);
const engines = require('playwright');
const results = [];
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await engines.chromium.launch({ headless: true, ...(process.env.CATALOG_CHROMIUM_PATH ? { executablePath: process.env.CATALOG_CHROMIUM_PATH } : {}) });
const name = 'Ibis Styles Fortaleza Giga Mall';
try {
  for (const width of [390, 1280]) {
    for (const view of ['hotels', 'presentation']) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
      const errors = [], writes = [];
      await context.addInitScript(() => {
        localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'catalog-test', email: 'synthetic@example.invalid', role: 'user' }));
        localStorage.setItem('crewcheck_auth_token', 'synthetic');
      });
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        if (route.request().method() !== 'GET') writes.push(route.request().method());
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, stays: [], items: [], address: null }) });
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin + (view === 'presentation' ? '/presentation' : '/'));
      if (view === 'hotels') await page.locator('.cc-hotel-catalog-disclosure > summary').click();
      else await page.getByRole('textbox', { name: 'Aeroporto/local', exact: true }).fill('ZZZ');
      const input = view === 'hotels'
        ? page.getByPlaceholder('Hotel, cidade ou aeroporto')
        : page.getByPlaceholder('Prioridade: ZZZ');
      for (const query of ['Giga', name, 'FOR']) {
        await input.fill(query);
        const choices = page.locator(view === 'hotels' ? '.cz-hotel-catalog-results' : '.cc139-choices');
        const row = (view === 'hotels' ? choices.locator('article') : choices.getByRole('button')).filter({ hasText: name });
        const button = view === 'hotels' ? row.getByRole('button', { name: 'Usar neste pernoite' }) : row;
        await button.waitFor();
        assert.equal(await button.count(), 1, `${view}/${width}/${query}: unique Giga result`);
        if (query === 'FOR') {
          assert.equal(await (view === 'hotels' ? choices.locator('article') : choices.getByRole('button')).filter({ hasText: 'Ibis Fortaleza Centro de Eventos' }).count(), 1, 'Existing FOR unit remains visible');
        }
        await button.scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(output, `${view}-${width}-${query === name ? 'name' : query}.png`), animations: 'disabled' });
      }
      const selected = page.locator(view === 'hotels' ? '.cz-hotel-catalog-results article' : '.cc139-choices button').filter({ hasText: name });
      await (view === 'hotels' ? selected.getByRole('button', { name: 'Usar neste pernoite' }) : selected).click();
      if (view === 'presentation') {
        assert.equal(await page.getByRole('textbox', { name: 'Hotel', exact: true }).inputValue(), name);
        assert.equal(await page.getByRole('textbox', { name: 'Aeroporto/local', exact: true }).inputValue(), 'FOR');
      } else {
        assert.equal(await page.getByRole('textbox', { name: 'Nome do hotel', exact: true }).inputValue(), name);
      }
      await page.screenshot({ path: path.join(output, `${view}-${width}-selected.png`), animations: 'disabled' });
      assert.deepEqual(errors, [], 'No browser exceptions');
      assert.deepEqual(writes, [], 'Selection does not save or notify');
      results.push({ view, width, queries: ['Giga', name, 'FOR'], unique: true, existingUnitPreserved: true, selection: true, errors, writes });
      await context.close();
    }
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), scope: 'Actual prepared Home HotelsView and PresentationStayManagerView, production CSS; synthetic account/API, empty roster; Chromium mobile/desktop component QA.', results }, null, 2));
}
assert.equal(results.length, 4);
console.log('PASS: both actual hotel catalog screens, mobile/desktop, Giga/name/FOR, existing unit and selection without writes');
