const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const { build } = require('esbuild');
const { samplePulseTouchTarget, meetsPulseTouchMinimum } = require('./lib/pulse-touch-target-sample.cjs');

// Focused, synthetic UI fixture, not a substitute for the full-app menu/header
// and long-Pulse gates. Actual prepared components/runtime + shipping Vite CSS.
// --bundle-only NEVER launches a browser and is not browser acceptance.
const bundleOnly = process.argv.includes('--bundle-only');
assert.ok(process.argv.slice(2).every(arg => arg === '--bundle-only'));
const output = path.resolve(process.env.PULSE_TOUCH_ARTIFACTS || 'artifacts/pulse-touch-targets');
fs.mkdirSync(output, { recursive: true });
const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const TITLE = 'Aviso sintético: confira todos os detalhes da programação antes de continuar';
const TAIL = 'FIM DO AVISO SINTÉTICO.';
const DETAIL = ('Texto longo sintético para leitura integral, com detalhes operacionais sem qualquer dado real. ').repeat(40) + TAIL;
const selectors = { dismiss: '.cc-pulse-popover .cc-pulse-dismiss', collapse: '.cc-pulse-popover .cc-pulse-collapse', trigger: '.cc-pulse-compact-details-trigger' };
const sampleFile = path.join(output, 'original-touch-samples.jsonl');
fs.writeFileSync(sampleFile, '');

// Only these actual UI declarations are extracted. No Home effects, weather
// producer, provider adapter, financial screen or account/network hook runs.
const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const ast = ts.createSourceFile('Home.tsx', home, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['Brand', 'BottomNav', 'CrewCheckMark'];
const declarations = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text));
for (const name of names) assert.equal(declarations.filter(node => node.name?.text === name).length, 1, `Prepared ${name}`);
assert.ok(home.includes('data-ipad-layout-v14394'), 'Run the complete canonical preparation first');
const components = declarations.map(node => node.getText(ast)).join('\n');
assert.match(components, /createPortal\(/, 'Use actual body-portaled BottomNav');
assert.match(components, /data-header-navigation/);
assert.match(components, /data-crewcheck-menu-trigger/);
const icons = ast.statements.filter(node => ts.isImportDeclaration(node) && node.moduleSpecifier.text === 'lucide-react').map(node => node.getText(ast)).join('\n');
const rootProps = { className: 'cz-app', 'data-view': 'cockpit', 'data-menu-open': 'false' };
function collect(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'DEFAULT_VERSION' && node.initializer && ts.isStringLiteral(node.initializer)) rootProps['data-version'] = node.initializer.text;
  if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.attributes.properties.some(attr => ts.isJsxAttribute(attr) && attr.name.text === 'data-ipad-layout-v14394')) {
    for (const attr of node.attributes.properties) if (ts.isJsxAttribute(attr) && attr.name.text.startsWith('data-') && attr.initializer && ts.isStringLiteral(attr.initializer)) rootProps[attr.name.text] = attr.initializer.text;
  }
  ts.forEachChild(node, collect);
}
collect(ast);
rootProps['data-menu-open'] = 'false';
assert.ok(rootProps['data-version']);
const entry = `
import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createPortal} from 'react-dom';
${icons}
import {alertText} from '@/lib/alertExperienceText';
import {readAlertReviews} from '@/lib/alertReviewStore';
import {peekPendingNavigationContext} from '@/lib/navigationContext';
import CrewCheckPulse from '@/components/pulse/CrewCheckPulse';
import {publishCrewCheckPulse,clearCrewCheckPulse,currentCrewCheckPulseState} from '@/components/pulse/pulseRuntime';
import {InternalHeaderFrame} from '@/components/navigation/InternalHeaderFrame';
import {OperationalLayoutSafety} from '@/components/navigation/OperationalLayoutSafety';
import {availablePulseReturnTarget} from '@/components/navigation/headerMenuAccess';
${components}
let serial=0;
window.pulseNavigation=[];
function App(){
 const [view,setView]=useState('cockpit');
 useEffect(()=>{
  const navigate=event=>{window.pulseNavigation.push(event.detail);setView(event.detail);};
  window.addEventListener('crewcheck:set-view',navigate);
  window.pulseFixture={
   state:()=>currentCrewCheckPulseState(),reviews:()=>readAlertReviews(),
   navigation:()=>({events:window.pulseNavigation,pending:peekPendingNavigationContext()}),
   publish:(kind='long')=>{
    clearCrewCheckPulse();
    return publishCrewCheckPulse({id:'synthetic-touch-'+(++serial),scope:'synthetic-touch',
     title:${JSON.stringify(TITLE)},compactTitle:'Aviso sintético',detail:kind==='leaving'?'Aviso sintético com expiração controlada.':${JSON.stringify(DETAIL)},
     tone:'atencao',priority:'alta',category:'general',dismissible:kind!=='nondismissible',
     autoDismissMs:kind==='leaving'?60000:0,systemNotification:'never',
     action:{label:'Abrir escala sintética',view:'roster',context:{programId:'synthetic-touch-program'}}});
   },
   captureReturn:()=>{
    window.pulseExpectedReturn=availablePulseReturnTarget(document.querySelector('.cz-app'));
    const target=window.pulseExpectedReturn;
    return target?{header:target.getAttribute('data-header-navigation'),footer:target.getAttribute('data-crewcheck-menu-trigger'),label:target.getAttribute('aria-label')||target.textContent}:null;
   },
   returnedExactly:()=>Boolean(window.pulseExpectedReturn&&document.activeElement===window.pulseExpectedReturn)
  };
  requestAnimationFrame(()=>requestAnimationFrame(()=>window.pulseReady=true));
  return ()=>window.removeEventListener('crewcheck:set-view',navigate);
 },[]);
 return <><main {...${JSON.stringify(rootProps)}} data-view={view}><OperationalLayoutSafety/>
  <InternalHeaderFrame><Brand pulse global back={view!=='cockpit'}/></InternalHeaderFrame>
  <section className="cz-toolbox"><h1>Fixture sintética de acessibilidade Pulse</h1><p>Somente dados sintéticos, sem provedores, serviços de conta ou notificações.</p></section>
 </main><BottomNav view={view} setView={setView} openMenu={()=>window.pulseNavigation.push('menu')}/></>;
}
createRoot(document.getElementById('root')).render(<App/>);
`;
fs.writeFileSync(path.join(output, 'prepared-pulse-components.tsx'), components);
fs.writeFileSync(path.join(output, 'synthetic-entry.tsx'), entry);

