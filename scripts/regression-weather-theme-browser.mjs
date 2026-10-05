import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { build } from 'esbuild';

// Run after canonical preparation AND the production Vite build, from repo root.
// This renders the actual prepared declarations, navigation and shipped CSS.
// Only account/event/local preference fixtures and toast reporting are synthetic.
// No follow control is clicked; backend/API/notification attempts are forbidden; public Inter font reads are allowlisted.
// --baseline runs the same assertions against an unfixed production build and
// succeeds only if a visual regression is observed. It never certifies a fix.
// WEATHER_THEME_DIST can select an existing baseline dist without injecting CSS.
const baseline = process.argv.includes('--baseline');
assert.ok(process.argv.slice(2).every(arg => arg === '--baseline'), 'Only --baseline is supported');
const output = path.resolve(process.env.WEATHER_THEME_ARTIFACTS || `artifacts/weather-theme${baseline ? '-baseline' : ''}`);
const dist = path.resolve(process.env.WEATHER_THEME_DIST || 'dist');
const sourceCss = 'client/src/components/v1430/trust-and-conversion.css';
const viewports = [
  { width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 },
  { width: 768, height: 1024 }, { width: 1440, height: 1000 },
  { width: 320, height: 740, textScale: 2 },
  { width: 390, height: 844, empty: true },
];
const snapshotsPerSession = 6;
const expectedCases = 2 * viewports.reduce((count, viewport) => count + (viewport.empty ? 1 : 2), 0) * snapshotsPerSession;
fs.mkdirSync(output, { recursive: true });
const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const ast = ts.createSourceFile('Home.tsx', home, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const rootProps = { className: 'cz-app', 'data-view': 'weather', 'data-menu-open': 'false' };
let rootTag;
function collect(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'DEFAULT_VERSION' && node.initializer && ts.isStringLiteral(node.initializer)) rootProps['data-version'] = node.initializer.text;
  if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.attributes.properties.some(attr => ts.isJsxAttribute(attr) && attr.name.text === 'data-ipad-layout-v14394')) {
    rootTag = node.tagName.getText(ast);
    for (const attr of node.attributes.properties) {
      if (ts.isJsxAttribute(attr) && attr.name.text.startsWith('data-') && attr.initializer && ts.isStringLiteral(attr.initializer)) rootProps[attr.name.text] = attr.initializer.text;
    }
  }
  ts.forEachChild(node, collect);
}
collect(ast);
// These dynamic attributes belong to this exact rendered view, not another view
// that happened to appear as a string literal in the source.
rootProps['data-view'] = 'weather';
rootProps['data-menu-open'] = 'false';
assert.equal(rootTag, 'main', 'Run canonical preparation before browser regression');
assert.ok(rootProps['data-version'], 'Prepared Home version is required');
const names = ['MeteoFollowPanel', 'crewcheckPlanExperience', 'Brand', 'BottomNav'];
const declarations = ast.statements.filter(node =>
  (ts.isFunctionDeclaration(node) && [...names, 'CrewCheckMark'].includes(node.name?.text))
  || (ts.isVariableStatement(node) && node.declarationList.declarations.some(decl => decl.name.getText(ast) === 'storage')));
for (const name of names) assert.equal(declarations.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name).length, 1, `Actual prepared ${name} is required`);
assert.ok(declarations.some(node => ts.isVariableStatement(node)), 'Use the actual local storage adapter');
// Exercise the actual canonically prepared search form and its submit handler.
// Deliberately omit WeatherView's data-fetching effects: loading and response
// state are local fixtures, so this layout regression cannot contact an API.
const weatherView = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'WeatherView');
assert.ok(weatherView?.body, 'Actual prepared WeatherView is required');
const searchDeclarations = weatherView.body.statements.filter(node => ts.isVariableStatement(node)
  && node.declarationList.declarations.some(declaration => ['scheduled', '[query, setQuery]', '[activeQuery, setActiveQuery]', '[loading, setLoading]', 'search'].includes(declaration.name.getText(ast))));
assert.equal(searchDeclarations.length, 5, 'Retain the real query state, loading state and submit handler');
let searchForm;
function collectSearchForm(node) {
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'form'
    && node.openingElement.attributes.properties.some(attribute => ts.isJsxAttribute(attribute) && attribute.name.text === 'className' && attribute.initializer?.text === 'cc-weather-search')) {
    assert.ok(!searchForm, 'Only one weather search form is expected');
    searchForm = node.getText(ast);
  }
  ts.forEachChild(node, collectSearchForm);
}
collectSearchForm(weatherView);
assert.ok(searchForm?.includes('cc-weather-search-row-v14344'), 'Run canonical search-field preparation first');
const searchSource = searchDeclarations.map(node => node.getText(ast)).join('\n');
fs.writeFileSync(path.join(output, 'prepared-search-form.tsx'), searchSource + '\n' + searchForm);
const componentSource = declarations.map(node => node.getText(ast)).join('\n');
const iconImports = ast.statements.filter(node => ts.isImportDeclaration(node) && node.moduleSpecifier.text === 'lucide-react').map(node => node.getText(ast)).join('\n');
assert.ok(iconImports, 'Use actual Home icon imports');
fs.writeFileSync(path.join(output, 'prepared-components.tsx'), componentSource);
fs.copyFileSync(sourceCss, path.join(output, 'source.css'));

