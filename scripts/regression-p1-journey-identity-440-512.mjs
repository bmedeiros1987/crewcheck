/**
 * P-1 regression gate for #440 (teletransporte / continuidade física) e
 * #512 (mesma jornada atravessando meia-noite contada como duas madrugadas).
 *
 * Caso real de referência (#512, evidência 19->20/08/2026):
 *   Jornada A: LA3347 BPS->GRU, apresentação 01:40, 03:35->05:40, término 06:10.
 *   Jornada B: apresentação 22:43, LA3382 GRU->REC 23:30->02:30(+1),
 *              seguida de LA3123 REC->BSB 03:55(+1)->06:40(+1), término 07:10(+1).
 *
 * As duas jornadas ocupam o MESMO dateKey civil (19/08) e a segunda atravessa a
 * meia-noite. A fixture real `crew-roster-august-2026.txt` prova que o parser
 * canônico de fato entrega RosterDay com várias jornadas dentro (19/08 carrega
 * 5 pernas espalhadas por 19->21/08), portanto este cenário não é hipotético.
 *
 * Estas regressões descrevem o comportamento CORRETO. Espera-se que falhem
 * enquanto a identidade de jornada não existir no modelo.
 */

import { loadClientModules, TYPE_ONLY_PDF_PARSER_STUB, readRepoFile, createChecker } from './lib/ts-module-harness.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const harness = loadClientModules({
  prefix: 'crewcheck-journey-identity-',
  stubs: TYPE_ONLY_PDF_PARSER_STUB,
  files: [
    'client/src/lib/rosterCodes.ts',
    'client/src/lib/actRules.ts',
    'client/src/lib/rosterContinuity.ts',
    'client/src/lib/canonicalRoster.ts',
    'client/src/lib/complianceEngine.ts',
  ],
});

const { buildCanonicalRosterEvents, normalizeRosterDays } = harness.load('canonicalRoster');
const { analyzeCompliance } = harness.load('complianceEngine');

/**
 * O parser V3 do servidor é a única implementação do formato CrewRosterReport
 * carregável fora do bundle Vite. Expor os hooks internos permite testar a
 * cadeia real (texto publicado -> dias canônicos) sem alterar comportamento.
 */
