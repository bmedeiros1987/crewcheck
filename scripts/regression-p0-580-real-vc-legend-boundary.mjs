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

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-580-real-vc-legend-'));
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;
fs.writeFileSync(path.join(outDir, 'pdfParser.js'), compiled);
const require = createRequire(import.meta.url);
const { parseCrewRosterReportRows } = require(path.join(outDir, 'pdfParser.js'));

function item(str, x, y, page) {
  return { str, x, y, page, width: 10 };
}
function horizontalRow(page, y, values) {
  const items = values.map((value, index) => item(value, 60 + index * 30, y, page));
  return { page, key: y, text: values.join(' '), items };
}

const rows = [];
for (let day = 17; day <= 20; day += 1) {
  const dateToken = `${String(day).padStart(2, '0')}-Sep-2026`;
  const x = 60 + (day - 17) * 30;
  rows.push({
    page: 2,
    key: day,
    text: `${dateToken} VC BSB 00:00 BSB 23:59`,
    items: [item(dateToken, x, 31, 2), item('VC', x, 213, 2), item('BSB 00:00', x, 594, 2), item('BSB', x, 673, 2), item('23:59', x, 702, 2)],
  });
}

// This is the geometry that matters in CrewRosterReport-11.pdf: the final
// operational date band is horizontal, and date tokens sit near the page top
// (y <= 35), above weekdays and activity codes. A parser that only accepts
// y > 35 silently loses these dates and lets row-wise parsing collapse them.
const page = 3;
const finalDates = Array.from({ length: 10 }, (_, index) => `${String(index + 21).padStart(2, '0')}-Sep-2026`);
rows.push(horizontalRow(page, 129, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed']));
rows.push(horizontalRow(page, 212, Array.from({ length: 10 }, () => 'VC')));
rows.push(horizontalRow(page, 594, Array.from({ length: 10 }, () => 'BSB')));
rows.push(horizontalRow(page, 664, Array.from({ length: 10 }, () => 'BSB')));
rows.push(horizontalRow(page, 702, Array.from({ length: 10 }, () => '00:00')));
rows.push(horizontalRow(page, 758, Array.from({ length: 10 }, () => '23:59')));
rows.push(horizontalRow(page, 847, Array.from({ length: 10 }, () => '00:00')));
rows.push(horizontalRow(page, 927, Array.from({ length: 10 }, () => '00:00')));

const dateAndLegendItems = [
  ...finalDates.map((value, index) => item(value, 60 + index * 30, 31, page)),
  item('LEGEND', 373, 30, page),
  item('HSB', 396, 28, page),
  item('DO', 417, 28, page),
  item('VC', 438, 28, page),
  item('DR', 459, 28, page),
  item('<==', 480, 28, page),
];
rows.push({ page, key: 31, text: [...finalDates, 'LEGEND', 'HSB', 'DO', 'VC', 'DR', '<=='].join(' '), items: dateAndLegendItems });

// LEGEND follows the operational band. Its descriptions intentionally use
// valid activity labels and therefore prove the terminal boundary as well.
rows.push({ page, key: 88, text: 'Home Stand by Day off Vacation Requested day off Pairing/Flight extends to previous day(s)', items: [item('Home Stand by Day off Vacation Requested day off Pairing/Flight extends to previous day(s)', 60, 88, page)] });

const fullText = ['Roster Report 01-Sep-2026 to 01-Oct-2026', ...rows.map((row) => row.text)].join('\n');
const roster = parseCrewRosterReportRows(rows, fullText);
const vcDates = roster.days
  .filter((day) => String(day.pairingCode || '').toUpperCase() === 'VC')
  .map((day) => day.date);
const expected = Array.from({ length: 14 }, (_, index) => `${String(index + 17).padStart(2, '0')}/09/2026`);
assert.deepEqual([...new Set(vcDates)], expected, '17–30 must remain fourteen independent VC days');
for (const day of roster.days.filter((entry) => expected.includes(entry.date))) {
  assert.equal((day.rawText || '').match(/\b\d{2}-[A-Za-z]{3}-\d{4}\b/g)?.length || 0, 1, `one date token per day: ${day.date}`);
  assert.ok(!/\bLEGEND\b|Home Stand by|Day off|Vacation|Requested day off|Pairing\/Flight extends to previous day\(s\)/i.test(day.rawText || ''), `legend leaked into ${day.date}`);
}
assert.ok(!roster.days.some((day) => /\bLEGEND\b|Home Stand by|Requested day off/i.test(day.rawText || '')), 'legend must remain terminal');

console.log('PASS regression-p0-580-real-vc-legend-boundary');
fs.rmSync(outDir, { recursive: true, force: true });
