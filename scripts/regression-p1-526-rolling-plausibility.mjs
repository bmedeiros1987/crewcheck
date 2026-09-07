import { loadClientModules, TYPE_ONLY_PDF_PARSER_STUB, createChecker } from './lib/ts-module-harness.mjs';

const harness = loadClientModules({
  prefix: 'crewcheck-526-rolling-plausibility-',
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
const checker = createChecker('P-1 #526 — plausibilidade da janela móvel de 28 dias');
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

// Contraprova Work/Codex P2: o motor pode receber duração numérica contaminada
// por minutos interpretados como horas. Um rolling implausível não pode virar
// irregularidade regulatória confirmada de alta confiança.
const implausible = analyzeCompliance(roster(dayRange('2026-08-15', 4, 120), 9, 2026));
const implausibleConfirmed = implausible.alerts.find((alert) =>
  alert.title === 'Limite de 28 dias de horas de voo excedido'
  && alert.classification === 'confirmada'
);
const implausibleReview = implausible.alerts.find((alert) =>
  /revisar base de cálculo/i.test(String(alert.title || ''))
  && alert.severity === 'warning'
  && alert.classification !== 'confirmada'
);

check(
  'rolling implausível não vira violação confirmada',
  !implausibleConfirmed,
  `rolling=${implausible.metrics.maxFlightHoursRolling28Days}; alerts=${implausible.alerts.map((alert) => `${alert.title}:${alert.classification || ''}`).join(' | ')}`,
);
check(
  'rolling implausível é rebaixado para revisão da base de cálculo',
  Boolean(implausibleReview),
  `alerts=${implausible.alerts.map((alert) => alert.title).join(' | ')}`,
);

// O guard de plausibilidade não pode esconder uma violação real e plausível.
const realViolation = analyzeCompliance(roster(dayRange('2026-08-15', 28, 3.5), 9, 2026));
const confirmed98h = realViolation.alerts.find((alert) =>
  alert.title === 'Limite de 28 dias de horas de voo excedido'
  && alert.classification === 'confirmada'
  && String(alert.description || '').includes('98.0h')
);
check(
  '98h/28d plausíveis continuam violação confirmada NarrowBody',
  Boolean(confirmed98h),
  `rolling=${realViolation.metrics.maxFlightHoursRolling28Days}; alerts=${realViolation.alerts.map((alert) => `${alert.title}:${alert.classification || ''}`).join(' | ')}`,
);

const failures = checker.report();
harness.cleanup();
if (failures) process.exit(1);