async function loadServerRosterParser() {
  const source = readRepoFile('server/rosterParser.mjs');
  const patched = source.replace(
    'export { parsePdfOnServer };',
    'export { parsePdfOnServer, parseServerRosterReport, finalizeServerDays };',
  );
  if (patched === source) throw new Error('não foi possível expor hooks internos do parser V3');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-v3-parser-'));
  const file = path.join(dir, 'rosterParser.mjs');
  fs.writeFileSync(file, patched);
  return { parser: await import(pathToFileURL(file).href), cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

const checker = createChecker('P-1 #440/#512 — identidade de jornada');
const { check } = checker;

const leg = (flightNumber, origin, destination, departureTime, arrivalTime, extra = {}) => ({
  flightNumber, origin, destination, departureTime, arrivalTime, workType: 'OP', ...extra,
});
const makeRoster = (days) => ({
  crewName: 'T', crewId: '1', base: 'BSB', rank: 'CCM', month: 8, year: 2026,
  rawText: 'CrewRosterReport 01-Aug-2026 to 31-Aug-2026', days,
});

// ===========================================================================
// R1/R2 — DERIVAÇÃO (#512): duas jornadas dentro do mesmo RosterDay.
// Estado real produzido pelo parser: a jornada B perde a apresentação e vira
// "Conexão/Solo" da jornada A, gerando o falso solo relatado na issue.
// ===========================================================================
const mergedRoster = makeRoster([
  {
    date: '19/08/2026', dayOfWeek: 'QUA', dayNumber: 19, month: 8, year: 2026,
    type: 'VOO', pairingCode: 'LA3347', dutyReport: '01:40', dutyDebrief: '03:00',
    dutyHours: null, flyingHours: null, isNextDay: true, hotel: null, base: 'BSB',
    legs: [
      leg('LA3347', 'BPS', 'GRU', '03:35', '05:40'),
      leg('LA3382', 'GRU', 'REC', '23:30', '02:30', { isNextDay: true }),
    ],
  },
  {
    date: '20/08/2026', dayOfWeek: 'QUI', dayNumber: 20, month: 8, year: 2026,
    type: 'VOO', pairingCode: 'LA3123', dutyReport: '03:55', dutyDebrief: '07:10',
    dutyHours: null, flyingHours: null, isNextDay: false, hotel: null, base: 'BSB',
    legs: [leg('LA3123', 'REC', 'BSB', '03:55', '06:40')],
  },
]);

const mergedEvents = buildCanonicalRosterEvents(mergedRoster).filter((event) => event.kind === 'flight');
const eventOf = (flightNumber) => mergedEvents.find((event) => event.flightNumber === flightNumber);
const la3382 = eventOf('LA3382');
const la3123 = eventOf('LA3123');

console.log('\n[R1/R2] eventos derivados do dia com duas jornadas:');
for (const event of mergedEvents) {
  console.log(`   ${event.date} ${event.flightNumber} showPresentation=${event.showPresentation} presentation=${event.presentation} groundBefore=${event.groundBeforeMinutes}`);
}

check(
  'R1a LA3382 não recebe groundBeforeMinutes de 1070 (falso solo de 17h50)',
  Boolean(la3382) && la3382.groundBeforeMinutes !== 1070,
  `groundBeforeMinutes=${la3382 && la3382.groundBeforeMinutes}`,
);
check(
  'R1b LA3382 abre jornada própria e mantém apresentação (não é conexão da jornada A)',
  Boolean(la3382 && la3382.showPresentation),
  `showPresentation=${la3382 && la3382.showPresentation}, presentation=${la3382 && la3382.presentation}`,
);
check(
  'R2 LA3123 é carry-over da jornada de LA3382 e não inventa apresentação nova',
  Boolean(la3123) && la3123.showPresentation === false,
  `showPresentation=${la3123 && la3123.showPresentation} (esperado false: continuação após 00:00 herda a jornada)`,
);

// ===========================================================================
// R3/R4 — #440 sobre a fixture REAL: nenhuma perna publicada pode desaparecer,
// e a sequência que sobrevive precisa ser fisicamente contínua.
// ===========================================================================
const { parser: serverParser, cleanup: cleanupParser } = await loadServerRosterParser();
const fixture = readRepoFile('scripts/fixtures/crew-roster-august-2026.txt');
const parsedDays = serverParser.finalizeServerDays(
  serverParser.parseServerRosterReport(fixture, [], 'CrewRosterReport-August-2026.pdf').days,
  8, 2026, 'BSB',
);
const fixtureRoster = { ...makeRoster(parsedDays), rawText: fixture };

const parsedLegCount = parsedDays.reduce((sum, day) => sum + (day.legs || []).length, 0);
const normalizedDays = normalizeRosterDays(fixtureRoster).days;
const normalizedLegCount = normalizedDays.reduce((sum, day) => sum + (day.legs || []).length, 0);

const parsedFlightNumbers = new Set(parsedDays.flatMap((day) => (day.legs || []).map((item) => item.flightNumber)));
const normalizedFlightNumbers = new Set(normalizedDays.flatMap((day) => (day.legs || []).map((item) => item.flightNumber)));
const dropped = [...parsedFlightNumbers].filter((flightNumber) => !normalizedFlightNumbers.has(flightNumber));

console.log(`\n[R3] pernas no parser canônico: ${parsedLegCount} -> após normalizeRosterDays: ${normalizedLegCount}`);
if (dropped.length) console.log(`   voos descartados silenciosamente: ${dropped.join(', ')}`);

check(
  'R3 normalizeRosterDays não descarta silenciosamente pernas publicadas',
  dropped.length === 0,
  `${dropped.length} voos sumiram da escala: ${dropped.join(', ')}`,
);

const fixtureEvents = buildCanonicalRosterEvents(fixtureRoster).filter((event) => event.kind === 'flight');
const impossible = [];
for (const day of normalizedDays) {
  const legs = day.legs || [];
  for (let index = 1; index < legs.length; index += 1) {
    if (legs[index - 1].destination !== legs[index].origin) {
      impossible.push(`${day.date}: ${legs[index - 1].flightNumber}(${legs[index - 1].destination}) -> ${legs[index].flightNumber}(${legs[index].origin})`);
    }
  }
}
check(
  'R4 nenhuma sequência fisicamente impossível sobrevive na escala normalizada',
  impossible.length === 0,
  impossible.join('; '),
);

// A evidência do #440 cita justamente BEL->MCP e GRU->FLN em 25/08.
const fixtureFlights = new Set(fixtureEvents.map((event) => event.flightNumber));
check(
  'R4b voos da evidência #440 (LA3899 BEL->MCP, LA3861, LA3308) continuam na escala',
  ['LA3899', 'LA3861', 'LA3308'].every((flightNumber) => fixtureFlights.has(flightNumber)),
  `presentes: ${['LA3899', 'LA3861', 'LA3308'].filter((flightNumber) => fixtureFlights.has(flightNumber)).join(', ') || 'nenhum'}`,
);

cleanupParser();

// ===========================================================================
// R5 — REGULAMENTAÇÃO (#512): o carry-over precisa ser absorvido pela jornada
// de origem mesmo quando o parser não marcou `isNextDay` no dia, porque a
// evidência de cruzamento de meia-noite está nas pernas.
// ===========================================================================
const journeyA = {
  date: '19/08/2026', dayOfWeek: 'QUA', dayNumber: 19, month: 8, year: 2026,
  type: 'VOO', pairingCode: 'LA3347', dutyReport: '01:40', dutyDebrief: '06:10',
  dutyHours: null, flyingHours: null, isNextDay: false, hotel: null, base: 'BSB',
  legs: [leg('LA3347', 'BPS', 'GRU', '03:35', '05:40')],
};
// Jornada B: atravessa a meia-noite, mas o dia NÃO foi marcado isNextDay.
const journeyBFragile = {
  date: '19/08/2026', dayOfWeek: 'QUA', dayNumber: 19, month: 8, year: 2026,
  type: 'VOO', pairingCode: 'LA3382', dutyReport: '22:43', dutyDebrief: '03:00',
  dutyHours: null, flyingHours: null, isNextDay: false, hotel: null, base: 'BSB',
  legs: [leg('LA3382', 'GRU', 'REC', '23:30', '02:30', { isNextDay: true })],
};
const journeyBCarryOver = {
  date: '20/08/2026', dayOfWeek: 'QUI', dayNumber: 20, month: 8, year: 2026,
  type: 'VOO', pairingCode: 'LA3123', dutyReport: '03:55', dutyDebrief: '07:10',
  dutyHours: null, flyingHours: null, isNextDay: false, hotel: null, base: 'BSB',
  legs: [leg('LA3123', 'REC', 'BSB', '03:55', '06:40')],
};

const fragile = analyzeCompliance(makeRoster([journeyA, journeyBFragile, journeyBCarryOver]));
console.log(`\n[R5] carry-over com isNextDay ausente -> maxConsecutiveNights=${fragile.metrics.maxConsecutiveNights}`);
check(
  'R5 carry-over não vira madrugada própria quando o dia não marcou isNextDay',
  fragile.metrics.maxConsecutiveNights === 1,
  `maxConsecutiveNights=${fragile.metrics.maxConsecutiveNights} (esperado 1: 19/08 concentra as duas jornadas e o dia 20 é continuação)`,
);

// ===========================================================================
// R6 — Contraprova: madrugadas realmente distintas continuam contando e alertando.
// ===========================================================================
const distinctNight = (date, dayNumber, flightNumber) => ({
  date, dayOfWeek: 'X', dayNumber, month: 8, year: 2026,
  type: 'VOO', pairingCode: flightNumber, dutyReport: '02:10', dutyDebrief: '05:10',
  dutyHours: null, flyingHours: null, isNextDay: false, hotel: null, base: 'BSB',
  legs: [leg(flightNumber, 'BSB', 'CGH', '02:40', '04:10')],
});
const threeDistinct = analyzeCompliance(makeRoster([
  distinctNight('19/08/2026', 19, 'LA9001'),
  distinctNight('20/08/2026', 20, 'LA9002'),
  distinctNight('21/08/2026', 21, 'LA9003'),
]));
const nightAlerts = threeDistinct.alerts.filter((alert) => /madrugada|noturn/i.test(alert.title));
console.log(`[R6] três jornadas noturnas distintas -> maxConsecutiveNights=${threeDistinct.metrics.maxConsecutiveNights}, alertas=${nightAlerts.length}`);
check(
  'R6a três madrugadas realmente distintas continuam contando 3',
  threeDistinct.metrics.maxConsecutiveNights === 3,
  `maxConsecutiveNights=${threeDistinct.metrics.maxConsecutiveNights}`,
);
check(
  'R6b alerta legítimo de madrugadas consecutivas continua disparando',
  nightAlerts.length > 0,
  `alertas encontrados: ${nightAlerts.length}`,
);

harness.cleanup();
process.exit(checker.report() > 0 ? 1 : 0);
