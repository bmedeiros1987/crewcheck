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

import { readFileSync } from 'node:fs';
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

const { buildCanonicalRosterEvents, selectNextRosterEvent, isOperationalCanonicalEvent, OPERATIONAL_CANONICAL_EVENT_KINDS } = harness.load('canonicalRoster');
const { isSmartDepartureEligible, isJourneyRestScheduleActivity } = harness.load('scheduleActivityClassification');

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

// -----------------------------------------------------------------------
// Caso 6 (#537) — CONSUMIDORES OPERACIONAIS.
//
// `journey-rest` é projetado como `kind: 'duty'` de propósito: mapeá-lo para
// `stay` inflaria a contagem de pernoites. Mas o predicado que decide o que é
// programação operacional olhava só o `kind` da projeção, então o repouso era
// aceito como `duty` e podia ser selecionado como programação ATUAL/PRÓXIMA.
// Consequência: Cockpit/Despertador recebiam o intervalo 18:30 -> 03:10 como
// se fosse jornada, com apresentação vazia.
//
// Contrato: o repouso PERMANECE na timeline e é EXCLUÍDO dos seletores.
// -----------------------------------------------------------------------
{
  // API guard — sem isto, uma exportação ausente derruba o arquivo com
  // TypeError e as asserções que importam nunca chegam a ser avaliadas.
  check('API: canonicalRoster exporta isOperationalCanonicalEvent',
    typeof isOperationalCanonicalEvent === 'function', typeof isOperationalCanonicalEvent);
  check('API: canonicalRoster exporta OPERATIONAL_CANONICAL_EVENT_KINDS',
    Array.isArray(OPERATIONAL_CANONICAL_EVENT_KINDS), JSON.stringify(OPERATIONAL_CANONICAL_EVENT_KINDS ?? null));

  // Chamada protegida: com a API ausente, o teste precisa FALHAR NOMEADO em cada
  // contrato, não morrer no primeiro TypeError e esconder o resto do arquivo.
  const ehOperacional = (kind) => (typeof isOperationalCanonicalEvent === 'function'
    ? isOperationalCanonicalEvent({ kind })
    : `API AUSENTE (${typeof isOperationalCanonicalEvent})`);

  check('predicado: journey-rest NÃO é programação operacional',
    ehOperacional('journey-rest') === false, String(ehOperacional('journey-rest')));
  check('predicado: rest NÃO é programação operacional',
    ehOperacional('rest') === false, String(ehOperacional('rest')));
  for (const kind of ['flight', 'duty', 'stay']) {
    check(`predicado: ${kind} continua sendo programação operacional`,
      ehOperacional(kind) === true, String(ehOperacional(kind)));
  }

  // Cenário real: repouso ATIVO agora, entre duas jornadas.
  const events = buildCanonicalRosterEvents(roster([
    day('18/08/2026', [leg('LA600', 'CNF', 'GRU', '16:00', '18:00')], { dutyReport: '15:00', dutyDebrief: '18:30' }),
    day('19/08/2026', [leg('LA601', 'GRU', 'BSB', '04:00', '06:00', { presentationTime: '03:10' })], { dutyReport: '03:10', dutyDebrief: '06:30' }),
  ]));
  const rest = events.find((e) => e.kind === 'journey-rest');
  check('cenário: o repouso entre jornadas existe na timeline', Boolean(rest), JSON.stringify(events.map((e) => e.kind)));

  // "Agora" DENTRO do repouso: é o instante em que o defeito aparece, porque
  // `selectNextRosterEvent` prefere o evento ativo ao próximo futuro.
  const duranteORepouso = new Date('2026-08-18T22:00:00');
  const selecionado = selectNextRosterEvent(events, duranteORepouso);
  check('durante o repouso: o seletor NÃO devolve o repouso como programação',
    selecionado?.kind !== 'journey-rest', JSON.stringify(selecionado));
  check('durante o repouso: o seletor devolve a próxima jornada REAL (LA601)',
    selecionado?.flightNumber === 'LA601', JSON.stringify(selecionado));
  check('durante o repouso: a programação selecionada tem apresentação publicada',
    Boolean(selecionado?.presentation), JSON.stringify(selecionado?.presentation ?? null));

  // O repouso segue visível: excluir do seletor não pode apagá-lo da timeline.
  check('a exclusão do seletor não remove o repouso da timeline',
    events.some((e) => e.kind === 'journey-rest'), JSON.stringify(events.map((e) => e.kind)));

  // Contraprova: sem nenhum repouso na lista, a seleção não muda.
  const semRepouso = events.filter((e) => e.kind !== 'journey-rest');
  check('contraprova: a seleção é a mesma com e sem o repouso na entrada',
    selectNextRosterEvent(semRepouso, duranteORepouso)?.id === selecionado?.id,
    JSON.stringify({ com: selecionado?.id, sem: selectNextRosterEvent(semRepouso, duranteORepouso)?.id }));

  // O repouso também não pode ser escolhido quando é o ÚNICO candidato: aí a
  // resposta correta é "nenhuma programação", não o repouso.
  check('repouso sozinho não vira programação: seleção devolve null',
    selectNextRosterEvent([rest], duranteORepouso) === null, JSON.stringify(selectNextRosterEvent([rest], duranteORepouso)));
}

