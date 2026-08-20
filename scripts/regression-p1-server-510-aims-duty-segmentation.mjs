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
// Nota: a exatidão fina de LA4631 (ignorar "CNA" como aeroporto ao montar o
// padrão da última perna) é um refinamento de `findBestFlightPatternV3` que
// só se materializa no estado preparado (`scripts/v139/apply.mjs`) — mesmo
// comportamento em `main` sem nenhuma mudança deste patch. Já coberto no
// contexto certo por `regression-v14-3-74-for-cgh.mjs` e
// `regression-v14-3-75-telegram-roster-parity.mjs`, que passam nos dois
// estados (confirmado). Não é reimplementado aqui para não duplicar escopo.
// -----------------------------------------------------------------------
{
  const tokens = ['LA','3558','13:05','13:35','FOR','PHB','14:37','15:07','LA','3559','15:28','15:58','PHB','FOR','16:52','17:22','LA','4631','17:09','17:39','FOR','CGH','21:09','CNA','21:10','CGH','21:20','21:50'];
  const days = mod.parseAimsTokensIntoEventsV3(tokens, 1, 8, 2026, 'BSB');
  const flightDays = days.filter((d) => d.type === 'VOO');
  check('LA3558+LA3559+LA4631: permanecem UMA única jornada (não fragmentam por par programado/realizado)', flightDays.length === 1 && flightDays[0]?.legs?.length === 3, JSON.stringify(days));
  const legs = flightDays[0]?.legs || [];
  check('LA3558+LA3559+LA4631: sequência de voos correta', JSON.stringify(legs.map((l) => l.flightNumber)) === JSON.stringify(['LA3558', 'LA3559', 'LA4631']), JSON.stringify(legs));
  check('LA3558: rota e horários corretos (FOR-PHB, 13:35->14:37)', legs[0]?.origin === 'FOR' && legs[0]?.destination === 'PHB' && legs[0]?.departureTime === '13:35' && legs[0]?.arrivalTime === '14:37', JSON.stringify(legs[0]));
  check('LA3559: rota e horários corretos (PHB-FOR, 15:58->16:52)', legs[1]?.origin === 'PHB' && legs[1]?.destination === 'FOR' && legs[1]?.departureTime === '15:58' && legs[1]?.arrivalTime === '16:52', JSON.stringify(legs[1]));
  check('LA4631: perna reconhecida com seu próprio flightNumber (não perdida nem fundida)', Boolean(legs[2]?.flightNumber === 'LA4631'), JSON.stringify(legs[2]));
}

// -----------------------------------------------------------------------
// Caso 6 — marcador EXTRA/PS logo antes do "LA" que abre uma NOVA jornada
// (não a primeira da coluna) precisa ser atribuído à perna certa. Ler o
// marcador de forma relativa ao segmento (em vez da coluna inteira, como o
// SHA anterior fazia) o deixava invisível para findAimsVisualFlightBlockEnd
// quando a perna nova ficava exatamente no início do seu próprio segmento —
// hasLeadingExtraMarker agora sempre olha upperTokens/i absolutos.
//
// Nota: parseAimsFlightSeq já detecta EXTRA/PS de forma independente dentro
// da própria janela de tokens de CADA perna (comportamento pré-existente, não
// tocado aqui), então um EXTRA colado ao fim da perna anterior também marca
// aquela perna como PS — isso já acontecia no `main` sem nenhuma mudança do
// #510 e está fora do escopo desta correção estrutural.
// -----------------------------------------------------------------------
{
  const tokens = ['LA', '9004', '06:00', '06:45', 'BSB', 'CGH', '08:20', 'EXTRA', 'LA', '9005', '22:00', '22:30', 'CGH', 'GRU', '23:40'];
  const days = mod.parseAimsTokensIntoEventsV3(tokens, 22, 8, 2026, 'BSB');
  const flightDays = days.filter((d) => d.type === 'VOO');
  check('marcador EXTRA antes de nova jornada: duas jornadas distintas (gap >= 12h)', flightDays.length === 2, JSON.stringify(days));
  const second = flightDays.find((d) => d.pairingCode === 'LA9005');
  check('marcador EXTRA antes de nova jornada: workType=PS atribuído à perna correta (LA9005) que ele realmente precede', second?.legs?.[0]?.workType === 'PS', JSON.stringify(second));
}

console.log(`\n---> ${passed} passed, ${failed} failed`);
fs.rmSync(tempDir, { recursive: true, force: true });
process.exit(failed > 0 ? 1 : 0);
