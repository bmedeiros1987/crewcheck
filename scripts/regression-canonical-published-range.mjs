import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const source = fs.readFileSync('client/src/lib/canonicalRoster.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-canonical-range-'));
const tempFile = path.join(tempDir, 'canonicalRoster.cjs');
fs.writeFileSync(tempFile, compiled);
const require = createRequire(import.meta.url);
const { normalizeRosterDays } = require(tempFile);

const roster = {
  crewName: 'Teste', crewId: '1', base: 'BSB', rank: 'CCM', airline: 'LATAM',
  month: 7, year: 2026,
  rawText: 'CrewRoster Report 01-Jul-2026 to 31-Jul-2026 Updated Date msgsys 25-Jun-2026',
  days: [
    { date: '25/06/2026', dayOfWeek: 'QUI', dayNumber: 25, month: 6, year: 2026, type: 'HSB', pairingCode: 'HSB', dutyReport: '01:20', dutyDebrief: '23:59', dutyHours: null, flyingHours: null, isNextDay: false, hotel: null, base: 'BSB', rawText: 'msgsys 328 HSB LA3748', legs: [] },
    { date: '07/07/2026', dayOfWeek: 'TER', dayNumber: 7, month: 7, year: 2026, type: 'VOO', pairingCode: 'LA3838', dutyReport: '09:03', dutyDebrief: '11:00', dutyHours: null, flyingHours: null, isNextDay: false, hotel: null, base: 'GRU', legs: [{ flightNumber: 'LA3838', origin: 'GRU', destination: 'CXJ', departureTime: '09:03', arrivalTime: '11:00', workType: 'OP' }] },
  ],
};

const normalized = normalizeRosterDays(roster);
if (normalized.days.some(day => day.date === '25/06/2026')) {
  console.error('Expected technical 25/06 artifact to be removed');
  process.exit(1);
}
if (!normalized.days.some(day => day.date === '07/07/2026')) {
  console.error('Expected valid July day to remain');
  process.exit(1);
}
console.log('canonical published range regression OK');