// -----------------------------------------------------------------------
// Caso 7 (#537) — ESTAÇÃO FÍSICA. O repouso usa o dia do voo SEGUINTE como
// `publishedDay`. Ler a base desse dia exibiria BSB no lugar da estação onde o
// tripulante realmente está. O evento canônico já resolve isso em origin/destination.
// -----------------------------------------------------------------------
{
  const events = buildCanonicalRosterEvents(roster([
    day('18/08/2026', [leg('LA700', 'BSB', 'BEL', '16:00', '18:00')], { dutyReport: '15:00', dutyDebrief: '18:30' }),
    day('19/08/2026', [leg('LA701', 'BEL', 'FLN', '04:00', '06:00', { presentationTime: '03:10' })], { dutyReport: '03:10', dutyDebrief: '06:30' }),
  ]));
  const rest = events.find((e) => e.kind === 'journey-rest');
  check('estação física: o repouso acontece em BEL, não na base BSB do dia seguinte',
    rest?.origin === 'BEL' && rest?.destination === 'BEL', JSON.stringify({ origin: rest?.origin, destination: rest?.destination }));
  check('estação física: o repouso não herda o pairing do voo seguinte',
    !rest?.flightNumber, JSON.stringify(rest?.flightNumber ?? null));
  check('estação física: o repouso não tem apresentação (não alimenta despertador)',
    !rest?.presentation && rest?.showPresentation === false, JSON.stringify({ presentation: rest?.presentation, showPresentation: rest?.showPresentation }));
  check('oracle 520 min preservado: 18:30 -> 03:10',
    rest?.restMinutes === 520, JSON.stringify(rest?.restMinutes ?? null));
}

// -----------------------------------------------------------------------
// Caso 8 (#537) — O CAMINHO DO ESTADO PREPARADO.
//
// Em estado preparado o passo v14.3.50 SUBSTITUI `isOperationalEvent` inteiro
// por `return isSmartDepartureEligible(event)`. Uma correção feita só no corpo
// inline de Home.tsx ficaria verde em base e INERTE em produção — exatamente o
// padrão que já custou uma rodada no #549. Por isso a exclusão vive também na
// função de classificação, e é aqui que ela é provada de forma executável,
// valendo nos DOIS estados.
// -----------------------------------------------------------------------
{
  const elegivel = (activity) => (typeof isSmartDepartureEligible === 'function'
    ? isSmartDepartureEligible(activity)
    : `API AUSENTE (${typeof isSmartDepartureEligible})`);

  check('API: scheduleActivityClassification exporta isJourneyRestScheduleActivity',
    typeof isJourneyRestScheduleActivity === 'function', typeof isJourneyRestScheduleActivity);

  const repouso = { kind: 'duty', canonical: { kind: 'journey-rest' }, presentation: '', flightNumber: '' };
  const voo = { kind: 'flight', canonical: { kind: 'flight' }, presentation: '03:10', flightNumber: 'LA601' };

  check('preparado: isSmartDepartureEligible REJEITA o repouso entre jornadas',
    elegivel(repouso) === false, String(elegivel(repouso)));
  check('preparado: isSmartDepartureEligible continua aceitando voo real',
    elegivel(voo) === true, String(elegivel(voo)));
  check('preparado: o repouso é reconhecido pelo tipo canônico, não pelo kind da projeção',
    typeof isJourneyRestScheduleActivity === 'function'
    && isJourneyRestScheduleActivity(repouso) === true
    && isJourneyRestScheduleActivity(voo) === false);
}

// -----------------------------------------------------------------------
// Caso 9 (#537) — FIAÇÃO em Home.tsx, ciente do estado.
//
// Asserções de fiação, não de comportamento: Home.tsx é uma página React de
// ~4.600 linhas e não é carregável neste harness puro. A prova de comportamento
// está nos Casos 6 e 8. O que estas checagens garantem é que os consumidores
// continuam LIGADOS e que a cadeia de preparação não desfaz a correção em
// silêncio. Cada forma abaixo é a esperada no seu estado.
// -----------------------------------------------------------------------
{
  const home = readFileSync(new URL('../client/src/pages/Home.tsx', import.meta.url), 'utf8');
  const preparado = /function isOperationalEvent\(event: ZeroLeg\) \{\s*\n\s*return isSmartDepartureEligible\(event\);\s*\n\}/.test(home);
  const estado = preparado ? 'preparado' : 'base';

  check(`fiação (${estado}): isOperationalEvent exclui o repouso`,
    preparado
      ? /return isSmartDepartureEligible\(event\);/.test(home)
      : /if \(event\.canonical && !isOperationalCanonicalEvent\(event\.canonical\)\) return false;/.test(home));

  check(`fiação (${estado}): a linha do \`base\` está numa das duas formas conhecidas`,
    home.includes("    const base = safe((day as any).base || (day as any).airport || (day as any).hotel || event.origin, roster.base || '—');")
    || home.includes("    const base = safe((day as any).operationalAirport || (day as any).airport || event.origin || (day as any).base || (day as any).hotel, roster.base || '—');"));

  // Estas valem nos dois estados: nenhum passo da cadeia as reescreve.
  check('fiação: Home.tsx importa o predicado canônico',
    /import \{ isOperationalCanonicalEvent \} from '@\/lib\/canonicalRoster';/.test(home));
  check('fiação: a linha-âncora do v14.3.50 (import canônico) permanece intacta',
    home.includes("import { buildCanonicalRosterEvents, normalizeRosterDays, selectNextRosterEvent, rosterCounters, type CanonicalRosterEvent } from '@/lib/canonicalRoster';"));
  check('fiação: rosterEventTitle preserva o título próprio do repouso',
    /if \(isJourneyRestEvent\(event\)\) return event\.title;/.test(home));
  check('fiação: rosterEventLine preserva o subtítulo próprio do repouso',
    /if \(isJourneyRestEvent\(event\)\) return event\.subtitle;/.test(home));
  check('fiação: a estação do repouso vem do canônico, não da base do dia seguinte',
    /const restStation = isJourneyRest \? safe\(event\.origin, base\) : base;/.test(home)
    && /origin: restStation,\s*\n\s*destination: restStation,/.test(home));
}

process.exit(checker.report());
