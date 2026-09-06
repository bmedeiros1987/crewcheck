/**
 * #525 / #537 — semântica do repouso entre jornadas e associação física do pernoite.
 *
 * Dois P1 do mesmo evento canônico:
 *
 * 1. DURAÇÃO. `journey-rest` nascia de chegada -> partida. Repouso começa no fim de
 *    jornada publicado (debrief) e termina na apresentação publicada da jornada
 *    seguinte. `gapMinutes` continua válido para detectar boundary físico, mas não
 *    é duração exibida. Oracle #527: chegada 18:00, debrief 18:30, apresentação
 *    03:10, partida 04:00 => 18:30 -> 03:10(+1) = 520 min. Chegada->partida daria 600.
 *
 * 2. LOCAL. O aeroporto do repouso/pernoite precisa ser sustentado pelo boundary
 *    físico — destino da jornada anterior E origem da próxima. Em produção apareceu
 *    pernoite em FLN enquanto a continuidade real mantinha o tripulante em BEL.
 *    Mesmo princípio anti-teletransporte do #440/#530.
 *
 * Sem os dois endpoints provados não se fabrica duração: STD nunca substitui
 * apresentação e chegada nunca substitui debrief.
 *
 * Casos sintéticos no nível de campo; nenhum PDF ou fixture mensal (ver #533).
 */

import { loadClientModules, TYPE_ONLY_PDF_PARSER_STUB, createChecker } from './lib/ts-module-harness.mjs';

const harness = loadClientModules({
  prefix: 'crewcheck-537-rest-',
  stubs: TYPE_ONLY_PDF_PARSER_STUB,
  files: [
    'client/src/lib/rosterCodes.ts', 'client/src/lib/actRules.ts', 'client/src/lib/embeddedFormalDaysOff.ts',
    'client/src/lib/scheduleActivityClassification.ts', 'client/src/lib/rosterContinuity.ts',
    'client/src/lib/canonicalRoster.ts', 'client/src/lib/complianceEngine.ts',
  ],
});
const { buildCanonicalRosterEvents } = harness.load('canonicalRoster');
const checker = createChecker('P-1 #537 — endpoints provados do repouso e estação física');
const { check } = checker;

const leg = (flightNumber, origin, destination, departureTime, arrivalTime, extra = {}) => ({
  flightNumber, origin, destination, departureTime, arrivalTime, workType: 'OP', ...extra,
});
const day = (date, legs, extra = {}) => ({
  date, dayNumber: Number(date.slice(0, 2)), month: Number(date.slice(3, 5)), year: Number(date.slice(6)),
  dayOfWeek: 'Ter', type: 'VOO', pairingCode: legs[0]?.flightNumber || '', dutyReport: null, dutyDebrief: null,
  legs, dutyHours: null, flyingHours: 0, isNextDay: false, hotel: null, base: 'BSB', rawText: '', ...extra,
});
const roster = (days) => ({ crewName: 'T', crewId: '1', base: 'BSB', rank: 'CCM', month: 8, year: 2026, rawText: '', days });
const rests = (events) => events.filter((e) => e.kind === 'journey-rest');
const stays = (events) => events.filter((e) => e.kind === 'stay');
const hhmm = (iso) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

