/**
 * #510 (lado cliente) — desambiguação aeroporto x código de escala no AIMS/Escala.
 *
 * `REC` é simultaneamente o código IATA do Recife e o código de escala LATAM para
 * treino recorrente em simulador ("Re standard", categoria SIMULATOR). Duas funções
 * em aimsParser.ts tratavam qualquer `isKnownRosterCode(token)` como fronteira de
 * bloco sem checar primeiro se o token também é estação de uma perna em aberto:
 *   - findAimsVisualFlightBlockEnd (fim de bloco de voo dentro de uma coluna)
 *   - findAimsContinuationPrefixEnd (prefixo de continuidade ao costurar virada de
 *     coluna civil, usado pelo stitching de pernoite)
 *
 * Isso derrubava por completo o LA3382 (GRU->REC atravessando meia-noite: a
 * costura nunca capturava REC/horário de chegada) e criava dias fantasmas
 * "OTHER/REC" com pernas vizinhas cortadas ao meio (ex.: LA3402 BSB->REC virava
 * um dia incompleto BSB-only mais um "REC 17:40 (328)" órfão).
 *
 * Este teste roda o parser real (não uma cópia) contra um PDF real do corpus
 * sanitizado (nome/matrícula substituídos, página de Tripulações removida) e
 * contra dois casos sintéticos no nível de token para provar que a regra é
 * contextual, não um hardcode de Recife:
 *   1. corpus real: LA3382 presente e correto, nenhum "OTHER/REC" fantasma;
 *   2. sintético: REC como estação dentro de uma perna em aberto vence sobre o
 *      código de escala;
 *   3. sintético: REC como atividade legítima (sem perna de voo adjacente em
 *      aberto) continua sendo reconhecido como atividade, não engolido por um
 *      voo vizinho.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createChecker } from './lib/ts-module-harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checker = createChecker('P-1 #510 (cliente) — REC aeroporto x código de escala');
const { check } = checker;

function loadAimsModuleWithInternals(exposeNames) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-aims-510-'));
  fs.writeFileSync(path.join(dir, 'pdfParser.js'), 'module.exports = {};');

  const rosterCodesSource = fs.readFileSync(path.join(ROOT, 'client/src/lib/rosterCodes.ts'), 'utf8');
  fs.writeFileSync(path.join(dir, 'rosterCodes.js'), ts.transpileModule(rosterCodesSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText);

  const aimsSource = fs.readFileSync(path.join(ROOT, 'client/src/lib/aimsParser.ts'), 'utf8');
  const patched = `${aimsSource}\nexport { ${exposeNames.join(', ')} };\n`;
  fs.writeFileSync(path.join(dir, 'aimsParser.js'), ts.transpileModule(patched, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText);

  const require = createRequire(import.meta.url);
  const aims = require(path.join(dir, 'aimsParser.js'));
  return { aims, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

// ---------------------------------------------------------------------------
// 1. Corpus real sanitizado — prova end-to-end via parseAimsRoster (API pública).
// ---------------------------------------------------------------------------
{
  const { aims, cleanup } = loadAimsModuleWithInternals(['parseAimsVisualColumnDays', 'findAimsVisualFlightBlockEnd', 'isAimsHumanAirport']);
  const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/fixtures/official-roster-2026-08-client510-escala-anonymized.json'), 'utf8'));
  const visualRows = [{ page: 1, key: 0, text: '', items: fixture.pages[0].items }];
  const roster = aims.parseAimsRoster(fixture.fullText, visualRows);

  const allLegs = roster.days.flatMap((day) => (day.legs || []).map((leg) => ({ ...leg, date: day.date })));
  const la3382 = allLegs.find((leg) => leg.flightNumber === 'LA3382');

  check('LA3382 (GRU->REC, atravessa meia-noite) está presente', Boolean(la3382), JSON.stringify(la3382));
  if (la3382) {
    check('LA3382 origem/destino corretos (GRU->REC)', la3382.origin === 'GRU' && la3382.destination === 'REC', JSON.stringify(la3382));
    check('LA3382 horários corretos (23:30 -> 02:30, isNextDay)', la3382.departureTime === '23:30' && la3382.arrivalTime === '02:30' && la3382.isNextDay === true, JSON.stringify(la3382));
    check('LA3382 não herda apresentação (um único horário antes da decolagem, #512)', la3382.presentationTime === undefined, JSON.stringify(la3382));
  }

  const otherRec = roster.days.filter((day) => day.type === 'OTHER' && day.pairingCode === 'REC');
  check('nenhum dia fantasma "OTHER/REC" (perna de voo cortada ao meio por REC)', otherRec.length === 0, JSON.stringify(otherRec.map((d) => ({ date: d.date, rawText: d.rawText }))));

  const otherActivityCounts = roster.days.reduce((acc, day) => {
    if (['ASB', 'HSB', 'HSBE', 'DO', 'DOF', 'DR', 'CRM'].includes(day.type)) acc[day.type] = (acc[day.type] || 0) + 1;
    return acc;
  }, {});
  check('demais atividades de solo (ASB/HSB/DO/DR/CRM) inalteradas: 1 ASB, 2 HSB, 7 DO, 4 DR, 2 CRM',
    otherActivityCounts.ASB === 1 && otherActivityCounts.HSB === 2 && otherActivityCounts.DO === 7 && otherActivityCounts.DR === 4 && otherActivityCounts.CRM === 2,
    JSON.stringify(otherActivityCounts));

  cleanup();
}

// ---------------------------------------------------------------------------
// 2. Sintético — REC como estação dentro de uma perna em aberto vence sobre o
//    código de escala (contextual, sem hardcode de Recife: qualquer aeroporto de
//    3 letras que colida com um código de escala deve se comportar assim).
// ---------------------------------------------------------------------------
{
  const { aims, cleanup } = loadAimsModuleWithInternals(['findAimsVisualFlightBlockEnd']);
  const tokens = ['LA', '9001', '10:00', 'GRU', 'REC', '12:30', '(320)'];
  const end = aims.findAimsVisualFlightBlockEnd(tokens, 0);
  check('REC dentro de uma perna em aberto (só 1 estação vista) não é tratado como fronteira', end === tokens.length, `end=${end} tokens=${JSON.stringify(tokens)}`);
}

// ---------------------------------------------------------------------------
// 3. Sintético — REC como atividade legítima (sem voo adjacente em aberto) segue
//    sendo reconhecido como atividade e não é engolido pelo voo anterior, que já
//    tem origem+destino completos antes de REC aparecer.
// ---------------------------------------------------------------------------
{
  const { aims, cleanup: cleanup2 } = loadAimsModuleWithInternals(['parseAimsVisualColumnDays']);
  const tokens = ['LA', '9002', '08:00', 'GRU', 'BSB', '09:30', '(320)', 'REC', '14:00', '18:00'];
  const context = { date: '15/08/2026', dayOfWeek: 'Sáb', dateObj: new Date(2026, 7, 15), base: 'BSB', rawBlock: tokens.join(' ') };
  const days = aims.parseAimsVisualColumnDays(tokens, context);

  const flightDay = days.find((day) => day.type === 'VOO');
  const recDay = days.find((day) => day.type === 'OTHER' && day.pairingCode === 'REC');

  check('voo anterior (GRU->BSB) permanece intacto, sem engolir o REC seguinte',
    Boolean(flightDay) && flightDay.legs?.length === 1 && flightDay.legs[0].destination === 'BSB',
    JSON.stringify(days));
  check('atividade REC legítima (sem voo adjacente em aberto) ainda é reconhecida separadamente',
    Boolean(recDay), JSON.stringify(days));

  cleanup2();
}

process.exit(checker.report());
