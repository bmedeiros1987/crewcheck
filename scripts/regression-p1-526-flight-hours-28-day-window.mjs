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

const { worstFlightHoursWindow28Days } = harness.load('complianceEngine');

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

checker.report();