function matrix() {
  const cases = [];
  for (const width of [320, 360, 390, 412, 430, 768, 1024, 1440]) for (const theme of ['light', 'dark']) for (const scale of [1, 1.5, 2]) cases.push({ width, height: 844, theme, scale, motion: 'no-preference' });
  for (const width of [320, 390, 1440]) for (const theme of ['light', 'dark']) for (const scale of [1, 1.5, 2]) cases.push({ width, height: 420, theme, scale, motion: 'no-preference' });
  for (const width of [320, 390, 1440]) cases.push({ width, height: 420, theme: 'dark', scale: 2, motion: 'reduce' });
  assert.equal(cases.length, 69);
  return cases;
}

async function readingProof(page, expected) {
  const proof = await page.evaluate(() => {
    const font = element => parseFloat(getComputedStyle(element).fontSize);
    const root = document.documentElement;
    return { rootFontPx: font(root), scale: Number(getComputedStyle(root).getPropertyValue('--cc-text-scale')), declared: root.dataset.crewTextSize,
      trigger: font(document.querySelector('.cc-pulse-compact-details-trigger strong')),
      details: [...document.querySelectorAll('.cc-pulse-popover-copy strong,.cc-pulse-popover-copy small')].map(font),
      family: getComputedStyle(document.querySelector('.cc-pulse-popover-copy small')).fontFamily };
  });
  assert.equal(proof.scale, expected);
  assert.equal(proof.declared, String(expected * 100));
  assert.ok(Number.isFinite(proof.rootFontPx) && proof.rootFontPx > 0);
  assert.equal(proof.trigger, proof.rootFontPx * expected, 'Actual computed title scale');
  assert.equal(proof.details.length, 2);
  for (const size of proof.details) assert.equal(size, proof.rootFontPx * expected, 'Actual computed detail scale');
  return proof;
}

async function freezeSample(locator, name, phase, samples, expected = true) {
  // FIRST observation at the normal interaction point. No animation/geometry
  // readiness call, round trip, offset fallback, rounding, epsilon or retry.
  const target = await locator.evaluate(samplePulseTouchTarget);
  const accepted = meetsPulseTouchMinimum(target);
  const original = Object.freeze({ name, phase, target: Object.freeze(target), accepted, expected });
  samples.push(original);
  fs.appendFileSync(sampleFile, JSON.stringify(original) + '\n');
  // Diagnostic reads happen only AFTER the original immutable result is saved.
  const diagnostics = await locator.evaluate(element => {
    const style = getComputedStyle(element), animations = [];
    for (let node = element; node; node = node.parentElement) for (const animation of node.getAnimations()) {
      animations.push({ ancestor: node.className, name: animation.animationName || null, currentTime: animation.currentTime,
        playState: animation.playState, progress: animation.effect?.getComputedTiming().progress, transform: getComputedStyle(node).transform });
    }
    return { cssWidth: style.width, cssHeight: style.height, boxSizing: style.boxSizing, disabled: element.matches(':disabled'),
      afterContent: getComputedStyle(element, '::after').content, afterDisplay: getComputedStyle(element, '::after').display, animations };
  });
  // A later observation cannot turn the frozen false into a pass.
  assert.equal(accepted, expected, `${name} ${phase}: original strict rendered >=44 gate: ${JSON.stringify({ original, diagnostics })}`);
  return { original, diagnostics };
}

function real48(sample) {
  assert.equal(sample.diagnostics.boxSizing, 'border-box');
  assert.equal(sample.diagnostics.cssWidth, '48px', 'Real CSS border box, not pseudo-element hit area');
  assert.equal(sample.diagnostics.cssHeight, '48px');
}

