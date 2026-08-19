/**
 * PR B — #512 (regulamentação 168h): madrugadas contadas por jornada
 * qualificável, não por dateKey civil.
 *
 * Pré-requisito (PR A, já mesclado): `buildCanonicalRosterEvents` deriva
 * `journeyId`/`journeyBoundary` por evidência publicada, não por posição no
 * array nem por `dateKey`. Este PR reusa essa identidade dentro do agregador
 * de madrugada em vez de reimplementar uma heurística paralela — a
 * investigação original apontou exatamente essa duplicação de heurísticas
 * entre consumidores como causa estrutural.
 *
 * Duas métricas, tratadas como regras independentes (exigido explicitamente):
 *   - countNightOpsInRolling168h: conta OCORRÊNCIAS (cada jornada
 *     qualificável conta 1, mesmo que duas caiam no mesmo dia civil);
 *   - countMaxConsecutiveMadrugadas: conta NOITES CIVIS distintas em
 *     sequência (duas jornadas na mesma noite não inflam o streak).
 */

import { loadClientModules, TYPE_ONLY_PDF_PARSER_STUB, createChecker } from './lib/ts-module-harness.mjs';

const harness = loadClientModules({
  prefix: 'crewcheck-night-ops-',
  stubs: TYPE_ONLY_PDF_PARSER_STUB,
  files: [
    'client/src/lib/rosterCodes.ts',
    'client/src/lib/actRules.ts',
    'client/src/lib/rosterContinuity.ts',
    'client/src/lib/canonicalRoster.ts',
    'client/src/lib/embeddedFormalDaysOff.ts',
    'client/src/lib/complianceEngine.ts',
  ],
});
const { analyzeCompliance } = harness.load('complianceEngine');

const checker = createChecker('PR B #512 — madrugada por jornada, não por dateKey');
const { check } = checker;

const leg = (flightNumber, origin, destination, departureTime, arrivalTime, extra = {}) => ({
  flightNumber, origin, destination, departureTime, arrivalTime, workType: 'OP', ...extra,
});
const makeRoster = (days) => ({
  crewName: 'T', crewId: '1', base: 'BSB', rank: 'CCM', month: 8, year: 2026,
  rawText: 'CrewRosterReport 01-Aug-2026 to 31-Aug-2026', days,
});
const nightAlerts = (result) => result.alerts.filter((alert) => /madrugada|noturn/i.test(alert.title));

// ===========================================================================
// Caso real de referência (19->20/08/2026): Jornada A fechada + Jornada B
// cruzando meia-noite, ambas legítimas. Espera-se 2, nunca 3.
// ===========================================================================
const journeyA = {
  date: '19/08/2026', dayOfWeek: 'QUA', dayNumber: 19, month: 8, year: 2026,
  type: 'VOO', pairingCode: 'LA3347', dutyReport: '01:40', dutyDebrief: '06:10',
  dutyHours: null, flyingHours: null, isNextDay: false, hotel: null, base: 'BSB',
  legs: [leg('LA3347', 'BPS', 'GRU', '03:35', '05:40')],
};
const journeyB = {
  date: '19/08/2026', dayOfWeek: 'QUA', dayNumber: 19, month: 8, year: 2026,
  type: 'VOO', pairingCode: 'LA3382', dutyReport: '22:43', dutyDebrief: '03:00',
  dutyHours: null, flyingHours: null, isNextDay: true, hotel: null, base: 'BSB',
  legs: [leg('LA3382', 'GRU', 'REC', '23:30', '02:30', { isNextDay: true })],
};
const journeyBCarryOver = {
  date: '20/08/2026', dayOfWeek: 'QUI', dayNumber: 20, month: 8, year: 2026,
  type: 'VOO', pairingCode: 'LA3123', dutyReport: '03:55', dutyDebrief: '07:10',
  dutyHours: null, flyingHours: null, isNextDay: false, hotel: null, base: 'BSB',
  legs: [leg('LA3123', 'REC', 'BSB', '03:55', '06:40')],
};