const productionIndex = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const stylesheetTags = [...productionIndex.matchAll(/<link\b[^>]*>/gi)].map(match => match[0]).filter(tag => /\brel=["']stylesheet["']/i.test(tag));
assert.ok(stylesheetTags.length, 'Use real production stylesheets, not a hand-authored test stylesheet');
const publicFontStylesheets = [];
const cssFiles = stylesheetTags.flatMap(tag => {
  const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1]?.replaceAll('&amp;', '&');
  assert.ok(href, 'Production stylesheet href is required');
  if (/^(?:https?:)?\/\//.test(href)) {
    const url = new URL(href);
    assert.equal(url.origin, 'https://fonts.googleapis.com', 'Only the existing public font stylesheet may be external');
    assert.equal(url.pathname, '/css2');
    assert.equal(url.searchParams.get('family'), 'Inter:wght@400;500;600;700;800;900');
    assert.equal(url.searchParams.get('display'), 'swap');
    assert.deepEqual([...url.searchParams.keys()].sort(), ['display', 'family']);
    publicFontStylesheets.push(url.href);
    return [];
  }
  const file = path.resolve(dist, href.split(/[?#]/)[0].replace(/^\//, ''));
  assert.ok(file.startsWith(dist + path.sep) && fs.existsSync(file), `Production stylesheet exists: ${href}`);
  return [file];
});
assert.ok(cssFiles.length, 'Require linked local application CSS');
const shippedCss = cssFiles.map(file => fs.readFileSync(file, 'utf8')).join('\n');
const overridePattern = /html\s+body\s+\.cz-app\[data-version\]\s+\.cc-meteo-follow\s*\{[^}]*background(?:-color)?\s*:\s*var\(--cc-review-surface\s*[,)]/;
if (!baseline) {
  assert.ok(overridePattern.test(fs.readFileSync(sourceCss, 'utf8')), 'Scoped theme override is present in source CSS');
  assert.ok(overridePattern.test(shippedCss), 'Scoped theme override is in the linked Vite CSS, not only the source file');
}

const entry = `
import React, {useState,useEffect,useMemo,useRef,useCallback} from 'react';
import {createPortal} from 'react-dom';
import {createRoot} from 'react-dom/client';
${iconImports}
import CrewCheckPulse from '@/components/pulse/CrewCheckPulse';
import {InternalHeaderFrame} from '@/components/navigation/InternalHeaderFrame';
import {OperationalLayoutSafety} from '@/components/navigation/OperationalLayoutSafety';
import {setCrewCheckThemePreference,getCrewCheckThemePreference,getEffectiveCrewCheckTheme} from '@/lib/themeRuntime';
const getStoredUser = () => Object.freeze({id:'synthetic-weather-theme',plan:'premium',premium:true});
const toast = {error:message=>window.weatherThemeToasts.push({type:'error',message}),info:message=>window.weatherThemeToasts.push({type:'info',message}),success:message=>window.weatherThemeToasts.push({type:'success',message})};
${componentSource}
const event = new URLSearchParams(location.search).has('empty') ? undefined : {id:'synthetic-weather-flight',kind:'flight',origin:'AAA',destination:'BBB'};
window.weatherThemeToasts=[];
window.weatherThemeNavigation=[];
window.weatherThemeFollowEvents=[];
window.weatherThemeSession='session-'+Math.random().toString(36).slice(2);
window.addEventListener('crewcheck:set-view',e=>window.weatherThemeNavigation.push(e.detail));
window.addEventListener('crewcheck:meteo-follow-updated',e=>window.weatherThemeFollowEvents.push(e.detail));
window.applyWeatherTheme=setCrewCheckThemePreference;
window.readWeatherTheme=()=>({preference:getCrewCheckThemePreference(),effective:getEffectiveCrewCheckTheme()});
function WeatherSearchFixture(){
  const event = {id:'synthetic-weather-search',origin:'AAA',destination:'BBB'};
  ${searchSource}
  useEffect(()=>{window.weatherSearchState={query,activeQuery,loading};window.weatherSearchSetLoading=setLoading;},[query,activeQuery,loading]);
  return <section className="cc-weather-console">${searchForm}</section>;
}
function App(){return <><main {...${JSON.stringify(rootProps)}}><OperationalLayoutSafety/><InternalHeaderFrame><Brand back/></InternalHeaderFrame><WeatherSearchFixture/><MeteoFollowPanel event={event}/></main><BottomNav view="weather" setView={view=>window.weatherThemeNavigation.push(view)} openMenu={()=>window.weatherThemeNavigation.push('menu')}/></>}
createRoot(document.getElementById('root')).render(<App/>);
`;
await build({
  stdin: { contents: entry, loader: 'tsx', resolveDir: process.cwd() }, bundle: true,
  platform: 'browser', format: 'esm', jsx: 'automatic', tsconfig: 'tsconfig.json',
  outfile: path.join(output, 'harness.js'), loader: { '.css': 'empty' },
  define: { 'process.env.NODE_ENV': '"test"', 'import.meta.env': JSON.stringify({ DEV: false, PROD: true, MODE: 'test', BASE_URL: '/' }) },
});
fs.writeFileSync(path.join(output, 'index.html'), `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">${stylesheetTags.join('\n')}</head><body><div id="root"></div><script type="module" src="/harness.js"></script></body></html>`);
fs.cpSync(path.join(dist, 'assets'), path.join(output, 'assets'), { recursive: true });
if (fs.existsSync(path.join(dist, 'icons'))) fs.cpSync(path.join(dist, 'icons'), path.join(output, 'icons'), { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url || '/', 'http://localhost').pathname;
  const file = path.resolve(output, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (request.method !== 'GET' || !file.startsWith(output + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return; }
  response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(response);
});
const require = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || import.meta.url);
const engines = require('playwright');
const results = [], interactions = [], safety = [], failures = [];
let origin;
const settle = async page => page.evaluate(async () => {
  await document.fonts.ready;
  const frames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await frames();
  // Measure the settled effective theme, retaining real shipping transitions.
  // Infinite decorative animations are not a settling condition.
  const finite = document.getAnimations().filter(animation =>
    Number.isFinite(animation.effect?.getComputedTiming().endTime) && animation.playState !== 'finished');
  await Promise.all(finite.map(animation => animation.finished.catch(() => {})));
  await frames();
});

async function inspectSearch(page, name, state = 'idle') {
  const metrics = await page.locator('.cc-weather-search').evaluate(form => {
    const row = form.querySelector('.cc-weather-search-row-v14344');
    const input = form.querySelector('input'), button = form.querySelector('button[type="submit"]');
    const bounds = element => { const r = element.getBoundingClientRect(); return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,center:r.x+r.width/2}; };
    const range = document.createRange(); range.selectNodeContents(button);
    const label = range.getBoundingClientRect();
    return {row:bounds(row),input:bounds(input),button:bounds(button),label:{x:label.x,right:label.right,y:label.y,bottom:label.bottom},stacked:matchMedia('(max-width:520px)').matches,
      buttonText:button.textContent,disabled:button.disabled,focused:document.activeElement===button,
      buttonOverflow:button.scrollWidth>button.clientWidth+1 || button.scrollHeight>button.clientHeight+1,
      pageOverflow:document.documentElement.scrollWidth>innerWidth+1};
  });
  const issues = [];
  if (metrics.stacked && Math.abs(metrics.button.center-metrics.row.center)>1) issues.push('Search submit is not centered in its row');
  if (metrics.stacked && Math.abs(metrics.button.center-metrics.input.center)>1) issues.push('Search input and submit do not share a center');
  for (const control of [metrics.input,metrics.button]) {
    if (control.x<metrics.row.x-1 || control.right>metrics.row.right+1) issues.push('Search control outside row');
    if (control.width<43.5 || control.height<43.5) issues.push('Search touch target below 44px');
  }
  if (metrics.stacked && metrics.button.y<metrics.input.bottom-1) issues.push('Search input and submit overlap');
  if (metrics.label.x<metrics.button.x-1 || metrics.label.right>metrics.button.right+1 || metrics.label.y<metrics.button.y-1 || metrics.label.bottom>metrics.button.bottom+1 || metrics.buttonOverflow) issues.push('Search submit label clipped');
  if (metrics.pageOverflow) issues.push('Search page overflow');
  fs.writeFileSync(path.join(output, `${name}-search-${state}.json`), JSON.stringify({...metrics,issues},null,2));
  failures.push(...issues.map(issue=>`${name} ${state}: ${issue}`));
  return metrics;
}

async function inspect(page, name, preference, effective, favoriteCount, session, empty) {
  await page.waitForFunction(({ preference, effective }) => {
    const html = document.documentElement;
    return window.readWeatherTheme?.().preference === preference
      && window.readWeatherTheme?.().effective === effective
      && html.dataset.crewcheckThemePreference === preference
      && html.dataset.crewTheme === effective
      && html.dataset.crewcheckTheme === effective
      && html.classList.contains('dark') === (effective === 'dark');
  }, { preference, effective });
  await page.evaluate(() => window.scrollTo(0, 0));
  await settle(page);
  const metrics = await page.locator('.cc-meteo-follow').evaluate((panel, { effective, publicFontStylesheets }) => {
    const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas color parser is unavailable');
    const rgba = value => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = 'rgba(0,0,0,0)';
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      const data = context.getImageData(0, 0, 1, 1).data;
      return [data[0] / 255, data[1] / 255, data[2] / 255, data[3] / 255];
    };
    const over = (front, back) => {
      const alpha = front[3] + back[3] * (1 - front[3]);
      return alpha ? [0, 1, 2].map(i => (front[i] * front[3] + back[i] * back[3] * (1 - front[3])) / alpha).concat(alpha) : [0, 0, 0, 0];
    };
    const luminance = color => color.slice(0, 3).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const contrast = (one, two) => (Math.max(luminance(one), luminance(two)) + 0.05) / (Math.min(luminance(one), luminance(two)) + 0.05);
    const backgroundChoices = style => {
      const color = rgba(style.backgroundColor);
      if (style.backgroundImage === 'none') return [color];
      if (/url\(/.test(style.backgroundImage)) throw new Error('Contrast sampling cannot certify image backgrounds');
      const stops = [...style.backgroundImage.matchAll(/(?:rgba?|hsla?|(?:ok)?lab|(?:ok)?lch|color)\([^)]*\)|#[\da-f]{3,8}\b|\btransparent\b/gi)].map(match => rgba(match[0]));
      if (!stops.length) throw new Error('Cannot parse gradient colors: ' + style.backgroundImage);
      // Conservative samples include every gradient stop and intermediates.
      // The repaired component is required to use a solid theme surface.
      const samples = [...stops];
      for (let i = 1; i < stops.length; i++) for (const t of [0.25, 0.5, 0.75]) samples.push(stops[i - 1].map((v, channel) => v * (1 - t) + stops[i][channel] * t));
      return samples.map(sample => over(sample, color));
    };
    const paints = element => {
      let variants = [{ foreground: rgba(getComputedStyle(element).color), background: [0, 0, 0, 0] }];
      // Paint child over each ancestor background, respecting translucent fills
      // and group opacity; do not compare text to transparent black or white.
      for (let node = element; node; node = node.parentElement) {
        const style = getComputedStyle(node), opacity = Number(style.opacity);
        variants = variants.flatMap(current => backgroundChoices(style).map(background => {
          const foreground = over(current.foreground, background), composite = over(current.background, background);
          foreground[3] *= opacity; composite[3] *= opacity;
          return { foreground, background: composite };
        }));
        if (variants.length > 4096) throw new Error('Too many layered background combinations to certify contrast');
      }
      return variants.map(value => ({ foreground: over(value.foreground, [1, 1, 1, 1]), background: over(value.background, [1, 1, 1, 1]) }));
    };
    const rect = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const visible = element => { const style = getComputedStyle(element); return element.getClientRects().length && style.visibility !== 'hidden' && style.display !== 'none'; };
    const text = element => (element.textContent || '').replace(/\s+/g, ' ').trim();
    const texts = [...panel.querySelectorAll('h1,h2,h3,p,small,strong,em,button,select,header > span')].filter(visible).map(element => {
      const options = paints(element), style = getComputedStyle(element);
      const bounds = rect(element), range = document.createRange();
      range.selectNodeContents(element);
      // Native select popups/options are outside DOM text layout. The closed
      // control still has its dimensions, client/scroll sizes and contrast tested.
      const textRects = element.tagName === 'SELECT' ? [] : [...range.getClientRects()].map(r => ({ x: r.x, y: r.y, right: r.right, bottom: r.bottom }));
      const verticalClips = [];
      for (let ancestor = element; ancestor && panel.contains(ancestor); ancestor = ancestor.parentElement) {
        const overflow = getComputedStyle(ancestor).overflowY;
        if (['hidden', 'clip', 'auto', 'scroll'].includes(overflow) || (ancestor === element && element.tagName === 'BUTTON')) verticalClips.push(rect(ancestor));
      }
      // Font ascenders may extend beyond an overflow-visible line box. They
      // are clipped only by an actual clipping ancestor (or control boundary).
      const textFits = element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1
        && textRects.every(r => r.x >= bounds.x - 1.5 && r.right <= bounds.right + 1.5
          && verticalClips.every(clip => r.y >= clip.y - 1.5 && r.bottom <= clip.bottom + 1.5));
      return { tag: element.tagName, text: element.tagName === 'SELECT' ? element.selectedOptions[0]?.textContent : text(element), color: style.color, background: style.backgroundColor, image: style.backgroundImage, minimumContrast: Math.min(...options.map(value => contrast(value.foreground, value.background))), rect: bounds, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, textRects, verticalClips, textFits };
    });
    const surfaces = [panel, ...panel.querySelectorAll('.cc-meteo-airports article')].map(element => {
      const values = paints(element).map(value => luminance(value.background));
      return { tag: element.tagName, className: element.className, color: getComputedStyle(element).backgroundColor, image: getComputedStyle(element).backgroundImage, minimumLuminance: Math.min(...values), maximumLuminance: Math.max(...values) };
    });
    const nav = panel.querySelector('nav');
    const tabs = [...nav.querySelectorAll('button')].map(element => {
      const range = document.createRange(); range.selectNodeContents(element);
      const label = range.getBoundingClientRect(), button = element.getBoundingClientRect(), parent = nav.getBoundingClientRect();
      return { text: text(element), rect: rect(element), label: { x: label.x, y: label.y, right: label.right, bottom: label.bottom }, contained: button.left >= parent.left - 1 && button.right <= parent.right + 1 && label.left >= button.left - 1 && label.right <= button.right + 1 && label.top >= button.top - 1 && label.bottom <= button.bottom + 1 && element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1 };
    });
    const controls = [...panel.querySelectorAll('button,select')].filter(visible).map(element => ({ text: element.getAttribute('aria-label') || text(element), clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, ...rect(element) }));
    const rules = [];
    const scanRules = list => { for (const rule of list) { if (rule.cssRules) scanRules(rule.cssRules); if (rule.selectorText && /html\s+body\s+\.cz-app\[data-version\]\s+\.cc-meteo-follow(?:\s*,|$)/.test(rule.selectorText) && /var\(--cc-review-surface\s*[,)]/.test(rule.style?.getPropertyValue('background') || rule.style?.getPropertyValue('background-color') || '')) rules.push(rule.cssText); } };
    for (const sheet of document.styleSheets) {
      try { scanRules(sheet.cssRules); } catch (error) {
        if (error.name !== 'SecurityError' || !publicFontStylesheets.includes(sheet.href)) throw error;
      }
    }
    const probe = document.createElement('i');
    probe.style.cssText = 'display:none;background:var(--cc-review-surface,var(--cc-surface));';
    panel.appendChild(probe);
    const expectedSurface = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return { effective, session: window.weatherThemeSession, preference: window.readWeatherTheme(), texts, surfaces, tabs, controls, panel: rect(panel), nav: rect(nav), navOverflow: nav.scrollWidth > nav.clientWidth + 1, pageOverflow: document.documentElement.scrollWidth > innerWidth + 1, expectedSurface, actualSurface: getComputedStyle(panel).backgroundColor, panelImage: getComputedStyle(panel).backgroundImage, overrideRules: rules, selectedHours: [...panel.querySelectorAll('select')].map(element => element.value), favoriteStorage: localStorage.getItem('crewcheck_meteo_favorites_v1'), followStorage: localStorage.getItem('crewcheck_meteo_follow_v1') };
  }, { effective, publicFontStylesheets });
  const searchMetrics = await inspectSearch(page, name);
  const issues = [];
  const check = (condition, message) => { if (!condition) issues.push(message); };
  assert.equal(metrics.session, session, `${name}: theme changes must retain the same document/session`);
  assert.deepEqual(metrics.selectedHours, empty ? [] : ['24', '3'], `${name}: local selection survives theme changes`);
  assert.equal(JSON.parse(metrics.favoriteStorage).length, favoriteCount, `${name}: theme changes retain local favorites`);
  assert.equal(metrics.texts.filter(item => item.tag === 'EM').length, empty ? 0 : 1, 'Seeded active-status text is covered without starting a follow');
  if (empty) assert.ok(metrics.texts.some(item => item.text === 'Importe uma escala para carregar origem e destino automaticamente.'), 'Actual no-event empty state is rendered');
  assert.ok(metrics.texts.some(item => item.tag === 'H2') && metrics.texts.some(item => item.tag === 'P') && metrics.texts.some(item => item.tag === 'SMALL') && metrics.texts.some(item => item.tag === 'SPAN' && item.text === 'Premium'), 'Heading, paragraph, small text and Premium badge are measured');
  const premiumBadge = metrics.texts.find(item => item.tag === 'SPAN' && item.text === 'Premium');
  check(premiumBadge?.textRects.length === 1, 'Premium badge must remain one unbroken word');
  for (const item of metrics.texts) {
    check(item.minimumContrast >= 4.5, `contrast ${item.minimumContrast.toFixed(2)} < 4.5: ${item.tag} ${item.text}`);
    check(item.textFits, `Clipped text: ${item.tag} ${item.text}`);
  }
  for (const surface of metrics.surfaces) check(effective === 'light' ? surface.minimumLuminance >= 0.65 : surface.maximumLuminance <= 0.18, `mixed ${effective} surface: ${surface.className} luminance ${surface.minimumLuminance.toFixed(3)}–${surface.maximumLuminance.toFixed(3)}`);
  check(metrics.panelImage === 'none', 'Panel still has a fixed gradient background');
  check(metrics.actualSurface === metrics.expectedSurface, `Panel background ${metrics.actualSurface} does not match theme token ${metrics.expectedSurface}`);
  if (!baseline) check(metrics.overrideRules.length > 0, 'Scoped candidate theme override missing from runtime CSSOM');
  check(!metrics.pageOverflow && !metrics.navOverflow, 'Horizontal page/tab overflow');
  check(metrics.panel.x >= -1 && metrics.panel.right <= page.viewportSize().width + 1, 'Panel extends beyond viewport');
  assert.deepEqual(metrics.tabs.map(item => item.text), ['Pela escala', `Favoritos (${favoriteCount})`, 'Pesquisar']);
  for (const tab of metrics.tabs) check(tab.contained, `Clipped tab: ${tab.text}`);
  for (const control of metrics.controls) {
    check(control.height >= 43.5 && control.width >= 43.5, `Touch target below 44px: ${control.text} (${control.width.toFixed(1)}×${control.height.toFixed(1)})`);
    check(control.x >= metrics.panel.x - 1 && control.right <= metrics.panel.right + 1, `Control outside panel: ${control.text}`);
  }
  await page.locator('.cc-weather-search').screenshot({path:path.join(output, `${name}-search.png`),animations:'disabled'});
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled', fullPage: true });
  await page.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight));
  await settle(page);
  const lastAction = empty ? page.locator('.cc-meteo-follow nav').getByRole('button', { name: 'Pesquisar', exact: true }) : page.locator('.cc-meteo-airports article').last().getByRole('button', { name: 'Seguir METAR/TAF', exact: true });
  const last = await lastAction.boundingBox(), bottomNav = await page.locator('body > nav.cz-bottom-nav').boundingBox();
  const scroll = await page.evaluate(() => ({ y: scrollY, height: innerHeight, reserved: getComputedStyle(document.documentElement).getPropertyValue('--cc-operational-nav-clearance') }));
  check(Boolean(last && bottomNav && last.y >= 0 && last.y + last.height <= bottomNav.y - 4 && last.y + last.height <= scroll.height), 'Last follow control cannot scroll clear of actual fixed bottom navigation');
  metrics.footer = { lastAction: last, bottomNav, scroll };
  if (scroll.y > 0 || issues.length) await page.screenshot({ path: path.join(output, `${name}-scrolled.png`), animations: 'disabled' });
  fs.writeFileSync(path.join(output, `${name}-metrics.json`), JSON.stringify({ ...metrics, searchMetrics, issues }, null, 2));
  if (issues.length) fs.writeFileSync(path.join(output, `${name}.html`), await page.content());
  results.push({ name, preference, effective, favoriteCount, empty: Boolean(empty), minimumContrast: Math.min(...metrics.texts.map(item => item.minimumContrast)), issues, metricsFile: `${name}-metrics.json` });
  failures.push(...issues.map(issue => `${name}: ${issue}`));
}

let executionError;
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  for (const engine of ['chromium', 'webkit']) {
    const browser = await engines[engine].launch({ headless: true });
    try {
      for (const viewport of viewports) for (const favoriteCount of viewport.empty ? [0] : [0, 20]) {
        const name = `${engine}-${viewport.width}x${viewport.height}-favorites-${favoriteCount}${viewport.textScale ? '-text-200' : ''}${viewport.empty ? '-empty' : ''}`;
        const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.width <= 430, hasTouch: viewport.width <= 768, colorScheme: 'dark', reducedMotion: 'reduce', serviceWorkers: 'block' });
        const pageErrors = [], forbiddenRequests = [], publicFontRequests = [];
        const declaredFontUrls = new Set();
        let page;
        try {
          await context.addInitScript(({ favoriteCount }) => {
            localStorage.setItem('crewcheck:appearance:v1', 'light');
            localStorage.setItem('crewcheck_theme_mode', 'light');
            // Count-20 is a label-width fixture. Repeated AAA/BBB deliberately
            // avoid introducing real airports; only count-0 exercises toggling.
            localStorage.setItem('crewcheck_meteo_favorites_v1', JSON.stringify(Array.from({ length: favoriteCount }, (_, index) => index % 2 ? 'BBB' : 'AAA')));
            // Read-only prior-state fixture. Never start a notification follow.
            localStorage.setItem('crewcheck_meteo_follow_v1', JSON.stringify({ AAA: Date.now() + 86400000 }));
            window.weatherThemeNotificationAttempts = [];
            if ('Notification' in window) {
              const Original = window.Notification;
              window.Notification = new Proxy(Original, {
                construct() { window.weatherThemeNotificationAttempts.push('construct'); throw new Error('Notifications forbidden in theme regression'); },
                get(target, property) {
                  if (property === 'requestPermission') return () => { window.weatherThemeNotificationAttempts.push('requestPermission'); return Promise.reject(new Error('Notification permission forbidden in theme regression')); };
                  return Reflect.get(target, property);
                },
              });
            }
            if ('serviceWorker' in navigator && 'ServiceWorkerRegistration' in window) {
              ServiceWorkerRegistration.prototype.showNotification = async () => { window.weatherThemeNotificationAttempts.push('showNotification'); throw new Error('Notifications forbidden in theme regression'); };
            }
          }, { favoriteCount });
          await context.route('**/*', async route => {
            const request = route.request(), url = new URL(request.url());
            if (request.method() === 'GET' && publicFontStylesheets.includes(url.href)) {
              publicFontRequests.push(url.href);
              const response = await route.fetch({ maxRedirects: 0 });
              assert.equal(response.url(), url.href, 'The approved Inter stylesheet must not redirect');
              assert.ok(response.ok(), 'The approved Inter stylesheet must load successfully');
              const css = await response.text();
              // Google may serve Inter via /s/inter/... or /l/font?... . Allow
              // only the exact URLs declared by this existing Inter stylesheet,
              // never an arbitrary gstatic request or an unrelated font family.
              for (const match of css.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g)) {
                const font = new URL(match[1], url.href);
                assert.equal(font.origin, 'https://fonts.gstatic.com', 'Only official font assets are allowed');
                assert.ok(!font.username && !font.password && !font.hash, 'Font assets must not include credentials or fragments');
                assert.ok(/^\/s\/inter\/v\d+\/[A-Za-z0-9_-]+\.woff2$/.test(font.pathname) || font.pathname === '/l/font', 'Only Inter font asset endpoints are allowed');
                declaredFontUrls.add(font.href);
              }
              assert.ok(declaredFontUrls.size, 'Require actual font assets in the Inter stylesheet');
              return route.fulfill({ response, body: css });
            }
            if (request.method() === 'GET' && declaredFontUrls.has(url.href)) { publicFontRequests.push(url.href); return route.continue(); }
            if (url.origin !== origin || url.pathname.startsWith('/api/') || request.method() !== 'GET') {
              forbiddenRequests.push({ url: request.url(), method: request.method() });
              return route.abort('blockedbyclient');
            }
            return route.continue();
          });
          page = await context.newPage();
          page.on('pageerror', error => pageErrors.push(error.message));
          await page.goto(origin + (viewport.empty ? '/?empty=1' : '/'));
          await page.getByRole('heading', { name: 'Pela escala e favoritos', exact: true }).waitFor({ timeout: 15000 });
          if (viewport.textScale) await page.evaluate(scale => {
            // Measure all sizes before applying any change, so nested text is
            // exactly doubled rather than repeatedly inheriting a multiplier.
            // This also grows the real header/footer and exercises their layout.
            const sizes = [...document.querySelectorAll('body,body *')].filter(element => element instanceof HTMLElement && !['SCRIPT', 'STYLE'].includes(element.tagName)).map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
            for (const [element, size] of sizes) if (Number.isFinite(size)) element.style.setProperty('font-size', `${size * scale}px`, 'important');
          }, viewport.textScale);
          const loadedFonts = await page.evaluate(async () => {
            await document.fonts.load('400 16px Inter');
            await document.fonts.ready;
            return [...document.fonts].filter(face => face.family.replace(/["']/g, '') === 'Inter' && face.status === 'loaded').map(face => ({family:face.family,weight:face.weight,status:face.status}));
          });
          assert.ok(loadedFonts.length, `${name}: require the actual loaded Inter FontFace, not an implicit fallback`);
          const session = await page.evaluate(() => window.weatherThemeSession);
          const initialFollow = await page.evaluate(() => localStorage.getItem('crewcheck_meteo_follow_v1'));
          if (!viewport.empty) await page.getByRole('combobox', { name: 'Tempo para seguir AAA', exact: true }).selectOption('24');
          await inspect(page, `${name}-light`, 'light', 'light', favoriteCount, session, viewport.empty);
          // Explicit choice must win over the opposite operating-system theme.
          await page.emulateMedia({ colorScheme: 'light' });
          await page.evaluate(() => window.applyWeatherTheme('dark'));
          await inspect(page, `${name}-dark`, 'dark', 'dark', favoriteCount, session, viewport.empty);
          await page.evaluate(() => window.applyWeatherTheme('light'));
          await inspect(page, `${name}-light-return`, 'light', 'light', favoriteCount, session, viewport.empty);
          await page.evaluate(() => window.applyWeatherTheme('system'));
          await inspect(page, `${name}-system-light`, 'system', 'light', favoriteCount, session, viewport.empty);
          await page.emulateMedia({ colorScheme: 'dark' });
          await inspect(page, `${name}-system-dark`, 'system', 'dark', favoriteCount, session, viewport.empty);
          await page.emulateMedia({ colorScheme: 'light' });
          await inspect(page, `${name}-system-light-return`, 'system', 'light', favoriteCount, session, viewport.empty);
          const searchInput = page.locator('.cc-weather-search input');
          const searchButton = page.locator('.cc-weather-search button[type="submit"]');
          await searchInput.focus();
          await page.keyboard.press('Tab');
          assert.ok(await searchButton.evaluate(button=>document.activeElement===button), `${name}: search submit is keyboard reachable`);
          await inspectSearch(page,name,'focused');
          await searchInput.fill('ccc;ddd');
          await searchButton.click();
          await page.waitForFunction(()=>window.weatherSearchState?.activeQuery==='CCC, DDD');
          assert.equal(await searchInput.inputValue(),'CCC, DDD','Actual submit handler normalizes the query');
          await searchButton.click();
          assert.equal(await page.evaluate(()=>window.weatherSearchState.activeQuery),'CCC, DDD','Repeated submit retains query');
          await page.evaluate(()=>window.weatherSearchSetLoading(true));
          await page.waitForFunction(()=>document.querySelector('.cc-weather-search button[type="submit"]')?.textContent==='Consultando…');
          assert.ok(await searchButton.isDisabled(),'Actual loading state disables submit');
          await inspectSearch(page,name,'loading');
          await page.evaluate(()=>window.weatherSearchSetLoading(false));
          await page.waitForFunction(()=>document.querySelector('.cc-weather-search button[type="submit"]')?.textContent==='Pesquisar');
          await searchButton.scrollIntoViewIfNeeded();
          const searchBox=await searchButton.boundingBox();
          await page.mouse.move(searchBox.x+searchBox.width/2,searchBox.y+searchBox.height/2);
          await page.mouse.down();
          await inspectSearch(page,name,'pressed');
          await page.mouse.up();
          await searchInput.fill('eee');
          await searchInput.press('Enter');
          await page.waitForFunction(()=>window.weatherSearchState?.activeQuery==='EEE');
          assert.equal(await searchInput.inputValue(),'EEE','Enter submits the actual form');
          if (favoriteCount === 0 && !viewport.empty) {
            const first = page.locator('.cc-meteo-airports article').first();
            await first.getByRole('button', { name: '☆ Favoritar', exact: true }).click();
            await page.getByRole('button', { name: 'Favoritos (1)', exact: true }).waitFor();
            assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('crewcheck_meteo_favorites_v1'))), ['AAA']);
            await first.getByRole('button', { name: '★ Favoritado', exact: true }).click();
            await page.getByRole('button', { name: 'Favoritos (0)', exact: true }).waitFor();
            assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('crewcheck_meteo_favorites_v1'))), []);
            assert.equal(await first.getByRole('combobox').inputValue(), '24', 'Favorite changes retain the local duration selection');
            interactions.push({ name, checks: ['favorite added and removed', 'favorites persisted locally', 'duration selected without following'] });
          }
          const sideEffects = await page.evaluate(() => ({ follow: localStorage.getItem('crewcheck_meteo_follow_v1'), events: window.weatherThemeFollowEvents, notifications: window.weatherThemeNotificationAttempts, toasts: window.weatherThemeToasts }));
          assert.equal(sideEffects.follow, initialFollow, `${name}: no follow state mutation`);
          assert.deepEqual(sideEffects.events, [], `${name}: no follow activation event`);
          assert.deepEqual(sideEffects.notifications, [], `${name}: no notification or permission attempt`);
          assert.deepEqual(sideEffects.toasts, [], `${name}: no follow/plan-limit toast`);
          assert.deepEqual(forbiddenRequests, [], `${name}: no non-font external request or API access`);
          assert.deepEqual(pageErrors, [], `${name}: no browser exception`);
          safety.push({ name, forbiddenRequests, publicFontRequests, loadedFonts, pageErrors, followUnchanged: true, followEvents: sideEffects.events, notificationAttempts: sideEffects.notifications });
        } catch (error) {
          safety.push({ name, forbiddenRequests, publicFontRequests, pageErrors, aborted: true });
          if (page) {
            await page.screenshot({ path: path.join(output, `${name}-error.png`), animations: 'disabled' }).catch(() => {});
            fs.writeFileSync(path.join(output, `${name}-error.html`), await page.content().catch(() => 'Page content unavailable'));
          }
          throw error;
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
  assert.equal(results.length, expectedCases, 'Complete Chromium/WebKit, viewport, favorite count, theme-transition matrix');
  assert.equal(interactions.length, 2 * viewports.filter(viewport => !viewport.empty).length, 'Favorite add/remove exercised in both engines at every populated viewport');
  if (baseline) assert.ok(failures.some(failure => /contrast |mixed .* surface|Clipped tab|Horizontal page\/tab overflow|Search submit is not centered|Search input and submit do not share a center/.test(failure)), 'Baseline must reproduce a real visual regression, not just lack the new CSS rule');
  else assert.deepEqual(failures, [], 'Production weather theme/layout regression');
} catch (error) {
  executionError = error.stack || String(error);
  throw error;
} finally {
  let commit;
  try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { commit = 'unavailable'; }
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({
    mode: baseline ? 'baseline-negative-control' : 'production-candidate', commit,
    status: executionError ? 'failed' : baseline ? 'expected-regression-observed' : 'passed',
    executionError, expectedCases, completedCases: results.length,
    scope: 'Actual prepared MeteoFollowPanel/crewcheckPlanExperience/storage/Brand/BottomNav, actual themeRuntime and full linked Vite CSS. Synthetic premium account, AAA/BBB event, prior active status, and local-only favorites. Count-20 repeats synthetic codes solely to test the tab label. Includes 320px with all rendered computed font sizes doubled, and no-event empty state. No follow activation, backend or notification delivery. Only the exact existing Google Fonts Inter stylesheet and the official gstatic font URLs it declares may be read externally; font reads are recorded. CSS gradient contrast uses conservative stop/intermediate samples; candidate panel must use a solid theme surface. The actual prepared WeatherView search form, query/loading state and submit handler are rendered in the existing weather console wrapper before the follow panel, with a synthetic event and controlled loading; WeatherView fetch effects are intentionally omitted. Search geometry is measured in every theme plus keyboard focus, press and loading states; click, repeat and Enter use its real submit handler. Physical devices, nonzero safe-area insets and full-page WeatherView/API integration are not claimed.',
    preparedComponentsSha256: createHash('sha256').update(componentSource).digest('hex'),
    stylesheetAssets: cssFiles.map(file => ({ path: path.relative(dist, file), sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex') })),
    results, interactions, safety, failures,
  }, null, 2));
  if (server.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
console.log(baseline ? `EXPECTED REGRESSION: ${failures.length} visual failures recorded across ${results.length} baseline cases` : `PASS: ${results.length} prepared weather theme/layout cases, local interactions and no notification/API side effects`);