async function layoutProof(page, oneRow = false) {
  const proof = await page.locator('.cc-pulse-popover').evaluate(popover => {
    const rect = element => { const r = element.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const rail = popover.querySelector('.cc-pulse-controls'), copy = popover.querySelector('.cc-pulse-popover-copy'), action = popover.querySelector('.cc-pulse-action');
    const style = getComputedStyle(rail);
    return { popover: rect(popover), rail: rect(rail), copy: rect(copy), action: rect(action), viewportWidth: innerWidth,
      railCss: { width: style.width, rows: style.gridTemplateRows, columns: style.gridTemplateColumns, gap: style.rowGap, alignSelf: style.alignSelf },
      buttons: [...rail.querySelectorAll('button')].map(button => ({ box: rect(button), icon: rect(button.querySelector('svg')), label: button.getAttribute('aria-label') })),
      overflow: getComputedStyle(popover).overflowY, position: getComputedStyle(popover).position,
      headerPosition: getComputedStyle(document.querySelector('.cz-global-header')).position,
      bodyOverflow: getComputedStyle(document.body).overflowY };
  });
  const contains = (a, b) => b.left >= a.left && b.right <= a.right && b.top >= a.top && b.bottom <= a.bottom;
  const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  assert.equal(proof.buttons.length, oneRow ? 1 : 2);
  assert.equal(proof.railCss.width, '48px');
  assert.equal(proof.railCss.columns, '48px');
  assert.equal(proof.railCss.rows, oneRow ? '48px' : '48px 48px', 'No reserved dismiss row when non-dismissible');
  assert.equal(proof.railCss.gap, '8px');
  assert.equal(proof.rail.top, proof.copy.top, 'Long-copy rail remains top aligned');
  assert.ok(proof.copy.height > proof.rail.height, 'Actually exercise long-copy top alignment');
  assert.ok(proof.popover.left >= 0 && proof.popover.right <= proof.viewportWidth, 'No horizontal popover overflow');
  assert.equal(proof.position, 'relative');
  assert.equal(proof.headerPosition, 'relative');
  assert.equal(proof.overflow, 'visible');
  assert.ok(!['hidden', 'clip'].includes(proof.bodyOverflow), 'No page scroll lock');
  assert.ok(contains(proof.popover, proof.rail));
  for (const button of proof.buttons) {
    assert.ok(button.label);
    assert.ok(contains(proof.rail, button.box) && contains(proof.popover, button.box));
    assert.ok(!overlaps(button.box, proof.copy) && !overlaps(button.box, proof.action), 'Controls must not cover copy/action');
    assert.equal(button.icon.width, 16);
    assert.equal(button.icon.height, 16);
    assert.ok(Math.abs((button.box.left + button.box.right - button.icon.left - button.icon.right) / 2) <= 1);
    assert.ok(Math.abs((button.box.top + button.box.bottom - button.icon.top - button.icon.bottom) / 2) <= 1, 'Centered 16px pictogram');
  }
  if (!oneRow) assert.ok(!overlaps(proof.buttons[0].box, proof.buttons[1].box));
  return proof;
}

// The app sets a global smooth scroll-behavior, so returning focus to the trigger
// can leave a smooth scroll running when the popover reopens. Position and measure
// only while the page is not scrolling; this never waits for a passing geometry.
// Polled from Node so a scenario with a controlled page clock cannot stall it.
async function scrollSettled(page) {
  let last = await page.evaluate(() => scrollY), stable = 0;
  for (let read = 0; read < 100 && stable < 5; read += 1) {
    await new Promise(resolve => setTimeout(resolve, 50));
    const current = await page.evaluate(() => scrollY);
    if (current === last) stable += 1; else { last = current; stable = 0; }
  }
  assert.ok(stable >= 5, 'Page scroll settles before reachability is measured');
}

async function reachableControl(page, selector, focus = true) {
  const locator = page.locator(selector);
  // This is a separate, explicit reachability operation AFTER size-only samples.
  // Deliberately offscreen originals are never rejected for viewport hit tests.
  await scrollSettled(page);
  await locator.evaluate(element => {
    element.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = element.getBoundingClientRect(), footer = document.querySelector('body > nav.cz-bottom-nav').getBoundingClientRect();
    window.scrollBy({ top: (r.top + r.bottom) / 2 - footer.top / 2, behavior: 'instant' });
  });
  if (focus) await locator.focus();
  await scrollSettled(page);
  const proof = await locator.evaluate(element => {
    const r = element.getBoundingClientRect(), footer = document.querySelector('body > nav.cz-bottom-nav').getBoundingClientRect(), style = getComputedStyle(element);
    const points = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 1, r.top + r.height / 2], [r.right - 1, r.top + r.height / 2], [r.left + r.width / 2, r.top + 1], [r.left + r.width / 2, r.bottom - 1]];
    return { box: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, footerTop: footer.top, viewportWidth: innerWidth,
      points: points.map(([x, y]) => ({ x, y, hit: element.contains(document.elementFromPoint(x, y)) })),
      focused: document.activeElement === element, focusVisible: element.matches(':focus-visible'),
      outline: { width: parseFloat(style.outlineWidth), offset: parseFloat(style.outlineOffset), style: style.outlineStyle, color: style.outlineColor },
      enabled: !element.matches(':disabled') };
  });
  assert.ok(proof.box.left >= 0 && proof.box.right <= proof.viewportWidth && proof.box.top >= 0 && proof.box.bottom <= proof.footerTop, 'Reachable button stays above footer');
  assert.ok(proof.points.every(point => point.hit), 'Interior and near-edge hit tests must hit the actual button');
  if (focus) {
    assert.ok(proof.enabled && proof.focused && proof.focusVisible);
    assert.ok(proof.outline.width >= 2 && proof.outline.offset >= 0 && proof.outline.style !== 'none');
    assert.ok(!['transparent', 'rgba(0, 0, 0, 0)'].includes(proof.outline.color));
    const extent = proof.outline.width + proof.outline.offset;
    assert.ok(proof.box.top - extent >= 0 && proof.box.bottom + extent <= proof.footerTop, 'Focus outline is not clipped by the viewport/footer');
  }
  return proof;
}

