import { loadClientModules, TYPE_ONLY_PDF_PARSER_STUB, createChecker } from './lib/ts-module-harness.mjs';

const harness = loadClientModules({
  prefix: 'crewcheck-526-rolling-kernel-',
  stubs: TYPE_ONLY_PDF_PARSER_STUB,
  files: ['client/src/lib/rollingFlightHours.ts'],
});
const { maxFlightHoursRolling28Days, sumFlightHoursForCompetence, crewDateUtcEpoch } = harness.load('rollingFlightHours');
const checker = createChecker('P-1 #526 — kernel UTC da janela móvel de 28 dias');
const { check } = checker;

const pad = (value) => String(value).padStart(2, '0');
function observations(startIso, count, hours) {
  const start = new Date(`${startIso}T00:00:00.000Z`);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start.getTime() + index * 86_400_000);
    return {
      date: `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`,
      hours,
    };
  });
}

check(
  '31 dias x 3h => maior janela D1..D28 = 84h',
  maxFlightHoursRolling28Days(observations('2026-08-15', 31, 3)) === 84,
);
check(
  'D29 expulsa D1: 29 dias x 4h continuam em 112h',
  maxFlightHoursRolling28Days(observations('2026-08-10', 29, 4)) === 112,
);

const crossMonth = [
  ...observations('2026-08-05', 27, 3),
  ...observations('2026-09-02', 1, 8),
];
check(
  'histórico anterior participa da janela móvel',
  maxFlightHoursRolling28Days(crossMonth) === 89,
);
check(
  'histórico anterior não infla KPI da competência ativa',
  sumFlightHoursForCompetence(crossMonth, 9, 2026) === 8,
);

check(
  'múltiplas ocorrências no mesmo dia são somadas antes da janela',
  maxFlightHoursRolling28Days([
    { date: '02/09/2026', hours: 5 },
    { date: '02/09/2026', hours: 3 },
  ]) === 8,
);
check(
  'datas civis inválidas falham fechado e não viram observação',
  crewDateUtcEpoch('31/02/2026') === null
    && maxFlightHoursRolling28Days([{ date: '31/02/2026', hours: 99 }]) === 0,
);

const failures = checker.report();
harness.cleanup();
if (failures) process.exit(1);
