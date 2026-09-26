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

// Run after regression-menu-responsive-browser.mjs. Reuse its actual root markers,
// effective App theme functions and CSS from the prepared Vite build. Only the
// content-height sample and account are synthetic; this is NOT full-app/device E2E.
const output = path.resolve('artifacts/menu-responsive');
let html = fs.readFileSync(path.join(output, 'menu.html'), 'utf8');
const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const source = ts.createSourceFile('Home.tsx', home, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['CrewCheckMark', 'Brand', 'BottomNav'];
const declarations = source.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text));
assert.equal(declarations.length, names.length, 'Use current prepared header and BottomNav');
const navSource = declarations.find(n => n.name.text === 'BottomNav').getText(source);
assert.ok(navSource.includes('createPortal(') && navSource.includes('document.body'), 'Keep real body portal contract');
const code = ts.transpileModule(declarations.map(n => n.getText(source)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
}).outputText;
const testDocument = { body: {} };
let portalCalls = 0;
const scope = { React, ...React, ...icons, HomeIcon: icons.Home, MapIcon: icons.Map,
  document: testDocument,
  storage: { get: (_key, fallback) => fallback, set: () => {} },
  createPortal: (node, target) => { assert.equal(target, testDocument.body); portalCalls++; return node; },
};
vm.runInNewContext(code + '\nthis.TestBrand = Brand; this.TestNav = BottomNav;', scope, { timeout: 1000 });
const brand = renderToStaticMarkup(React.createElement(scope.TestBrand, { onMenu: () => {} }));
const nav = renderToStaticMarkup(React.createElement(scope.TestNav, {
  view: 'roster', setView: () => {}, openMenu: () => {}, alertCount: 12, alertSignature: 'synthetic-layout-only',
}));
assert.equal(portalCalls, 1, 'Exactly one canonical footer');
const content = `<div class="cz-global-header" data-global-internal-header="true">${brand}</div><div class="cz-global-header-spacer"></div><section class="cz-empty-real" data-shell-sample="true"><h2>Teste de navegação</h2><p>Amostra de layout sem dados de conta. Cabeçalho, menu e barra inferior usam os componentes reais.</p><div style="height:900px" aria-hidden="true"></div><button type="button" data-shell-end="true">Última ação da página</button></section>`;
assert.match(html, /<main\s[^>]*class="cz-app"/);
html = html.replace(/(<main\s[^>]*>)/, '$1' + content).replace('<script type="module">', nav + '<script type="module">');
fs.writeFileSync(path.join(output, 'shell.html'), html);
fs.writeFileSync(path.join(output, 'prepared-navigation.tsx'), declarations.map(n => n.getText(source)).join('\n'));

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const file = path.resolve(output, '.' + decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname));
  if (!file.startsWith(output + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const require = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || import.meta.url);
const engines = require('playwright');
const matrix = [
  { name: 'narrow-320', width: 320, height: 740, touch: true },
  { name: 'portrait', width: 360, height: 800, touch: true },
  { name: 'landscape-small', width: 667, height: 375, touch: true },
  { name: 'landscape', width: 844, height: 390, touch: true },
  { name: 'landscape-wide', width: 932, height: 430, touch: true },
  { name: 'tablet', width: 1024, height: 768, touch: true },
  { name: 'desktop-small', width: 1024, height: 768, touch: false },
  { name: 'desktop', width: 1440, height: 900, touch: false },
];
const results = [];
async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (const a of document.getAnimations()) if (Number.isFinite(a.effect?.getComputedTiming().endTime)) { try { a.finish(); } catch {} }
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}
async function setDrawer(page, open) {
  await page.evaluate(open => {
    const app = document.querySelector('main.cz-app');
    window.__layoutDrawer ||= document.querySelector('.cz-menu-overlay');
    if (open) app.appendChild(window.__layoutDrawer); else window.__layoutDrawer.remove();
    app.dataset.menuOpen = String(open);
    document.documentElement.classList.toggle('crewcheck-menu-open', open);
    document.body.classList.toggle('crewcheck-menu-open', open);
  }, open);
  await settle(page);
}
async function inspect(page, name, scale = 1) {
  await setDrawer(page, false);
  await page.evaluate(() => window.scrollTo(0, 0));
  await settle(page);
  const metrics = await page.evaluate(() => {
    const box = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const navs = document.querySelectorAll('body > nav.cz-bottom-nav');
    const nav = navs[0];
    const style = getComputedStyle(nav);
    const buttons = [...nav.querySelectorAll(':scope > button')];
    return { width: innerWidth, height: innerHeight, count: navs.length, display: style.display, visibility: style.visibility,
      nav: box(nav), paddingBottom: parseFloat(getComputedStyle(document.querySelector('main.cz-app')).paddingBottom),
      rows: buttons.map(button => {
        const label = button.querySelector('span'); const r = button.getBoundingClientRect();
        return { button: box(button), label: box(label), text: label.textContent, svg: box(button.querySelector('svg')),
          textFits: label.scrollWidth <= label.clientWidth + 1 && label.scrollHeight <= label.clientHeight + 1,
          hit: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('button') === button };
      }) };
  });
  const failures = [];
  const within = (a, b) => a.width > 0 && a.height > 0 && a.x >= b.x - 1 && a.y >= b.y - 1 && a.right <= b.right + 1 && a.bottom <= b.bottom + 1;
  if (metrics.count !== 1 || metrics.display === 'none' || metrics.visibility !== 'visible') failures.push('Canonical footer is hidden/duplicated');
  if (!within(metrics.nav, { x: 0, y: 0, right: metrics.width, bottom: metrics.height })) failures.push('Footer outside viewport');
  if (metrics.rows.length !== 5) failures.push('Five destinations not preserved');
  for (const row of metrics.rows) {
    if (row.button.width < 44 || row.button.height < 44) failures.push(`${row.text}: target below 44 CSS px`);
    if (!within(row.label, row.button) || !row.textFits) failures.push(`${row.text}: text clipped`);
    if (!within(row.svg, row.button) || row.svg.width < 18 || row.svg.height < 18) failures.push(`${row.text}: icon clipped`);
    if (!row.hit) failures.push(`${row.text}: covered/non-interactive`);
  }
  if (scale === 1 && metrics.width > metrics.height && metrics.height <= 500 && metrics.nav.height > 64) failures.push('Landscape footer consumes too much height');
  await page.screenshot({ path: path.join(output, `shell-${name}.png`), animations: 'disabled' });
  await page.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight));
  await settle(page);
  const end = await page.evaluate(() => ({ end: document.querySelector('[data-shell-end]').getBoundingClientRect().bottom, nav: document.querySelector('body > nav.cz-bottom-nav').getBoundingClientRect().top }));
  if (end.end > end.nav - 4) failures.push('Last content action covered by footer');
  await page.evaluate(() => window.scrollTo(0, 0));
  await setDrawer(page, true);
  const hidden = await page.locator('body > nav.cz-bottom-nav').evaluate(el => getComputedStyle(el).display === 'none');
  if (!hidden) failures.push('Footer still overlaps open drawer');
  await setDrawer(page, false);
  const restored = await page.locator('body > nav.cz-bottom-nav').evaluate(el => getComputedStyle(el).display !== 'none');
  if (!restored) failures.push('Footer not restored after drawer close');
  results.push({ name, scale, failures, metrics });
  console.log(`${failures.length ? 'FAIL' : 'PASS'} ${name}: ${failures.join('; ') || 'visible, contained, readable, content unobscured'}`);
}
try {
  for (const engine of ['chromium', 'webkit']) {
    const browser = await engines[engine].launch({ headless: true });
    try {
      for (const device of matrix) {
        const context = await browser.newContext({ viewport: { width: device.width, height: device.height }, hasTouch: device.touch, isMobile: device.touch, reducedMotion: 'reduce' });
        await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
        const page = await context.newPage();
        await page.goto(origin + '/shell.html', { waitUntil: 'networkidle' });
        await page.waitForFunction(() => typeof window.applyMenuTestTheme === 'function');
        for (const theme of ['dark', 'light']) {
          await page.evaluate(theme => window.applyMenuTestTheme(theme), theme);
          await inspect(page, `${engine}-${device.name}-${theme}`);
        }
        if (device.name === 'portrait') {
          await page.setViewportSize({ width: 844, height: 390 });
          await inspect(page, `${engine}-rotate-landscape`);
          await page.setViewportSize({ width: 360, height: 800 });
          await inspect(page, `${engine}-rotate-portrait`);
        }
        if (device.name === 'desktop') {
          await page.evaluate(() => document.documentElement.style.setProperty('font-size', '32px', 'important'));
          await inspect(page, `${engine}-text-200-percent`, 2);
        }
        await context.close();
      }
    } finally { await browser.close(); }
  }
} finally {
  fs.writeFileSync(path.join(output, 'shell-report.json'), JSON.stringify({ commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    scope: 'Prepared Brand/BottomNav/body portal plus actual CSS; synthetic content height; drawer state replay; not full-app E2E or physical acceptance', results }, null, 2));
  await new Promise(resolve => server.close(resolve));
}
assert.equal(results.length, 38, 'All browser/viewport/theme/rotation/text-scale cases must run');
assert.ok(results.every(r => !r.failures.length), 'Shell layout failures; inspect screenshots and shell-report.json');