async function fullTextProof(page) {
  assert.equal(await page.locator('.cc-pulse-popover-copy strong').innerText(), TITLE);
  assert.equal(await page.locator('.cc-pulse-popover-copy small').innerText(), DETAIL);
  const proof = await page.locator('.cc-pulse-popover-copy small').evaluate((element, tail) => {
    const range = document.createRange(); range.selectNodeContents(element);
    const box = element.getBoundingClientRect();
    const lines = [...range.getClientRects()].map(r => ({ left: r.left, right: r.right }));
    const text = element.firstChild;
    range.setStart(text, text.textContent.lastIndexOf(tail)); range.setEnd(text, text.textContent.length);
    const tailRect = range.getBoundingClientRect(), footer = document.querySelector('body > nav.cz-bottom-nav').getBoundingClientRect();
    window.scrollBy({ top: (tailRect.top + tailRect.bottom) / 2 - footer.top / 2, behavior: 'instant' });
    const tails = [...range.getClientRects()].map(r => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom }));
    const afterFooter = document.querySelector('body > nav.cz-bottom-nav').getBoundingClientRect();
    return { lines, box: { left: box.left, right: box.right }, tails, footerTop: afterFooter.top, viewportWidth: innerWidth, scrollY };
  }, TAIL);
  assert.ok(proof.lines.length > 1 && proof.lines.every(line => line.left >= proof.box.left && line.right <= proof.box.right), 'Every full-detail text line fits the copy border box');
  assert.ok(proof.tails.length && proof.tails.every(line => line.top >= 0 && line.bottom <= proof.footerTop && line.left >= 0 && line.right <= proof.viewportWidth), 'Full-text tail remains readable above the footer');
  return proof;
}

async function negativeControls(page, name, samples) {
  await page.evaluate(() => {
    const host = document.createElement('div'); host.id = 'synthetic-touch-negatives';
    host.style.cssText = 'position:fixed;left:-1000px;top:20px;width:100px;';
    for (const kind of ['positive48', 'small43', 'scaled', 'display-none', 'visibility-hidden', 'hidden-parent', 'inert-parent', 'aria-hidden-parent', 'translated48']) {
      const parent = document.createElement('div'), button = document.createElement('button');
      button.dataset.syntheticTouch = kind; button.textContent = 'Synthetic';
      button.style.cssText = 'box-sizing:border-box;display:block;visibility:visible;width:48px;height:48px;min-width:0;min-height:0;padding:0;border:0;transform:none;';
      if (kind === 'small43') { button.style.width = '43px'; button.style.height = '43px'; }
      if (kind === 'scaled') button.style.transform = 'scale(.5)';
      if (kind === 'display-none') button.style.display = 'none';
      if (kind === 'visibility-hidden') button.style.visibility = 'hidden';
      if (kind === 'hidden-parent') parent.hidden = true;
      if (kind === 'inert-parent') parent.inert = true;
      if (kind === 'aria-hidden-parent') parent.setAttribute('aria-hidden', 'true');
      parent.append(button); host.append(parent);
    }
    document.body.append(host);
  });
  const results = [];
  try {
    for (const kind of ['positive48', 'small43', 'scaled', 'display-none', 'visibility-hidden', 'hidden-parent', 'inert-parent', 'aria-hidden-parent']) {
      results.push(await freezeSample(page.locator(`[data-synthetic-touch="${kind}"]`), name, `isolated-negative/${kind}`, samples, kind === 'positive48'));
    }
    await page.locator('[data-synthetic-touch="translated48"]').evaluate(element => {
      window.syntheticTouchAnimation = element.animate([{ transform: 'translateY(2px)' }, { transform: 'translateY(0px)' }], { duration: 160, easing: 'ease-out', fill: 'both' });
      window.syntheticTouchAnimation.pause();
    });
    // Prescribed controlled samples, NOT native-frame timing and NOT retries.
    // They cannot rescue or replace a failed original live-animation sample.
    for (const milliseconds of [0, 16, 40, 80, 120, 159, 160]) {
      await page.evaluate(time => { window.syntheticTouchAnimation.currentTime = time; }, milliseconds);
      const sample = await freezeSample(page.locator('[data-synthetic-touch="translated48"]'), name, `synthetic-controlled-translation/${milliseconds}ms`, samples);
      real48(sample); results.push(sample);
    }
  } finally {
    await page.evaluate(() => { window.syntheticTouchAnimation?.cancel(); delete window.syntheticTouchAnimation; document.querySelector('#synthetic-touch-negatives')?.remove(); });
  }
  return results;
}

