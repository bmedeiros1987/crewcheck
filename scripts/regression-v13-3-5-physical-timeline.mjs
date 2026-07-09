import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const source = fs.readFileSync('client/src/lib/canonicalRoster.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-v1335-'));
const out = path.join(dir, 'canonicalRoster.cjs');
fs.writeFileSync(out, compiled);
const { normalizeRosterDays, buildCanonicalRosterEvents, selectPhysicalLegSequence } = createRequire(import.meta.url)(out);

const legs = [
  { flightNumber: 'LA3838', origin: 'GRU', destination: 'CXJ', departureTime: '09:50', arrivalTime: '11:30', workType: 'OP' },
  { flightNumber: 'LA3730', origin: 'BSB', destination: 'FOR', departureTime: '10:08', arrivalTime: '12:34', workType: 'OP' },
  { flightNumber: 'LA3730', origin: 'BSB', destination: 'FOR', departureTime: '10:20', arrivalTime: '13:00', workType: 'OP' },
  { flightNumber: 'LA3839', origin: 'CXJ', destination: 'GRU', departureTime: '12:30', arrivalTime: '14:05', workType: 'OP' },
];

const selected = selectPhysicalLegSequence(legs);
if (selected.some((leg) => leg.flightNumber === 'LA3730')) {
  throw new Error('Teletransporte BSB→FOR sobreviveu no bloco GRU→CXJ→GRU');
}
if (selected.map((leg) => leg.flightNumber).join(',') !== 'LA3838,LA3839') {
  throw new Error(`Sequência física esperada LA3838,LA3839; veio ${selected.map((leg) => leg.flightNumber).join(',')}`);
}

const roster = {
  crewName: 'T',
  crewId: '1',
  base: 'BSB',
  rank: 'CCM',
  month: 7,
  year: 2026,
  rawText: 'CrewRoster Report 01-Jul-2026 to 31-Jul-2026',
  days: [{
    date: '08/07/2026',
    dayOfWeek: 'QUA',
    dayNumber: 8,
    month: 7,
    year: 2026,
    type: 'VOO',
    pairingCode: 'JRN',
    dutyReport: '09:03',
    dutyDebrief: '14:05',
    dutyHours: null,
    flyingHours: null,
    isNextDay: false,
    hotel: null,
    base: 'GRU',
    legs,
  }],
};

const normalized = normalizeRosterDays(roster);
const events = buildCanonicalRosterEvents(normalized);
if (events.some((event) => event.flightNumber === 'LA3730')) {
  throw new Error('Evento canônico ainda contém voo teletransportado LA3730');
}
console.log('v13.3.5 physical timeline regression OK');
