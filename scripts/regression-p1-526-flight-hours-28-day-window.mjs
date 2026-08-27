/**
 * P-1 regression gate for #526 — horas de VOO limitadas por janela de 28 dias,
 * não por mês civil.
 *
 * A ACT LATAM Comissários 2025/2027, cl. 3.3.17, limita horas de VOO a 90h
 * (NarrowBody: A32F/Embraer) ou 100h (WideBody) em 28 DIAS. A implementação
 * anterior agregava por mês civil e comparava contra esse teto, o que produz
 * dois erros de sinal oposto:
 *
 *   1. conta 29-31 dias contra um teto de 28 (super-contagem, conservadora);
 *   2. DEIXA DE DETECTAR violação real que atravessa a virada do mês.
 *
 * O item 2 é o grave e é o motivo desta regressão existir: 50h no fim de
 * janeiro somadas a 50h no início de fevereiro são 100h numa janela de 28 dias
 * — acima do teto NarrowBody — mas cada mês civil isolado mostra apenas 50h e
 * nenhum alerta dispara. Era subdetecção silenciosa de irregularidade
 * regulatória.
 *
 * Também fixa a fronteira: 176h continua sendo HORAS DE TRABALHO mensais
 * (Lei 13.475/2017, art. 41) e nunca denominador de horas de voo; tempo em solo
 * jamais entra no acumulador de voo.
 */

import { readFileSync } from 'node:fs';
import { loadClientModules, TYPE_ONLY_PDF_PARSER_STUB, createChecker } from './lib/ts-module-harness.mjs';

