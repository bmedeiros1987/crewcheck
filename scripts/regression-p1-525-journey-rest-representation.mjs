/**
 * P-1 regression gate for #525 — separar TRÊS conceitos que hoje se confundem
 * (ou desaparecem) na derivação canônica.
 *
 * Contrato definido pelo owner:
 *
 *   1. Tempo em solo         — intervalo DENTRO da mesma jornada (conexão/espera).
 *   2. Repouso entre jornadas — há boundary real entre jornadas, MESMO que o
 *                               intervalo seja menor que 12h.
 *   3. Pernoite/stay          — só quando o contrato de pernoite estiver
 *                               satisfeito; não nasce automaticamente só porque
 *                               existe boundary.
 *
 * A ZONA MORTA que motiva esta regressão: `journeyBoundaryReason` declara
 * boundary por CINCO razões, incluindo "apresentação publicada", que não exige
 * intervalo nenhum. Já `completeContinuityDays` só cria stay quando o intervalo
 * fica entre 12h e 96h. Entre os dois critérios existe um conjunto não-vazio:
 * boundary declarado + intervalo < 12h. Nele acontecem as duas coisas ao mesmo
 * tempo:
 *
 *   - `groundBeforeMinutes` vira null (correto: não é conexão, #513);
 *   - nenhum stay é criado (intervalo curto demais).
 *
 * Resultado: o intervalo DESAPARECE inteiro da interface. Foi exatamente o
 * sintoma relatado em 18/08 no caso CNF -> GRU: sem card de pernoite e sem a
 * informação de tempo em solo que existia antes.
 *
 * Segundo furo coberto aqui: `completeContinuityDays` itera pares de DIAS
 * CIVIS consecutivos. Duas jornadas dentro do mesmo dia civil — forma que o
 * #510 provou ser real — nunca formam par e por isso não podem ter o intervalo
 * entre elas representado, com qualquer duração.
 *
 * Casos sintéticos, escritos à mão. Sem fixture de corpus e sem PDF real.
 */

import { loadClientModules, TYPE_ONLY_PDF_PARSER_STUB, createChecker } from './lib/ts-module-harness.mjs';

const harness = loadClientModules({
  prefix: 'crewcheck-525-journey-rest-',
  stubs: TYPE_ONLY_PDF_PARSER_STUB,
  files: [
    'client/src/lib/rosterCodes.ts',
    'client/src/lib/actRules.ts',
    'client/src/lib/embeddedFormalDaysOff.ts',
    'client/src/lib/scheduleActivityClassification.ts',
    'client/src/lib/rosterContinuity.ts',
    'client/src/lib/canonicalRoster.ts',
    'client/src/lib/complianceEngine.ts',
  ],
});

const { buildCanonicalRosterEvents } = harness.load('canonicalRoster');

const checker = createChecker('P-1 #525 — tempo em solo x repouso entre jornadas x pernoite');
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

// Um intervalo entre jornadas precisa existir como evento próprio, seja ele
// pernoite ou repouso curto. `journey-rest` é a representação do caso 2.
const isBetweenJourneys = (event) => event.kind === 'stay' || event.kind === 'journey-rest';

// -----------------------------------------------------------------------
// Caso 1 — Tempo em solo DENTRO da mesma jornada: conexão de 1h30 entre duas
// pernas sem apresentação própria. Deve reportar ground time e NÃO criar
// nenhum evento de intervalo entre jornadas.
// -----------------------------------------------------------------------
{
  const events = buildCanonicalRosterEvents(roster([
    day('10/08/2026', [
      leg('LA100', 'BSB', 'GRU', '08:00', '09:30'),
      leg('LA101', 'GRU', 'CGH', '11:00', '11:40'),
    ], { dutyReport: '07:00', dutyDebrief: '12:10' }),
  ]));
  const flights = events.filter((e) => e.kind === 'flight');
  const second = flights.find((e) => e.flightNumber === 'LA101');
  check('mesma jornada: 2ª perna reporta tempo em solo (90 min)', second?.groundBeforeMinutes === 90, JSON.stringify(second));
  check('mesma jornada: nenhum evento de intervalo entre jornadas é criado', !events.some(isBetweenJourneys), JSON.stringify(events.map((e) => e.kind)));
}

