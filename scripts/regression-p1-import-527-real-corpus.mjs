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
  return (day?.legs || []).map((leg) => `${leg.flightNumber} ${leg.origin}${leg.departureTime}->${leg.destination}${leg.arrivalTime}${leg.isNextDay ? '(+1)' : ''}`);
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
    assert.deepEqual(legsOf(la3246), ['LA3246 GRU23:50->BPS01:40(+1)(+1)', 'LA3347 BPS03:35(+1)->GRU05:40(+1)'], 'Revisão A nativo: pernas do LA3246/LA3347 devem permanecer no dia do LA3246, sem se misturar com o LA4712');

    // LA4712 (18/08, apresentação 06:40) deve continuar como jornada própria, não fundida com o LA3246.
    const la4712 = dayOn(roster, '18/08/2026', 'LA4712');
    assert.ok(la4712, 'Revisão A nativo: dia do LA4712 (18/08) não encontrado');
    assert.equal(la4712.dutyReport, '06:40', 'Revisão A nativo: apresentação do LA4712 deve ser 06:40, sem herdar/contaminar o LA3246');
  }

  // --- Revisão A: Escala AIMS/Crewtopia -> FAIL, comportamento real e atual do bug (#510) ---
  // ATENÇÃO: estas asserções documentam o BUG ATUAL, não o comportamento correto.
  // Quando o #510 corrigir a extração de apresentação deste formato, os valores
  // abaixo devem mudar para bater com o oracle (09:25 / 23:03, sem fusão de dia)
  // — é esperado que este bloco precise ser reescrito nesse momento.
  {
    const roster = parseFixture(mod, loadFixture('official-roster-2026-08-revA-escala-anonymized.json'));

    const la3730 = dayOn(roster, '17/08/2026', 'LA3730');
    assert.ok(la3730, 'Revisão A escala: dia do LA3730 (17/08) não encontrado');
    assert.equal(la3730.dutyReport, '08:29', 'BUG ATUAL (#510): apresentação do LA3730 no formato Escala está contaminada pelo debrief da DR anterior (08:29) em vez de 09:25');

    // LA4712 e LA3246 (18/08) aparecem FUNDIDOS num único dia/pairing no formato Escala.
    const merged = dayOn(roster, '18/08/2026', 'LA4712');
    assert.ok(merged, 'Revisão A escala: dia fundido de 18/08 não encontrado');
    assert.equal(merged.dutyReport, '06:40', 'BUG ATUAL (#510): dia fundido herda a apresentação do LA4712 (06:40)');
    assert.equal(merged.dutyDebrief, '01:40', 'BUG ATUAL (#510): dia fundido termina no debrief do LA3246 (01:40+1) — apresentação real do LA3246 (23:03) desaparece');
    assert.deepEqual(legsOf(merged), ['LA4712 CNF07:10->GRU08:35', 'LA3246 GRU23:50->BPS01:40(+1)'], 'BUG ATUAL (#510): pernas do LA4712 e do LA3246 aparecem no mesmo dia/pairing');
    assert.equal(dayOn(roster, '18/08/2026', 'LA3246'), undefined, 'BUG ATUAL (#510): o LA3246 não existe mais como jornada própria — foi engolido pelo dia fundido');
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

  // --- Revisão B: Escala AIMS/Crewtopia -> FAIL, segunda forma do mesmo bug (#510) ---
  // ATENÇÃO: mesma ressalva do bloco da Revisão A — documenta o bug atual.
  // Aqui não há fusão de dia, mas o valor de dutyReport está errado do mesmo jeito:
  // o parser pega um horário de chegada em vez da apresentação real.
  {
    const roster = parseFixture(mod, loadFixture('official-roster-2026-08-revB-escala-anonymized.json'));

    const la3463 = dayOn(roster, '20/08/2026', 'LA3463');
    assert.ok(la3463, 'Revisão B escala: dia do LA3463 (20/08) não encontrado');
    assert.equal(la3463.dutyReport, '00:15', 'BUG ATUAL (#510): apresentação mostrada é 00:15 (chegada em LDB da perna anterior), não a apresentação real 18:50');

    const la3171 = dayOn(roster, '21/08/2026', 'LA3171');
    assert.ok(la3171, 'Revisão B escala: dia do LA3171 (21/08) não encontrado');
    assert.equal(la3171.dutyReport, '02:30', 'BUG ATUAL (#510): apresentação mostrada é 02:30 (chegada em REC da perna anterior), não a apresentação real 15:40');
  }

  console.log('#527 corpus real (Revisões A/B, nativo x Escala): OK — PASS do nativo e FAIL atual da Escala reproduzidos e documentados como regressão para o #510.');
} finally {
  fs.unlinkSync(tmpPath);
}
