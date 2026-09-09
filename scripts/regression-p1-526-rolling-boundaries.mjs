import { loadClientModules, TYPE_ONLY_PDF_PARSER_STUB, createChecker } from './lib/ts-module-harness.mjs';

const harness = loadClientModules({
  stubs: TYPE_ONLY_PDF_PARSER_STUB,
  files: ['client/src/lib/complianceEngine.ts'],
});
const { analyzeCompliance } = harness.load('complianceEngine');
const checker = createChecker('P0 #526 rolling coverage and active competence');
const { check } = checker;
const DAY = 86400000;
const start = Date.UTC(2032, 4, 1);
function day(offset, hours = 0, aircraftType = 'A320') {
  const d = new Date(start + offset * DAY);
  return {
    date: `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`,
    dayNumber: d.getUTCDate(), month: d.getUTCMonth() + 1, year: d.getUTCFullYear(),
    type: hours ? 'VOO' : 'FOLGA', rawText: hours ? 'OP' : 'FOLGA',
    flyingHours: hours, dutyHours: hours ? hours + 1 : 0,
    legs: hours ? [{ duration: hours, aircraftType, workType: 'OP' }] : [],
  };
}
const range = (offset, count, hours = 0, aircraft) => Array.from({ length: count }, (_, i) => day(offset + i, hours, aircraft));
const analyze = days => analyzeCompliance({ month: 5, year: 2032, rank: 'CCM', days, rawText: '' });
const violation = r => r.alerts.some(a => a.title === 'Limite de 28 dias de horas de voo excedido' && a.classification === 'confirmada');
const incomplete = r => r.alerts.some(a => /28 dias.*incompleta/i.test(a.title) && a.severity === 'warning' && a.classification === 'atencao');

const partial = analyze(range(0, 11, 3.5));
check('missing previous history is explicitly incomplete', incomplete(partial));
check('missing days never invent flight hours', partial.metrics.maxFlightHoursRolling28Days === 38.5);
const coveredDays = [...range(-27, 10), ...range(-17, 28, 3.5)];
const covered = analyze(coveredDays);
check('27 prior days cover the assessment through last active day', !incomplete(covered));
check('covered 98h/90h remains confirmed', violation(covered));
check('active KPI excludes prior history', covered.metrics.totalFlightHours === 38.5);
const gap = analyze(coveredDays.filter((_, i) => i !== 5));
check('an interior missing day cannot masquerade as coverage', incomplete(gap));
const duplicate = analyze([...coveredDays.filter((_, i) => i !== 5), coveredDays[0]]);
check('duplicate dates do not fill missing coverage', incomplete(duplicate));
const wide = analyze([...range(-27, 10), ...range(-17, 28, 3.5, 'B777')]);
check('covered 98h/100h is not a violation', !violation(wide) && !incomplete(wide));
const next = analyze([...range(-27, 58), ...range(31, 28, 3.5)]);
check('next publication cannot create active violation', !violation(next));
check('next publication cannot inflate active rolling metric', next.metrics.maxFlightHoursRolling28Days === 0);
check('next publication cannot inflate active KPI', next.metrics.totalFlightHours === 0);
const futureCross = analyze([...range(-27, 57), day(30, 3.5), ...range(31, 27, 3.5)]);
check('future days also excluded from crossing windows', futureCross.metrics.maxFlightHoursRolling28Days === 3.5 && !violation(futureCross));
const implausible = analyze([...range(-27, 27), ...range(0, 4, 120)]);
check('480h remains warning/review', !violation(implausible) && implausible.alerts.some(a => /revisar base de cálculo/i.test(a.title) && a.severity === 'warning'));
const repeated = analyze([...range(-27, 27), day(0, 2), day(0, 3)]);
check('same-day multiplicity preserved', repeated.metrics.maxFlightHoursRolling28Days === 5);
const failures = checker.report();
harness.cleanup();
if (failures) process.exit(1);