// -----------------------------------------------------------------------
// Caso 2 — A ZONA MORTA. CNF -> GRU chega 18:00; nova jornada em GRU com
// apresentação PUBLICADA às 03:10 do dia seguinte. Intervalo ~8h40: há
// boundary real (apresentação publicada), mas está abaixo de 12h.
//
// Hoje o intervalo some por completo. O contrato exige que ele apareça como
// REPOUSO ENTRE JORNADAS — nem tempo em solo, nem pernoite inventado.
// -----------------------------------------------------------------------
{
  const events = buildCanonicalRosterEvents(roster([
    day('18/08/2026', [leg('LA200', 'CNF', 'GRU', '16:00', '18:00')], { dutyReport: '15:00', dutyDebrief: '18:30' }),
    day('19/08/2026', [leg('LA201', 'GRU', 'BSB', '04:00', '06:00', { presentationTime: '03:10' })], { dutyReport: '03:10', dutyDebrief: '06:30' }),
  ]));
  const second = events.find((e) => e.kind === 'flight' && e.flightNumber === 'LA201');
  check('zona morta: 2ª jornada não reporta tempo em solo (boundary real, não é conexão)', second?.groundBeforeMinutes == null, JSON.stringify(second));

  const between = events.filter(isBetweenJourneys);
  check('zona morta: o intervalo de 8h40 NÃO desaparece — existe evento entre as jornadas', between.length === 1, JSON.stringify(events.map((e) => e.kind)));
  check('zona morta: o intervalo curto é repouso entre jornadas, não pernoite inventado', between[0]?.kind === 'journey-rest', JSON.stringify(between));
}

// -----------------------------------------------------------------------
// Caso 3 — Pernoite legítimo: mesmo par, agora com intervalo de ~13h30.
// Continua sendo stay/pernoite, como já era. O caso 2 não pode ter roubado
// este comportamento.
// -----------------------------------------------------------------------
{
  const events = buildCanonicalRosterEvents(roster([
    day('18/08/2026', [leg('LA300', 'CNF', 'GRU', '16:00', '18:00')], { dutyReport: '15:00', dutyDebrief: '18:30' }),
    day('19/08/2026', [leg('LA301', 'GRU', 'BSB', '09:00', '11:00', { presentationTime: '08:10' })], { dutyReport: '08:10', dutyDebrief: '11:30' }),
  ]));
  const between = events.filter(isBetweenJourneys);
  check('pernoite: intervalo de 13h30 continua gerando stay', between.some((e) => e.kind === 'stay'), JSON.stringify(events.map((e) => e.kind)));
  check('pernoite: exatamente um evento entre as jornadas (não duplica com repouso)', between.length === 1, JSON.stringify(between.map((e) => e.kind)));
}

// -----------------------------------------------------------------------
// Caso 4 — Duas jornadas no MESMO dia civil. `completeContinuityDays` itera
// pares de dias civis, então este intervalo nunca é considerado hoje, com
// qualquer duração. O contrato exige que a derivação trabalhe sobre a
// sequência canônica de jornadas/boundaries, não sobre dias civis.
//
// LA400 chega CGH 08:20; LA401 sai de CGH às 23:50 com apresentação própria
// publicada 23:03 — mesmo dia civil, intervalo ~14h43 (o caso real do #510).
// -----------------------------------------------------------------------
{
  const events = buildCanonicalRosterEvents(roster([
    day('20/08/2026', [
      leg('LA400', 'BSB', 'CGH', '06:45', '08:20'),
      leg('LA401', 'CGH', 'GRU', '23:50', '00:35', { presentationTime: '23:03', isNextDay: true }),
    ], { dutyReport: '06:00', dutyDebrief: '01:05' }),
  ]));
  const second = events.find((e) => e.kind === 'flight' && e.flightNumber === 'LA401');
  check('mesmo dia civil: 2ª jornada não reporta tempo em solo', second?.groundBeforeMinutes == null, JSON.stringify(second));
  check('mesmo dia civil: o intervalo entre as duas jornadas é representado', events.some(isBetweenJourneys), JSON.stringify(events.map((e) => e.kind)));
}

// -----------------------------------------------------------------------
// Caso 5 — Repouso entre jornadas não pode virar hotel/pernoite inventado.
// O evento de repouso curto não deve carregar hotel nem ser classificado como
// stay, para não contaminar a Central de Pernoite (#519).
// -----------------------------------------------------------------------
{
  const events = buildCanonicalRosterEvents(roster([
    day('21/08/2026', [leg('LA500', 'CNF', 'GRU', '16:00', '18:00')], { dutyReport: '15:00', dutyDebrief: '18:30' }),
    day('22/08/2026', [leg('LA501', 'GRU', 'BSB', '04:00', '06:00', { presentationTime: '03:10' })], { dutyReport: '03:10', dutyDebrief: '06:30' }),
  ]));
  const rest = events.find((e) => e.kind === 'journey-rest');
  check('repouso curto: não é classificado como stay (não alimenta hotel/Central de Pernoite)', !events.some((e) => e.kind === 'stay'), JSON.stringify(events.map((e) => e.kind)));
  check('repouso curto: não inventa hotel', !rest?.day?.hotel, JSON.stringify(rest?.day?.hotel ?? null));
}

checker.report();
