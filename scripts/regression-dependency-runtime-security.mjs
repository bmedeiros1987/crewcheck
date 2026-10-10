import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import createDOMPurify from 'dompurify';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

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
  const raw = window.document.createElement('style');
  raw.textContent = '<img src=x onerror="window.pwned=1">';
  window.document.body.append(raw);
  let result;
  try { result = purifier.sanitize(raw, { IN_PLACE: true }); }
  catch (error) { assert(error instanceof TypeError); result = null; }
  assert(!result || !result.textContent.includes('onerror'));
  console.log('PASS DOMPurify ordinary markup, detached subtrees at both after hooks and rawtext root');
} finally { window.close(); }

const dir = await mkdtemp(path.join(os.tmpdir(), 'crewcheck-pdf-qa-'));
try {
  const bundle = path.join(dir, 'pdf-export.cjs');
  await build({ entryPoints: ['client/src/lib/pdfExport.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: bundle });
  const { exportReport } = createRequire(import.meta.url)(bundle);
  const day = { date: '2026-10-10', dayOfWeek: 'Sab', type: 'OFF', dutyHours: 0 };
  const roster = { crewName: 'Synthetic Pilot', base: 'BSB', rank: 'QA', month: 10, year: 2026, days: [day] };
  const compliance = { score: 100, alerts: [], legalProfile: { actName: 'Synthetic QA', roleLabel: 'QA', functionLabel: 'QA', flightLimit28Days: 80 }, metrics: { totalFlightHours: 0, totalDutyHours: 0, totalDaysOff: 1, minDaysOffRequired: 1, weekendPairs: 0, nightOperations: 0, maxNightOps168h: 2, totalStandby: 0, maxStandbyMonth: 80 }, loadAnalysis: { days: [] } };
  for (const count of [1, 80]) {
    roster.days = Array.from({ length: count }, () => ({ ...day }));
    const result = exportReport(roster, compliance, []);
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
} finally { await rm(dir, { recursive: true, force: true }); }
