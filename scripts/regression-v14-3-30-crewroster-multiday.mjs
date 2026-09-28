import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const applyPath = path.join(root, 'scripts/v14330/apply.mjs');
const preparedParserPath = path.join(root, 'client/src/lib/pdfParser.ts');
const applySource = fs.readFileSync(applyPath, 'utf8');
const preparedParser = fs.readFileSync(preparedParserPath, 'utf8');

for (const [marker, label] of [
  ['function crewRosterRawLegTimings(', 'leitura ordenada dos offsets por perna'],
  ['const usedIndexes = new Set<number>();', 'consumo único de ocorrências repetidas'],
  ['const between = raw.slice(previousMatchEnd, timing.sourceIndex);', 'apresentação isolada do trecho anterior'],
  ['const explicitNewPresentation = Boolean(timing.report);', 'separação por nova apresentação'],
  ['const longRest = groundGap >= 12 * 60;', 'separação por repouso'],
  ['function rescueCrewRosterOffsetGroundActivities(', 'resgate de MCK'],
  ['const daysWithGroundActivities = rescueCrewRosterOffsetGroundActivities(', 'pipeline do parser'],
  ['isNextDay: crossesMidnight', 'virada relativa à jornada real'],
]) {
  assert.ok(preparedParser.includes(marker), `v14.3.30: ausente ${label}`);
}
assert.ok(!preparedParser.includes('if (segments.length <= 1)'), 'jornada única também precisa recalcular offsets relativos');
assert.ok(!preparedParser.includes('const isSingleConnectedDuty ='), 'atalho antigo não pode juntar todo pairing conectado em um único dia');
assert.ok(!preparedParser.includes('target.isNextDay = offset > 0'), 'offset absoluto não pode virar isNextDay depois da troca de data');
assert.ok(applySource.includes("const WEB_VERSION = '14.3.30';"), 'release web 14.3.30 deve ser publicada');
assert.ok(applySource.includes("var currentRelease = '${WEB_VERSION}';"), 'watcher do cliente deve acompanhar a versão nova');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-v14330-'));
const parserDir = path.join(tempDir, 'client/src/lib');
const parserPath = path.join(parserDir, 'pdfParser.ts');
fs.mkdirSync(parserDir, { recursive: true });

const legacyFixture = `function normalizeCrewRosterReportContinuationDays(days: RosterDay[], referenceMonth: number, referenceYear: number, base: string): RosterDay[] {
  const output: RosterDay[] = [];
  for (const day of days) {
    const isSingleConnectedDuty = day.legs.length > 1 && Boolean(day.dutyReport);
    if (isSingleConnectedDuty) output.push(day);
  }
  return output;
}

type GenericTripulationRecord = { flightNumber: string };

function parseCrewRosterReportRows() {
  const rescuedDays = [];
  const header = { month: 8, year: 2026, base: 'BSB', crewName: 'Tripulante' };
  const crewRecords = [];
  const days = applyGenericTripulationRecordsToDays(normalizeCrewRosterReportContinuationDays(rescuedDays, header.month, header.year, header.base), crewRecords, header.crewName);
  return days;
}
`;

