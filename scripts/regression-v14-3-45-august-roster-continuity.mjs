import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const fixture = read('scripts/fixtures/crew-roster-august-2026.txt');
const chain = read('scripts/v139/apply.mjs');
const clientSource = read('client/src/lib/pdfParser.ts');
const serverSource = read('server/rosterParser.mjs');
const applySource = read('scripts/v14345/apply.mjs');

assert.ok(chain.trimEnd().endsWith("await import('../v14345/apply.mjs');"), 'v14.3.45 deve encerrar a preparação canônica');
assert.ok(!fixture.includes('BRUNO SARAIVA'), 'fixture não pode carregar nome real');
assert.ok(!fixture.includes('04453812'), 'fixture não pode carregar BP real');
assert.ok(fixture.includes('<== Thu LA3512/300726/'), 'fixture deve preservar a continuação anterior ao mês');
assert.ok(fixture.includes('MCK CGH 09:00(+1) CGH 13:00(+1)'), 'fixture deve preservar o primeiro MCK');
assert.ok(fixture.includes('MCK CGH 14:00(+1) CGH 18:00(+1)'), 'fixture deve preservar o segundo MCK');
assert.ok(fixture.includes('LA3737 OP FLN 14:40(+3) BSB 16:55(+3)'), 'fixture deve preservar offset +3 até setembro');

for (const marker of [
  'function rebuildCrewRosterOffsetDays(',
  'function crewRosterOffsetMckDays(',
  'function crewRosterOffsetLegIdentity(',
  'function crewRosterOffsetReplacementKeys(',
  'const replacementKeys = crewRosterOffsetReplacementKeys(',
  'const offsetAwareDays = rebuildCrewRosterOffsetDays(',
  'const continuationDays = offsetAwareDays;',
  'const flightHours = compactText.match(',
  'const dutyHours = compactText.match(',
]) assert.ok(clientSource.includes(marker), `proteção de agosto ausente no cliente: ${marker}`);
assert.ok(!clientSource.includes('const authoritativeIdentities = new Set('), 'cliente não pode apagar todas as ocorrências pela identidade global');
assert.ok(!clientSource.includes('normalizeCrewRosterReportContinuationDays(offsetAwareDays,'), 'offsets autoritativos não podem ser aplicados duas vezes no cliente');