// ---------------------------------------------------------------------------
// 1. ORACLE #527 — debrief 18:30 -> apresentação 03:10 = 520 min, não 600.
// ---------------------------------------------------------------------------
{
  const events = buildCanonicalRosterEvents(roster([
    day('24/08/2026', [leg('LA100', 'GRU', 'BEL', '15:00', '18:00')], { dutyDebrief: '18:30' }),
    day('25/08/2026', [leg('LA200', 'BEL', 'GRU', '04:00', '07:00', { presentationTime: '03:10' })]),
  ]));
  const rest = rests(events)[0];
  check('oracle: existe repouso entre as duas jornadas', Boolean(rest), JSON.stringify(events.map((e) => e.kind)));
  check('oracle: duração é 520 min (debrief -> apresentação), não 600 (chegada -> partida)',
    rest?.restMinutes === 520, `restMinutes=${rest?.restMinutes}`);
  check('oracle: início é o debrief 18:30, não a chegada 18:00',
    hhmm(rest?.startDateTime) === '18:30', `start=${rest && hhmm(rest.startDateTime)}`);
  check('oracle: fim é a apresentação 03:10, não a partida 04:00',
    hhmm(rest?.endDateTime) === '03:10', `end=${rest && hhmm(rest.endDateTime)}`);
  check('oracle: os três campos nascem do mesmo par de endpoints',
    rest && Math.round((new Date(rest.endDateTime) - new Date(rest.startDateTime)) / 60000) === rest.restMinutes,
    `start=${rest?.startDateTime} end=${rest?.endDateTime} min=${rest?.restMinutes}`);
}

// ---------------------------------------------------------------------------
// 2. Contraprova (a) — APZ ausente com STD conhecida não vira fim do repouso.
// ---------------------------------------------------------------------------
{
  const events = buildCanonicalRosterEvents(roster([
    day('24/08/2026', [leg('LA100', 'GRU', 'BEL', '15:00', '18:00')], { dutyDebrief: '18:30' }),
    day('25/08/2026', [leg('LA200', 'BEL', 'GRU', '04:00', '07:00')]),
  ]));
  const rest = rests(events)[0];
  check('(a) sem apresentação publicada, não se fabrica duração a partir da STD',
    !rest || rest.restMinutes == null, `restMinutes=${rest?.restMinutes}`);
}

// ---------------------------------------------------------------------------
// 3. Contraprova (b) — debrief ausente com chegada conhecida não vira início.
// ---------------------------------------------------------------------------
{
  const events = buildCanonicalRosterEvents(roster([
    day('24/08/2026', [leg('LA100', 'GRU', 'BEL', '15:00', '18:00')]),
    day('25/08/2026', [leg('LA200', 'BEL', 'GRU', '04:00', '07:00', { presentationTime: '03:10' })]),
  ]));
  const rest = rests(events)[0];
  check('(b) sem debrief publicado, a chegada não vira início do repouso',
    !rest || rest.restMinutes == null, `restMinutes=${rest?.restMinutes}`);
}

// ---------------------------------------------------------------------------
// 4. Contraprova (c) — duas jornadas no mesmo dia civil não herdam o debrief
//    global do dia para o segmento errado.
// ---------------------------------------------------------------------------
{
  const events = buildCanonicalRosterEvents(roster([
    day('24/08/2026', [
      leg('LA100', 'GRU', 'BEL', '06:00', '09:00'),
      leg('LA300', 'BEL', 'GRU', '14:00', '17:00', { presentationTime: '13:10' }),
    ], { dutyDebrief: '17:30' }),
  ]));
  const rest = rests(events)[0];
  check('(c) primeira jornada do dia não herda o dutyDebrief global (que é da segunda)',
    !rest || rest.restMinutes == null, `restMinutes=${rest?.restMinutes}`);
}

// ---------------------------------------------------------------------------
// 5. BEL/FLN — o aeroporto vem do boundary físico, nunca do destino futuro.
// ---------------------------------------------------------------------------
{
  const events = buildCanonicalRosterEvents(roster([
    day('24/08/2026', [leg('LA100', 'GRU', 'BEL', '15:00', '18:00')], { dutyDebrief: '18:30' }),
    day('25/08/2026', [leg('LA200', 'BEL', 'FLN', '04:00', '09:00', { presentationTime: '03:10' })], { hotel: 'HOTEL FLN' }),
  ]));
  const between = [...rests(events), ...stays(events)];
  check('BEL: 24/08 termina em BEL e 25/08 começa em BEL => o intervalo é em BEL',
    between.every((e) => e.origin === 'BEL' && e.destination === 'BEL'),
    JSON.stringify(between.map((e) => ({ k: e.kind, o: e.origin, d: e.destination }))));
  check('BEL: FLN é destino da jornada seguinte e não pode virar local de permanência',
    !between.some((e) => e.origin === 'FLN' || e.destination === 'FLN'),
    JSON.stringify(between.map((e) => `${e.origin}->${e.destination}`)));
  check('BEL: hotel do dia seguinte não sobrescreve o aeroporto físico',
    between.every((e) => e.origin === 'BEL'), 'hotel="HOTEL FLN" não pode reposicionar');
}

