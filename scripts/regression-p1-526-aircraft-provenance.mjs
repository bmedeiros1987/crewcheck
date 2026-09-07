import { loadClientModules, TYPE_ONLY_PDF_PARSER_STUB, createChecker } from './lib/ts-module-harness.mjs';

const harness = loadClientModules({
  prefix: 'crewcheck-526-aircraft-provenance-',
  stubs: TYPE_ONLY_PDF_PARSER_STUB,
  files: ['client/src/lib/actRules.ts'],
});

const { getLegalProfile } = harness.load('actRules');
const checker = createChecker('P-1 #526 — proveniencia do enquadramento de aeronave');
const { check } = checker;

const wideBodyRoster = {
  year: 2026,
  month: 9,
  crewName: 'TEST',
  rank: 'CMS',
  base: 'BSB',
  days: [{
    date: '04/09/2026',
    dayNumber: 4,
    month: 9,
    year: 2026,
    type: 'VOO',
    pairingCode: '',
    dutyReport: '08:00',
    dutyDebrief: '18:00',
    dutyHours: 10,
    flyingHours: 8,
    isNextDay: false,
    hotel: null,
    base: 'BSB',
    rawText: 'B777',
    legs: [{
      flightNumber: 'LA0001',
      origin: 'GRU',
      destination: 'MIA',
      departureTime: '09:00',
      arrivalTime: '17:00',
      aircraftType: 'B777',
    }],
  }],
};

// Contrato #526: a escala pode fornecer evidencia de aeronave, mas o resultado
// regulatorio precisa declarar de onde veio o enquadramento. Nao basta devolver
// apenas narrowBody/wideBody sem proveniencia rastreavel.
const fromRoster = getLegalProfile(wideBodyRoster, 'cabin');
check('roster WideBody continua reconhecido como WideBody',
  fromRoster.aircraftGroup === 'wideBody', JSON.stringify(fromRoster));
check('enquadramento derivado da escala declara fonte = escala',
  fromRoster.aircraftGroupProvenance?.source === 'escala', JSON.stringify(fromRoster));
check('proveniencia derivada da escala preserva evidencia observavel',
  Array.isArray(fromRoster.aircraftGroupProvenance?.evidence)
    && fromRoster.aircraftGroupProvenance.evidence.some((item) => /B777/i.test(String(item))),
  JSON.stringify(fromRoster));

// Regressao do blocker Work: um codigo numerico maior que apenas contem "777"
// nao pode virar evidencia WideBody por correspondencia parcial. Mantemos uma
// evidencia NarrowBody real para provar que o ruído textual nao muda o limite.
const narrowBodyWithNumericNoise = {
  ...wideBodyRoster,
  rawText: 'EQUIP A320 REFERENCE 7777',
  days: wideBodyRoster.days.map((day) => ({
    ...day,
    rawText: 'EQUIP A320 REFERENCE 7777',
    legs: day.legs.map((leg) => ({ ...leg, aircraftType: 'A320' })),
  })),
};
const fromNumericNoise = getLegalProfile(narrowBodyWithNumericNoise, 'cabin');
check('superset numerico 7777 nao e interpretado como codigo 777',
  fromNumericNoise.aircraftGroup === 'narrowBody', JSON.stringify(fromNumericNoise));
check('evidencia NarrowBody permanece atribuida a escala',
  fromNumericNoise.aircraftGroupProvenance?.source === 'escala', JSON.stringify(fromNumericNoise));

// Contrato de produto da #526: uma selecao persistente/editavel de perfil deve
// prevalecer sobre a inferencia de um voo isolado. O terceiro argumento e o
// contexto explicito do enquadramento; main atual ainda nao o implementa.
const fromProfile = getLegalProfile(wideBodyRoster, 'cabin', {
  aircraftGroup: 'narrowBody',
  source: 'perfil',
});
check('perfil NarrowBody prevalece sobre aeronave WideBody observada na escala',
  fromProfile.aircraftGroup === 'narrowBody', JSON.stringify(fromProfile));
check('override de perfil declara fonte = perfil',
  fromProfile.aircraftGroupProvenance?.source === 'perfil', JSON.stringify(fromProfile));

const failures = checker.report();
harness.cleanup();
if (failures) process.exit(1);
