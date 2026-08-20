import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Fixtures gerados a partir de PDFs reais AIMS/CrewRoster (#527), anonimizados:
// nome/matrícula do tripulante substituídos por valores sintéticos, seção de
// tripulação (nomes de terceiros) removida. Estrutura preservada — cada item é
// {str, x, y, page} exatamente como pdfjs-dist extrai da fonte primária, então
// o parser real roda sem nenhuma adaptação. Ver docs/atlas/QA_ORACLES.md e
// docs/atlas/CORPUS.md para a proveniência completa e a matriz PASS/FAIL/REVIEW.
//
// Revisão A e B são duas revisões distintas do mesmo mês (agosto/2026) da
// mesma escala real, cada uma em dois formatos: CrewRosterReport (nativo,
// exportado diretamente do AIMS) e Escala (convertida para o padrão
// AIMS/Crewtopia — o formato que o usuário normalmente recebe).

const root = process.cwd();
const serverSource = fs.readFileSync(path.join(root, 'server/rosterParser.mjs'), 'utf8');
const exposed = serverSource.replace(
  'export { parsePdfOnServer };',
  'export { parsePdfOnServer, parseServerRosterReport, parseServerAims, finalizeServerDays, buildServerFullText };',
);
assert.notEqual(exposed, serverSource, '#527: não foi possível expor as funções internas de server/rosterParser.mjs para o teste');

const tmpPath = path.join(os.tmpdir(), `crewcheck-527-rosterparser-${Date.now()}.mjs`);
fs.writeFileSync(tmpPath, exposed, 'utf8');

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(root, 'scripts/fixtures', name), 'utf8'));
}

function parseFixture(mod, fixture) {
  const fullText = mod.buildServerFullText(fixture.pages);
  const roster = fixture.format === 'AIMS'
    ? mod.parseServerAims(fullText, fixture.pages)
    : mod.parseServerRosterReport(fullText, fixture.pages, 'fixture.pdf');
  roster.days = mod.finalizeServerDays(roster.days, roster.month, roster.year, roster.base);
  return roster;
}

function dayOn(roster, date, pairingCode) {
  return roster.days.find((day) => day.date === date && (!pairingCode || day.pairingCode === pairingCode));
}

function legsOf(day) {
  // O estado preparado (scripts/v139/apply.mjs) normaliza arrivalTime/departureTime
  // removendo o sufixo "(+1)" e deixando isNextDay como única fonte da virada de
  // dia; o estado base ainda carrega o sufixo dentro da própria string. Ambos os
  // estados concordam em isNextDay e nos horários em si — só a representação
  // textual difere, então normalizamos aqui para a comparação ser estável nos
  // dois estados.
  const stripSuffix = (value) => String(value || '').replace(/\(\+\d+\)$/, '');
  return (day?.legs || []).map((leg) => `${leg.flightNumber} ${leg.origin}${stripSuffix(leg.departureTime)}->${leg.destination}${stripSuffix(leg.arrivalTime)}${leg.isNextDay ? '(+1)' : ''}`);
}