// ---------------------------------------------------------------------------
// 6. O boundary SEGUINTE, esse sim, produz FLN.
// ---------------------------------------------------------------------------
{
  const events = buildCanonicalRosterEvents(roster([
    day('24/08/2026', [leg('LA100', 'GRU', 'BEL', '15:00', '18:00')], { dutyDebrief: '18:30' }),
    day('25/08/2026', [leg('LA200', 'BEL', 'FLN', '04:00', '09:00', { presentationTime: '03:10' })], { dutyDebrief: '09:30' }),
    day('26/08/2026', [leg('LA400', 'FLN', 'GRU', '20:00', '22:00', { presentationTime: '19:10' })]),
  ]));
  const between = [...rests(events), ...stays(events)].sort((a, b) => String(a.startDateTime).localeCompare(String(b.startDateTime)));
  check('sequência: dois intervalos, o primeiro em BEL e o segundo em FLN',
    between.length === 2 && between[0].origin === 'BEL' && between[1].origin === 'FLN',
    JSON.stringify(between.map((e) => `${e.kind}:${e.origin}`)));
}

// ---------------------------------------------------------------------------
// 7. Contraprova — descontinuidade física não inventa permanência em nenhum
//    dos dois aeroportos.
// ---------------------------------------------------------------------------
{
  const events = buildCanonicalRosterEvents(roster([
    day('24/08/2026', [leg('LA100', 'GRU', 'BEL', '15:00', '18:00')], { dutyDebrief: '18:30' }),
    day('25/08/2026', [leg('LA200', 'FLN', 'GRU', '04:00', '07:00', { presentationTime: '03:10' })]),
  ]));
  const between = [...rests(events), ...stays(events)];
  check('descontinuidade BEL->FLN não gera repouso/pernoite em nenhum dos dois',
    between.length === 0, JSON.stringify(between.map((e) => `${e.kind}:${e.origin}`)));
}

// ---------------------------------------------------------------------------
// 8. Não regressão — 13h30 que satisfaz pernoite continua um único stay.
// ---------------------------------------------------------------------------
{
  const events = buildCanonicalRosterEvents(roster([
    day('24/08/2026', [leg('LA100', 'GRU', 'BEL', '15:00', '18:00')], { dutyDebrief: '18:30' }),
    day('25/08/2026', [leg('LA200', 'BEL', 'GRU', '08:00', '11:00', { presentationTime: '07:10' })]),
  ]));
  check('13h30: continua exatamente um intervalo entre jornadas, sem duplicar',
    [...rests(events), ...stays(events)].length === 1,
    JSON.stringify([...rests(events), ...stays(events)].map((e) => e.kind)));
}

// ---------------------------------------------------------------------------
// 9. Não regressão — ground intra-jornada segue separado do repouso.
// ---------------------------------------------------------------------------
{
  const events = buildCanonicalRosterEvents(roster([
    day('24/08/2026', [
      leg('LA100', 'GRU', 'BSB', '06:00', '07:30'),
      leg('LA101', 'BSB', 'BEL', '09:00', '11:00'),
    ]),
  ]));
  check('conexão intra-jornada continua ground time, sem virar repouso entre jornadas',
    rests(events).length === 0 && events.some((e) => Number(e.groundBeforeMinutes) > 0),
    JSON.stringify(events.map((e) => ({ k: e.kind, g: e.groundBeforeMinutes }))));
}

harness.cleanup();
process.exit(checker.report());
