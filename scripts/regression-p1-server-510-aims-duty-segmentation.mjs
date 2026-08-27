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
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempDir = fs.mkdtempSync(path.join('/tmp', 'crewcheck-510-server-regression-'));
const src = fs.readFileSync(path.join(ROOT, 'server/rosterParser.mjs'), 'utf8');
assert.ok(src.includes('export { parsePdfOnServer };'), 'ponto de export esperado não encontrado — arquivo mudou de forma inesperada');
const currentBaseGuard = "  const routeBoundaries = new Set(['CNA']);\n  if (upper.slice(0, arrItem.idx).some((token) => routeBoundaries.has(token))) return;";
const currentPreparedGuard = "  const routeBoundaries = new Set(['CNA','HSB','HSBE','ASB','RES','CRM','CRMB','CRMBSB','RCFI','MT','MCK','MCK320','MCK_SS','CBF','EMER','DO','DOF','DOP','DOPR','DR','OFF','VC','NS','NSJ','IJ','DM']);\n  if (upper.slice(0, arrItem.idx).some((token) => routeBoundaries.has(token))) return;";
const priorPreparedGuard = "  const routeBoundaries = new Set(['CNA','HSB','HSBE','ASB','RES','CRM','CRMB','CRMBSB','RCFI','MT','MCK','MCK320','MCK_SS','CBF','EMER','DO','DOF','DOP','DOPR','DR','OFF','VC','NS','NSJ','IJ','DM']);\n  if (upper.slice(originIdx + 1, arrItem.idx).some((token) => routeBoundaries.has(token))) return;";
let legacyPreparedSource = src;
if (legacyPreparedSource.includes(currentBaseGuard)) legacyPreparedSource = legacyPreparedSource.replace(currentBaseGuard, priorPreparedGuard);
else if (legacyPreparedSource.includes(currentPreparedGuard)) legacyPreparedSource = legacyPreparedSource.replace(currentPreparedGuard, priorPreparedGuard);
else assert.fail('guard CNA atual não localizado para construir estado preparado legado');
const legacyMarker = '// [v14.3.75] Telegram/server AIMS parity with canonical client parser';
if (!legacyPreparedSource.includes(legacyMarker)) legacyPreparedSource = `${legacyPreparedSource.trimEnd()}\n\n${legacyMarker}\n`;
const legacyDir = path.join(tempDir, 'legacy-prepared');
fs.mkdirSync(path.join(legacyDir, 'server'), { recursive: true });
fs.mkdirSync(path.join(legacyDir, 'scripts', 'v14375'), { recursive: true });
fs.writeFileSync(path.join(legacyDir, 'server', 'rosterParser.mjs'), legacyPreparedSource);
fs.copyFileSync(path.join(ROOT, 'scripts', 'v14375', 'apply.mjs'), path.join(legacyDir, 'scripts', 'v14375', 'apply.mjs'));
execFileSync(process.execPath, ['scripts/v14375/apply.mjs'], { cwd: legacyDir, stdio: 'pipe' });
const migratedLegacySource = fs.readFileSync(path.join(legacyDir, 'server', 'rosterParser.mjs'), 'utf8');
assert.ok(migratedLegacySource.includes(currentPreparedGuard), 'estado já marcado precisa persistir migração do guard até o início do bloco');
assert.ok(!migratedLegacySource.includes(priorPreparedGuard), 'guard legado não pode sobreviver ao short-circuit do marker');