async function loadShippingFonts(page) {
  return page.evaluate(async () => {
    await Promise.all([document.fonts.load('400 16px Inter'), document.fonts.load('700 16px Inter')]); await document.fonts.ready;
    return [...document.fonts].filter(face => face.family.replace(/["']/g, '') === 'Inter' && face.status === 'loaded').length;
  });
}

async function leavingProof(page, name, samples, origin, requiresInter) {
  // Only this supplemental scenario uses a controlled clock. All original live
  // expansion measurements above have already been frozen under native timing.
  const at = Date.parse('2032-02-02T17:30:00Z');
  await page.clock.install({ time: at });
  // Start a fresh document with the clock installed BEFORE any of its timers.
  // Never mix the native document's existing timers with this controlled phase.
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.pulseReady === true);
  const loadedInterFaces = await loadShippingFonts(page);
  if (requiresInter) assert.ok(loadedInterFaces > 0, 'Controlled scenario also uses shipping Inter');
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  assert.equal(await page.evaluate(() => window.pulseFixture.publish('leaving')), true);
  await page.locator(selectors.trigger).focus(); await page.keyboard.press('Enter');
  await page.locator(selectors.dismiss).waitFor({ state: 'attached' });
  await page.clock.fastForward(60_000);
  const disabled = page.locator(`${selectors.dismiss}:disabled`);
  await disabled.waitFor({ state: 'attached' });
  assert.equal(await page.evaluate(() => window.pulseFixture.state().leaving), true);
  const sample = await freezeSample(disabled, name, 'synthetic-controlled-runtime-expiry/disabled-leaving', samples);
  real48(sample); assert.equal(sample.diagnostics.disabled, true);
  const reachable = await reachableControl(page, selectors.dismiss, false);
  const before = await page.evaluate(() => ({ state: window.pulseFixture.state(), reviews: window.pulseFixture.reviews(), nav: window.pulseFixture.navigation() }));
  // Ordinary pointer input at the real disabled button, never force:true and
  // never removing disabled. Browser-native suppression must prevent action.
  await page.mouse.click((reachable.box.left + reachable.box.right) / 2, (reachable.box.top + reachable.box.bottom) / 2);
  await disabled.focus();
  assert.equal(await disabled.evaluate(element => document.activeElement === element), false, 'Disabled button cannot receive keyboard focus');
  const after = await page.evaluate(() => ({ state: window.pulseFixture.state(), reviews: window.pulseFixture.reviews(), nav: window.pulseFixture.navigation() }));
  assert.deepEqual(after, before, 'Disabled click must not dismiss, review, navigate or advance the message');
  await page.clock.fastForward(180);
  await page.locator('.cc-pulse-compact').waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => window.pulseFixture.state().message), null);
  assert.deepEqual(await page.evaluate(() => window.pulseFixture.reviews()), before.reviews, 'Automatic expiry is not acknowledgement');
  return { timing: 'synthetic-controlled-runtime-timers/fresh-document', loadedInterFaces, sample, reachable, before, after };
}

