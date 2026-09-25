import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as icons from 'lucide-react';
import ts from 'typescript';

// Tests the actual prepared MenuDrawer and shipped CSS, not a second hand-built menu.
// Account data is synthetic; no authentication, API, roster or production data is used.
// This is a component layout test, not a full-app or physical-device acceptance test.
const output = path.resolve(process.env.MENU_EVIDENCE_DIR || 'artifacts/menu-responsive');
fs.mkdirSync(output, { recursive: true });
const dist = path.resolve('dist');
const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const source = ts.createSourceFile('Home.tsx', home, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['CrewCheckMark', 'MenuDrawer'];
const declarations = source.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text));
assert.equal(declarations.length, names.length, 'Canonical MenuDrawer/brand must exist after preparation');
const rootProps = { className: 'cz-app', 'data-version': 'prepared', 'data-view': 'roster', 'data-menu-open': 'true' };
function collectRoot(node) {
  if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
      && node.attributes.properties.some(a => ts.isJsxAttribute(a) && a.name.text === 'data-ipad-layout-v14394')) {
    for (const attr of node.attributes.properties) {
      if (!ts.isJsxAttribute(attr) || !attr.name.text.startsWith('data-')) continue;
      if (attr.initializer && ts.isStringLiteral(attr.initializer)) rootProps[attr.name.text] = attr.initializer.text;
    }
  }
  ts.forEachChild(node, collectRoot);
}
collectRoot(source);
assert.equal(rootProps['data-ipad-layout-v14394'], 'contained', 'Use prepared canonical root markers');
const code = ts.transpileModule(declarations.map(n => n.getText(source)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
}).outputText;
const scope = {
  React, ...React, ...icons, HomeIcon: icons.Home, MapIcon: icons.Map,
  storage: { get: (_key, fallback) => fallback, set: () => {} },
  getStoredUser: () => ({ name: 'Tripulante de demonstração com nome longo', email: 'demo@example.invalid' }),
  isAdmin: () => true,
};
vm.runInNewContext(code + '\nthis.RenderMenu = MenuDrawer;', scope, { timeout: 1000 });
const menu = renderToStaticMarkup(React.createElement(scope.RenderMenu, {
  open: true, close: () => {}, view: 'roster', setView: () => {}, actions: { logout: () => {} },
}));
assert.ok(menu.includes('data-menu-label='), 'Render the current canonical labeled destinations');
const index = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const links = [...index.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/g)].map(m => m[0]).join('\n');
assert.ok(links, 'Use CSS linked by the real Vite build');
// rootProps usa o nome JSX (className); no HTML estático o atributo é class. Sem isso o
// fixture saía com className="cz-app" literal e nenhuma regra .cz-app do CSS real casava —
// o teste media uma cascata diferente da que o app mostra.
const attrs = Object.entries(rootProps).map(([k, v]) => `${k === 'className' ? 'class' : k}="${String(v).replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`).join(' ');
const fixture = `<!doctype html><html lang="pt-BR" data-crew-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">${links}</head><body><div id="root"><div ${attrs}>${menu}</div></div></body></html>`;
fs.writeFileSync(path.join(output, 'menu.html'), fixture);
fs.writeFileSync(path.join(output, 'prepared-menu.tsx'), declarations.map(n => n.getText(source)).join('\n'));
fs.cpSync(path.join(dist, 'assets'), path.join(output, 'assets'), { recursive: true });
if (fs.existsSync(path.join(dist, 'icons'))) fs.cpSync(path.join(dist, 'icons'), path.join(output, 'icons'), { recursive: true });