// Idempotência do ramo de migração: `oldScoreGuard` é prefixo literal de
// `newScoreGuard`, então uma árvore já migrada ainda casaria aquele ramo e o
// bloco de boundaries seria reinjetado. Reaplicar precisa ser no-op.
execFileSync(process.execPath, ['scripts/v14375/apply.mjs'], { cwd: legacyDir, stdio: 'pipe' });
const reappliedLegacySource = fs.readFileSync(path.join(legacyDir, 'server', 'rosterParser.mjs'), 'utf8');
assert.equal(reappliedLegacySource, migratedLegacySource, 'reaplicar v14.3.75 sobre árvore já migrada precisa ser no-op byte a byte');
assert.equal((reappliedLegacySource.match(/const routeBoundaries = new Set\(/g) || []).length, 1, 'reaplicar v14.3.75 não pode duplicar a declaração de routeBoundaries');
execFileSync(process.execPath, ['--check', path.join(legacyDir, 'server', 'rosterParser.mjs')], { stdio: 'pipe' });

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

// CNA é atividade/cancelamento, nunca aeroporto. O contrato abaixo deve ser
// idêntico no estado base e após a cadeia de preparação.

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
// CNA é código de atividade/cancelamento, não aeroporto. Esse contrato agora
// é materializado na base e o preparador v14.3.75 aceita o estado intermediário
// de forma idempotente; portanto agrupamento, continuidade física e rotas
// devem ser idênticos antes e depois da preparação.
//
// -----------------------------------------------------------------------
{
  const tokens = ['LA','3558','13:05','13:35','FOR','PHB','14:37','15:07','LA','3559','15:28','15:58','PHB','FOR','16:52','17:22','LA','4631','17:09','17:39','FOR','CGH','21:09','CNA','21:10','CGH','21:20','21:50'];
  const days = mod.parseAimsTokensIntoEventsV3(tokens, 1, 8, 2026, 'BSB');
  const flightDays = days.filter((d) => d.type === 'VOO');
  const allLegs = flightDays.flatMap((d) => d.legs || []);
  check('LA3558+LA3559+LA4631: as 3 pernas continuam presentes (nenhuma perdida), estado base ou preparado', JSON.stringify(allLegs.map((l) => l.flightNumber).sort()) === JSON.stringify(['LA3558', 'LA3559', 'LA4631']), JSON.stringify(days));
  check('LA3558+LA3559+LA4631: permanecem UMA única jornada com 3 pernas, estado base ou preparado', flightDays.length === 1 && flightDays[0]?.legs?.length === 3, JSON.stringify(days));
  const legs = flightDays[0]?.legs || [];
  check('LA3558: rota e horários corretos (FOR-PHB, 13:35->14:37)', legs[0]?.origin === 'FOR' && legs[0]?.destination === 'PHB' && legs[0]?.departureTime === '13:35' && legs[0]?.arrivalTime === '14:37', JSON.stringify(legs[0]));
  check('LA3559: rota e horários corretos (PHB-FOR, 15:58->16:52)', legs[1]?.origin === 'PHB' && legs[1]?.destination === 'FOR' && legs[1]?.departureTime === '15:58' && legs[1]?.arrivalTime === '16:52', JSON.stringify(legs[1]));
}

// -----------------------------------------------------------------------
// Caso 5b — CNA é boundary de cancelamento/atividade, não um token
// transparente entre dois aeroportos. A base e o preparado não podem criar
// uma perna fictícia AAA→BBB atravessando CNA.
// -----------------------------------------------------------------------
{
  const tokens = ['LA','1234','09:00','AAA','10:00','CNA','11:00','BBB','12:00'];
  const days = mod.parseAimsTokensIntoEventsV3(tokens, 1, 8, 2026, 'BSB');
  const flightDays = days.filter((d) => d.type === 'VOO');
  check('CNA boundary: nenhuma perna fictícia atravessa cancelamento, estado base ou preparado', flightDays.length === 0, JSON.stringify(days));
}

// -----------------------------------------------------------------------
// Caso 5c — o boundary CNA precisa cobrir o candidato inteiro até o horário
// de chegada, inclusive quando aparece DEPOIS do destino selecionado.
// -----------------------------------------------------------------------
{
  const tokens = ['LA','1234','09:00','AAA','10:00','BBB','CNA','12:00'];
  const days = mod.parseAimsTokensIntoEventsV3(tokens, 1, 8, 2026, 'BSB');
  const flightDays = days.filter((d) => d.type === 'VOO');
  check('CNA entre destino e chegada: nenhuma perna fictícia, estado base ou preparado', flightDays.length === 0, JSON.stringify(days));
}

// -----------------------------------------------------------------------
// Caso 5d — CNA também invalida o candidato quando aparece antes da origem
// selecionada dentro do mesmo bloco LA. O boundary não pode ficar fora da
// janela apenas porque o scorer encontrou um aeroporto posterior.
// -----------------------------------------------------------------------
{
  const tokens = ['LA','1234','09:00','CNA','AAA','10:00','BBB','12:00'];
  const days = mod.parseAimsTokensIntoEventsV3(tokens, 1, 8, 2026, 'BSB');
  const flightDays = days.filter((d) => d.type === 'VOO');
  check('CNA antes da origem selecionada: nenhuma perna fictícia, estado base ou preparado', flightDays.length === 0, JSON.stringify(days));
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
// Caso 7 — apresentação impressa ANTES do token "LA" da PRIMEIRA perna da
// coluna (k===0), com a coluna genuinamente limpa (sem nenhum "(...)" antes
// do "LA"), é reconhecida: não existe jornada anterior nem boundary
// disputando o token, então é sempre seguro recuperar o valor em vez de
// descartá-lo. Achado da auditoria adversarial sobre uma versão anterior que
// descartava isso incondicionalmente (inclusive neste caso limpo, onde a
// perda é desnecessária porque não há ambiguidade nenhuma).
// -----------------------------------------------------------------------
{
  const tokens = ['09:25', 'LA', '9010', '10:15', 'AAA', 'BBB', '11:15'];
  const days = mod.parseAimsTokensIntoEventsV3(tokens, 23, 8, 2026, 'BSB');
  const flightDays = days.filter((d) => d.type === 'VOO');
  check('apresentação pré-LA (primeira perna da coluna, sem boundary): dutyReport recuperado (09:25), não descartado', flightDays[0]?.dutyReport === '09:25', JSON.stringify(flightDays));
  check('apresentação pré-LA (primeira perna da coluna, sem boundary): perna preservada', flightDays[0]?.legs?.[0]?.flightNumber === 'LA9010', JSON.stringify(flightDays));
}

// -----------------------------------------------------------------------
// Caso 7d — apresentação pré-LA da PRIMEIRA perna da coluna (k===0) NÃO pode
// ser reconhecida quando a coluna abre com resíduo de boundary "(...)"
// (mesmo marcador estrutural que stitchServerAimsMidnightColumns já usa para
// resíduo de virada de meia-noite, regex /^\(\.{3}\)$/ — não é convenção só
// de teste). Achado da auditoria adversarial: "primeiro LA da coluna" não é
// o mesmo que "início limpo da coluna"; `(...) AAA 08:29 08:29 LA9101 ...`
// tem o horário 08:29 pertencente ao boundary anterior, não a uma
// apresentação própria de LA9101 — reconhecê-lo reabre exatamente a classe
// de contaminação boundary→APZ que o #510 existe para impedir.
// -----------------------------------------------------------------------
{
  const tokens = ['(...)', 'AAA', '08:29', '08:29', 'LA', '9101', '10:15', 'AAA', 'BBB', '11:15'];
  const days = mod.parseAimsTokensIntoEventsV3(tokens, 27, 8, 2026, 'BSB');
  const flightDays = days.filter((d) => d.type === 'VOO');
  check('apresentação pré-LA (primeira perna da coluna, COM boundary "(...)"): dutyReport=null (REVIEW), nunca herda o horário do boundary (08:29)', flightDays[0]?.dutyReport === null, JSON.stringify(flightDays));
  check('apresentação pré-LA (primeira perna da coluna, COM boundary "(...)"): perna preservada mesmo sem dutyReport', flightDays[0]?.legs?.[0]?.flightNumber === 'LA9101', JSON.stringify(flightDays));
}

// -----------------------------------------------------------------------
// Caso 7e — apresentação pré-LA da PRIMEIRA perna da coluna (k===0) É
// reconhecida quando há um 3º horário distinto além dos 2 que o boundary
// "(...)" já consome (chegada + debrief da jornada anterior, exatamente o
// formato que stitchServerAimsMidnightColumns produz ao substituir o
// "(...)"). Um 3º horário além desses dois não pode pertencer ao boundary —
// só pode ser a apresentação própria desta perna. Distingue do Caso 7d
// (exatamente 2 horários desde o boundary, todos pertencentes a ele).
// -----------------------------------------------------------------------
{
  const tokens = ['(...)', 'AAA', '08:29', '08:29', '09:25', 'LA', '9102', '10:15', 'AAA', 'BBB', '11:15'];
  const days = mod.parseAimsTokensIntoEventsV3(tokens, 28, 8, 2026, 'BSB');
  const flightDays = days.filter((d) => d.type === 'VOO');
  check('apresentação pré-LA (primeira perna da coluna, boundary + 3º horário distinto): dutyReport recuperado (09:25), não descartado como se fosse boundary', flightDays[0]?.dutyReport === '09:25', JSON.stringify(flightDays));
}

// -----------------------------------------------------------------------
// Caso 7b — apresentação pré-LA da SEGUNDA jornada, quando a perna anterior
// tem EXATAMENTE 2 horários após o próprio destino, é um caso estruturalmente
// irresolúvel: o mesmo padrão de token (2 horários após o destino) é
// indistinguível do debrief legítimo real de LA3559→LA4631 (Caso 5). Sem um
// sinal que distinga os dois casos, a apresentação da 2ª jornada fica REVIEW
// (dutyReport=null) — aceito conscientemente como limitação, não como bug:
// o essencial é que o debrief da 1ª jornada não seja contaminado pelo token
// ambíguo (achado direto da auditoria adversarial: `06:00 LA9001 ... 08:20
// 23:03 LA9002 23:50 ...` produzia LA9001.dutyDebrief=23:03 e
// LA9002.dutyReport=null — a apresentação da segunda jornada virava debrief
// inventado da primeira; agora nem um nem outro acontece).
// -----------------------------------------------------------------------
{
  const tokens = ['LA', '9001', '06:00', '06:45', 'AAA', 'BBB', '08:20', '23:03', 'LA', '9002', '23:50', 'BBB', 'CCC', '01:15'];
  const days = mod.parseAimsTokensIntoEventsV3(tokens, 1, 8, 2026, 'BSB');
  const flightDays = days.filter((d) => d.type === 'VOO');
  const first = flightDays.find((d) => d.pairingCode === 'LA9001');
  const second = flightDays.find((d) => d.pairingCode === 'LA9002');
  check('apresentação pré-LA da 2ª jornada (2 horários, caso irresolúvel): dutyDebrief da 1ª jornada não é contaminado pela apresentação da 2ª (não é 23:03)', first?.dutyDebrief !== '23:03', JSON.stringify(first));
  check('apresentação pré-LA da 2ª jornada (2 horários, caso irresolúvel): dutyDebrief da 1ª jornada preservado corretamente (08:20)', first?.dutyDebrief === '08:20', JSON.stringify(first));
  check('apresentação pré-LA da 2ª jornada (2 horários, caso irresolúvel): dutyReport da 2ª fica null (REVIEW), não inventado nem perdido silenciosamente', second?.dutyReport === null, JSON.stringify(second));
}

// -----------------------------------------------------------------------
// Caso 7c — apresentação pré-LA da SEGUNDA jornada, quando a perna anterior
// tem 3+ horários após o próprio destino: os dois primeiros formam o par
// chegada+debrief legítimo dela; o 3º é estruturalmente excedente e
// pertence à apresentação da jornada seguinte. Achado da auditoria
// adversarial: `... BBB 08:20 08:50 23:03 LA9006 23:50 ...` — o recorte
// anti-vazamento de uma versão anterior descartava sempre o 2º horário (não
// só o excedente), reduzindo o debrief legítimo (08:50) à mera chegada
// (08:20) e ainda perdia o 23:03 por completo em vez de atribuí-lo à
// LA9006.
// -----------------------------------------------------------------------
{
  const tokens = ['LA', '9005', '07:00', '07:30', 'AAA', 'BBB', '08:20', '08:50', '23:03', 'LA', '9006', '23:50', 'BBB', 'CCC', '01:15'];
  const days = mod.parseAimsTokensIntoEventsV3(tokens, 26, 8, 2026, 'BSB');
  const flightDays = days.filter((d) => d.type === 'VOO');
  const first = flightDays.find((d) => d.pairingCode === 'LA9005');
  const second = flightDays.find((d) => d.pairingCode === 'LA9006');
  check('3 horários pós-destino: debrief legítimo da 1ª jornada preservado (08:50), não reduzido à chegada', first?.dutyDebrief === '08:50', JSON.stringify(first));
  check('3 horários pós-destino: horário excedente (3º) atribuído à apresentação da 2ª jornada (23:03), não perdido', second?.dutyReport === '23:03', JSON.stringify(second));
}

// -----------------------------------------------------------------------
// Caso 7f — igual ao Caso 7c, mas com um token NÃO-horário (ex.: matrícula de
// aeronave) intercalado entre o 1º e o 2º horário pós-destino. O recorte
// anti-vazamento não pode usar "destIdx + contagem de horários" como posição
// de corte — um token intercalado quebra essa aritmética e corta também um
// horário legítimo. O corte precisa usar a posição REAL do penúltimo
// horário, não uma contagem. Achado técnico avaliado por mérito próprio
// (reproduzido de forma independente antes de corrigir).
// -----------------------------------------------------------------------
{
  const tokens = ['LA', '9005', '07:00', '07:30', 'AAA', 'BBB', '08:20', '320', '08:50', '23:03', 'LA', '9006', '23:50', 'BBB', 'CCC', '01:15'];
  const days = mod.parseAimsTokensIntoEventsV3(tokens, 26, 8, 2026, 'BSB');
  const flightDays = days.filter((d) => d.type === 'VOO');
  const first = flightDays.find((d) => d.pairingCode === 'LA9005');
  const second = flightDays.find((d) => d.pairingCode === 'LA9006');
  check('token intercalado entre horários pós-destino: debrief legítimo da 1ª jornada preservado (08:50), não reduzido à chegada (08:20)', first?.dutyDebrief === '08:50', JSON.stringify(first));
  check('token intercalado entre horários pós-destino: horário excedente atribuído à apresentação da 2ª jornada (23:03), não perdido', second?.dutyReport === '23:03', JSON.stringify(second));
}

// -----------------------------------------------------------------------
// Caso 7g — quando a apresentação da nova jornada já está publicada DENTRO
// do próprio bloco LA, ela não disputa os horários pós-destino da jornada
// anterior. O recorte anti-vazamento não pode apagar seu debrief legítimo.
// -----------------------------------------------------------------------
{
  const tokens = ['LA', '1001', '06:00', '06:45', 'AAA', 'BBB', '08:20', '08:50', 'LA', '1002', '23:03', '23:50', 'BBB', 'CCC', '01:15'];
  const days = mod.parseAimsTokensIntoEventsV3(tokens, 29, 8, 2026, 'BSB');
  const flightDays = days.filter((d) => d.type === 'VOO');
  const first = flightDays.find((d) => d.pairingCode === 'LA1001');
  const second = flightDays.find((d) => d.pairingCode === 'LA1002');
  check('APZ própria dentro do próximo LA: debrief legítimo anterior preservado (08:50)', first?.dutyDebrief === '08:50', JSON.stringify(first));
  check('APZ própria dentro do próximo LA: dutyReport da nova jornada preservado (23:03)', second?.dutyReport === '23:03', JSON.stringify(second));
}

// -----------------------------------------------------------------------
// Caso 7h — o limiar de 12h entre jornadas é descanso após o fim/debrief da
// jornada anterior, não após a chegada. A apresentação pode se sobrepor em
// poucos minutos ao fim publicado; isso não é virada de dia nem nova jornada.
// -----------------------------------------------------------------------
{
  const below = ['LA','1101','06:00','06:45','AAA','BBB','08:00','08:30','LA','1102','20:00','20:30','BBB','CCC','21:30'];
  const belowFlightDays = mod.parseAimsTokensIntoEventsV3(below, 30, 8, 2026, 'BSB').filter((d) => d.type === 'VOO');
  check('limiar de descanso: 11h30 após debrief permanece uma jornada', belowFlightDays.length === 1 && belowFlightDays[0]?.legs?.length === 2, JSON.stringify(belowFlightDays));

  const exact = ['LA','1101','06:00','06:45','AAA','BBB','08:00','08:30','LA','1102','20:30','21:00','BBB','CCC','22:00'];
  const exactFlightDays = mod.parseAimsTokensIntoEventsV3(exact, 30, 8, 2026, 'BSB').filter((d) => d.type === 'VOO');
  check('limiar de descanso: exatamente 12h após debrief abre nova jornada', exactFlightDays.length === 2, JSON.stringify(exactFlightDays));
}

// -----------------------------------------------------------------------
// Caso 7h2 — sem debrief publicado, o fim inferido da jornada anterior é
// chegada + 30 minutos, em paridade com o parser canônico do cliente.
// -----------------------------------------------------------------------
{
  const below = ['LA','1111','06:00','06:45','AAA','BBB','08:00','LA','1112','20:15','20:45','BBB','CCC','21:45'];
  const belowFlightDays = mod.parseAimsTokensIntoEventsV3(below, 30, 8, 2026, 'BSB').filter((d) => d.type === 'VOO');
  check('fim inferido sem debrief: 20:15 fica 11h45 após chegada+30 e permanece uma jornada', belowFlightDays.length === 1 && belowFlightDays[0]?.legs?.length === 2, JSON.stringify(belowFlightDays));

  const exact = ['LA','1111','06:00','06:45','AAA','BBB','08:00','LA','1112','20:30','21:00','BBB','CCC','22:00'];
  const exactFlightDays = mod.parseAimsTokensIntoEventsV3(exact, 30, 8, 2026, 'BSB').filter((d) => d.type === 'VOO');
  check('fim inferido sem debrief: 20:30 fica exatamente 12h após chegada+30 e abre nova jornada', exactFlightDays.length === 2, JSON.stringify(exactFlightDays));
}

// -----------------------------------------------------------------------
// Caso 7h3 — chegada + debrief explícitos continuam governando o limiar
// quando a próxima perna omite APZ. Um horário 11h45 antes do STD não é uma
// apresentação plausível (janela máxima de 3h), portanto é debrief.
// -----------------------------------------------------------------------
{
  const below = ['LA','1121','06:00','06:45','AAA','BBB','08:00','08:45','LA','1122','20:30','BBB','CCC','22:00'];
  const belowFlightDays = mod.parseAimsTokensIntoEventsV3(below, 30, 8, 2026, 'BSB').filter((d) => d.type === 'VOO');
  check('debrief explícito + próxima perna sem APZ: 11h45 permanece uma jornada', belowFlightDays.length === 1 && belowFlightDays[0]?.legs?.length === 2, JSON.stringify(belowFlightDays));

  const exact = ['LA','1121','06:00','06:45','AAA','BBB','08:00','08:45','LA','1122','20:45','BBB','CCC','22:15'];
  const exactFlightDays = mod.parseAimsTokensIntoEventsV3(exact, 30, 8, 2026, 'BSB').filter((d) => d.type === 'VOO');
  check('debrief explícito + próxima perna sem APZ: exatamente 12h abre nova jornada, preserva 08:45 e mantém dutyReport=null', exactFlightDays.length === 2 && exactFlightDays[0]?.dutyDebrief === '08:45' && exactFlightDays[1]?.dutyReport === null, JSON.stringify(exactFlightDays));
}

// -----------------------------------------------------------------------
// Caso 7i — marcadores de trabalho reconhecidos podem ficar entre a APZ e o
// token LA. A recuperação pré-LA atravessa somente esses marcadores, preserva
// APZ/debrief e ainda atribui PS à perna correta.
// -----------------------------------------------------------------------
{
  const firstTokens = ['09:25','EXTRA','LA','9010','10:15','AAA','BBB','11:15'];
  const firstFlightDays = mod.parseAimsTokensIntoEventsV3(firstTokens, 31, 8, 2026, 'BSB').filter((d) => d.type === 'VOO');
  check('APZ pré-LA com EXTRA na primeira jornada: dutyReport=09:25', firstFlightDays[0]?.dutyReport === '09:25', JSON.stringify(firstFlightDays));
  check('APZ pré-LA com EXTRA na primeira jornada: workType=PS', firstFlightDays[0]?.legs?.[0]?.workType === 'PS', JSON.stringify(firstFlightDays));

  const laterTokens = ['LA','9005','07:00','07:30','AAA','BBB','08:20','08:50','23:03','EXTRA','LA','9006','23:50','BBB','CCC','01:15'];
  const laterFlightDays = mod.parseAimsTokensIntoEventsV3(laterTokens, 31, 8, 2026, 'BSB').filter((d) => d.type === 'VOO');
  const first = laterFlightDays.find((d) => d.pairingCode === 'LA9005');
  const second = laterFlightDays.find((d) => d.pairingCode === 'LA9006');
  check('APZ pré-LA com EXTRA em jornada posterior: debrief anterior=08:50', first?.dutyDebrief === '08:50', JSON.stringify(first));
  check('APZ pré-LA com EXTRA em jornada posterior: dutyReport=23:03 e workType=PS', second?.dutyReport === '23:03' && second?.legs?.[0]?.workType === 'PS', JSON.stringify(second));
}

// -----------------------------------------------------------------------
// Caso 7j — marcador antes da APZ pré-LA pertence somente à próxima perna.
// A ordem EXTRA 23:03 LA não pode contaminar a perna anterior.
// -----------------------------------------------------------------------
{
  const tokens = ['LA','1131','06:00','06:45','AAA','BBB','08:20','08:50','EXTRA','23:03','LA','1132','23:50','BBB','CCC','01:15'];
  const flightDays = mod.parseAimsTokensIntoEventsV3(tokens, 31, 8, 2026, 'BSB').filter((d) => d.type === 'VOO');
  const first = flightDays.find((d) => d.pairingCode === 'LA1131');
  const second = flightDays.find((d) => d.pairingCode === 'LA1132');
  check('EXTRA antes da APZ pré-LA: perna anterior permanece OP e preserva debrief 08:50', first?.legs?.[0]?.workType === 'OP' && first?.dutyDebrief === '08:50', JSON.stringify(first));
  check('EXTRA antes da APZ pré-LA: próxima perna recebe PS e APZ 23:03', second?.legs?.[0]?.workType === 'PS' && second?.dutyReport === '23:03', JSON.stringify(second));
}

// -----------------------------------------------------------------------
// Caso 7k — APZ -> marcador(es) -> LA. Ordem espelhada do 7j: aqui o marcador
// fica ENTRE a apresentação e o "LA". O horário seguido de marcador não pode ser
// debrief da perna anterior — o marcador qualifica a perna que começa, então o
// horário pertence à apresentação dela. Vale para os cinco marcadores.
// -----------------------------------------------------------------------
for (const marker of ['EXTRA', '[EXTRA]', 'PS', 'PAX', 'PASSAGEIRO']) {
  const tokens = ['LA','4712','06:00','06:45','AAA','BBB','08:20','23:03',marker,'LA','3246','23:50','BBB','CCC','01:15'];
  const flightDays = mod.parseAimsTokensIntoEventsV3(tokens, 31, 8, 2026, 'BSB').filter((d) => d.type === 'VOO');
  const first = flightDays.find((d) => d.pairingCode === 'LA4712');
  const second = flightDays.find((d) => d.pairingCode === 'LA3246');
  check(`APZ antes de ${marker}: nova jornada recebe APZ 23:03, nunca a STD 23:50`,
    second?.dutyReport === '23:03' && second?.legs?.[0]?.departureTime === '23:50', JSON.stringify(second));
  check(`APZ antes de ${marker}: nova perna é PS e a jornada anterior fica intacta`,
    second?.legs?.[0]?.workType === 'PS' && first?.dutyReport === '06:00' && first?.dutyDebrief === '08:20',
    JSON.stringify({ first, second }));
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

// -----------------------------------------------------------------------
// Caso 7m — DISCRIMINADOR do primeiro "LA" depois de um boundary "(...)".
//
// Duas leituras produzem EXATAMENTE o mesmo token stream:
//
//   chegada A + debrief D + marcador + continuação sem APZ própria
//   chegada A + APZ     P + marcador + jornada nova
//
// Nem o marcador nem a contagem separam as duas. O marcador prova a que perna o
// segmento pertence (workType); a contagem prova o que não cabe no boundary,
// mas o boundary contribui chegada + debrief opcional, então DOIS horários
// ainda cabem inteiramente nele.
//
// O sinal que separa está na própria entrada, e é temporal: um debriefing segue
// a chegada em MINUTOS; uma apresentação de jornada nova fica muito além disso e
// imediatamente antes da própria STD. Quando as duas leituras continuam
// plausíveis, a entrada é genuinamente ambígua e o resultado seguro é REVIEW.
//
//   candidato dentro da janela de debriefing  -> REVIEW (nunca inventar APZ)
//   candidato fora dela E com lead plausível  -> APZ comprovada
// -----------------------------------------------------------------------
for (const marker of ['EXTRA', '[EXTRA]', 'PS', 'PAX', 'PASSAGEIRO']) {
  // --- 1 horário: o único horário depois do "(...)" é resíduo herdado.
  for (const [ordem, tokens] of [
    ['APZ -> marcador', ['(...)', 'BSB', '08:29', marker, 'LA', '3730', '10:15', 'BSB', 'FOR', '12:55']],
    ['marcador -> APZ', ['(...)', 'BSB', marker, '08:29', 'LA', '3730', '10:15', 'BSB', 'FOR', '12:55']],
  ]) {
    const day = mod.parseAimsTokensIntoEventsV3(tokens, 17, 8, 2026, 'BSB').find((d) => d.type === 'VOO');
    check(`boundary + 1 horário + ${marker} (${ordem}): resíduo 08:29 NÃO é promovido, dutyReport=null`,
      day?.dutyReport === null, JSON.stringify(day));
    check(`boundary + 1 horário + ${marker} (${ordem}): perna preservada, STD 10:15 nunca vira APZ`,
      day?.legs?.length === 1 && day?.legs?.[0]?.departureTime === '10:15'
      && day?.legs?.[0]?.workType === 'PS', JSON.stringify(day));
  }

  // --- 2 horários, candidato DENTRO da janela de debriefing (21 min após a
  //     chegada): leitura "chegada + debrief" continua válida. REVIEW.
  for (const [ordem, tokens] of [
    ['APZ -> marcador', ['(...)', 'BSB', '08:29', '08:50', marker, 'LA', '9001', '10:15', 'BSB', 'FOR', '12:55']],
    ['marcador -> APZ', ['(...)', 'BSB', '08:29', marker, '08:50', 'LA', '9001', '10:15', 'BSB', 'FOR', '12:55']],
  ]) {
    const day = mod.parseAimsTokensIntoEventsV3(tokens, 17, 8, 2026, 'BSB').find((d) => d.type === 'VOO');
    check(`boundary + 2 horários + ${marker} (${ordem}): debrief possível NÃO vira APZ, dutyReport=null`,
      day?.dutyReport === null, JSON.stringify(day));
    check(`boundary + 2 horários + ${marker} (${ordem}): perna e workType preservados mesmo em REVIEW`,
      day?.legs?.length === 1 && day?.legs?.[0]?.departureTime === '10:15'
      && day?.legs?.[0]?.workType === 'PS', JSON.stringify(day));
  }

  // --- 2 horários, candidato FORA da janela de debriefing (14h43 após a
  //     chegada) e a 47 min da própria STD: a leitura "debrief" é
  //     fisicamente insustentável. Aqui a APZ está comprovada pela entrada.
  for (const [ordem, tokens] of [
    ['APZ -> marcador', ['(...)', 'BSB', '08:20', '23:03', marker, 'LA', '3246', '23:50', 'BBB', 'CCC', '01:15']],
    ['marcador -> APZ', ['(...)', 'BSB', '08:20', marker, '23:03', 'LA', '3246', '23:50', 'BBB', 'CCC', '01:15']],
  ]) {
    const day = mod.parseAimsTokensIntoEventsV3(tokens, 17, 8, 2026, 'BSB').find((d) => d.type === 'VOO');
    check(`boundary + candidato fora da janela de debriefing + ${marker} (${ordem}): APZ 23:03`,
      day?.dutyReport === '23:03' && day?.legs?.[0]?.departureTime === '23:50', JSON.stringify(day));
    check(`boundary + candidato fora da janela + ${marker} (${ordem}): a chegada 08:20 nunca é promovida`,
      day?.dutyReport !== '08:20', JSON.stringify(day));
  }
}

// -----------------------------------------------------------------------
// Caso 7n — fronteiras do discriminador e contraprovas. A regra tem de ser
// uma linha nítida, não um efeito colateral.
// -----------------------------------------------------------------------
{
  // Exatamente na janela de debriefing (120 min): ainda pode ser debrief.
  const dentro = ['(...)', 'BSB', '08:00', '10:00', 'EXTRA', 'LA', '9001', '12:00', 'BSB', 'FOR', '14:00'];
  const d1 = mod.parseAimsTokensIntoEventsV3(dentro, 17, 8, 2026, 'BSB').find((d) => d.type === 'VOO');
  check('fronteira: candidato exatamente na janela de debriefing segue REVIEW',
    d1?.dutyReport === null, JSON.stringify(d1));

  // Um minuto além: deixa de caber como debriefing e a APZ é comprovada.
  const fora = ['(...)', 'BSB', '08:00', '10:01', 'EXTRA', 'LA', '9001', '12:00', 'BSB', 'FOR', '14:00'];
  const d2 = mod.parseAimsTokensIntoEventsV3(fora, 17, 8, 2026, 'BSB').find((d) => d.type === 'VOO');
  check('fronteira: um minuto além da janela de debriefing, a APZ é comprovada',
    d2?.dutyReport === '10:01', JSON.stringify(d2));
}
{
  // Fora da janela de debriefing MAS longe demais da STD: não é debrief nem
  // apresentação plausível. Os dois lados precisam fechar.
  const tokens = ['(...)', 'BSB', '08:20', '14:00', 'EXTRA', 'LA', '9001', '20:00', 'BSB', 'FOR', '22:00'];
  const day = mod.parseAimsTokensIntoEventsV3(tokens, 17, 8, 2026, 'BSB').find((d) => d.type === 'VOO');
  check('candidato fora da janela de debriefing mas sem lead plausível: segue REVIEW',
    day?.dutyReport === null, JSON.stringify(day));
}
{
  const tokens = ['(...)', 'BSB', '08:29', '09:25', 'LA', '3730', '10:15', 'BSB', 'FOR', '12:55'];
  const day = mod.parseAimsTokensIntoEventsV3(tokens, 17, 8, 2026, 'BSB').find((d) => d.type === 'VOO');
  check('sem marcador, boundary + 2 horários: segue REVIEW',
    day?.dutyReport === null && day?.legs?.[0]?.departureTime === '10:15', JSON.stringify(day));
}
{
  const tokens = ['(...)', 'BSB', '08:29', '08:45', '09:25', 'LA', '3730', '10:15', 'BSB', 'FOR', '12:55'];
  const day = mod.parseAimsTokensIntoEventsV3(tokens, 17, 8, 2026, 'BSB').find((d) => d.type === 'VOO');
  check('sem marcador, boundary + 3 horários: o 3º é excedente estrutural, APZ 09:25',
    day?.dutyReport === '09:25', JSON.stringify(day));
}
{
  const tokens = ['(...)', 'BSB', '08:29', '09:25', '(320)', 'LA', '3730', '10:15', 'BSB', 'FOR', '12:55'];
  const day = mod.parseAimsTokensIntoEventsV3(tokens, 17, 8, 2026, 'BSB').find((d) => d.type === 'VOO');
  check('token fora do allowlist entre candidato e LA não prova apresentação: REVIEW',
    day?.dutyReport === null, JSON.stringify(day));
}
{
  const tokens = ['(...)', 'BSB', '08:29', 'LA', '3730', '10:15', 'BSB', 'FOR', '12:55'];
  const day = mod.parseAimsTokensIntoEventsV3(tokens, 17, 8, 2026, 'BSB').find((d) => d.type === 'VOO');
  check('continuação sem APZ após boundary: dutyReport=null, jamais a STD 10:15',
    day?.dutyReport === null && day?.legs?.[0]?.departureTime === '10:15', JSON.stringify(day));
}
{
  const tokens = ['BSB', '09:25', 'LA', '3730', '10:15', 'BSB', 'FOR', '12:55'];
  const day = mod.parseAimsTokensIntoEventsV3(tokens, 17, 8, 2026, 'BSB').find((d) => d.type === 'VOO');
  check('sem boundary: a APZ pré-LA de coluna limpa continua sendo lida (09:25)',
    day?.dutyReport === '09:25', JSON.stringify(day));
}

console.log(`\n---> ${passed} passed, ${failed} failed`);
fs.rmSync(tempDir, { recursive: true, force: true });
process.exit(failed > 0 ? 1 : 0);
