import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import ts from 'typescript';

// Real prepared MenuDrawer + shipped CSS, rendered client-side so clicks, state and
// per-account localStorage are exercised. Synthetic accounts; not full-app acceptance.
const output = path.resolve(process.env.MENU_EVIDENCE_DIR || 'artifacts/menu-interaction');
fs.mkdirSync(output, { recursive: true });
const dist = path.resolve('dist');
const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const source = ts.createSourceFile('Home.tsx', home, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['CrewCheckMark', 'MenuDrawer'];
const declarations = source.statements.filter((n) =>
  (ts.isFunctionDeclaration(n) && names.includes(n.name?.text))
  || (ts.isVariableStatement(n) && n.declarationList.declarations.some((entry) => entry.name.getText(source) === 'MENU_5S_ALLOWED_IDS')));
assert.equal(declarations.length, 3, 'prepared MenuDrawer, brand and allowlist must exist');
const menuCode = ts.transpileModule(declarations.map((n) => n.getText(source)).join('\n') + '\nreturn MenuDrawer;', {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React, allowJs: true },
  reportDiagnostics: false,
}).outputText.replace(/^export /gm, '');

let rootTag;
const rootProps = { className: 'cz-app', 'data-view': 'roster', 'data-menu-open': 'true' };
function collectRoot(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'DEFAULT_VERSION'
      && node.initializer && ts.isStringLiteral(node.initializer)) {
    rootProps['data-version'] = node.initializer.text;
  }
  if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
      && node.attributes.properties.some(a => ts.isJsxAttribute(a) && a.name.text === 'data-ipad-layout-v14394')) {
    rootTag = node.tagName.getText(source);
    for (const attr of node.attributes.properties) {
      if (!ts.isJsxAttribute(attr) || !attr.name.text.startsWith('data-')) continue;
      if (attr.initializer && ts.isStringLiteral(attr.initializer)) rootProps[attr.name.text] = attr.initializer.text;
    }
  }
  ts.forEachChild(node, collectRoot);
}
collectRoot(source);
assert.equal(rootTag, 'main', 'Use the actual canonical root tag');
assert.ok(rootProps['data-version'], 'Use actual prepared version, not a mock selector value');
assert.equal(rootProps['data-ipad-layout-v14394'], 'contained');