const harness = loadClientModules({
  prefix: 'crewcheck-526-flight-window-',
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

const {
  worstFlightHoursWindow28Days,
  regulatoryHistoryCoverageComplete,
  canReuseComplianceSnapshot,
  rosterFingerprint,
  analyzeCompliance,
} = harness.load('complianceEngine');

const checker = createChecker('P-1 #526 — horas de voo em janela de 28 dias');
const { check } = checker;

const pad = (value) => String(value).padStart(2, '0');
const day = (date, flyingHours, extra = {}) => ({
  date, dayNumber: Number(date.slice(0, 2)), month: Number(date.slice(3, 5)), year: Number(date.slice(6)),
  type: flyingHours > 0 ? 'VOO' : 'OFF', pairingCode: '', dutyReport: null, dutyDebrief: null,
  legs: [], dutyHours: null, flyingHours, isNextDay: false, hotel: null, base: 'BSB', rawText: '', ...extra,
});

// -----------------------------------------------------------------------
// Caso 1 — O caso decisivo: violação atravessando a virada do mês.
// 50h de 20 a 31/01 + 50h de 01 a 16/02. A janela 20/01 -> 16/02 tem
// exatamente 28 dias e soma 100h, acima do teto NarrowBody de 90h.
// Por mês civil: janeiro 50h, fevereiro 50h — nenhum dos dois excede, e a
// irregularidade passava despercebida.
// -----------------------------------------------------------------------
{
  const days = [];
  for (let d = 20; d <= 31; d++) days.push(day(`${pad(d)}/01/2026`, 50 / 12));
  for (let d = 1; d <= 16; d++) days.push(day(`${pad(d)}/02/2026`, 50 / 16));
  const worst = worstFlightHoursWindow28Days(days);

  check('virada de mês: janela de 28 dias soma as duas metades (~100h), não 50h de cada mês',
    worst.flightHours >= 99.5 && worst.flightHours <= 100.5, JSON.stringify(worst));
  check('virada de mês: janela excede o teto NarrowBody de 90h (era subdetecção por mês civil)',
    worst.flightHours > 90, JSON.stringify(worst));
  check('virada de mês: janela é sinalizada como atravessando a virada do mês',
    worst.spansMonthBoundary === true, JSON.stringify(worst));
  check('virada de mês: janela reportada começa em janeiro e termina em fevereiro',
    worst.from === '20/01/2026' && worst.to === '16/02/2026', JSON.stringify(worst));
}

// -----------------------------------------------------------------------
// Caso 2 — Fronteira exata da janela: o 29º dia NÃO pode entrar.
// 10h no dia 01 e 10h no dia 29 estão a 28 dias de distância — fora da mesma
// janela de 28 dias (que cobre [início, início+27]).
// -----------------------------------------------------------------------
{
  const days = [day('01/03/2026', 10), day('29/03/2026', 10)];
  const worst = worstFlightHoursWindow28Days(days);
  check('fronteira: dias separados por 28 dias não somam na mesma janela (10h, não 20h)',
    worst.flightHours === 10, JSON.stringify(worst));
}

// -----------------------------------------------------------------------
// Caso 2b — o 28º dia entra: dia 01 e dia 28 distam 27 dias, mesma janela.
// -----------------------------------------------------------------------
{
  const days = [day('01/03/2026', 10), day('28/03/2026', 10)];
  const worst = worstFlightHoursWindow28Days(days);
  check('fronteira: dias separados por 27 dias somam na mesma janela (20h)',
    worst.flightHours === 20, JSON.stringify(worst));
}

// -----------------------------------------------------------------------
// Caso 3 — Mês de 31 dias não pode contar 31 dias contra um teto de 28.
// 3h/dia em todos os 31 dias de janeiro = 93h no mês, mas a pior janela de
// 28 dias soma 84h — abaixo do teto NarrowBody.
// -----------------------------------------------------------------------
{
  const days = [];
  for (let d = 1; d <= 31; d++) days.push(day(`${pad(d)}/01/2026`, 3));
  const worst = worstFlightHoursWindow28Days(days);
  check('mês de 31 dias: janela de 28 dias soma 84h, não os 93h do mês civil inteiro',
    worst.flightHours === 84, JSON.stringify(worst));
  check('mês de 31 dias: 84h fica abaixo do teto NarrowBody (90h) — não vira falso positivo',
    worst.flightHours < 90, JSON.stringify(worst));
}

// -----------------------------------------------------------------------
// Caso 4 — Tempo em solo nunca entra no acumulador de horas de voo.
// Dias com jornada longa mas sem voo publicado somam 0h de voo.
// -----------------------------------------------------------------------
{
  const days = [
    day('01/04/2026', 10),
    { ...day('02/04/2026', 0), type: 'VOO', dutyHours: 12, dutyReport: '06:00', dutyDebrief: '18:00' },
    { ...day('03/04/2026', 0), type: 'HSB', dutyHours: 12 },
  ];
  const worst = worstFlightHoursWindow28Days(days);
  check('solo/reserva/jornada sem voo publicado não entram nas horas de voo (10h, não 22h+)',
    worst.flightHours === 10, JSON.stringify(worst));
}

// -----------------------------------------------------------------------
// Caso 5 — Escala vazia ou sem datas válidas não quebra nem inventa horas.
// -----------------------------------------------------------------------
{
  check('escala vazia: 0h, sem exceção', worstFlightHoursWindow28Days([]).flightHours === 0);
  check('datas inválidas: ignoradas sem quebrar',
    worstFlightHoursWindow28Days([day('', 10), day('lixo', 5)]).flightHours === 0);
}

// -----------------------------------------------------------------------
// Caso 6 — A pior janela é escolhida, não simplesmente a primeira.
// O pico fica FORA da primeira janela de 28 dias: maio inteiro sem voo, pico
// de 90h entre 04 e 13/06. Uma implementação que avaliasse só a janela
// inicial veria 0h e não alertaria nada.
// -----------------------------------------------------------------------
{
  const days = [];
  for (let d = 1; d <= 31; d++) days.push(day(`${pad(d)}/05/2026`, 0));
  for (let d = 1; d <= 30; d++) days.push(day(`${pad(d)}/06/2026`, d >= 4 && d <= 13 ? 9 : 0));
  const worst = worstFlightHoursWindow28Days(days);
  check('pior janela: pico fora da primeira janela é encontrado (90h), não 0h',
    worst.flightHours === 90, JSON.stringify(worst));
  check('pior janela: intervalo reportado cobre o pico de junho',
    worst.to >= '13/06/2026' || worst.from <= '04/06/2026', JSON.stringify(worst));
}

// -----------------------------------------------------------------------
// Caso 7 — Fronteira regulatória: 176h é HORAS DE TRABALHO, nunca teto de voo.
// Garante que o limite de voo continua vindo do perfil ACT (90/100), e que
// ninguém religou 176h como denominador de horas de voo.
// -----------------------------------------------------------------------
{
  const { ACT_RULES } = harness.load('actRules');
  const limits = ACT_RULES?.cabin?.flightLimits;
  check('ACT: NarrowBody = 90h em 28 dias', limits?.narrowBody28Days === 90, JSON.stringify(limits));
  check('ACT: WideBody = 100h em 28 dias', limits?.wideBody28Days === 100, JSON.stringify(limits));
  check('ACT: nenhum limite de horas de voo vale 176h (isso é horas de trabalho, Lei 13.475 art. 41)',
    ![limits?.narrowBody28Days, limits?.wideBody28Days].includes(176), JSON.stringify(limits));
}

// -----------------------------------------------------------------------
// Caso 8 (#536) — COBERTURA REGULATÓRIA. Sucesso da consulta não é prova de
// cobertura temporal.
//
// `fetchRegulatoryHistoryDays` devolvia `complete: true` sempre que
// `/api/rosters` respondia com sucesso — inclusive quando a conta contém APENAS
// a competência ativa e não existe um único dia anterior. Isso remove o aviso de
// análise não conclusiva e permite falso OK: 49,6h em fevereiro passam como
// dentro do limite embora 50,4h não carregadas do fim de janeiro formem
// 100h/28d.
//
// Regra: todo dia civil no intervalo [primeiro dia ativo - 27, primeiro dia - 1]
// precisa estar representado. Buraco reprova — fail-closed.
// -----------------------------------------------------------------------
{
  const cobertura = (currentDays, historyDays) => (typeof regulatoryHistoryCoverageComplete === 'function'
    ? regulatoryHistoryCoverageComplete(currentDays, historyDays)
    : `API AUSENTE (${typeof regulatoryHistoryCoverageComplete})`);

  check('API: complianceEngine exporta regulatoryHistoryCoverageComplete',
    typeof regulatoryHistoryCoverageComplete === 'function', typeof regulatoryHistoryCoverageComplete);

  // Fevereiro inteiro como competência ativa.
  const fevereiro = [];
  for (let d = 1; d <= 28; d++) fevereiro.push(day(`${pad(d)}/02/2026`, d <= 16 ? 3.1 : 0));

  // Janeiro inteiro: cobre com folga os 27 dias anteriores a 01/02.
  const janeiroCompleto = [];
  for (let d = 1; d <= 31; d++) janeiroCompleto.push(day(`${pad(d)}/01/2026`, d >= 20 ? 4.2 : 0));

  check('cloud só com a competência ativa: cobertura INCOMPLETA (nenhum dia anterior)',
    cobertura(fevereiro, []) === false, String(cobertura(fevereiro, [])));
  check('histórico suficiente: cobertura COMPLETA',
    cobertura(fevereiro, janeiroCompleto) === true, String(cobertura(fevereiro, janeiroCompleto)));

  // Buraco de um único dia dentro do intervalo exigido reprova.
  const comBuraco = janeiroCompleto.filter((d) => d.date !== '20/01/2026');
  check('um único dia faltando no intervalo exigido: cobertura INCOMPLETA',
    cobertura(fevereiro, comBuraco) === false, String(cobertura(fevereiro, comBuraco)));

  // Histórico que existe mas é curto demais (só a última semana de janeiro).
  const parcial = janeiroCompleto.filter((d) => Number(d.date.slice(0, 2)) >= 25);
  check('histórico local parcial (só a última semana): cobertura INCOMPLETA',
    cobertura(fevereiro, parcial) === false, String(cobertura(fevereiro, parcial)));

  // Dia anterior ao intervalo exigido não compensa buraco dentro dele.
  const soDezembro = [];
  for (let d = 1; d <= 31; d++) soDezembro.push(day(`${pad(d)}/12/2025`, 0));
  check('histórico antigo demais (dezembro) não cobre o intervalo exigido',
    cobertura(fevereiro, soDezembro) === false, String(cobertura(fevereiro, soDezembro)));

  // Sem escala ativa não há nada a declarar como completo.
  check('sem escala ativa: nunca declarar cobertura completa',
    cobertura([], janeiroCompleto) === false, String(cobertura([], janeiroCompleto)));

  // A contraprova central do #526 continua valendo: a violação 50,4h + 49,6h
  // atravessando a virada do mês é detectada quando o histórico está presente.
  const janeiro20a31 = [];
  for (let d = 20; d <= 31; d++) janeiro20a31.push(day(`${pad(d)}/01/2026`, 4.2));
  const fevereiro01a16 = [];
  for (let d = 1; d <= 16; d++) fevereiro01a16.push(day(`${pad(d)}/02/2026`, 3.1));
  const worst = worstFlightHoursWindow28Days([...janeiro20a31, ...fevereiro01a16]);
  check('violação 50,4h + 49,6h atravessando a virada do mês continua detectada (100h)',
    Math.round(worst.flightHours) === 100 && worst.spansMonthBoundary === true, JSON.stringify(worst));
  check('cobertura incompleta NÃO apaga violação já detectada',
    Math.round(worstFlightHoursWindow28Days([...janeiro20a31, ...fevereiro01a16]).flightHours) === 100);
}

// -----------------------------------------------------------------------
// Caso 9 (#536) — PROVENIÊNCIA: o tipo de aeronave decide o perfil legal
// (NarrowBody 90h x WideBody 100h). Fora do digest, uma escala reclassificada
// de Narrow para Wide reaproveitaria um snapshot calculado com o teto errado.
// -----------------------------------------------------------------------
{
  const comAeronave = (aircraftType) => ({
    crewName: 'T', crewId: '1', base: 'BSB', rank: 'CCM', month: 2, year: 2026, rawText: '',
    days: [{
      ...day('10/02/2026', 3.1),
      type: 'VOO',
      legs: [{ flightNumber: 'LA100', origin: 'BSB', destination: 'GRU', departureTime: '08:00', arrivalTime: '09:30', workType: 'OP', aircraftType }],
    }],
  });

  const narrow = rosterFingerprint(comAeronave('320'));
  const wide = rosterFingerprint(comAeronave('789'));
  check('proveniência: mudar NarrowBody -> WideBody muda o rosterFingerprint',
    narrow !== wide, JSON.stringify({ narrow, wide }));
  check('proveniência: mesmo tipo de aeronave mantém o fingerprint estável',
    rosterFingerprint(comAeronave('320')) === narrow);

  // O snapshot calculado como Narrow não pode ser reaproveitado como Wide.
  const contexto = (roster, complete) => ({ roster, regulatoryHistoryDays: [], roleSelection: 'CCM', regulatoryHistoryComplete: complete });
  const snapshotNarrow = analyzeCompliance(comAeronave('320'), 'CCM', [], true);
  check('snapshot Narrow NÃO é reutilizado depois de reclassificar para Wide',
    canReuseComplianceSnapshot(snapshotNarrow, contexto(comAeronave('789'), true)) === false);
  check('snapshot Narrow continua reutilizável para a mesma escala',
    canReuseComplianceSnapshot(snapshotNarrow, contexto(comAeronave('320'), true)) === true);
  check('mudança de cobertura (completa -> incompleta) invalida o snapshot',
    canReuseComplianceSnapshot(snapshotNarrow, contexto(comAeronave('320'), false)) === false);
}

// -----------------------------------------------------------------------
// Caso 10 (#536) — FIAÇÃO em databaseClient.ts.
//
// Asserção de fiação, não de comportamento: `databaseClient.ts` depende de
// `localStorage`/`fetch` e não é carregável neste harness puro. O comportamento
// está provado no Caso 8, na função pura. O que esta checagem garante é que o
// caminho de rede realmente CONSULTA a cobertura em vez de declarar `true`.
// -----------------------------------------------------------------------
{
  const db = readFileSync(new URL('../client/src/lib/databaseClient.ts', import.meta.url), 'utf8');
  check('fiação: databaseClient importa regulatoryHistoryCoverageComplete',
    /import \{ regulatoryHistoryCoverageComplete \} from '\.\/complianceEngine';/.test(db));
  check('fiação: complete vem da cobertura temporal, não do sucesso da requisição',
    /complete: regulatoryHistoryCoverageComplete\(active\?\.days \|\| \[\], days\)/.test(db));
  check('fiação: nenhum caminho declara complete: true incondicionalmente',
    !/complete: true/.test(db), 'ainda existe `complete: true` literal em databaseClient.ts');
  check('fiação: falha de rede continua fail-closed (complete: false)',
    /return \{ days: local, complete: false \};/.test(db));
}

process.exit(checker.report());