const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
  const file = path.resolve(output, '.' + (pathname === '/' ? '/menu.html' : pathname));
  if (!file.startsWith(output + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404).end(); return;
  }
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const require = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch({ headless: true });
const matrix = [
  { name: 'phone-portrait', width: 360, height: 800, touch: true },
  { name: 'phone-landscape-small', width: 667, height: 375, touch: true },
  { name: 'phone-landscape', width: 844, height: 390, touch: true },
  { name: 'phone-landscape-wide', width: 932, height: 430, touch: true },
  { name: 'tablet', width: 1024, height: 768, touch: true },
  { name: 'desktop-small', width: 1024, height: 768, touch: false },
  { name: 'desktop', width: 1440, height: 900, touch: false },
];
const results = [];
async function inspect(page, label) {
  await page.evaluate(() => { document.querySelector('.cz-menu-scroll').scrollTop = 0; });
  const metrics = await page.evaluate(() => {
    const box = e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const panel = document.querySelector('.cz-menu-panel');
    const scroll = document.querySelector('.cz-menu-scroll');
    const buttons = [...document.querySelectorAll('.cz-menu-group > button')];
    return {
      viewport: { width: innerWidth, height: innerHeight },
      panel: box(panel), scroll: { ...box(scroll), scrollWidth: scroll.scrollWidth, clientWidth: scroll.clientWidth },
      close: box(document.querySelector('.cz-menu-close')),
      logout: box(document.querySelector('.cz-menu-logout')),
      profile: box(document.querySelector('.cz-menu-profile')),
      count: buttons.length,
      rows: buttons.map(b => {
        const copy = b.querySelector(':scope > span');
        const style = getComputedStyle(copy);
        return { name: b.dataset.menuLabel, button: box(b), copy: box(copy), opacity: style.opacity, visibility: style.visibility, position: style.position };
      }),
    };
  });
  const failures = [];
  const inside = (r, outer) => r.width > 0 && r.height > 0 && r.x >= outer.x - 1 && r.y >= outer.y - 1 && r.right <= outer.right + 1 && r.bottom <= outer.bottom + 1;
  const viewport = { x: 0, y: 0, right: metrics.viewport.width, bottom: metrics.viewport.height };
  if (!inside(metrics.panel, viewport)) failures.push('Menu panel escapes viewport');
  for (const key of ['close', 'logout', 'profile']) {
    if (!inside(metrics[key], metrics.panel)) failures.push(`${key} escapes panel`);
  }
  for (const key of ['close', 'logout']) {
    if (metrics[key].width < 44 || metrics[key].height < 44) failures.push(`${key} touch target below 44 CSS px`);
  }
  const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.x, b.x) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 1;
  if (overlap(metrics.close, metrics.logout) || overlap(metrics.profile, metrics.logout) || overlap(metrics.profile, metrics.close)) failures.push('Header actions overlap');
  if (metrics.scroll.height < 100) failures.push('No useful scrolling area');
  if (metrics.scroll.scrollWidth > metrics.scroll.clientWidth + 1) failures.push('Horizontal overflow in menu list');
  if (metrics.count !== 40) failures.push(`Expected 40 canonical destinations; got ${metrics.count}`);
  for (const row of metrics.rows) {
    if (row.visibility !== 'visible' || Number(row.opacity) < 0.99 || row.position === 'absolute') failures.push(`${row.name}: label depends on hover`);
    if (row.button.width < 200 || row.button.height < 44) failures.push(`${row.name}: collapsed navigation row`);
    if (!inside(row.copy, row.button)) failures.push(`${row.name}: copy outside button`);
  }
  await page.screenshot({ path: path.join(output, `${label}.png`), animations: 'disabled' });
  await page.evaluate(() => { const el = document.querySelector('.cz-menu-scroll'); el.scrollTop = el.scrollHeight; });
  const end = await page.evaluate(() => {
    const scroll = document.querySelector('.cz-menu-scroll').getBoundingClientRect();
    const last = [...document.querySelectorAll('.cz-menu-group > button')].at(-1).getBoundingClientRect();
    return { scrollTop: scroll.top, scrollBottom: scroll.bottom, top: last.top, bottom: last.bottom };
  });
  if (end.top < end.scrollTop - 1 || end.bottom > Math.min(end.scrollBottom, metrics.viewport.height) + 1) failures.push('Last destination unreachable');
  results.push({ label, failures, metrics });
  console.log(`${failures.length ? 'FAIL' : 'PASS'} ${label}: ${failures.join('; ') || 'contained, readable, scrollable'}`);
}
try {
  for (const device of matrix) {
    const context = await browser.newContext({ viewport: { width: device.width, height: device.height }, hasTouch: device.touch, isMobile: device.touch, reducedMotion: 'reduce' });
    await context.route('**/*', route => route.request().url().startsWith(url) ? route.continue() : route.abort());
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => { document.documentElement.dataset.crewTheme = theme; }, theme);
      await inspect(page, `${device.name}-${theme}`);
    }
    if (device.name === 'phone-portrait') {
      await page.setViewportSize({ width: 844, height: 390 });
      await inspect(page, 'rotate-open-menu-to-landscape');
      await page.setViewportSize({ width: 360, height: 800 });
      await inspect(page, 'rotate-open-menu-back-to-portrait');
    }
    await context.close();
  }
} finally {
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    scope: 'Prepared MenuDrawer + shipped CSS; synthetic account; no full-app/device acceptance', results,
  }, null, 2));
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
assert.ok(results.length >= 16 && results.every(r => !r.failures.length), 'Responsive menu failures; inspect report.json and viewport screenshots');