const realCase = analyzeCompliance(makeRoster([journeyA, journeyB, journeyBCarryOver]));
console.log(`\n[caso real 19->20/08] maxConsecutiveNights=${realCase.metrics.maxConsecutiveNights}, maxNightOps168hCount=${realCase.metrics.maxNightOps168hCount}`);
// As duas jornadas pertencem à MESMA noite civil (19/08): o streak de noites
// em sequência conta 1 (não há uma segunda noite), mas a janela 168h — que
// conta OCORRÊNCIAS, não noites — precisa refletir as 2 jornadas reais.
// Isso é literalmente "regras independentes", como pedido.
// journeyA toca a madrugada do 19 (01:40-06:10). journeyB (22:43->03:00,
// isNextDay) só toca a janela 00:00-06:00 do dia SEGUINTE — 22:43 é depois
// das 06:00 do 19, então a apresentação tardia não conta como "noite do 19".
// São duas noites civis DISTINTAS e adjacentes: streak = 2, corretamente.
check(
  'streak de noites civis conta 2 (19 e 20 são noites distintas e adjacentes, não a mesma)',
  realCase.metrics.maxConsecutiveNights === 2,
  `maxConsecutiveNights=${realCase.metrics.maxConsecutiveNights}`,
);
check(
  'janela 168h conta as 2 jornadas reais como 2 ocorrências, nunca 3 nem 1',
  realCase.metrics.maxNightOps168hCount === 2,
  `maxNightOps168hCount=${realCase.metrics.maxNightOps168hCount}`,
);

// Mesmo caso, mas com A e B fisicamente entregues DENTRO do mesmo RosterDay
// (a forma patológica que originou "Apresentação —"/"Conexão/Solo 1070min"
// no #512 original). O agregador precisa separar por jornada mesmo aqui.
const mergedDay = {
  date: '19/08/2026', dayOfWeek: 'QUA', dayNumber: 19, month: 8, year: 2026,
  type: 'VOO', pairingCode: 'LA3347', dutyReport: '01:40', dutyDebrief: '03:00',
  dutyHours: null, flyingHours: null, isNextDay: true, hotel: null, base: 'BSB',
  legs: [
    leg('LA3347', 'BPS', 'GRU', '03:35', '05:40'),
    leg('LA3382', 'GRU', 'REC', '23:30', '02:30', { isNextDay: true }),
  ],
};
const mergedCase = analyzeCompliance(makeRoster([mergedDay, journeyBCarryOver]));
console.log(`[caso real, pernas mescladas no mesmo RosterDay] maxConsecutiveNights=${mergedCase.metrics.maxConsecutiveNights}, maxNightOps168hCount=${mergedCase.metrics.maxNightOps168hCount}`);
check(
  'mesmo com as pernas mescladas num RosterDay só, o streak de noites continua 2 (19 e 20)',
  mergedCase.metrics.maxConsecutiveNights === 2,
  `maxConsecutiveNights=${mergedCase.metrics.maxConsecutiveNights}`,
);
check(
  'mesmo com as pernas mescladas num RosterDay só, a janela 168h ainda vê 2 jornadas (não 1 por causa do RosterDay compartilhado)',
  mergedCase.metrics.maxNightOps168hCount === 2,
  `maxNightOps168hCount=${mergedCase.metrics.maxNightOps168hCount}`,
);

// ===========================================================================
// "jornada cruzando 00h = uma ocorrência": isolando só a jornada B (sem A),
// tanto para o streak consecutivo quanto para a janela 168h.
// ===========================================================================
const onlyCrossing = analyzeCompliance(makeRoster([journeyB, journeyBCarryOver]));
console.log(`[apenas jornada cruzando 00h] maxConsecutiveNights=${onlyCrossing.metrics.maxConsecutiveNights}`);
check(
  'jornada única cruzando 00h conta exatamente 1 (não 2 por causa do dia seguinte)',
  onlyCrossing.metrics.maxConsecutiveNights === 1,
  `maxConsecutiveNights=${onlyCrossing.metrics.maxConsecutiveNights}`,
);

