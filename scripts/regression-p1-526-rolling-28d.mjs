import { loadClientModules, TYPE_ONLY_PDF_PARSER_STUB, createChecker } from './lib/ts-module-harness.mjs';

const harness = loadClientModules({
  prefix: 'crewcheck-526-rolling-28d-',
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
const checker = createChecker('P-1 #526 — janela móvel real de 28 dias');
const { check } = checker;

const pad = (value) => String(value).padStart(2, '0');
const toDateKey = (date) => `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;

function flightDay(date, hours) {
  return {
    date: toDateKey(date),
    dayOfWeek: 'SEG',
    dayNumber: date.getUTCDate(),
    month: date.getUTCMonth() + 1,
    year: date.getUTCFullYear(),
    type: 'VOO',
    pairingCode: 'OP',
    dutyReport: '08:00',
    dutyDebrief: '12:30',
    dutyHours: hours + 1,
    flyingHours: hours,
    isNextDay: false,
    hotel: null,
    base: 'BSB',
    rawText: 'OP',
    legs: [{
      flightNumber: 'LA0001',
      origin: 'BSB',
      destination: 'GRU',
      departureTime: '09:00',
      arrivalTime: '12:00',
      duration: hours,
      workType: 'OP',
    }],
  };
}

function roster(days, month = 9, year = 2026) {
  return {
    crewName: 'TEST',
    crewId: 'TEST',
    base: 'BSB',
    rank: 'CCM',
    month,
    year,
    rawText: 'TEST ROSTER',
    days,
  };
}

function dayRange(startIso, count, hours) {
  const start = new Date(`${startIso}T00:00:00.000Z`);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start.getTime() + index * 86_400_000);
    return flightDay(date, hours);
  });
}

// 31 dias a 3h/dia = 93h no agregado bruto, mas nenhuma janela de 28 dias
// pode ultrapassar 84h. A regra deve olhar a janela móvel, não o mês inteiro.
const thirtyOneDays = analyzeCompliance(roster(dayRange('2026-08-15', 31, 3)));
check(
  '31 dias x 3h produz pior janela de 28 dias = 84h',
  thirtyOneDays.metrics.maxFlightHoursRolling28Days === 84,
  `maxFlightHoursRolling28Days=${thirtyOneDays.metrics.maxFlightHoursRolling28Days}`,
);

// Fronteira D28/D29: o primeiro dia deve sair exatamente quando o 29º entra.
// 28 dias x 4h = 112h; adicionar o 29º dia não pode criar janela de 116h.
const twentyNineDays = analyzeCompliance(roster(dayRange('2026-08-10', 29, 4)));
check(
  'D29 expulsa D1: pior janela permanece 112h, nunca 116h',
  twentyNineDays.metrics.maxFlightHoursRolling28Days === 112,
  `maxFlightHoursRolling28Days=${twentyNineDays.metrics.maxFlightHoursRolling28Days}`,
);

// Histórico anterior entra no limite móvel, mas não deve inflar o KPI da
// competência ativa. Agosto fornece 81h dentro da janela Ago/Set sem criar um
// dia civil extra em setembro: 26 dias Ago 6..31 x 3h, mais uma segunda
// ocorrência de 3h em Ago 31. Setembro fornece apenas Sep 2 = 8h.
const augustHistory = dayRange('2026-08-06', 26, 3);
const august31 = new Date('2026-08-31T00:00:00.000Z');
const crossMonthDays = [
  ...augustHistory,
  flightDay(august31, 3),
  ...dayRange('2026-09-02', 1, 8),
];
const crossMonth = analyzeCompliance(roster(crossMonthDays, 9, 2026));
check(
  'histórico anterior compõe a janela móvel da competência atual',
  crossMonth.metrics.maxFlightHoursRolling28Days === 89,
  `maxFlightHoursRolling28Days=${crossMonth.metrics.maxFlightHoursRolling28Days}`,
);
check(
  'histórico anterior não infla totalFlightHours da competência atual',
  crossMonth.metrics.totalFlightHours === 8,
  `totalFlightHours=${crossMonth.metrics.totalFlightHours}`,
);

const failures = checker.report();
harness.cleanup();
if (failures) process.exit(1);