try {
  const mod = await import(`file://${tmpPath}`);

  // --- Revisão A: CrewRosterReport nativo -> PASS, bate com o oracle confirmado ---
  {
    const roster = parseFixture(mod, loadFixture('official-roster-2026-08-revA-native-anonymized.json'));
    assert.equal(roster.base, 'BSB');
    assert.equal(roster.month, 8);
    assert.equal(roster.year, 2026);

    const la3730 = dayOn(roster, '17/08/2026', 'LA3730');
    assert.ok(la3730, 'Revisão A nativo: dia do LA3730 (17/08) não encontrado');
    assert.equal(la3730.dutyReport, '09:25', 'Revisão A nativo: apresentação do LA3730 deve ser 09:25 (oracle confirmado)');

    const la3246 = dayOn(roster, '18/08/2026', 'LA3246');
    assert.ok(la3246, 'Revisão A nativo: dia do LA3246 (18/08) não encontrado');
    assert.equal(la3246.dutyReport, '23:03', 'Revisão A nativo: apresentação do LA3246 deve ser 23:03 (oracle confirmado)');
    assert.deepEqual(legsOf(la3246), ['LA3246 GRU23:50->BPS01:40(+1)', 'LA3347 BPS03:35->GRU05:40'], 'Revisão A nativo: pernas do LA3246/LA3347 devem permanecer no dia do LA3246, sem se misturar com o LA4712');

    // LA4712 (18/08, apresentação 06:40) deve continuar como jornada própria, não fundida com o LA3246.
    const la4712 = dayOn(roster, '18/08/2026', 'LA4712');
    assert.ok(la4712, 'Revisão A nativo: dia do LA4712 (18/08) não encontrado');
    assert.equal(la4712.dutyReport, '06:40', 'Revisão A nativo: apresentação do LA4712 deve ser 06:40, sem herdar/contaminar o LA3246');
  }

  // --- Revisão A: Escala AIMS/Crewtopia -> PASS, corrigido pelo #510 ---
  // Antes do #510 estas asserções falhavam (LA3730 herdava 08:29 da DR
  // anterior; LA4712+LA3246 apareciam fundidos num único dia). A causa raiz
  // era a ausência de segmentação por nova apresentação dentro da coluna de
  // um dia civil — corrigido em parseAimsTokensIntoEventsV3.
  {
    const roster = parseFixture(mod, loadFixture('official-roster-2026-08-revA-escala-anonymized.json'));

    const la3730 = dayOn(roster, '17/08/2026', 'LA3730');
    assert.ok(la3730, 'Revisão A escala: dia do LA3730 (17/08) não encontrado');
    assert.equal(la3730.dutyReport, '09:25', 'Revisão A escala (pós-#510): apresentação do LA3730 deve convergir com o oracle (09:25), sem contaminação da DR anterior (08:29)');

    // LA4712 e LA3246 (18/08) devem existir como jornadas próprias, não fundidas.
    const la4712 = dayOn(roster, '18/08/2026', 'LA4712');
    assert.ok(la4712, 'Revisão A escala: dia do LA4712 (18/08) não encontrado');
    assert.equal(la4712.dutyReport, '06:40', 'Revisão A escala (pós-#510): apresentação do LA4712 deve ser 06:40');
    assert.equal(la4712.dutyDebrief, '09:05', 'Revisão A escala (pós-#510): debrief do LA4712 deve ser o seu próprio (09:05), não herdar o do LA3246');
    assert.deepEqual(legsOf(la4712), ['LA4712 CNF07:10->GRU08:35'], 'Revisão A escala (pós-#510): LA4712 não pode carregar a perna do LA3246');

    const la3246 = dayOn(roster, '18/08/2026', 'LA3246');
    assert.ok(la3246, 'Revisão A escala (pós-#510): LA3246 deve existir como jornada própria, não fundida com o LA4712');
    assert.equal(la3246.dutyReport, '23:03', 'Revisão A escala (pós-#510): apresentação do LA3246 deve convergir com o oracle (23:03)');
    assert.deepEqual(legsOf(la3246), ['LA3246 GRU23:50->BPS01:40(+1)'], 'Revisão A escala (pós-#510): LA3246 deve manter sua própria perna');
  }

  // --- Revisão B: CrewRosterReport nativo -> PASS, bate com a leitura direta da fonte primária ---
  {
    const roster = parseFixture(mod, loadFixture('official-roster-2026-08-revB-native-anonymized.json'));

    const la3463 = dayOn(roster, '20/08/2026', 'LA3463');
    assert.ok(la3463, 'Revisão B nativo: dia do LA3463 (20/08) não encontrado');
    assert.equal(la3463.dutyReport, '18:50', 'Revisão B nativo: apresentação do LA3463 deve ser 18:50');

    const la3171 = dayOn(roster, '21/08/2026', 'LA3171');
    assert.ok(la3171, 'Revisão B nativo: dia do LA3171 (21/08) não encontrado');
    assert.equal(la3171.dutyReport, '15:40', 'Revisão B nativo: apresentação do LA3171 deve ser 15:40');
  }

  // --- Revisão B: Escala AIMS/Crewtopia -> PASS, corrigido pelo #510 ---
  // Antes do #510, dutyReport pegava o horário de chegada da perna anterior
  // (resíduo "(...)" do dia civil anterior) em vez da apresentação real.
  {
    const roster = parseFixture(mod, loadFixture('official-roster-2026-08-revB-escala-anonymized.json'));

    const la3463 = dayOn(roster, '20/08/2026', 'LA3463');
    assert.ok(la3463, 'Revisão B escala: dia do LA3463 (20/08) não encontrado');
    assert.equal(la3463.dutyReport, '18:50', 'Revisão B escala (pós-#510): apresentação do LA3463 deve convergir com o oracle (18:50), não a chegada em LDB (00:15)');

    const la3171 = dayOn(roster, '21/08/2026', 'LA3171');
    assert.ok(la3171, 'Revisão B escala: dia do LA3171 (21/08) não encontrado');
    assert.equal(la3171.dutyReport, '15:40', 'Revisão B escala (pós-#510): apresentação do LA3171 deve convergir com o oracle (15:40), não a chegada em REC (02:30)');

    // LA3382 (perna de continuação, sem apresentação própria) deve permanecer
    // junto do LA3463 — a segmentação não pode fragmentar uma jornada real.
    assert.deepEqual(legsOf(la3463), ['LA3463 LDB19:20->GRU20:35', 'LA3382 GRU23:30->REC02:30(+1)'], 'Revisão B escala (pós-#510): LA3382 deve continuar como perna do LA3463, não virar jornada própria');
  }

  console.log('#527/#510 corpus real (Revisões A/B, nativo x Escala): OK — nativo e Escala convergem com o oracle, sem fusão de jornada nem contaminação de apresentação.');
} finally {
  fs.unlinkSync(tmpPath);
}