// ===========================================================================
// "duas jornadas reais no mesmo dia civil = duas ocorrências quando
// qualificáveis": a janela 168h precisa refletir 2 ocorrências reais mesmo
// quando o streak de noites consecutivas as vê como 1 noite.
// ===========================================================================
const dayC = {
  date: '17/08/2026', dayOfWeek: 'SEG', dayNumber: 17, month: 8, year: 2026,
  type: 'VOO', pairingCode: 'LA9000', dutyReport: '01:10', dutyDebrief: '04:10',
  dutyHours: null, flyingHours: null, isNextDay: false, hotel: null, base: 'BSB',
  legs: [leg('LA9000', 'BSB', 'CGH', '01:40', '03:10')],
};
const sameNightTwice = analyzeCompliance(makeRoster([dayC, journeyA, journeyB, journeyBCarryOver]));
console.log(`[3 jornadas, 19/08 com 2] maxConsecutiveNights=${sameNightTwice.metrics.maxConsecutiveNights}`);
// 17/08 (dayC) não é adjacente a 19/08 (journeyA) - 18/08 fica sem madrugada
// entre elas, quebrando o streak. Mas 19/08 (journeyA) e 20/08 (journeyB,
// que só toca a janela do dia seguinte) SÃO adjacentes => streak de 2, não 1.
check(
  'streak não emenda 17/08 (isolado) com 19/08+20/08 (adjacentes entre si) => maior sequência é 2',
  sameNightTwice.metrics.maxConsecutiveNights === 2,
  `maxConsecutiveNights=${sameNightTwice.metrics.maxConsecutiveNights}`,
);

// ===========================================================================
// Terceira jornada realmente distinta e consecutiva: o alerta de streak
// continua funcionando (guard-rail contra "corrigir" escondendo o alerta).
// ===========================================================================
const dayD = {
  date: '21/08/2026', dayOfWeek: 'SEX', dayNumber: 21, month: 8, year: 2026,
  type: 'VOO', pairingCode: 'LA9001', dutyReport: '02:10', dutyDebrief: '05:10',
  dutyHours: null, flyingHours: null, isNextDay: false, hotel: null, base: 'BSB',
  legs: [leg('LA9001', 'BSB', 'CGH', '02:40', '04:10')],
};
const threeConsecutive = analyzeCompliance(makeRoster([journeyA, journeyB, journeyBCarryOver, dayD]));
console.log(`[19/08 com 2 jornadas + 21/08] maxConsecutiveNights=${threeConsecutive.metrics.maxConsecutiveNights}, maxNightOps168hCount=${threeConsecutive.metrics.maxNightOps168hCount}`);
// Noites civis tocadas: 19 (journeyA), 20 (journeyB toca só a janela do dia
// seguinte + carry-over), 21 (dayD) — três noites adjacentes em sequência.
check(
  '19+20 (2 jornadas, 2 noites adjacentes) + 21 (adjacente a 20) => streak de 3 noites em sequência',
  threeConsecutive.metrics.maxConsecutiveNights === 3,
  `maxConsecutiveNights=${threeConsecutive.metrics.maxConsecutiveNights}`,
);
check(
  'janela 168h conta as 3 jornadas reais (2 em 19/08 + 1 em 21/08)',
  threeConsecutive.metrics.maxNightOps168hCount === 3,
  `maxNightOps168hCount=${threeConsecutive.metrics.maxNightOps168hCount}`,
);

const dayD2 = {
  date: '20/08/2026', dayOfWeek: 'QUI', dayNumber: 20, month: 8, year: 2026,
  type: 'VOO', pairingCode: 'LA9002', dutyReport: '02:10', dutyDebrief: '05:10',
  dutyHours: null, flyingHours: null, isNextDay: false, hotel: null, base: 'BSB',
  legs: [leg('LA9002', 'BSB', 'CGH', '02:40', '04:10')],
};
const threeGenuineNights = analyzeCompliance(makeRoster([journeyA, dayD2, dayD]));
console.log(`[3 jornadas em noites civis 19,20,21 realmente distintas] maxConsecutiveNights=${threeGenuineNights.metrics.maxConsecutiveNights}, alertas=${nightAlerts(threeGenuineNights).length}`);
check(
  'três madrugadas realmente distintas e consecutivas continuam contando 3',
  threeGenuineNights.metrics.maxConsecutiveNights === 3,
  `maxConsecutiveNights=${threeGenuineNights.metrics.maxConsecutiveNights}`,
);
check(
  'alerta legítimo de madrugadas consecutivas continua disparando',
  nightAlerts(threeGenuineNights).length > 0,
  `alertas: ${nightAlerts(threeGenuineNights).length}`,
);

