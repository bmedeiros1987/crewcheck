import { loadClientModules, TYPE_ONLY_PDF_PARSER_STUB, createChecker } from './lib/ts-module-harness.mjs';

const checker = createChecker('P0 canonical — apresentação antes da meia-noite / decolagem após 00:00');
const { check } = checker;

const harness = loadClientModules({
  prefix: 'crewcheck-midnight-apz-',
  stubs: TYPE_ONLY_PDF_PARSER_STUB,
  files: [
    'client/src/lib/rosterContinuity.ts',
    'client/src/lib/canonicalRoster.ts',
  ],
});

const { buildCanonicalRosterEvents } = harness.load('canonicalRoster');

const leg = (flightNumber, origin, destination, departureTime, arrivalTime, extra = {}) => ({
  flightNumber,
  origin,
  destination,
  departureTime,
  arrivalTime,
  workType: 'OP',
  ...extra,
});

const day = (date, dutyReport, dutyDebrief, legs) => {
  const [dd, mm, yyyy] = date.split('/').map(Number);
  return {
    date,
    dayNumber: dd,
    month: mm,
    year: yyyy,
    dayOfWeek: '',
    type: 'VOO',
    pairingCode: legs[0]?.flightNumber || '',
    dutyReport,
    dutyDebrief,
    dutyHours: null,
    flyingHours: null,
    isNextDay: false,
    hotel: null,
    base: 'AAA',
    rawText: 'synthetic',
    legs,
  };
};

// Caso sintético equivalente ao padrão observado:
// 04/out manhã: jornada anterior encerra 06:25;
// 04/out 23:18: nova jornada apresenta;
// 05/out 00:05: primeira decolagem dessa jornada;
// 05/out 04:20: segunda perna, continuação, sem nova apresentação.
const roster = {
  crewName: 'Synthetic crew',
  crewId: 'synthetic-id',
  base: 'AAA',
  rank: 'CCM',
  airline: 'LATAM',
  month: 10,
  year: 2026,
  rawText: '',
  days: [
    day('04/10/2026', '02:40', '06:25', [
      leg('LA9101', 'BBB', 'CCC', '02:40', '05:55'),
    ]),
    day('04/10/2026', '23:18', '03:20', [
      leg('LA9102', 'CCC', 'DDD', '00:05', '03:20'),
    ]),
    day('05/10/2026', '04:20', '07:35', [
      leg('LA9103', 'DDD', 'AAA', '04:20', '07:05'),
    ]),
  ],
};

const events = buildCanonicalRosterEvents(roster);
const flights = events.filter((event) => event.kind === 'flight');
const byFlight = (number) => flights.find((event) => event.flightNumber === number);
const first = byFlight('LA9101');
const midnight = byFlight('LA9102');
const continuation = byFlight('LA9103');
const rest = events.find((event) =>
  (event.kind === 'journey-rest' || event.kind === 'stay')
  && event.origin === 'CCC'
  && new Date(event.endDateTime).getTime() > new Date(event.startDateTime).getTime()
);

check('as três pernas permanecem na timeline', flights.length === 3, JSON.stringify(flights));
check('APZ 23:18 é preservada; não vira STD 00:05', midnight?.presentation === '23:18', JSON.stringify(midnight));
check('decolagem 00:05 é ancorada no dia civil seguinte', midnight?.startDateTime === '2026-10-05T03:05:00.000Z', String(midnight?.startDateTime));
check('etapa pós-meia-noite é marcada como +1 em relação ao dia publicado', midnight?.isNextDay === true, JSON.stringify(midnight));
const restDurationMinutes = rest
  ? Math.round((new Date(rest.endDateTime).getTime() - new Date(rest.startDateTime).getTime()) / 60_000)
  : null;
check('repouso 06:25 → 23:18 permanece 16h53', restDurationMinutes === 16 * 60 + 53, JSON.stringify(rest));
check('segunda perna 04:20 continua a jornada 23:18', continuation?.journeyId === midnight?.journeyId, JSON.stringify({ midnight, continuation }));
check('segunda perna não inventa nova apresentação', continuation?.showPresentation === false && continuation?.journeyBoundary === null, JSON.stringify(continuation));
check('solo entre as pernas é 60 min, não um repouso de 24h+', continuation?.groundBeforeMinutes === 60, JSON.stringify(continuation));

const chronological = events
  .filter((event) => event.kind === 'flight' || event.kind === 'journey-rest' || event.kind === 'stay')
  .map((event) => event.kind === 'flight' ? event.flightNumber : 'REST');
check(
  'ordem canônica não coloca 00:05 antes da jornada da manhã anterior',
  JSON.stringify(chronological) === JSON.stringify(['LA9101', 'REST', 'LA9102', 'LA9103']),
  chronological.join(' > '),
);

// Contraprova: uma "apresentação" 10:00 para STD 09:00 não é uma virada curta;
// são 23h de distância circular e deve continuar rejeitada.
const unsafeRoster = {
  ...roster,
  days: [
    day('06/10/2026', '10:00', '11:00', [
      leg('LA9199', 'AAA', 'BBB', '09:00', '11:00'),
    ]),
  ],
};
const unsafeEvent = buildCanonicalRosterEvents(unsafeRoster).find((event) => event.kind === 'flight');
check('horário posterior inválido não é aceito como APZ', unsafeEvent?.presentation === '09:00', JSON.stringify(unsafeEvent));
check('horário posterior inválido não desloca a perna para +1', unsafeEvent?.startDateTime === '2026-10-06T12:00:00.000Z', String(unsafeEvent?.startDateTime));

harness.cleanup();
process.exit(checker.report() > 0 ? 1 : 0);
