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
// Use the composed canonical setter; do not synchronize two independent writers.
const entry = `
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import * as icons from 'lucide-react';
import { setCrewCheckThemePreference } from '${path.join(output, 'theme-runtime.js')}';
window.applyMenuTestTheme = mode => setCrewCheckThemePreference(mode);
import * as menuPreference from '${path.resolve('client/src/lib/menuPreference.ts').replace(/\\/g, '/')}';
const code = ${JSON.stringify(menuCode)};
window.__account = 'account-a';
window.__admin = true;
window.__nav = [];
const scope = {
  React, ...React, ...icons, ...menuPreference, HomeIcon: icons.Home, MapIcon: icons.Map,
  storage: { get: (_k, f) => f, set: () => {} },
  getStoredUser: () => window.__account ? { id: window.__account, name: 'Tripulante ' + window.__account, email: 'demo@example.invalid' } : null,
  isAdmin: () => window.__admin,
};
const keys = Object.keys(scope).filter((k) => k !== 'default' && /^[A-Za-z_$][\\w$]*$/.test(k));
const MenuDrawer = new Function(...keys, code)(...keys.map((k) => scope[k]));
function Harness() {
  const [, renderRole] = React.useState(0);
  window.__setAdmin = (admin) => { window.__admin = admin; renderRole(n => n + 1); };
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
const browser = await chromium.launch({ headless: true, ...(process.env.MENU_CHROMIUM_EXECUTABLE ? { executablePath: process.env.MENU_CHROMIUM_EXECUTABLE } : {}) });


const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.route('**/*', route => route.request().url().startsWith(url) ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('crewcheck:menu-favorites:v1:account-a', JSON.stringify(['roster','radar','departure','admin','maintenance']));
    localStorage.setItem('crewcheck:menu-favorites:v1:account-b', JSON.stringify(['weather']));
  });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.click('.menu-trigger');
  const count = () => page.locator('.cc-menu-favorite-chip').count();
  check(await count() === 5, 'admin account A starts with five favorites');
  await page.evaluate(() => window.__setAdmin(false));
  await page.waitForFunction(() => !document.querySelector('[data-menu-label="Admin"]'));
  check(await count() === 3, 'role removal hides admin favorites');
  await page.click('.cc-menu-edit-favorites');
  await page.click('[data-menu-favorite-id="cockpit"]');
  check(await count() === 4, 'hidden admin favorites must not consume limit when adding cockpit');
  await page.click('[data-menu-favorite-id="compare"]');
  check(await count() === 5, 'user can fill both freed slots');
  await page.click('[data-menu-favorite-id="weather"]');
  check((await page.locator('.cc-menu-status').textContent()).includes('até 5'), 'sixth valid favorite rejected');
  const savedA = await page.evaluate(() => JSON.parse(localStorage.getItem('crewcheck:menu-favorites:v1:account-a')));
  check(!savedA.includes('admin') && !savedA.includes('maintenance'), 'saving current selection drops unavailable entries');
  await page.evaluate(() => window.__setAccount('account-b'));
  await page.waitForFunction(() => document.querySelector('main').dataset.account === 'account-b' && !document.querySelector('.cc-menu-favorite'));
  check(await count() === 1, 'account B keeps own selection');
  await page.evaluate(() => window.__setAccount('account-a'));
  await page.waitForFunction(() => document.querySelector('main').dataset.account === 'account-a');
  check(await count() === 5, 'account A restores own valid selection');
  await page.evaluate(() => window.__setAdmin(true));
  await page.waitForSelector('[data-menu-label="Admin"]');
  check(await count() === 5, 'restoring role does not resurrect removed favorites');
  await page.evaluate(() => window.__setAccount(null));
  await page.waitForFunction(() => !document.querySelector('.cc-menu-favorites'));
  check(await count() === 0, 'logout clears private favorites from view');
  check(errors.length === 0, 'browser has no errors: ' + errors.join(';'));
  await page.screenshot({ path: path.join(output, 'role-transition.png') });
  await context.close();
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({scope: 'Real prepared MenuDrawer, synthetic accounts/role; external network blocked; not full-app E2E', failures}, null, 2));
assert.deepEqual(failures, []);
console.log('PASS menu role transitions, valid favorite limit, accounts A/B and logout');
