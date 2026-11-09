import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import createDOMPurify from 'dompurify';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { crewCheckEmailIdentity } from '../shared/crewcheckEmailIdentity.mjs';

// Test-only DOM installed separately with audit and lifecycle scripts disabled.
assert(process.env.CREWCHECK_QA_JSDOM_PACKAGE, 'Set CREWCHECK_QA_JSDOM_PACKAGE to the isolated jsdom package.json');
const require = createRequire(process.env.CREWCHECK_QA_JSDOM_PACKAGE);
const { JSDOM } = require('jsdom');
const window = new JSDOM('<!doctype html><body></body>').window;
const purifier = createDOMPurify(window);

// Structural synthetic probes only: jsdom scripts/resources stay disabled and
// no template, handler, animation or attacker expression is ever evaluated.
function octoberSanitizerRegressions(sanitizer, expectVulnerable = false) {
  const { document } = window;
  for (const hook of ['beforeSanitizeElements', 'uponSanitizeElement', 'afterSanitizeElements', 'beforeSanitizeAttributes', 'afterSanitizeAttributes']) {
    for (const mode of ['parent', 'nextSibling']) {
      sanitizer.removeAllHooks();
      const root = document.createElement('div');
      root.innerHTML = '<figure><img class="trigger"><img id="probe" onerror="window.syntheticProbe=1"></figure><p>safe</p>';
      document.body.append(root);
      const probe = root.querySelector('#probe');
      let detached = false;
      sanitizer.addHook(hook, node => {
        if (node.getAttribute?.('class') !== 'trigger') return;
        const target = mode === 'parent' ? node.parentNode : node.nextElementSibling;
        assert(target, `${hook}/${mode} exercises the detach`);
        target.remove();
        detached = true;
      });
      sanitizer.sanitize(root, { IN_PLACE: true });
      assert(detached);
      assert.equal(probe.isConnected, false);
      assert.equal(probe.hasAttribute('onerror'), expectVulnerable, `${hook}/${mode}: detached handlers`);
      assert.equal(root.querySelector('p').textContent, 'safe');
      root.remove();
    }
  }
  sanitizer.removeAllHooks();
  for (const fragments of [['$', '{syntheticProbe}'], ['{', '{syntheticProbe', '}', '}'], ['<', '%syntheticProbe', '%', '>']]) {
    for (const nested of [false, true]) {
      const host = document.createElement('div');
      let shadow = host.attachShadow({ mode: 'open' });
      if (nested) {
        const child = document.createElement('div');
        shadow.append(child);
        shadow = child.attachShadow({ mode: 'open' });
      }
      fragments.forEach((fragment, index) => {
        if (index) shadow.append(document.createElement('object'));
        shadow.append(document.createTextNode(fragment));
      });
      sanitizer.sanitize(host, { IN_PLACE: true, SAFE_FOR_TEMPLATES: true });
      assert.equal(shadow.querySelector('object'), null, 'disallowed separator removed');
      shadow.normalize();
      assert.equal(shadow.textContent.includes(fragments.join('')), expectVulnerable, `shadow template ${fragments[0]}, nested=${nested}`);
    }
  }
  const smil = '<svg xmlns="http://www.w3.org/2000/svg"><a><animate attributeName="href" values="x;javascript:syntheticProbe"/><text>safe</text></a></svg>';
  const clean = sanitizer.sanitize(smil, {
    PARSER_MEDIA_TYPE: 'application/xhtml+xml',
    ALLOWED_TAGS: ['svg', 'a', 'animate', 'text'],
    ALLOWED_ATTR: ['attributeName', 'values'],
  });
  const parsed = new window.DOMParser().parseFromString(clean, 'application/xhtml+xml');
  assert.equal(parsed.querySelector('parsererror'), null);
  assert.equal(parsed.querySelector('text').textContent, 'safe');
  assert.equal(parsed.querySelector('animate')?.getAttribute('attributeName') === 'href', expectVulnerable, 'XHTML SMIL href target');
  assert.equal(window.syntheticProbe, undefined, 'no probe is executed');
}

