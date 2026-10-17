import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import createDOMPurify from 'dompurify';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { crewCheckEmailIdentity } from '../shared/crewcheckEmailIdentity.mjs';

// Test-only DOM installed separately with audit and lifecycle scripts disabled.
assert(process.env.CREWCHECK_QA_JSDOM_PACKAGE, 'Set CREWCHECK_QA_JSDOM_PACKAGE to the isolated jsdom package.json');
const require = createRequire(process.env.CREWCHECK_QA_JSDOM_PACKAGE);
const { JSDOM } = require('jsdom');
const window = new JSDOM('<!doctype html><body></body>').window;
const purifier = createDOMPurify(window);
try {
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
const pdfWindow = new JSDOM('<!doctype html><body></body>', { url: 'https://fixture.invalid' }).window;
const browserGlobals = ['window', 'document', 'localStorage', 'CustomEvent', 'FileReader', 'fetch'];
const originalGlobals = new Map(browserGlobals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
let logoRequests = 0;
for (const key of browserGlobals.filter(key => key !== 'fetch')) {
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === 'window' ? pdfWindow : pdfWindow[key] });
}
globalThis.fetch = async url => {
  assert.equal(url, crewCheckEmailIdentity.logoPath, 'only the approved local PNG may be requested');
  logoRequests++;
  const bytes = await readFile(path.join(process.cwd(), 'public', crewCheckEmailIdentity.logoPath));
  return { ok: true, blob: async () => new pdfWindow.Blob([bytes], { type: 'image/png' }) };
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
        console.log(`PASS actual PDF export/parser roundtrip: ${count} synthetic rows, ${doc.numPages} pages`);
      } finally { await task.destroy(); }
    } finally { URL.revokeObjectURL(result.url); }
  }
  assert.equal(logoRequests, 1, 'approved logo is loaded once and cached across exports');
} finally {
  for (const [key, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
  pdfWindow.close();
  await rm(dir, { recursive: true, force: true });
}