for (const marker of [
  'function buildServerCrewRosterOffsetBlocks(',
  'function rebuildServerCrewRosterOffsetDays(',
  'function serverCrewRosterMckDays(',
  'function serverCrewRosterLegIdentity(',
  'function serverCrewRosterReplacementKeys(',
  'const replacementKeys = serverCrewRosterReplacementKeys(',
  'rebuildServerCrewRosterOffsetDays(roster.days, fullText,',
  "'FH','MCK','MCK320'",
  'const fh=fullText.match(',
  'const dh=fullText.match(',
]) assert.ok(serverSource.includes(marker), `proteção de agosto ausente no servidor: ${marker}`);
assert.ok(!serverSource.includes('const authoritativeIdentities = new Set('), 'servidor não pode apagar todas as ocorrências pela identidade global');
assert.equal((applySource.match(/\| \/\^MCK\(\?:320\|_SS\)\?\$\/\.test\(code\)/g) || []).length, 1, 'transformação MCK deve ter uma única expressão final');
assert.ok(applySource.includes("replaceRequired(next, oldMckCodeExpression, newMckCodeExpression, 'classificação MCK idempotente')"), 'transformação MCK deve ser protegida por replaceRequired');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-v14345-'));
try {
  const testModulePath = path.join(tempDir, 'rosterParser-august-test.mjs');
  const exported = serverSource.replace(
    'export { parsePdfOnServer };',
    'export { parsePdfOnServer, parseServerRosterReport, rebuildServerCrewRosterOffsetDays, finalizeServerDays, extractTotals, buildServerCrewRosterOffsetBlocks, serverCrewRosterReplacementKeys };',
  );
  assert.notEqual(exported, serverSource, 'não foi possível habilitar hooks internos do parser');
  fs.writeFileSync(testModulePath, exported, 'utf8');
  const parser = await import(`${pathToFileURL(testModulePath).href}?v=${Date.now()}`);

  const blocks = parser.buildServerCrewRosterOffsetBlocks(fixture, 2026);
  const julyContinuation = blocks.find((block) => block.dayToken === '30' && block.monthToken === 'Jul' && /\bLA3512\b/.test(block.text));
  assert.ok(julyContinuation, 'pairing <== deve gerar um bloco explícito de 30/07 antes da distribuição');
  assert.equal(blocks.some((block) => /^Roster\s+Report/i.test(block.text)), false, 'cabeçalho do relatório não pode virar programação');
  assert.ok(blocks.some((block) => block.dayToken === '06' && /\bMCK\b/.test(block.text)), 'bloco de 06/08 deve carregar as duas atividades MCK');

  const initial = parser.parseServerRosterReport(fixture, [], 'CrewRosterReport-August-2026.pdf');
  const rebuilt = parser.rebuildServerCrewRosterOffsetDays(initial.days, fixture, 8, 2026, 'BSB');
  const days = parser.finalizeServerDays(rebuilt, 8, 2026, 'BSB');
  const byDate = (date) => days.filter((day) => day.date === date);
  const flights = (date) => byDate(date).flatMap((day) => day.legs || []);
  const flightNumbers = (date) => flights(date).map((leg) => leg.flightNumber);

  assert.deepEqual(flightNumbers('01/08/2026'), ['LA3286', 'LA3111'], '01/08 deve receber as pernas +2 da jornada iniciada em julho');
  assert.deepEqual(flightNumbers('06/08/2026'), ['LA4737']);
  assert.deepEqual(flightNumbers('08/08/2026'), ['LA3010'], 'LA3010 +2 deve ficar em 08/08');
  assert.deepEqual(flightNumbers('09/08/2026'), ['LA3850']);
  assert.deepEqual(flightNumbers('10/08/2026'), ['LA3197', 'LA3638']);
  assert.deepEqual(flightNumbers('11/08/2026'), ['LA3895', 'LA3728', 'LA3027']);
  assert.deepEqual(flightNumbers('19/08/2026'), ['LA3402', 'LA4519', 'LA3690']);
  assert.deepEqual(flightNumbers('20/08/2026'), ['LA3463', 'LA3382']);
  assert.deepEqual(flightNumbers('21/08/2026'), ['LA3171', 'LA4546']);
  assert.deepEqual(flightNumbers('24/08/2026'), ['LA4794', 'LA3994', 'LA3232']);
  assert.deepEqual(flightNumbers('25/08/2026'), ['LA3899', 'LA3861', 'LA3308']);
  assert.deepEqual(flightNumbers('26/08/2026'), ['LA4781', 'LA4613', 'LA4736']);
  assert.deepEqual(flightNumbers('29/08/2026'), ['LA3953', 'LA3590', 'LA3591']);
  assert.deepEqual(flightNumbers('30/08/2026'), ['LA3149', 'LA3102', 'LA3235', 'LA3226']);
  assert.deepEqual(flightNumbers('31/08/2026'), ['LA3543', 'LA4662', 'LA3137', 'LA3308']);
  assert.deepEqual(flightNumbers('01/09/2026'), ['LA3737', 'LA4737', 'LA4546']);

  const mck = byDate('07/08/2026').filter((day) => /^MCK/.test(day.pairingCode || ''));
  assert.equal(mck.length, 2, 'duas atividades MCK distintas devem sobreviver no mesmo dia');
  assert.deepEqual(mck.map((day) => `${day.dutyReport}-${day.dutyDebrief}`), ['09:00-13:00', '14:00-18:00']);
  assert.equal(byDate('06/08/2026').filter((day) => /^MCK/.test(day.pairingCode || '')).length, 0, 'MCK +1 não pode permanecer em 06/08');

  const overnightMckText = '06-Aug-2026 Thu MCK CGH 23:00(+1) CGH 01:00(+2)';
  const overnightMck = parser.rebuildServerCrewRosterOffsetDays([], overnightMckText, 8, 2026, 'BSB');
  const overnightDay = overnightMck.find((day) => day.date === '07/08/2026' && /^MCK/.test(day.pairingCode || ''));
  assert.ok(overnightDay, 'MCK noturno deve ser datado pelo início +1, não pelo término +2');
  assert.equal(overnightDay.dutyReport, '23:00');
  assert.equal(overnightDay.dutyDebrief, '01:00');
  assert.equal(overnightDay.isNextDay, true);
  assert.equal(overnightMck.some((day) => day.date === '08/08/2026' && /^MCK/.test(day.pairingCode || '')), false, 'MCK noturno não pode ser deslocado para a data do término');

  assert.equal(byDate('13/08/2026').some((day) => day.type === 'DR'), true);
  assert.equal(byDate('16/08/2026').some((day) => day.type === 'DR'), true);
  assert.equal(byDate('17/08/2026').some((day) => day.type === 'HSB' && day.dutyReport === '02:00' && day.dutyDebrief === '14:00'), true);
  assert.equal(byDate('18/08/2026').some((day) => day.type === 'HSB' && day.dutyReport === '03:00' && day.dutyDebrief === '15:00'), true);

  const totalLegs = days.reduce((sum, day) => sum + (day.legs?.length || 0), 0);
  assert.equal(totalLegs, 46, 'todas as 46 etapas do contexto julho-agosto-setembro devem ser preservadas');
  const datedIdentities = days.flatMap((day) => (day.legs || []).map((leg) => `${day.date}|${leg.flightNumber}|${leg.origin}|${leg.destination}`));
  assert.equal(new Set(datedIdentities).size, datedIdentities.length, 'pernas reconstruídas não podem coexistir com cópias malformadas na mesma data civil');
  assert.deepEqual(days.flatMap((day) => (day.legs || []).filter((leg) => leg.flightNumber === 'LA3308').map(() => day.date)), ['25/08/2026', '31/08/2026'], 'LA3308 legítimo deve permanecer nas duas datas');
  assert.deepEqual(days.flatMap((day) => (day.legs || []).filter((leg) => leg.flightNumber === 'LA4737').map(() => day.date)), ['06/08/2026', '01/09/2026'], 'LA4737 legítimo deve permanecer nas duas datas');

  const scopedOriginals = [
    { date: '06/08/2026', dayNumber: 6, month: 8, year: 2026, pairingCode: 'LA1111/060826/JJCC320-P', legs: [{ flightNumber: 'LA9999', origin: 'BSB', destination: 'CGH', departureTime: '10:00', arrivalTime: '11:40' }] },
    { date: '20/08/2026', dayNumber: 20, month: 8, year: 2026, pairingCode: 'LA2222/200826/JJCC320-P', legs: [{ flightNumber: 'LA9999', origin: 'BSB', destination: 'CGH', departureTime: '18:00', arrivalTime: '19:40' }] },
  ];
  const scopedAuthority = [
    { date: '07/08/2026', dayNumber: 7, month: 8, year: 2026, pairingCode: 'LA1111/060826/JJCC320-P', legs: [{ flightNumber: 'LA9999', origin: 'BSB', destination: 'CGH', departureTime: '10:05', arrivalTime: '11:45' }] },
  ];
  const scopedKeys = parser.serverCrewRosterReplacementKeys(scopedOriginals, scopedAuthority);
  assert.equal(scopedKeys.has('0|0'), true, 'reconstrução deve substituir a ocorrência do mesmo pairing, mesmo com data/horário malformado');
  assert.equal(scopedKeys.has('1|0'), false, 'ocorrência legítima de outro pairing não pode ser apagada pela identidade global');

  for (const day of days.filter((item) => (item.legs?.length || 0) > 1)) {
    for (let index = 1; index < day.legs.length; index++) {
      assert.equal(day.legs[index - 1].destination, day.legs[index].origin, `${day.date} não pode conter teletransporte entre ${day.legs[index - 1].flightNumber} e ${day.legs[index].flightNumber}`);
    }
  }

  const totals = parser.extractTotals(fixture);
  assert.equal(totals.flightHours, 67 + 40 / 60, 'FH deve ser lido mesmo depois de DH');
  assert.equal(totals.dutyHours, 142 + 35 / 60, 'DH deve ser lido antes ou depois de FH');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

for (const protectedPath of ['client/src/lib/financialRules.ts', 'client/src/lib/regulationEngine.ts', 'server/platform.mjs']) {
  assert.ok(!applySource.includes(`update('${protectedPath}'`), `correção da escala não pode alterar ${protectedPath}`);
}

const tracked = [
  'client/src/lib/pdfParser.ts',
  'server/rosterParser.mjs',
  'client/src/pages/Home.tsx',
  'client/src/App.tsx',
  'client/index.html',
  'client/public/sw.js',
  'client/public/release.json',
];
const before = new Map(tracked.map((relative) => [relative, read(relative)]));
const apply = spawnSync(process.execPath, [path.join(root, 'scripts/v14345/apply.mjs')], { cwd: root, encoding: 'utf8' });
assert.equal(apply.status, 0, apply.stderr || apply.stdout || 'segunda aplicação v14.3.45 falhou');
for (const relative of tracked) assert.equal(read(relative), before.get(relative), `v14.3.45 deve ser idempotente em ${relative}`);

console.log('v14.3.45 August CrewRoster: previous-month continuation, explicit +1/+2/+3 dates, two MCK activities, scoped replacements, overnight MCK start date, repeated legitimate flights, 46 flights, no teleports, FH/DH order and idempotency validated.');
