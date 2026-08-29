import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd();
const sourcePath = path.join(root, 'client/src/lib/pdfParser.ts');
let source = fs.readFileSync(sourcePath, 'utf8');
source = source
  .replace("import { isAimsFormat, parseAimsRoster } from './aimsParser';", "const isAimsFormat = () => false; const parseAimsRoster = () => ({ days: [] });")
  .replace("import { getRosterCodeDefinition, isKnownRosterCode } from './rosterCodes';", "const getRosterCodeDefinition = () => null; const isKnownRosterCode = () => false;")
  .replace("import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';", "const pdfWorkerUrl = '';")
  .replace("import { normalizeRosterDays } from './canonicalRoster';", "const normalizeRosterDays = (roster) => roster;")
  .replace('function parseCrewRosterReportRows(', 'export function parseCrewRosterReportRows(');

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-580-vc-boundary-'));
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;
fs.writeFileSync(path.join(outDir, 'pdfParser.js'), compiled);
const require = createRequire(import.meta.url);
const { parseCrewRosterReportRows } = require(path.join(outDir, 'pdfParser.js'));

const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function token(date) {
  return `${String(date.getUTCDate()).padStart(2, '0')}-${monthNames[date.getUTCMonth()]}-${date.getUTCFullYear()}`;
}
function item(str, x, y, page) { return { str, x, y, page, width: 10 }; }
function flightRow(page, dateToken, extraLeg = false) {
  const baseX = 60;
  const items = [
    item(dateToken, baseX, 700, page),
    item(`LA${String(1000 + page)}`, baseX, 650, page),
    item('OP', baseX + 3, 640, page),
    item('01:00', baseX + 4, 630, page),
    item('AAA', baseX, 600, page), item('02:00', baseX + 8, 600, page),
    item('BBB', baseX, 550, page), item('03:00', baseX + 8, 550, page),
  ];
  if (extraLeg) {
    const x = 120;
    items.push(
      item(`LA${String(2000 + page)}`, x, 650, page),
      item('OP', x + 3, 640, page),
      item('03:30', x + 4, 630, page),
      item('BBB', x, 600, page), item('04:00', x + 8, 600, page),
      item('CCC', x, 550, page), item('05:00', x + 8, 550, page),
    );
  }
  return {
    page,
    key: 700,
    text: `${dateToken} Mon LA${String(1000 + page)} OP AAA 02:00 BBB 03:00`,
    items,
  };
}

const rows = [];
const carryInStart = new Date(Date.UTC(2026, 7, 29));
for (let i = 0; i < 24; i += 1) {
  const d = new Date(carryInStart); d.setUTCDate(carryInStart.getUTCDate() + i);
  rows.push(flightRow(i + 1, token(d), i < 6));
}

const page = 25;
for (let day = 21; day <= 30; day += 1) {
  const y = 700 - (day - 21) * 45;
  const dateToken = `${String(day).padStart(2, '0')}-Sep-2026`;
  rows.push({
    page,
    key: y,
    text: `${dateToken} Tue VC AAA 00:00 AAA 23:59`,
    items: [item(dateToken, 60, y, page), item('VC', 70, y, page)],
  });
}
rows.push({ page, key: 100, text: 'LEGEND HSB Home Stand by DO Day off VC Vacation DR Requested day off <==', items: [item('LEGEND HSB DO VC DR <==', 65, 100, page)] });

const fullText = ['Roster Report 01-Sep-2026 to 01-Oct-2026', ...rows.map((row) => row.text)].join('\n');
const roster = parseCrewRosterReportRows(rows, fullText);

assert.equal(roster.month, 9);
assert.equal(roster.year, 2026);
const vcDays = roster.days.filter((day) => String(day.pairingCode || '').toUpperCase() === 'VC');
const expected = Array.from({ length: 10 }, (_, i) => `${String(i + 21).padStart(2, '0')}/09/2026`);
assert.deepEqual([...new Set(vcDays.map((day) => day.date))], expected, '21–30 must remain ten independent VC days');
for (const day of vcDays) {
  assert.ok(!/\bLEGEND\b/i.test(day.rawText || ''), `legend leaked into ${day.date}`);
  const dates = (day.rawText || '').match(/\b\d{2}-[A-Za-z]{3}-\d{4}\b/g) || [];
  assert.ok(dates.length <= 1, `multiple date tokens collapsed into ${day.date}: ${dates.join(', ')}`);
}

console.log('PASS regression-p0-580-transposed-vc-boundary');
fs.rmSync(outDir, { recursive: true, force: true });