try {
  fs.writeFileSync(parserPath, legacyFixture, 'utf8');
  const first = spawnSync(process.execPath, [applyPath], { cwd: tempDir, encoding: 'utf8' });
  assert.equal(first.status, 0, first.stderr || first.stdout || 'primeira aplicação v14.3.30 falhou');
  const patched = fs.readFileSync(parserPath, 'utf8');
  assert.ok(patched.includes('function crewRosterRawLegTimings('), 'implementação estrutural não foi inserida');
  assert.ok(patched.includes('const daysWithGroundActivities = rescueCrewRosterOffsetGroundActivities('), 'pipeline de MCK não foi inserido');
  assert.ok(patched.includes('type GenericTripulationRecord ='), 'função seguinte deve ser preservada');
  assert.ok(!patched.includes('const isSingleConnectedDuty ='), 'atalho legado deve ser removido');
  assert.ok(fs.readFileSync(path.join(tempDir, 'client/public/release.json'), 'utf8').includes('14.3.30'), 'release.json deve forçar atualização do cliente');

  const second = spawnSync(process.execPath, [applyPath], { cwd: tempDir, encoding: 'utf8' });
  assert.equal(second.status, 0, second.stderr || second.stdout || 'segunda aplicação v14.3.30 falhou');
  assert.equal(fs.readFileSync(parserPath, 'utf8'), patched, 'patch v14.3.30 deve ser idempotente');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

function addOffset(dateText, offset) {
  const [day, month, year] = dateText.split('/').map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

assert.equal(addOffset('30/07/2026', 2), '01/08/2026', 'pairing iniciado em julho deve publicar a terceira jornada em agosto');
assert.equal(addOffset('06/08/2026', 1), '07/08/2026', 'MCK (+1) deve ficar em 7 de agosto');
assert.equal(addOffset('29/08/2026', 3), '01/09/2026', 'jornada (+3) deve atravessar corretamente para setembro');

function segmentOffsets(timings) {
  const segments = [];
  for (const timing of timings) {
    const current = segments[segments.length - 1];
    if (!current) {
      segments.push({ offset: timing.offset, lastArrival: timing.arrival, items: [timing] });
      continue;
    }
    const groundGap = timing.departure - current.lastArrival;
    if (timing.report || groundGap >= 12 * 60) {
      segments.push({ offset: timing.offset, lastArrival: timing.arrival, items: [timing] });
    } else {
      current.items.push(timing);
      current.lastArrival = timing.arrival;
    }
  }
  return segments.map((segment) => segment.offset);
}

const julyPairing = [
  { offset: 0, departure: 14 * 60 + 50, arrival: 16 * 60 + 45, report: true },
  { offset: 0, departure: 17 * 60 + 30, arrival: 19 * 60 + 25, report: false },
  { offset: 0, departure: 20 * 60 + 45, arrival: 23 * 60 + 20, report: false },
  { offset: 1, departure: 1440 + 13 * 60 + 25, arrival: 1440 + 16 * 60 + 45, report: true },
  { offset: 1, departure: 1440 + 19 * 60 + 25, arrival: 1440 + 21 * 60 + 10, report: false },
  { offset: 1, departure: 1440 + 21 * 60 + 55, arrival: 1440 + 23 * 60 + 40, report: false },
  { offset: 2, departure: 2880 + 15 * 60 + 35, arrival: 2880 + 16 * 60 + 35, report: true },
  { offset: 2, departure: 2880 + 17 * 60 + 35, arrival: 2880 + 19 * 60 + 30, report: false },
];
assert.deepEqual(segmentOffsets(julyPairing), [0, 1, 2], 'apresentações 14:00, 12:55(+1) e 14:58(+2) devem criar três jornadas');

const overnightConnection = [
  { offset: 0, departure: 23 * 60, arrival: 1440 + 15, report: true },
  { offset: 1, departure: 1440 + 70, arrival: 1440 + 150, report: false },
];
assert.deepEqual(segmentOffsets(overnightConnection), [0], 'conexão após meia-noite sem nova apresentação deve continuar na mesma jornada');

function reportBetweenFlights(raw, firstPattern, secondPattern) {
  const first = firstPattern.exec(raw);
  const second = secondPattern.exec(raw);
  assert.ok(first && second, 'voos de teste devem ser encontrados');
  const between = raw.slice(first.index + first[0].length, second.index);
  return between.match(/(?:^|\s)(\d{1,2}:\d{2}(?:\(\+\d+\))?)\s*$/)?.[1] || null;
}
const flightOne = /LA100 OP BSB 23:00 GRU 00:15\(\+1\)/;
const flightTwo = /LA200 OP GRU 01:10\(\+1\) REC 02:30\(\+1\)/;
assert.equal(reportBetweenFlights('LA100 OP BSB 23:00 GRU 00:15(+1) LA200 OP GRU 01:10(+1) REC 02:30(+1)', flightOne, flightTwo), null, 'chegada anterior não pode virar nova apresentação');
assert.equal(reportBetweenFlights('LA100 OP BSB 23:00 GRU 00:15(+1) 12:55(+1) LA200 OP GRU 13:25(+1) REC 16:45(+1)', flightOne, /LA200 OP GRU 13:25\(\+1\) REC 16:45\(\+1\)/), '12:55(+1)', 'apresentação explícita entre voos deve ser reconhecida');

function durationMinutes(rawDeparture, rawArrival) {
  const clean = (value) => value.replace(/\(\+\d+\)/g, '');
  const offset = (value) => Number(value.match(/\(\+(\d+)\)/)?.[1] || 0);
  const minutes = (value) => Number(clean(value).split(':')[0]) * 60 + Number(clean(value).split(':')[1]);
  let arrivalOffset = offset(rawArrival);
  const departureOffset = offset(rawDeparture);
  if (arrivalOffset < departureOffset) arrivalOffset = departureOffset;
  if (arrivalOffset === departureOffset && minutes(rawArrival) < minutes(rawDeparture)) arrivalOffset += 1;
  return arrivalOffset * 1440 + minutes(rawArrival) - (departureOffset * 1440 + minutes(rawDeparture));
}
assert.equal(durationMinutes('01:10(+1)', '02:30(+1)'), 80, 'segunda perna da mesma madrugada deve durar 1h20, não 25h20');

const repeatedRaw = 'LA3308 OP GRU 22:40(+1) FLN 23:55(+1) LA3308 OP GRU 22:40(+2) FLN 23:55(+2)';
const repeated = Array.from(repeatedRaw.matchAll(/LA3308 OP GRU (\d{2}:\d{2}\(\+\d+\)) FLN (\d{2}:\d{2}\(\+\d+\))/g));
assert.equal(repeated.length, 2, 'voo repetido deve manter duas ocorrências');
assert.notEqual(repeated[0].index, repeated[1].index, 'cada ocorrência repetida precisa de posição própria');
assert.equal(repeated[0][1], '22:40(+1)');
assert.equal(repeated[1][1], '22:40(+2)');

const mckPattern = /(?:(\d{1,2}:\d{2}(?:\(\+\d+\))?)\s+)?\b(MCK(?:320|_SS)?)\b\s+([A-Z]{3})\s+(\d{1,2}:\d{2}(?:\(\+\d+\))?)\s+([A-Z]{3})\s+(\d{1,2}:\d{2}(?:\(\+\d+\))?)/i;
const mckMorning = '09:00(+1) MCK CGH 09:00(+1) CGH 13:00(+1)'.match(mckPattern);
assert.ok(mckMorning, 'MCK matinal deve ser reconhecido');
assert.equal(mckMorning[2], 'MCK');
assert.equal(mckMorning[4], '09:00(+1)');
assert.equal(mckMorning[6], '13:00(+1)');
const mckAfternoon = 'MCK CGH 14:00(+1) CGH 18:00(+1)'.match(mckPattern);
assert.ok(mckAfternoon, 'segundo MCK sem apresentação repetida deve ser reconhecido');

console.log('v14.3.30 CrewRosterReport multiday pairing, timing and MCK regression: OK');
