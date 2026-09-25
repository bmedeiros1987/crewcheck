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

// Actual prepared MenuDrawer + shipped CSS + unmodified theme functions.
// Synthetic account only. This component test is not full-app/device acceptance.
const output = path.resolve(process.env.MENU_EVIDENCE_DIR || 'artifacts/menu-responsive');
fs.mkdirSync(output, { recursive: true });
const dist = path.resolve('dist');
const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const source = ts.createSourceFile('Home.tsx', home, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['CrewCheckMark', 'MenuDrawer'];
const declarations = source.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text));
assert.equal(declarations.length, names.length, 'Prepared MenuDrawer/brand must exist');
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
// React serializes className to class. Hand-building HTML previously lost this selector.
const markup = renderToStaticMarkup(React.createElement(rootTag, rootProps,
  React.createElement(scope.RenderMenu, {
    open: true, close: () => {}, view: 'roster', setView: () => {}, actions: { logout: () => {} },
  })));
assert.ok(markup.includes('class="cz-app"') && markup.includes('data-menu-label='));
const index = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const links = [...index.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/g)].map(m => m[0]).join('\n');
assert.ok(links, 'Use CSS linked by the real Vite build');
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
const fixture = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">${links}</head><body><div id="root">${markup}</div><script type="module">import { applyCrewCheckTheme } from './theme-runtime.js'; import { applyCrewThemeMode } from './app-theme.js'; window.applyMenuTestTheme = mode => { applyCrewCheckTheme(mode); applyCrewThemeMode(mode); };</script></body></html>`;
fs.writeFileSync(path.join(output, 'menu.html'), fixture);
fs.writeFileSync(path.join(output, 'prepared-menu.tsx'), declarations.map(n => n.getText(source)).join('\n'));
fs.cpSync(path.join(dist, 'assets'), path.join(output, 'assets'), { recursive: true });
if (fs.existsSync(path.join(dist, 'icons'))) fs.cpSync(path.join(dist, 'icons'), path.join(output, 'icons'), { recursive: true });

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
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
async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    for (const animation of document.getAnimations()) {
      if (Number.isFinite(animation.effect?.getComputedTiming().endTime)) {
        try { animation.finish(); } catch {}
      }
    }
    await new Promise(resolve => requestAnimationFrame(resolve));
  });
}
async function inspect(page, label) {
  assert.equal(await page.locator('main.cz-app[data-version]').count(), 1, 'Canonical root must match the shipped selectors');
  await page.evaluate(() => { document.querySelector('.cz-menu-scroll').scrollTop = 0; });
  await settle(page);
  const metrics = await page.evaluate(() => {
    const box = e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const panel = document.querySelector('.cz-menu-panel');
    const scroll = document.querySelector('.cz-menu-scroll');
    const buttons = [...document.querySelectorAll('.cz-menu-group > button')];
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const rgba = color => {
      context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    };
    const luminance = rgb => rgb.slice(0, 3).map(v => { const s = v / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; }).reduce((n, v, i) => n + v * [.2126, .7152, .0722][i], 0);
    const contrast = (color, background) => {
      const fg = rgba(color), bg = rgba(background);
      if (fg[3] !== 255 || bg[3] !== 255) return null; // Fail closed for non-opaque fixtures.
      const a = luminance(fg), b = luminance(bg);
      return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      theme: document.documentElement.dataset.crewTheme,
      expectedColumns: matchMedia('(pointer: coarse) and (min-width: 821px)').matches ? 2 : 1,
      columns: getComputedStyle(document.querySelector('.cz-menu-group')).gridTemplateColumns.split(' ').length,
      panel: box(panel), scroll: { ...box(scroll), scrollWidth: scroll.scrollWidth, clientWidth: scroll.clientWidth },
      close: box(document.querySelector('.cz-menu-close')),
      logout: box(document.querySelector('.cz-menu-logout')),
      profile: box(document.querySelector('.cz-menu-profile')),
      count: buttons.length,
      rows: buttons.map(b => {
        const copy = b.querySelector(':scope > span');
        const style = getComputedStyle(copy);
        const iconStyle = getComputedStyle(b.querySelector(':scope > svg:first-child'));
        const glyphWidth = parseFloat(iconStyle.width) - (iconStyle.boxSizing === 'border-box'
          ? parseFloat(iconStyle.paddingLeft) + parseFloat(iconStyle.paddingRight) + parseFloat(iconStyle.borderLeftWidth) + parseFloat(iconStyle.borderRightWidth) : 0);
        const textColor = getComputedStyle(copy.querySelector('strong')).color;
        const detailColor = getComputedStyle(copy.querySelector('small')).color;
        const background = getComputedStyle(b).backgroundColor;
        return { name: b.dataset.menuLabel, button: box(b), copy: box(copy), glyphWidth,
          opacity: style.opacity, visibility: style.visibility, position: style.position,
          textColor, background, titleContrast: contrast(textColor, background), detailContrast: contrast(detailColor, background) };
      }),
    };
  });
  const failures = [];
  const inside = (r, outer) => r.width > 0 && r.height > 0 && r.x >= outer.x - 1 && r.y >= outer.y - 1 && r.right <= outer.right + 1 && r.bottom <= outer.bottom + 1;
  const viewport = { x: 0, y: 0, right: metrics.viewport.width, bottom: metrics.viewport.height };
  if (!inside(metrics.panel, viewport)) failures.push('Menu panel escapes viewport');
  if (!['dark', 'light'].includes(metrics.theme)) failures.push('Effective app theme missing from fixture');
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
  if (metrics.columns !== metrics.expectedColumns) failures.push('Wrong navigation column count');
  if (metrics.count !== 40) failures.push(`Expected 40 canonical destinations; got ${metrics.count}`);
  for (const row of metrics.rows) {
    if (row.visibility !== 'visible' || Number(row.opacity) < 0.99 || row.position === 'absolute') failures.push(`${row.name}: label depends on hover`);
    if (row.button.width < 200 || row.button.height < 44) failures.push(`${row.name}: collapsed navigation row`);
    if (!inside(row.copy, row.button)) failures.push(`${row.name}: copy outside button`);
    if (row.glyphWidth < 18) failures.push(`${row.name}: icon glyph collapsed inside padding`);
    if (!(row.titleContrast >= 4.5) || !(row.detailContrast >= 4.5)) failures.push(`${row.name}: text contrast below 4.5:1`);
  }
  await page.screenshot({ path: path.join(output, `${label}.png`), animations: 'disabled' });
  await page.evaluate(() => { const el = document.querySelector('.cz-menu-scroll'); el.scrollTop = el.scrollHeight; });
  await settle(page);
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
    await page.waitForFunction(() => typeof window.applyMenuTestTheme === 'function');
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => window.applyMenuTestTheme(theme), theme);
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
    scope: 'Prepared MenuDrawer + shipped CSS + App effective theme; synthetic account; no full-app/device acceptance', results,
  }, null, 2));
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
assert.ok(results.length >= 16 && results.every(r => !r.failures.length), 'Responsive menu failures; inspect report.json and viewport screenshots');
