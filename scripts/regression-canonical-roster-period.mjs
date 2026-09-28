import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const source = fs.readFileSync('client/src/lib/canonicalRoster.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-canonical-period-'));
const tempFile = path.join(tempDir, 'canonicalRoster.cjs');
fs.writeFileSync(tempFile, compiled);
const require = createRequire(import.meta.url);
const { normalizeRosterDays } = require(tempFile);

const roster = {
  crewName: 'Teste', crewId: '1', base: 'GRU', rank: 'CCM', airline: 'LATAM',
  // Simula bug: header antigo ou cache marcando Junho, mas PDF e dias são Julho.
  month: 6, year: 2026,
  rawText: 'CrewRoster Report 01-Jul-2026 to 31-Jul-2026 BRUNO SARAIVA',
  days: [
    { date: '07/07/2026', dayOfWeek: 'TER', dayNumber: 7, month: 7, year: 2026, type: 'VOO', pairingCode: 'LA3455', dutyReport: '04:34', dutyDebrief: '07:58', dutyHours: null, flyingHours: null, isNextDay: false, hotel: null, base: 'FOR', legs: [{ flightNumber: 'LA3455', origin: 'FOR', destination: 'GRU', departureTime: '04:34', arrivalTime: '07:58', workType: 'OP' }] },
  ],
};

const normalized = normalizeRosterDays(roster);
if (normalized.month !== 7 || normalized.year !== 2026) {
  console.error(`Expected Julho/2026, got month=${normalized.month} year=${normalized.year}`);
  process.exit(1);
}
console.log('canonical roster period regression OK: Julho 2026');
