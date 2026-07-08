import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

function load(file) {
  const source = fs.readFileSync(file, 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-v1334-'));
  const out = path.join(dir, path.basename(file).replace('.ts', '.cjs'));
  fs.writeFileSync(out, compiled);
  return createRequire(import.meta.url)(out);
}

const { buildCanonicalRosterEvents } = load('client/src/lib/canonicalRoster.ts');
const { airportCity } = load('client/src/lib/airports.ts');

const day = {
  date: '08/07/2026',
  dayOfWeek: 'QUA',
  dayNumber: 8,
  month: 7,
  year: 2026,
  type: 'VOO',
  pairingCode: 'JRN',
  dutyReport: '18:20',
  dutyDebrief: '23:15',
  dutyHours: null,
  flyingHours: null,
  isNextDay: true,
  hotel: null,
  base: 'CGH',
  legs: [
    { flightNumber: 'LA3785', origin: 'RAO', destination: 'CGH', departureTime: '19:13', arrivalTime: '20:08', workType: 'OP' },
    { flightNumber: 'LA4546', origin: 'CGH', destination: 'BSB', departureTime: '21:22', arrivalTime: '22:55', workType: 'OP' },
  ],
};

const events = buildCanonicalRosterEvents({ crewName: 'T', crewId: '1', base: 'CGH', rank: 'CCM', month: 7, year: 2026, rawText: '', days: [day] });
const first = events[0];
const second = events[1];

if (first.isNextDay) throw new Error('LA3785 recebeu +1 indevido');
if (second.showPresentation) throw new Error('LA4546 herdou apresentação de primeira perna');
if (second.presentation === '18:20') throw new Error('LA4546 repetiu dutyReport como apresentação');
if (airportCity('CXJ') !== 'Caxias do Sul') throw new Error('CXJ não renderiza Caxias do Sul');
if (events.some((event) => event.isNextDay)) throw new Error('day.isNextDay contaminou legs sem virada');

console.log('v13.3.4 leg accuracy regression OK');
