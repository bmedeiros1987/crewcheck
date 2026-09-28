import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const source = fs.readFileSync('client/src/lib/canonicalRoster.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-canonical-'));
const tempFile = path.join(tempDir, 'canonicalRoster.cjs');
fs.writeFileSync(tempFile, compiled);
const require = createRequire(import.meta.url);
const { buildCanonicalRosterEvents, selectNextRosterEvent } = require(tempFile);

const roster = {
  crewName: 'Teste', crewId: '1', base: 'GRU', rank: 'CCM', airline: 'LATAM', month: 7, year: 2026, rawText: '',
  days: [
    { date: '07/07/2026', dayOfWeek: 'TER', dayNumber: 7, month: 7, year: 2026, type: 'VOO', pairingCode: 'LA3455', dutyReport: '04:34', dutyDebrief: '07:58', dutyHours: null, flyingHours: null, isNextDay: false, hotel: null, base: 'FOR', legs: [{ flightNumber: 'LA3455', origin: 'FOR', destination: 'GRU', departureTime: '04:34', arrivalTime: '07:58', workType: 'OP' }] },
  ],
};

const events = buildCanonicalRosterEvents(roster);
const selected = selectNextRosterEvent(events, new Date('2026-07-08T07:10:00-03:00'));
if (selected) {
  console.error(`Expected no future event, got ${selected.flightNumber}`);
  process.exit(1);
}
console.log('canonical no-past-fallback regression OK');