try {
  assert.equal(purifier.version, '3.4.17', 'the pinned patched sanitizer must actually execute');
  octoberSanitizerRegressions(purifier);
  if (process.env.CREWCHECK_QA_PREVIOUS_DOMPURIFY_PACKAGE) {
    const previousRequire = createRequire(process.env.CREWCHECK_QA_PREVIOUS_DOMPURIFY_PACKAGE);
    assert.equal(previousRequire('./package.json').version, '3.4.16');
    octoberSanitizerRegressions(previousRequire('dompurify')(window), true);
    console.log('PASS negative control: DOMPurify 3.4.16 retains detached handlers, shadow templates and XHTML SMIL href target; no execution');
  }
  console.log('PASS DOMPurify 3.4.17: 10 parent/sibling hook probes, 6 shadow template probes and XHTML SMIL guard');
  assert(!purifier.sanitize('<img src=x onerror="window.pwned=1"><script>bad()</script>').includes('onerror'));
  for (const hook of ['afterSanitizeElements', 'afterSanitizeAttributes']) {
    purifier.removeAllHooks();
    let removed;
    purifier.addHook(hook, node => { if (node.id === 'remove-me') { removed = node; node.remove(); } });
    const root = window.document.createElement('div');
    root.innerHTML = '<div id="remove-me"><img src=x onerror="window.pwned=1"></div>';
    window.document.body.append(root);
    purifier.sanitize(root, { IN_PLACE: true });
    assert(removed);
    assert.equal(removed.querySelector('img').getAttribute('onerror'), null);
    root.remove();
  }
  purifier.removeAllHooks();
  // GHSA-6688-9rhm-gjv2: own closing tag in rawtext is essential to reparse.
  // jsdom uses its default runScripts setting (off); no handler is executed.
  function rawtextReparse(sanitizer, expectVulnerable) {
    const raw = window.document.createElement('style');
    raw.setAttribute('onclick', 'window.syntheticProbe=1');
    raw.textContent = '</style><img src=x onerror="window.syntheticProbe=1">';
    window.document.body.append(raw);
    let result;
    let rejected = false;
    try { result = sanitizer.sanitize(raw, { IN_PLACE: true }); }
    catch (error) { assert(error instanceof TypeError); rejected = true; }
    assert.equal(raw.parentNode, null, 'unsafe root must be detached');
    assert(sanitizer.removed.some(item => item.element === raw), 'force-removal path must be exercised');
    const probe = window.document.createElement('div');
    probe.innerHTML = result?.outerHTML || '';
    const armed = [...probe.querySelectorAll('img')].filter(img => img.hasAttribute('onerror'));
    if (expectVulnerable) {
      assert.equal(rejected, false);
      assert.equal(result, raw, 'negative control returns the removed root');
      assert.equal(raw.getAttribute('onclick'), null, 'attribute axis already neutralized');
      assert.equal(armed.length, 1, 'negative control must materialize the armed image on reparse');
    } else {
      assert.equal(armed.length, 0, 'serialized sanitizer output must not re-create an armed image');
      assert(rejected || !result || !/<[/\w!]/.test(result.textContent), 'root must fail closed or have neutralized rawtext');
    }
    assert.equal(window.syntheticProbe, undefined, 'synthetic handlers are never executed');
  }
  rawtextReparse(purifier, false);
  if (process.env.CREWCHECK_QA_VULNERABLE_DOMPURIFY_PACKAGE) {
    const oldRequire = createRequire(process.env.CREWCHECK_QA_VULNERABLE_DOMPURIFY_PACKAGE);
    assert.equal(oldRequire('./package.json').version, '3.4.13');
    rawtextReparse(oldRequire('dompurify')(window), true);
    console.log('PASS rawtext negative control: DOMPurify 3.4.13 recreates one armed img without executing it');
  }
  console.log('PASS DOMPurify ordinary markup, detached subtrees at both after hooks and faithful rawtext serialize/reparse');
} finally { window.close(); }