const themeSource = fs.readFileSync('client/src/lib/themeRuntime.ts', 'utf8');
const moduleOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 };
fs.writeFileSync(path.join(output, 'theme-runtime.js'), ts.transpileModule(themeSource, { compilerOptions: moduleOptions }).outputText);
// Preparation rewrites themeRuntime; the effective data-crew-theme is applied by
// App's effect. Include those exact prepared functions, not fabricated attributes.
const appText = fs.readFileSync('client/src/App.tsx', 'utf8');
const appSource = ts.createSourceFile('App.tsx', appText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const themeNames = ['getEffectiveCrewTheme', 'applyCrewThemeMode'];
const appTheme = appSource.statements.filter(n => ts.isFunctionDeclaration(n) && themeNames.includes(n.name?.text));
assert.equal(appTheme.length, 2, 'Locate actual effective-theme functions in the prepared App');
fs.writeFileSync(path.join(output, 'app-theme.js'), ts.transpileModule(
  appTheme.map(n => n.getText(appSource)).join('\n') + '\nexport { applyCrewThemeMode };',
  { compilerOptions: moduleOptions },
).outputText);

const entry = `
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import * as icons from 'lucide-react';
import { applyCrewCheckTheme } from '${path.join(output, 'theme-runtime.js')}';
import { applyCrewThemeMode } from '${path.join(output, 'app-theme.js')}';
window.applyMenuTestTheme = mode => { applyCrewCheckTheme(mode); applyCrewThemeMode(mode); };
import * as menuPreference from '${path.resolve('client/src/lib/menuPreference.ts').replace(/\\/g, '/')}';
const code = ${JSON.stringify(menuCode)};
window.__account = 'account-a';
window.__nav = [];
const scope = {
  React, ...React, ...icons, ...menuPreference, HomeIcon: icons.Home, MapIcon: icons.Map,
  storage: { get: (_k, f) => f, set: () => {} },
  getStoredUser: () => window.__account ? { id: window.__account, name: 'Tripulante ' + window.__account, email: 'demo@example.invalid' } : null,
  isAdmin: () => true,
};
const keys = Object.keys(scope).filter((k) => k !== 'default' && /^[A-Za-z_$][\\w$]*$/.test(k));
const MenuDrawer = new Function(...keys, code)(...keys.map((k) => scope[k]));
function Harness() {
  const [account, setAccount] = React.useState('account-a');
  const [view, setView] = React.useState('roster');
  const [open, setOpen] = React.useState(false);
  window.__setAccount = (id) => { window.__account = id; setAccount(id); };
  return React.createElement('${rootTag}', { ...${JSON.stringify(rootProps)}, 'data-view': view, 'data-menu-open': String(open), 'data-account': account },
    React.createElement('button', { className: 'menu-trigger', onClick: () => setOpen(true) }, 'Abrir menu'),
    React.createElement(MenuDrawer, { open, close: () => { window.__nav.push('close'); setOpen(false); }, view, setView: (v) => { window.__nav.push(v); setView(v); }, actions: { logout: () => {} } }));
}
createRoot(document.getElementById('root')).render(React.createElement(Harness));
`;
await build({ stdin: { contents: entry, resolveDir: path.resolve('.'), loader: 'jsx' }, bundle: true, format: 'iife', outfile: path.join(output, 'menu-app.js'), define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'error' });
const index = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const links = [...index.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/g)].map((m) => m[0]).join('\n');
fs.writeFileSync(path.join(output, 'menu.html'), `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">${links}</head><body><div id="root"></div><script src="./menu-app.js"></script></body></html>`);
fs.cpSync(path.join(dist, 'assets'), path.join(output, 'assets'), { recursive: true });
fs.cpSync(path.join(dist, 'icons'), path.join(output, 'icons'), { recursive: true });
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
  const file = path.resolve(output, '.' + (pathname === '/' ? '/menu.html' : pathname));
  if (!file.startsWith(output + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const require = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch({ headless: true });

const matrix = [
  { name: 'phone-small', width: 320, height: 740, touch: true },
  { name: 'phone-portrait', width: 360, height: 800, touch: true },
  { name: 'phone-landscape', width: 844, height: 390, touch: true },
  { name: 'desktop', width: 1440, height: 900, touch: false },
];
const themedMatrix = matrix.flatMap(device => ['dark', 'light'].map(theme => ({ ...device, name: device.name + '-' + theme, theme })));
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
try {
  for (const device of themedMatrix) {
    const context = await browser.newContext({ viewport: { width: device.width, height: device.height }, hasTouch: device.touch, isMobile: device.touch, reducedMotion: 'reduce' });
    await context.route('**/*', (route) => route.request().url().startsWith(url) ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', response => { if (response.status() >= 400) errors.push('HTTP ' + response.status() + ' ' + new URL(response.url()).pathname); });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => typeof window.applyMenuTestTheme === 'function');
    await page.evaluate(theme => window.applyMenuTestTheme(theme), device.theme);
    const reopen = async () => {
      await page.click('.menu-trigger');
      await page.waitForSelector('.cc-menu-edit-favorites');
      await page.waitForFunction(() => document.activeElement?.classList.contains('cz-menu-close'));
    };
    await reopen();
    const label = (suffix) => `${device.name}: ${suffix}`;
    const chips = () => page.locator('.cc-menu-favorite-chip[data-menu-label]').allTextContents();
    const rows = () => page.locator('.cc-menu-destination[data-menu-label]').evaluateAll((els) => els.map((e) => e.dataset.menuLabel));
    const stars = () => page.locator('.cc-menu-favorite').count();
    const snap = (name) => page.screenshot({ path: path.join(output, `${device.name}-${name}.png`), animations: 'disabled' });
    const readableFavorites = async () => {
      const clipped = await page.locator('.cc-menu-favorite-chip span').evaluateAll(els => els.filter(el => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1).map(el => el.textContent));
      check(clipped.length === 0, label('favorite labels clipped: ' + clipped.join(', ')));
      const undersized = await page.locator('.cc-menu-favorite').evaluateAll(els => els.some(el => { const r=el.getBoundingClientRect(); return r.width < 44 || r.height < 44; }));
      check(!undersized, label('favorite controls smaller than 44px'));
      const overflow = await page.locator('.cz-menu-scroll').evaluate(el => el.scrollWidth - el.clientWidth);
      check(overflow <= 1, label('horizontal overflow during interaction'));
    };
    const stored = (account) => page.evaluate((a) => JSON.parse(localStorage.getItem('crewcheck:menu-favorites:v1:' + a) || 'null'), account);

    // default: 3 favorites on top, 37 in the catalog, no stars, each destination once
    const initialChips = await chips(); const initialRows = await rows();
    check(initialChips.length === 3, label(`3 default favorites, got ${initialChips.length}`));
    check(initialRows.length === 37, label(`37 catalog rows, got ${initialRows.length}`));
    check(new Set([...initialChips, ...initialRows]).size === 40, label('every destination exactly once'));
    check(!initialRows.some((r) => initialChips.includes(r)), label('catalog repeats a favorite'));
    check(await stars() === 0, label('stars visible outside edit mode'));
    await readableFavorites();
    check(await page.locator('.cz-menu-brandmark img').evaluateAll(els => els.every(el => el.complete && el.naturalWidth > 0)), label('brand image loaded'));
    await snap('1-default');

    // edit mode: stars appear on all 40, hidden again on exit
    await page.click('.cc-menu-edit-favorites');
    check(await stars() === 40, label(`edit mode shows 40 controls, got ${await stars()}`));
    await readableFavorites();
    await snap('2-edit-mode');
    // add: starts with 3, add 2 -> 5
    const target1 = initialRows[0]; const target2 = initialRows[1]; const target3 = initialRows[2];
    await page.click(`[aria-label="Adicionar ${target1} aos favoritos"]`);
    await page.click(`[aria-label="Adicionar ${target2} aos favoritos"]`);
    check((await chips()).length === 5, label('adding up to 5'));
    check(!(await rows()).includes(target1), label('added favorite leaves catalog'));
    // limit
    await page.click(`[aria-label="Adicionar ${target3} aos favoritos"]`);
    check((await chips()).length === 5, label('sixth favorite must be refused'));
    check((await page.locator('.cc-menu-status').textContent()).includes('até 5'), label('limit message'));
    check((await stored('account-a')).length === 5, label('limit persisted as 5'));
    await readableFavorites();
    await snap('3-limit');
    // remove
    await page.click(`[aria-label="Remover ${target1} dos favoritos"]`);
    check((await chips()).length === 4 && (await rows()).includes(target1), label('removed favorite returns to catalog'));
    // exit edit mode
    await page.click('.cc-menu-edit-favorites');
    check(await stars() === 0, label('stars hidden after Concluir'));

    // search finds everything once, including favorites
    const favName = (await chips())[0];
    await page.fill('.cc-menu-search input', 'a');
    const searchRows = await rows();
    check((await page.locator('.cc-menu-favorite-chip').count()) === 0, label('favorites block hidden while searching'));
    check(searchRows.length > 0 && new Set(searchRows).size === searchRows.length, label('broad search returns results'));
    await page.fill('.cc-menu-search input', '');
    await page.fill('.cc-menu-search input', 'meteorologia');
    const found = await rows();
    check(found.length >= 1 && new Set(found).size === found.length, label('search result unique'));
    await snap('4-search');
    // search for a favorite still finds it exactly once
    await page.fill('.cc-menu-search input', favName);
    const favFound = (await rows()).filter((r) => r === favName);
    check(favFound.length === 1, label(`favorite found once via search, got ${favFound.length}`));
    await page.fill('.cc-menu-search input', '');

    // navigation: chip and catalog row
    await page.locator('.cc-menu-favorite-chip').first().click();
    await reopen();
    await page.locator('.cc-menu-destination').first().click();
    const nav = await page.evaluate(() => window.__nav);
    check(nav.length === 4 && nav.every(Boolean), label(`navigation fired (setView+close x2), got ${JSON.stringify(nav)}`));

    await page.waitForSelector('.cc-menu-edit-favorites', { state: 'detached' });
    await reopen();
    // Keyboard edit, actual close/reopen, Escape and focus restoration.
    await page.locator('.cc-menu-edit-favorites').focus();
    await page.keyboard.press('Enter');
    check(await stars() === 40, label('Enter activates edit mode'));
    await page.locator('.cz-menu-close').click();
    await page.waitForSelector('.cc-menu-edit-favorites', { state: 'detached' });
    check(await page.locator('.menu-trigger').evaluate(el => el === document.activeElement), label('close restores opener focus'));
    await reopen();
    check(await stars() === 0, label('reopen exits editing'));
    await page.locator('.cc-menu-edit-favorites').focus();
    await page.keyboard.press('Space');
    check(await stars() === 40, label('Space activates edit mode'));
    await page.keyboard.press('Escape');
    await page.waitForSelector('.cc-menu-edit-favorites', { state: 'detached' });
    check(await page.locator('.menu-trigger').evaluate(el => el === document.activeElement), label('Escape restores opener focus'));
    await reopen();
    check(await stars() === 0, label('Escape exits editing'));
    const first = page.locator('.cz-menu-panel button').first();
    const last = page.locator('.cz-menu-panel button').last();
    await first.focus(); await page.keyboard.press('Shift+Tab');
    check(await last.evaluate(el => el === document.activeElement), label('reverse Tab stays in dialog'));
    await page.keyboard.press('Tab');
    check(await first.evaluate(el => el === document.activeElement), label('Tab stays in dialog'));
    // account switch: B has defaults, A keeps its own; edit mode reset
    await page.click('.cc-menu-edit-favorites');
    await page.evaluate(() => window.__setAccount('account-b'));
    await page.waitForFunction(() => document.querySelector('main').dataset.account === 'account-b');
    check((await chips()).length === 3, label('account B must not inherit account A favorites'));
    check(await stars() === 0, label('edit mode resets on account switch'));
    await page.evaluate(() => window.__setAccount('account-a'));
    await page.waitForFunction(() => document.querySelector('main').dataset.account === 'account-a');
    check((await chips()).length === 4, label('account A favorites restored'));
    // signed out: no private favorites
    await page.evaluate(() => window.__setAccount(null));
    await page.waitForFunction(() => !document.querySelector('.cc-menu-favorites'));
    check((await page.locator('.cc-menu-favorites').count()) === 0, label('signed-out menu must not show favorites'));

    // overflow check
    const overflow = await page.evaluate(() => { const s = document.querySelector('.cz-menu-scroll'); return s.scrollWidth - s.clientWidth; });
    check(overflow <= 1, label('horizontal overflow'));
    check(errors.length === 0, label('page errors: ' + errors.join('; ')));
    console.log(`${failures.filter((f) => f.startsWith(device.name)).length ? 'FAIL' : 'PASS'} ${device.name}`);
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ scope: 'Real prepared MenuDrawer and themes; synthetic accounts and navigation callbacks; not full-app E2E', cases: themedMatrix.length, failures }, null, 2));
assert.deepEqual(failures, [], 'Menu favorites interaction failures');
console.log('PASS: edit favorites, add/remove, limit of five, search, navigation and account isolation');