// Janela móvel de 168h deve contar 3 ocorrências reais aqui (regra
// independente do streak de "consecutivas").
console.log(`[168h, 3 noites realmente distintas] maxNightOps168hCount=${threeGenuineNights.metrics.maxNightOps168hCount}`);
check(
  'janela 168h conta as 3 ocorrências nas 3 noites realmente distintas',
  threeGenuineNights.metrics.maxNightOps168hCount === 3,
  `maxNightOps168hCount=${threeGenuineNights.metrics.maxNightOps168hCount}`,
);

// ===========================================================================
// Carry-over sem duplicação: a jornada B sozinha (sem A) cruzando 00h não
// pode contar 2 na janela 168h (isso seria contar a MESMA jornada duas vezes).
// ===========================================================================
console.log(`[168h isolado, só jornada cruzando 00h] maxNightOps168hCount=${onlyCrossing.metrics.maxNightOps168hCount}`);
check(
  'carry-over de uma única jornada conta 1 ocorrência na janela 168h, nunca 2',
  onlyCrossing.metrics.maxNightOps168hCount === 1,
  `maxNightOps168hCount=${onlyCrossing.metrics.maxNightOps168hCount}`,
);

// ===========================================================================
// RES/HSB preservando semântica própria: sobreaviso acionado cedo continua
// contando para madrugada mesmo sem pernas (comportamento pré-existente,
// não pode regredir).
// ===========================================================================
const hsbDay = {
  date: '05/08/2026', dayOfWeek: 'QUA', dayNumber: 5, month: 8, year: 2026,
  type: 'HSB', pairingCode: '', dutyReport: '02:00', dutyDebrief: '14:00',
  dutyHours: null, flyingHours: null, isNextDay: false, hotel: null, base: 'BSB', legs: [],
};
const hsbCase = analyzeCompliance(makeRoster([hsbDay]));
console.log(`[HSB isolado, report 02:00] maxConsecutiveNights=${hsbCase.metrics.maxConsecutiveNights}`);
// Sobreaviso SEM acionamento é disponibilidade, não madrugada trabalhada —
// o CrewCheck já trata isso como contexto separado (alerta próprio de HSB),
// não como ocorrência do streak/janela de madrugada trabalhada. RES/HSB
// ACIONADO (com pernas) segue outro caminho e não é afetado por esta regra.
check(
  'HSB sem acionamento não conta como madrugada trabalhada (é disponibilidade, não trabalho — semântica já existente preservada)',
  hsbCase.metrics.maxConsecutiveNights === 0,
  `maxConsecutiveNights=${hsbCase.metrics.maxConsecutiveNights}`,
);

const resDay = {
  date: '06/08/2026', dayOfWeek: 'QUI', dayNumber: 6, month: 8, year: 2026,
  type: 'RES', pairingCode: '', dutyReport: '08:00', dutyDebrief: '20:00',
  dutyHours: null, flyingHours: null, isNextDay: false, hotel: null, base: 'BSB', legs: [],
};
const resCase = analyzeCompliance(makeRoster([resDay]));
console.log(`[RES isolado, sem acionamento, report 08:00] maxConsecutiveNights=${resCase.metrics.maxConsecutiveNights}`);
check(
  'RES sem acionamento e fora da madrugada não conta (semântica preservada — regra já existente para reserva)',
  resCase.metrics.maxConsecutiveNights === 0,
  `maxConsecutiveNights=${resCase.metrics.maxConsecutiveNights}`,
);

harness.cleanup();
process.exit(checker.report() > 0 ? 1 : 0);