const dir = await mkdtemp(path.join(os.tmpdir(), 'crewcheck-pdf-qa-'));
// Current exportReport is asynchronous and loads the approved local brand PNG.
// Provide browser APIs with scripts/resources off and reject every other fetch.
const pdfWindow = new JSDOM('<!doctype html><body></body>', { url: 'https://fixture.invalid', pretendToBeVisual: true }).window;
const browserGlobals = ['window', 'document', 'localStorage', 'CustomEvent', 'FileReader', 'fetch'];
const originalGlobals = new Map(browserGlobals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
let logoRequests = 0;
let unexpectedRequests = 0;
// Vite's root is client/. Fail before export instead of allowing the production
// logo fallback to hide a missing fixture asset.
const logoBytes = await readFile(path.join(process.cwd(), 'client/public', crewCheckEmailIdentity.logoPath));
assert.equal(logoBytes.subarray(1, 4).toString(), 'PNG');
for (const key of browserGlobals.filter(key => key !== 'fetch')) {
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === 'window' ? pdfWindow : pdfWindow[key] });
}
globalThis.fetch = async url => {
  if (url !== crewCheckEmailIdentity.logoPath) unexpectedRequests++;
  assert.equal(url, crewCheckEmailIdentity.logoPath, 'only the approved local PNG may be requested');
  logoRequests++;
  return { ok: true, blob: async () => new pdfWindow.Blob([logoBytes], { type: 'image/png' }) };
};
try {
  const bundle = path.join(dir, 'pdf-export.cjs');
  await build({ entryPoints: ['client/src/lib/pdfExport.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: bundle });
  const { exportReport } = createRequire(import.meta.url)(bundle);
  const day = { date: '2026-10-10', dayOfWeek: 'Sab', type: 'OFF', dutyHours: 0 };
  const roster = { crewName: 'Synthetic Pilot', base: 'BSB', rank: 'QA', month: 10, year: 2026, days: [day] };
  const compliance = { score: 100, alerts: [], legalProfile: { actName: 'Synthetic QA', roleLabel: 'QA', functionLabel: 'QA', flightLimit28Days: 80 }, metrics: { totalFlightHours: 0, totalDutyHours: 0, totalDaysOff: 1, minDaysOffRequired: 1, weekendPairs: 0, nightOperations: 0, maxNightOps168h: 2, totalStandby: 0, maxStandbyMonth: 80 }, loadAnalysis: { days: [] } };
  for (const count of [1, 80]) {
    roster.days = Array.from({ length: count }, () => ({ ...day }));
    const result = await exportReport(roster, compliance, []);
    try {
      const bytes = new Uint8Array(await result.blob.arrayBuffer());
      assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), '%PDF-');
      const task = getDocument({ data: bytes, useSystemFonts: false, standardFontDataUrl: path.resolve('node_modules/pdfjs-dist/standard_fonts') + '/' });
      try {
        const doc = await task.promise;
        let text = '';
        for (let p = 1; p <= doc.numPages; p++) text += (await (await doc.getPage(p)).getTextContent()).items.map(item => item.str).join(' ');
        for (const expected of ['Synthetic Pilot', 'BSB', 'Folga']) assert(text.includes(expected), expected);
        assert(doc.numPages >= 2);
        const firstPage = await doc.getPage(1);
        const operators = await firstPage.getOperatorList();
        assert(operators.fnArray.includes(OPS.paintImageXObject), 'the real approved logo must be embedded, not silently skipped');
        const viewport = firstPage.getViewport({ scale: 1 });
        const rendered = doc.canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
        try {
          await firstPage.render({ canvasContext: rendered.context, viewport }).promise;
          const pixels = rendered.context.getImageData(0, 0, rendered.canvas.width, rendered.canvas.height).data;
          let ink = 0;
          for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 245 || pixels[i + 1] < 245 || pixels[i + 2] < 245) ink++;
          assert(ink > 1000, 'the actual PDF renders nonblank content with the existing Node canvas dependency');
        } finally { doc.canvasFactory.destroy(rendered); }
        console.log(`PASS actual PDF export/parser/render roundtrip: ${count} synthetic rows, ${doc.numPages} pages`);
      } finally { await task.destroy(); }
    } finally { URL.revokeObjectURL(result.url); }
  }
  assert.equal(logoRequests, 1, 'approved logo is loaded once and cached across exports');
  assert.equal(unexpectedRequests, 0, 'unexpected requests fail even if production catches a fetch error');
} finally {
  for (const [key, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
  pdfWindow.close();
  await rm(dir, { recursive: true, force: true });
}
