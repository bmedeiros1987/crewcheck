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
    { date: '07/07/2026', dayOfWeek: 'TER', dayNumber: 7, month: 7, year: 2026, type: 'VOO', pairingCode: 'LA3455', dutyReport: '09:30', dutyDebrief: '07:58', dutyHours: null, flyingHours: null, isNextDay: false, hotel: null, base: 'FOR', legs: [{ flightNumber: 'LA3455', origin: 'FOR', destination: 'GRU', departureTime: '04:34', arrivalTime: '07:58', workType: 'OP' }] },
    { date: '08/07/2026', dayOfWeek: 'QUA', dayNumber: 8, month: 7, year: 2026, type: 'VOO', pairingCode: 'LA3838', dutyReport: '09:03', dutyDebrief: '11:00', dutyHours: null, flyingHours: null, isNextDay: false, hotel: null, base: 'GRU', legs: [{ flightNumber: 'LA3838', origin: 'GRU', destination: 'CXJ', departureTime: '09:03', arrivalTime: '11:00', workType: 'OP' }] },
  ],
};

const events = buildCanonicalRosterEvents(roster);
const selected = selectNextRosterEvent(events, new Date('2026-07-07T23:40:00-03:00'));
if (selected?.flightNumber !== 'LA3838') {
  console.error(`Expected LA3838, got ${selected?.flightNumber || 'none'}`);
  process.exit(1);
}
console.log('canonical chronology regression OK: LA3838 selected');
