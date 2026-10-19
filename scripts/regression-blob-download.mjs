import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(fs.readFileSync('client/src/lib/blobDownload.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
function fixture({ clickFails = false } = {}) {
  const events = [], timers = [], anchor = { remove() { events.push('removed'); }, click() {
    assert(events.includes('attached'), 'link must be attached before navigation');
    events.push('clicked'); if (clickFails) throw new Error('SYNTHETIC_DOWNLOAD_REJECTED');
  } };
  const context = { exports: {}, URL: { createObjectURL() { events.push('created'); return 'blob:synthetic'; }, revokeObjectURL(url) { assert.equal(url, 'blob:synthetic'); events.push('revoked'); } },
    document: { createElement(tag) { assert.equal(tag, 'a'); return anchor; }, body: { appendChild() { events.push('attached'); } } },
    window: { setTimeout(fn, ms) { timers.push({ fn, ms }); } } };
  vm.runInNewContext(code, context);
  return { request: context.exports.requestBlobDownload, events, timers, anchor };
}
const f = fixture(); assert.equal(f.request({ size: 12 }, '../SYNTHETIC/report.pdf'), 'blob:synthetic');
assert.equal(f.anchor.download, '.._SYNTHETIC_report.pdf');
const long = fixture(); long.request({ size: 12 }, 'A'.repeat(190)+'.pdf');
assert.equal(long.anchor.download, 'A'.repeat(176)+'.pdf', 'truncate the basename, preserving the supplied extension');
const noExtension = fixture(); noExtension.request({ size: 12 }, 'A'.repeat(194));
assert.equal(noExtension.anchor.download, 'A'.repeat(180), 'do not invent a MIME-derived extension');
assert.deepEqual(f.events, ['created', 'attached', 'clicked', 'removed']);
assert.equal(f.timers.length, 1); assert(f.timers[0].ms >= 60_000);
f.timers[0].fn(); assert.equal(f.events.at(-1), 'revoked');
const failed = fixture({ clickFails: true });
assert.throws(() => failed.request({ size: 12 }, 'SYNTHETIC.pdf'), /SYNTHETIC_DOWNLOAD_REJECTED/);
assert.deepEqual(failed.events, ['created', 'attached', 'clicked', 'revoked', 'removed']);
assert.equal(failed.timers.length, 0);
const empty = fixture(); assert.throws(() => empty.request({ size: 0 }, 'empty.pdf'), /vazio/);
assert.deepEqual(empty.events, []);
// All shared export routes use this lifetime policy; account guards stay in the caller.
for (const file of ['client/src/lib/pdfExport.ts', 'client/src/lib/calendarExport.ts', 'client/src/components/v139/api.ts', 'client/src/components/v1435/CrewLockerView.tsx']) {
  assert.match(fs.readFileSync(file, 'utf8'), /requestBlobDownload\(blob, fileName\)|requestBlobDownload\(blob, doc\.fileName\)|requestBlobDownload\(new Blob\(\[ical\]/, file);
}
console.log('PASS Blob download: connected link, deferred revocation, cleanup, empty/error paths, shared callers');
