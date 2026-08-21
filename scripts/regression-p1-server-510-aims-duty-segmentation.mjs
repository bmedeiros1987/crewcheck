/**
 * #510 (lado servidor) — segmentação de coluna civil por nova apresentação no
 * formato AIMS/Escala, sem fallback silencioso para STD.
 *
 * `server/rosterParser.mjs::parseAimsTokensIntoEventsV3` tratava a coluna
 * inteira de um dia civil como uma única jornada: o primeiro horário antes de
 * qualquer "LA" virava `dutyReport` por padrão, e todos os "LA" da coluna
 * eram agrupados como pernas de um único dia. Isso permitia que um resíduo
 * "(...)" do descanso/pernoite anterior contaminasse a apresentação da
 * próxima jornada real, e fundia duas jornadas civis distintas no mesmo dia
 * em um só bloco.
 *
 * O sinal estrutural correto: um "LA" com apresentação própria publicada tem
 * DOIS horários antes do primeiro aeroporto (apresentação + partida); um "LA"
 * que é apenas continuação de uma jornada já aberta tem só UM (a partida).
 * `startsNewAimsDutyV3` segmenta a coluna por esse sinal antes de montar cada
 * `flightDay`.
 *
 * Uma tentativa anterior deste fix (revisada e marcada NÃO MERGE em #510)
 * corrigia a contaminação/fusão mas reintroduzia o problema por outro caminho:
 * quando o PRIMEIRO "LA" da coluna inteira é ele mesmo uma continuação sem
 * apresentação própria (perna real, mas sem apresentação comprovável), o
 * código antigo ainda caía em `|| flightDay.legs[0].departureTime` — ou seja,
 * inventava APZ = STD exatamente no caso que o #510 proíbe. Este teste prova
 * que essa perna continua preservada (não é descartada) e que `dutyReport`
 * fica `null` (REVIEW), nunca o horário de partida.
 *
 * Casos sintéticos, não derivados de nenhum PDF real — não há fixture de
 * corpus aqui, só arrays de tokens escritos à mão. LA3730/LA3246/LA4712 são
 * os números de voo do oracle público já registrado na issue #510 pelo
 * próprio Bruno; os demais casos usam números sintéticos (LA9002/LA9003) para
 * não amarrar a regra a um voo/aeroporto específico.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempDir = fs.mkdtempSync(path.join('/tmp', 'crewcheck-510-server-regression-'));
const src = fs.readFileSync(path.join(ROOT, 'server/rosterParser.mjs'), 'utf8');
assert.ok(src.includes('export { parsePdfOnServer };'), 'ponto de export esperado não encontrado — arquivo mudou de forma inesperada');
const patched = src.replace(
  'export { parsePdfOnServer };',
  'export { parsePdfOnServer, parseAimsTokensIntoEventsV3 };',
);
const tmpFile = path.join(tempDir, 'rosterParser.mjs');
fs.writeFileSync(tmpFile, patched);
const mod = await import(pathToFileURL(tmpFile).href);

let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  if (condition) { passed += 1; console.log(`  PASS  ${name}`); }
  else { failed += 1; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

// findBestFlightPatternV3 excluir "CNA" (atividade/cancelamento) do padrão de
// aeroporto de uma perna é um refinamento que só se materializa no estado
// preparado (scripts/v139/apply.mjs) — já verdadeiro em `main` sem nenhuma
// mudança deste patch (regression-v14-3-74-for-cgh.mjs/v14-3-75 também só
// passam preparados). Sondamos em runtime em vez de depender de um marcador
// de string frágil no fonte.
const cnaHandledCorrectly = (() => {
  // "1" não é um número de voo válido (parseAimsTokensIntoEventsV3 exige
  // /^\d{3,4}$/) — uma versão anterior desta sonda usava isso e sempre
  // retornava falso, mascarando a divergência base/preparado (achado da
  // auditoria adversarial). Corrigido para um número de voo real (3-4 dígitos).
  const probe = mod.parseAimsTokensIntoEventsV3(['LA', '1000', '10:00', '10:30', 'AAA', 'BBB', '11:00', 'CNA', '12:00', 'BBB', '12:30'], 1, 1, 2026, 'X');
  return probe.find((d) => d.type === 'VOO')?.legs?.[0]?.destination === 'BBB';
})();

// -----------------------------------------------------------------------
// Caso 1 — LA3730: boundary anterior (08:29, resíduo "(...)") não pode
// contaminar a apresentação da jornada real.
// -----------------------------------------------------------------------
{
  const tokens = ['(...)', 'BSB', '08:29', '08:29', 'LA', '3730', '09:25', '10:15', 'BSB', 'FOR', '12:55'];
  const days = mod.parseAimsTokensIntoEventsV3(tokens, 17, 8, 2026, 'BSB');
  const flightDays = days.filter((d) => d.type === 'VOO');
  check('LA3730: exatamente uma jornada extraída', flightDays.length === 1, JSON.stringify(days));
  const day = flightDays[0];
  check('LA3730: dutyReport = 09:25 (não 08:29 do boundary anterior)', day?.dutyReport === '09:25', JSON.stringify(day));
  check('LA3730: perna STD = 10:15, chegada 12:55, BSB->FOR', day?.legs?.[0]?.departureTime === '10:15' && day?.legs?.[0]?.arrivalTime === '12:55' && day?.legs?.[0]?.origin === 'BSB' && day?.legs?.[0]?.destination === 'FOR', JSON.stringify(day?.legs));
}

// -----------------------------------------------------------------------
// Caso 2 — LA4712 + LA3246 no mesmo dia civil: duas jornadas reais, não
// podem ser fundidas; LA3246 usa APZ=23:03, nunca STD=23:50.
// -----------------------------------------------------------------------
{
  const tokens = ['LA', '4712', '06:00', '06:45', 'BSB', 'CGH', '08:20', 'LA', '3246', '23:03', '23:50', 'CGH', 'GRU', '00:35'];
  const days = mod.parseAimsTokensIntoEventsV3(tokens, 18, 8, 2026, 'BSB');
  const flightDays = days.filter((d) => d.type === 'VOO');
  check('LA4712+LA3246: duas jornadas distintas (não fundidas)', flightDays.length === 2, JSON.stringify(days));
  const la4712 = flightDays.find((d) => d.pairingCode === 'LA4712');
  const la3246 = flightDays.find((d) => d.pairingCode === 'LA3246');
  check('LA4712: jornada própria com dutyReport = 06:00', la4712?.dutyReport === '06:00', JSON.stringify(la4712));
  check('LA3246: dutyReport (APZ) = 23:03', la3246?.dutyReport === '23:03', JSON.stringify(la3246));
  check('LA3246: partida (STD) = 23:50, nunca usada como dutyReport', la3246?.legs?.[0]?.departureTime === '23:50' && la3246?.dutyReport !== la3246?.legs?.[0]?.departureTime, JSON.stringify(la3246));
  check('LA4712 e LA3246 não compartilham pernas (sem contaminação cruzada)', la4712?.legs?.length === 1 && la3246?.legs?.length === 1 && la4712.legs[0].flightNumber !== la3246.legs[0].flightNumber, JSON.stringify({ la4712, la3246 }));
}

// -----------------------------------------------------------------------
// Caso 3 — primeiro "LA" da coluna é continuação sem apresentação própria:
// perna preservada, dutyReport=null (REVIEW), nunca STD inventado.
// -----------------------------------------------------------------------
{
  const tokens = ['LA', '9002', '01:15', 'GRU', 'REC', '03:30'];
  const days = mod.parseAimsTokensIntoEventsV3(tokens, 20, 8, 2026, 'BSB');
  const flightDays = days.filter((d) => d.type === 'VOO');
  check('continuação sem apresentação: perna preservada (não descartada)', flightDays.length === 1 && flightDays[0]?.legs?.length === 1, JSON.stringify(days));
  const day = flightDays[0];
  check('continuação sem apresentação: dutyReport === null (REVIEW), não 01:15 (STD)', day?.dutyReport === null, JSON.stringify(day));
  check('continuação sem apresentação: dutyHours === null (não NaN)', day?.dutyHours === null, `dutyHours=${day?.dutyHours}`);
  check('continuação sem apresentação: perna mantém seus próprios horários (GRU->REC, 01:15->03:30)', day?.legs?.[0]?.departureTime === '01:15' && day?.legs?.[0]?.arrivalTime === '03:30' && day?.legs?.[0]?.destination === 'REC', JSON.stringify(day?.legs));
}

// -----------------------------------------------------------------------
// Caso 4 — "(...)" é sempre continuação/boundary, nunca apresentação da
// PRÓXIMA jornada real (caso genérico, distinto do LA3730 acima).
// -----------------------------------------------------------------------
{
  const tokens = ['(...)', 'GRU', '05:10', '05:40', 'LA', '9003', '14:00', '14:45', 'GRU', 'REC', '16:20'];
  const days = mod.parseAimsTokensIntoEventsV3(tokens, 21, 8, 2026, 'BSB');
  const flightDays = days.filter((d) => d.type === 'VOO');
  check('"(...)" genérico: exatamente uma jornada extraída', flightDays.length === 1, JSON.stringify(days));
  const day = flightDays[0];
  check('"(...)" genérico: dutyReport = 14:00 (não 05:10/05:40 do resíduo anterior)', day?.dutyReport === '14:00', JSON.stringify(day));
}

// -----------------------------------------------------------------------
// Caso 5 — LA3558 + LA3559 + LA4631 (mesmo caso real do gate
// v14.3.74/v14.3.75): jornada com conexões curtas onde CADA perna imprime
// seu próprio par de horários (programado + realizado), não só a primeira.
// Contar "dois horários antes do aeroporto" sozinho fragmentaria as 3 pernas
// em 3 jornadas; o intervalo físico entre pernas (minutos, não pernoite)
// deve mantê-las na mesma jornada. Isto é o que esta correção estrutural
// governa (segmentação/agrupamento) — por isso as asserções abaixo cobrem
// contagem de jornada, sequência e as duas primeiras pernas completas.
//
// Nota: esta correção também passou a exigir continuidade física de estação
// (origem da perna == destino da anterior) para manter duas pernas na mesma
// jornada (achado da auditoria adversarial — nunca fundir jornada fisicamente
// impossível). Isso torna o agrupamento de LA4631 sensível a um refinamento
// PRÉ-EXISTENTE e não relacionado de `findBestFlightPatternV3` — ignorar
// "CNA" como aeroporto ao montar o padrão — que só se materializa no estado
// preparado (`scripts/v139/apply.mjs`); mesmo comportamento em `main` sem
// nenhuma mudança deste patch (`regression-v14-3-74-for-cgh.mjs`/`v14-3-75`
// também só passam preparados). Por isso a asserção de agrupamento é
// condicionada à sonda `cnaHandledCorrectly`; a preservação das 3 pernas
// (nenhuma perdida) é verificada sempre, nos dois estados.
// -----------------------------------------------------------------------
{
  const tokens = ['LA','3558','13:05','13:35','FOR','PHB','14:37','15:07','LA','3559','15:28','15:58','PHB','FOR','16:52','17:22','LA','4631','17:09','17:39','FOR','CGH','21:09','CNA','21:10','CGH','21:20','21:50'];
  const days = mod.parseAimsTokensIntoEventsV3(tokens, 1, 8, 2026, 'BSB');
  const flightDays = days.filter((d) => d.type === 'VOO');
  const allLegs = flightDays.flatMap((d) => d.legs || []);
  check('LA3558+LA3559+LA4631: as 3 pernas continuam presentes (nenhuma perdida), estado base ou preparado', JSON.stringify(allLegs.map((l) => l.flightNumber).sort()) === JSON.stringify(['LA3558', 'LA3559', 'LA4631']), JSON.stringify(days));
  if (cnaHandledCorrectly) {
    check('LA3558+LA3559+LA4631: permanecem UMA única jornada (estado preparado — não fragmentam por par programado/realizado)', flightDays.length === 1 && flightDays[0]?.legs?.length === 3, JSON.stringify(days));
  } else {
    console.log('  SKIP  LA3558+LA3559+LA4631: agrupamento em uma jornada só (estado base não tem o refinamento CNA de findBestFlightPatternV3 — ver nota acima; coberto por v14.3.74/v14.3.75 no contexto certo)');
  }
  const legs = flightDays[0]?.legs || [];
  check('LA3558: rota e horários corretos (FOR-PHB, 13:35->14:37)', legs[0]?.origin === 'FOR' && legs[0]?.destination === 'PHB' && legs[0]?.departureTime === '13:35' && legs[0]?.arrivalTime === '14:37', JSON.stringify(legs[0]));
  check('LA3559: rota e horários corretos (PHB-FOR, 15:58->16:52)', legs[1]?.origin === 'PHB' && legs[1]?.destination === 'FOR' && legs[1]?.departureTime === '15:58' && legs[1]?.arrivalTime === '16:52', JSON.stringify(legs[1]));
}

// -----------------------------------------------------------------------
// Caso 6 — marcador EXTRA/PS logo antes do "LA" que abre uma NOVA jornada
// (não a primeira da coluna) precisa ser atribuído à perna certa. Ler o
// marcador de forma relativa ao segmento (em vez da coluna inteira, como o
// SHA anterior fazia) o deixava invisível para findAimsVisualFlightBlockEnd
// quando a perna nova ficava exatamente no início do seu próprio segmento —
// hasLeadingExtraMarker agora sempre olha upperTokens/i absolutos.
//
// Achado da auditoria adversarial (WORK-AUDIT no SHA anterior): a janela de
// tokens (`seq`) da perna anterior ia até o próximo "LA", incluindo o
// marcador que na verdade descreve a PRÓXIMA perna — `parseAimsFlightSeq`
// detectava esse marcador dentro da própria janela e marcava a perna ERRADA
// (a anterior) como PS. Corrigido recortando o marcador do fim de `seq` antes
// de montar a perna anterior — agora ele nunca é visto por duas pernas.
// -----------------------------------------------------------------------
{
  const tokens = ['LA', '9004', '06:00', '06:45', 'BSB', 'CGH', '08:20', 'EXTRA', 'LA', '9005', '22:00', '22:30', 'CGH', 'GRU', '23:40'];
  const days = mod.parseAimsTokensIntoEventsV3(tokens, 22, 8, 2026, 'BSB');
  const flightDays = days.filter((d) => d.type === 'VOO');
  check('marcador EXTRA antes de nova jornada: duas jornadas distintas (gap >= 12h)', flightDays.length === 2, JSON.stringify(days));
  const second = flightDays.find((d) => d.pairingCode === 'LA9005');
  check('marcador EXTRA antes de nova jornada: workType=PS atribuído à perna correta (LA9005) que ele realmente precede', second?.legs?.[0]?.workType === 'PS', JSON.stringify(second));
  const first = flightDays.find((d) => d.pairingCode === 'LA9004');
  check('marcador EXTRA antes de nova jornada: perna anterior (LA9004) permanece OP, não contaminada', first?.legs?.[0]?.workType === 'OP', JSON.stringify(first));
}

// -----------------------------------------------------------------------
// Caso 7 — apresentação impressa ANTES do token "LA" (não só entre "LA" e a
// origem) não é reconhecida, em nenhuma posição. Achado da auditoria
// adversarial: uma versão anterior reconhecia isso só para a primeira perna
// da coluna, mas mesmo essa versão parcial deixava o token acessível ao
// cálculo de debrief da perna ANTERIOR quando havia mais de uma jornada na
// coluna — contaminando `dutyDebrief` da jornada anterior com a apresentação
// da seguinte, e ainda perdendo a apresentação em si (`dutyReport=null`). Sem
// um sinal estrutural que distinga isso de um debrief legítimo (ex.:
// LA3559→LA4631, onde o mesmo padrão de token É o debrief real), a
// apresentação pré-"LA" fica REVIEW (`dutyReport=null`) em qualquer posição —
// nunca inventada, nunca contaminando a jornada anterior.
// -----------------------------------------------------------------------
{
  const tokens = ['09:25', 'LA', '9010', '10:15', 'AAA', 'BBB', '11:15'];
  const days = mod.parseAimsTokensIntoEventsV3(tokens, 23, 8, 2026, 'BSB');
  const flightDays = days.filter((d) => d.type === 'VOO');
  check('apresentação pré-LA (primeira perna da coluna): dutyReport=null (REVIEW), não inventada', flightDays[0]?.dutyReport === null, JSON.stringify(flightDays));
  check('apresentação pré-LA (primeira perna da coluna): perna preservada mesmo sem dutyReport', flightDays[0]?.legs?.[0]?.flightNumber === 'LA9010', JSON.stringify(flightDays));
}

// -----------------------------------------------------------------------
// Caso 7b — apresentação pré-LA da SEGUNDA jornada não pode contaminar o
// dutyDebrief da jornada anterior (achado direto da auditoria adversarial:
// `06:00 LA9001 ... 08:20 23:03 LA9002 23:50 ...` produzia
// LA9001.dutyDebrief=23:03 e LA9002.dutyReport=null — a apresentação da
// segunda jornada virava debrief inventado da primeira).
// -----------------------------------------------------------------------
{
  const tokens = ['LA', '9001', '06:00', '06:45', 'AAA', 'BBB', '08:20', '23:03', 'LA', '9002', '23:50', 'BBB', 'CCC', '01:15'];
  const days = mod.parseAimsTokensIntoEventsV3(tokens, 1, 8, 2026, 'BSB');
  const flightDays = days.filter((d) => d.type === 'VOO');
  const first = flightDays.find((d) => d.pairingCode === 'LA9001');
  const second = flightDays.find((d) => d.pairingCode === 'LA9002');
  check('apresentação pré-LA da 2ª jornada: dutyDebrief da 1ª jornada não é contaminado pela apresentação da 2ª (não é 23:03)', first?.dutyDebrief !== '23:03', JSON.stringify(first));
  check('apresentação pré-LA da 2ª jornada: dutyReport da 2ª fica null (REVIEW), não inventado nem perdido silenciosamente', second?.dutyReport === null, JSON.stringify(second));
}

// -----------------------------------------------------------------------
// Caso 8 — descontinuidade física: origem da perna não bate com o destino da
// perna anterior. Mesmo com intervalo curto, não pode ser tratada como
// conexão da mesma jornada (nunca fundir jornada fisicamente impossível).
// -----------------------------------------------------------------------
{
  const tokens = ['LA', '9011', '06:00', '06:45', 'AAA', 'BBB', '08:00', 'LA', '9012', '08:30', '09:00', 'CCC', 'DDD', '10:00'];
  const days = mod.parseAimsTokensIntoEventsV3(tokens, 24, 8, 2026, 'BSB');
  const flightDays = days.filter((d) => d.type === 'VOO');
  check('descontinuidade física (BBB->...->CCC sem ligação): duas jornadas distintas mesmo com gap curto', flightDays.length === 2, JSON.stringify(days));
}

// -----------------------------------------------------------------------
// Caso 9 — perna sem apresentação própria após descanso longo não pode ficar
// silenciosamente fundida com a jornada anterior; deve abrir jornada própria
// com dutyReport=null (REVIEW), usando a partida real só para medir o
// intervalo (nunca como dutyReport).
// -----------------------------------------------------------------------
{
  const tokens = ['LA', '9013', '06:00', '06:45', 'AAA', 'BBB', '08:00', 'LA', '9014', '23:00', 'BBB', 'CCC', '23:45'];
  const days = mod.parseAimsTokensIntoEventsV3(tokens, 25, 8, 2026, 'BSB');
  const flightDays = days.filter((d) => d.type === 'VOO');
  check('sem apresentação após descanso longo: duas jornadas distintas (gap medido pela partida real)', flightDays.length === 2, JSON.stringify(days));
  const second = flightDays.find((d) => d.pairingCode === 'LA9014');
  check('sem apresentação após descanso longo: dutyReport=null (REVIEW), não herda a apresentação da jornada anterior nem vira STD', second?.dutyReport === null, JSON.stringify(second));
}

console.log(`\n---> ${passed} passed, ${failed} failed`);
fs.rmSync(tempDir, { recursive: true, force: true });
process.exit(failed > 0 ? 1 : 0);