async function main() {
  const bundle = await build({ metafile: true, stdin: { contents: entry, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, platform: 'browser', format: 'esm', jsx: 'automatic',
    nodePaths: (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean), tsconfig: 'tsconfig.json', outfile: path.join(output, 'harness.js'), loader: { '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"test"', 'import.meta.env': JSON.stringify({ DEV: false, PROD: true, MODE: 'test', BASE_URL: '/' }) } });
  const inputs = Object.keys(bundle.metafile.inputs);
  for (const required of ['components/pulse/CrewCheckPulse.tsx', 'components/pulse/pulseRuntime.ts', 'components/pulse/pulseSession.ts', 'components/navigation/InternalHeaderFrame.tsx', 'components/navigation/OperationalLayoutSafety.tsx', 'components/navigation/headerMenuAccess.ts']) assert.ok(inputs.some(file => file.endsWith(required)), required);
  assert.ok(!inputs.some(file => /operationalWeather|weatherLanding|pages\/Home\.tsx/.test(file)), 'No Home/provider/weather runtime imported');
  const artifact = { syntheticOnly: true, preparedHomeSha256: sha('client/src/pages/Home.tsx'), harnessSha256: sha(__filename),
    sharedSamplerSha256: sha(path.join(__dirname, 'lib/pulse-touch-target-sample.cjs')),
    sourceSha256: Object.fromEntries(inputs.filter(file => !file.includes('node_modules') && !file.startsWith('..') && fs.existsSync(file)).map(file => [file, sha(file)])),
    matrix: { normalHeight: 96, shortHeight: 36, reducedMotion: 6, total: 138 }, browserRun: false };
  try { artifact.commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { artifact.commit = null; }
  fs.writeFileSync(path.join(output, 'bundle-manifest.json'), JSON.stringify(artifact, null, 2));
  if (bundleOnly) { console.log('Prepared Pulse touch-target bundle compiled; browser NOT run.'); return; }
  const dist = path.resolve('dist'), index = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const styles = [...index.matchAll(/<link\b[^>]*>/gi)].map(match => match[0]).filter(tag => /\brel=["']stylesheet["']/i.test(tag));
  const publicFontStylesheets = [], cssFiles = [];
  for (const tag of styles) {
    const href = tag.match(/\bhref=["']([^"']+)/)?.[1]?.replaceAll('&amp;', '&'); assert.ok(href);
    if (/^(?:https?:)?\/\//.test(href)) {
      const url = new URL(href);
      assert.equal(url.origin, 'https://fonts.googleapis.com'); assert.equal(url.pathname, '/css2');
      assert.equal(url.searchParams.get('family'), 'Inter:wght@400;500;600;700;800;900');
      assert.equal(url.searchParams.get('display'), 'swap'); assert.deepEqual([...url.searchParams.keys()].sort(), ['display', 'family']);
      publicFontStylesheets.push(url.href);
    } else {
      assert.ok(href.startsWith('/assets/') && href.endsWith('.css'));
      cssFiles.push(path.join(dist, href));
    }
  }
  assert.ok(cssFiles.length, 'Actual shipping Vite-built CSS is mandatory');
  artifact.shippingCssSha256 = Object.fromEntries(cssFiles.map(file => [path.relative(dist, file), sha(file)]));
  artifact.shippingIndexSha256 = sha(path.join(dist, 'index.html'));
  fs.writeFileSync(path.join(output, 'index.html'), `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">${styles.join('\n')}</head><body><div id="root"></div><script type="module" src="/harness.js"></script></body></html>`);
  fs.cpSync(path.join(dist, 'assets'), path.join(output, 'assets'), { recursive: true });
  if (fs.existsSync(path.join(dist, 'icons'))) fs.cpSync(path.join(dist, 'icons'), path.join(output, 'icons'), { recursive: true });
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
  const localAllowed = pathname => pathname === '/' || pathname === '/harness.js' || pathname.startsWith('/assets/') || pathname.startsWith('/icons/');
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url || '/', 'http://localhost').pathname, file = path.resolve(output, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (request.method !== 'GET' || !localAllowed(pathname) || !file.startsWith(output + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const engines = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || __filename)('playwright');
  const results = [], started = Date.now(); let browser;
  try {
    for (const engine of ['chromium', 'webkit']) {
      browser = await engines[engine].launch({ headless: true });
      let negativeNormal = false, negativeReduced = false;
      for (const viewport of matrix()) {
        const name = `${engine}-${viewport.width}x${viewport.height}-${viewport.theme}-${viewport.scale * 100}-${viewport.motion}`;
        const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, colorScheme: viewport.theme, reducedMotion: viewport.motion,
          timezoneId: 'America/Sao_Paulo', locale: 'pt-BR', isMobile: viewport.width <= 430, hasTouch: viewport.width <= 768, serviceWorkers: 'block' });
        context.setDefaultTimeout(10_000);
        const page = await context.newPage(), errors = [], forbidden = [], publicFontRequests = [], declaredFontUrls = new Set(), samples = [];
        const result = { name, engine, viewport, samples, errors, forbidden, publicFontRequests, passed: false };
        await page.addInitScript(({ theme, scale }) => {
          window.pulseSideEffects = { notifications: 0, permissions: 0, geolocation: 0, audio: 0, native: 0 };
          class SyntheticNotification { static permission = 'denied'; static requestPermission() { window.pulseSideEffects.permissions++; return Promise.resolve('denied'); } constructor() { window.pulseSideEffects.notifications++; } }
          window.Notification = SyntheticNotification;
          Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition() { window.pulseSideEffects.geolocation++; }, watchPosition() { window.pulseSideEffects.geolocation++; return 0; }, clearWatch() {} } });
          const audio = function () { window.pulseSideEffects.audio++; throw new Error('Synthetic fixture forbids audio'); };
          window.Audio = audio; window.AudioContext = audio; window.webkitAudioContext = audio;
          const native = { notify() { window.pulseSideEffects.native++; return false; }, requestNotifications() { window.pulseSideEffects.native++; }, permissionStatus() { window.pulseSideEffects.native++; return '{"notifications":false}'; } };
          window.CrewCheckNative = native; window.AndroidCrewCheckNative = native; window.CrewCheckPremium = native;
          localStorage.setItem('crewcheck_auth_token', 'synthetic-touch-token'); localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'synthetic-touch-owner' }));
          localStorage.setItem('crewcheck_device_notifications', '0');
          localStorage.setItem('crewcheck:notification-preferences:v1:synthetic-touch-owner', JSON.stringify({ ownerId: 'synthetic-touch-owner', revision: 1, preferences: { settings: { crewcheck_pulse_enabled: true } } }));
          document.addEventListener('DOMContentLoaded', () => {
            document.documentElement.dataset.crewTextSize = String(scale * 100); document.documentElement.style.setProperty('--cc-text-scale', String(scale));
            document.documentElement.classList.toggle('dark', theme === 'dark'); document.documentElement.dataset.crewTheme = theme;
          });
        }, viewport);
        page.on('pageerror', error => errors.push(String(error)));
        await page.route('**/*', async route => {
          const request = route.request(), url = new URL(request.url());
          // Only the existing shipping public Inter allowlist may leave localhost.
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
          if (url.origin === origin && request.method() === 'GET' && localAllowed(url.pathname)) { await route.continue(); return; }
          forbidden.push({ method: request.method(), origin: url.origin, path: url.pathname }); await route.abort();
        });
        try {
          await page.goto(origin, { waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.pulseReady === true);
          result.loadedInterFaces = await loadShippingFonts(page);
          if (publicFontStylesheets.length) assert.ok(result.loadedInterFaces > 0, 'No fallback-font geometry');
          assert.equal(await page.evaluate(() => window.pulseFixture.publish()), true);
          await page.locator(selectors.trigger).focus(); await page.keyboard.press('Enter');
          // Do not insert a wait, geometry inspection or animation observation here.
          result.liveDismiss = await freezeSample(page.locator(selectors.dismiss), name, 'original-native-expansion/dismiss', samples);
          real48(result.liveDismiss);
          assert.ok(result.liveDismiss.diagnostics.afterContent === 'none' || result.liveDismiss.diagnostics.afterDisplay === 'none', 'Compact dismiss must not retain negative-inset pseudo hit area');
          result.liveCollapse = await freezeSample(page.locator(selectors.collapse), name, 'original-native-expansion/collapse', samples);
          real48(result.liveCollapse);
          result.font = await readingProof(page, viewport.scale);
          // A fixed post-original observation phase, not a wait-for-passing-size.
          // Native originals above remain immutable if any later check succeeds.
          await page.waitForTimeout(200);
          result.layout = await layoutProof(page);
          result.motion = await page.locator('.cc-pulse-popover').evaluate(element => {
            const style = getComputedStyle(element), beat = getComputedStyle(document.querySelector('.cc-pulse-brand-mark>i'));
            return { name: style.animationName, duration: style.animationDuration, beat: { name: beat.animationName, duration: beat.animationDuration, iterations: beat.animationIterationCount } };
          });
          assert.equal(result.motion.name, viewport.motion === 'reduce' ? 'none' : 'cc-pulse-detail-enter');
          assert.equal(result.motion.beat.name, viewport.motion === 'reduce' ? 'none' : 'cc-pulse-soft-beat');
          if (viewport.motion !== 'reduce') assert.equal(result.motion.duration, '0.16s');
          if (viewport.motion !== 'reduce') { assert.equal(result.motion.beat.duration, '2.4s'); assert.equal(result.motion.beat.iterations, '2'); }
          result.collapseReachable = await reachableControl(page, selectors.collapse);
          result.dismissReachable = await reachableControl(page, selectors.dismiss);
          await page.screenshot({ path: path.join(output, `${name}-controls.png`) });
          result.fullText = await fullTextProof(page);
          await page.screenshot({ path: path.join(output, `${name}-tail.png`) });
          await page.locator('.cc-pulse-popover-copy').focus(); await page.keyboard.press('Escape');
          await page.locator('.cc-pulse-popover').waitFor({ state: 'detached' });
          await page.waitForFunction(() => document.activeElement === document.querySelector('.cc-pulse-compact-details-trigger'));
          await page.keyboard.press('Enter'); await page.locator(selectors.collapse).waitFor({ state: 'attached' });
          await reachableControl(page, selectors.collapse); await page.keyboard.press('Enter');
          await page.locator('.cc-pulse-popover').waitFor({ state: 'detached' });
          await page.waitForFunction(() => document.activeElement === document.querySelector('.cc-pulse-compact-details-trigger'));
          await page.keyboard.press('Enter');
          await page.locator('.cc-pulse-action').focus(); await page.keyboard.press('Enter');
          await page.locator('.cz-app[data-view="roster"]').waitFor();
          result.navigation = await page.evaluate(() => window.pulseFixture.navigation());
          assert.equal(result.navigation.pending.programId, 'synthetic-touch-program');
          assert.equal(result.navigation.pending.targetView, 'roster');
          assert.ok(result.navigation.events.includes('roster'));
          assert.ok(await page.evaluate(() => window.pulseFixture.state().message), 'Action is not acknowledgement');
          await page.locator('.cz-global-header [data-header-navigation="back"]').focus(); await page.keyboard.press('Enter');
          await page.locator('.cz-app[data-view="cockpit"]').waitFor();
          await page.locator(selectors.trigger).focus(); await page.keyboard.press('Enter');
          await reachableControl(page, selectors.dismiss);
          result.expectedReturn = await page.evaluate(() => window.pulseFixture.captureReturn());
          assert.ok(result.expectedReturn, 'There is an actually reachable navigation return control');
          await page.keyboard.press('Enter');
          await page.locator('.cc-pulse-compact').waitFor({ state: 'detached' });
          assert.equal(await page.evaluate(() => window.pulseFixture.returnedExactly()), true, 'Dismiss returns to the exact reachable control selected before removal');
          assert.equal((await page.evaluate(() => window.pulseFixture.reviews())).length, 1);
          // A tap in the first frame of a newly mounted message must open it: the
          // per-message collapse cannot run after (and undo) the user's toggle. A slow
          // device (WebKit CI) lets the tap in before React's deferred effects; the
          // clock skew makes React's scheduler yield right after that commit.
          result.firstFrameTap = await page.evaluate(() => new Promise(resolve => {
            let skew = 0;
            performance.now = () => { if (!skew && document.querySelector('.cc-pulse-compact-details-trigger')) skew = 1000; return Performance.prototype.now.call(performance) + skew; };
            const finish = value => { observer.disconnect(); delete performance.now; resolve(value); };
            const observer = new MutationObserver(() => {
              const trigger = document.querySelector('.cc-pulse-compact-details-trigger');
              if (!trigger) return;
              observer.disconnect(); trigger.click();
              setTimeout(() => finish(document.querySelector('.cc-pulse-compact')?.dataset.expanded ?? null), 100);
            });
            observer.observe(document.body, { subtree: true, childList: true });
            setTimeout(() => finish('not-mounted'), 2000);
            window.pulseFixture.publish();
          }));
          assert.equal(result.firstFrameTap, 'true', 'A tap in the first frame of a new message opens its details');
          // Leave scroll and focus as the native flow below expects them.
          await page.evaluate(() => document.querySelector('.cc-pulse-popover .cc-pulse-dismiss').click());
          await page.locator('.cc-pulse-compact').waitFor({ state: 'detached' });
          assert.equal(await page.evaluate(() => window.pulseFixture.publish('nondismissible')), true);
          await page.locator(selectors.trigger).focus(); await page.keyboard.press('Enter');
          result.nonDismissible = await freezeSample(page.locator(selectors.collapse), name, 'original-native-nondismissible/collapse', samples);
          real48(result.nonDismissible);
          assert.equal(await page.locator(selectors.dismiss).count(), 0);
          await page.waitForTimeout(200);
          result.oneRow = await layoutProof(page, true);
          await reachableControl(page, selectors.collapse); await page.keyboard.press('Enter');
          await page.locator('.cc-pulse-popover').waitFor({ state: 'detached' });
          await page.waitForFunction(() => document.activeElement === document.querySelector('.cc-pulse-compact-details-trigger'));
          if ((viewport.motion === 'reduce' && !negativeReduced) || (viewport.motion !== 'reduce' && !negativeNormal)) {
            result.isolatedControls = await negativeControls(page, name, samples);
            if (viewport.motion === 'reduce') negativeReduced = true; else negativeNormal = true;
          }
          result.nativeSideEffects = await page.evaluate(() => window.pulseSideEffects);
          assert.deepEqual(result.nativeSideEffects, { notifications: 0, permissions: 0, geolocation: 0, audio: 0, native: 0 });
          result.leaving = await leavingProof(page, name, samples, origin, publicFontStylesheets.length > 0);
          result.controlledSideEffects = await page.evaluate(() => window.pulseSideEffects);
          assert.deepEqual(result.controlledSideEffects, { notifications: 0, permissions: 0, geolocation: 0, audio: 0, native: 0 });
          assert.deepEqual(forbidden, [], 'No provider, account, OS or unexpected network requests');
          assert.deepEqual(errors, []);
          result.passed = true;
          console.log('PASS Pulse touch targets', name);
        } catch (error) {
          result.failure = String(error.stack || error);
          try { await page.screenshot({ path: path.join(output, `${name}-failure.png`) }); } catch { /* Preserve original failure if capture itself fails. */ }
          throw error;
        } finally {
          results.push(result);
          fs.writeFileSync(path.join(output, `${name}.json`), JSON.stringify(result, null, 2));
          await context.close();
        }
      }
      await browser.close(); browser = null;
    }
    assert.equal(results.length, 138);
    assert.ok(results.every(result => result.passed));
    assert.equal(results.filter(result => result.viewport.height === 844).length, 96);
    assert.equal(results.filter(result => result.viewport.height === 420 && result.viewport.motion !== 'reduce').length, 36);
    assert.equal(results.filter(result => result.viewport.motion === 'reduce').length, 6);
    assert.deepEqual(Object.fromEntries(cssFiles.map(file => [path.relative(dist, file), sha(file)])), artifact.shippingCssSha256, 'Shipping CSS stays immutable during capture');
    console.log('All 138 actual Chromium/WebKit Pulse touch-target cases passed.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ ...artifact, browserRun: true, elapsedMs: Date.now() - started, results,
      scope: 'Prepared actual Pulse/runtime/navigation UI and shipping CSS; synthetic owner/messages; native original samples separate from synthetic controlled animation/timer samples. Full-app navigation gates remain separate. No physical Android/IME certification.' }, null, 2));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
