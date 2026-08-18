/**
 * Paridade cliente/APK <-> servidor para a identidade de jornada (#440, #512).
 *
 * O harness Node consegue exercitar `server/rosterParser.mjs` e os módulos de
 * derivação isoladamente, mas NÃO o caminho que roda no Web/PWA/APK: esse passa
 * pelo Vite, que é o único capaz de resolver
 * `pdfjs-dist/legacy/build/pdf.worker.min.mjs?url` em `pdfParser.ts`.
 *
 * Este teste constrói a entrada de paridade com o Vite real e executa a
 * derivação a partir do BUNDLE gerado, provando que a mesma escala produz a
 * mesma segmentação de jornada nos dois caminhos.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { loadClientModules, TYPE_ONLY_PDF_PARSER_STUB, readRepoFile, createChecker } from './lib/ts-module-harness.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const checker = createChecker('P-1 #440/#512 — paridade cliente(Vite)/servidor');
const { check } = checker;

// ---------------------------------------------------------------------------
// 1. Build real com Vite. Se `pdfParser.ts` ou a derivação quebrarem o bundle,
//    isto falha aqui — que é precisamente a lacuna que o harness Node deixava.
// ---------------------------------------------------------------------------
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-client-parity-'));
let bundleFile = '';
try {
  await build({
    root: ROOT,
    logLevel: 'error',
    resolve: { alias: { '@': path.resolve(ROOT, 'client', 'src'), '@shared': path.resolve(ROOT, 'shared') } },
    build: {
      outDir,
      emptyOutDir: true,
      minify: false,
      ssr: true,
      lib: {
        entry: path.resolve(ROOT, 'scripts/parity/client-journey-entry.ts'),
        formats: ['es'],
        fileName: 'client-journey-entry',
      },
      rollupOptions: { external: ['pdfjs-dist/legacy/build/pdf.mjs'] },
    },
  });
  bundleFile = path.join(outDir, 'client-journey-entry.js');
  check('build do bundle cliente (Vite) conclui com as mudanças de jornada', fs.existsSync(bundleFile));
} catch (error) {
  check('build do bundle cliente (Vite) conclui com as mudanças de jornada', false, String(error && error.message || error));
}

if (!bundleFile || !fs.existsSync(bundleFile)) {
  checker.report();
  process.exit(1);
}

const clientBundle = await import(pathToFileURL(bundleFile).href);

// ---------------------------------------------------------------------------
// 2. Mesma escala, dois caminhos. O roster vem do parser V3 do servidor sobre a
//    fixture real; a derivação roda no bundle do cliente e no módulo do servidor.
// ---------------------------------------------------------------------------
async function loadServerRosterParser() {
  const source = readRepoFile('server/rosterParser.mjs');
  const patched = source.replace(
    'export { parsePdfOnServer };',
    'export { parsePdfOnServer, parseServerRosterReport, finalizeServerDays };',
  );
  if (patched === source) throw new Error('não foi possível expor hooks internos do parser V3');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-v3-parity-'));
  const file = path.join(dir, 'rosterParser.mjs');
  fs.writeFileSync(file, patched);
  return import(pathToFileURL(file).href);
}

const serverParser = await loadServerRosterParser();
const fixture = readRepoFile('scripts/fixtures/crew-roster-august-2026.txt');
const days = serverParser.finalizeServerDays(
  serverParser.parseServerRosterReport(fixture, [], 'CrewRosterReport-August-2026.pdf').days,
  8, 2026, 'BSB',
);
const roster = {
  crewName: 'T', crewId: '1', base: 'BSB', rank: 'CCM', month: 8, year: 2026,
  rawText: fixture, days,
};

const nodeHarness = loadClientModules({
  prefix: 'crewcheck-parity-node-',
  stubs: TYPE_ONLY_PDF_PARSER_STUB,
  files: ['client/src/lib/rosterContinuity.ts', 'client/src/lib/canonicalRoster.ts'],
});
const nodeCanonical = nodeHarness.load('canonicalRoster');

const summarize = (events) => events
  .filter((event) => event.kind === 'flight')
  .map((event) => [event.date, event.flightNumber, event.journeyId, event.journeyBoundary, event.showPresentation, event.presentation, event.groundBeforeMinutes].join('~'));

const fromClientBundle = clientBundle.journeySummary(roster)
  .map((row) => [row.date, row.flightNumber, row.journeyId, row.journeyBoundary, row.showPresentation, row.presentation, row.groundBeforeMinutes].join('~'));
const fromNode = summarize(nodeCanonical.buildCanonicalRosterEvents(roster));

console.log(`\n[paridade] eventos no bundle cliente: ${fromClientBundle.length} · no módulo servidor: ${fromNode.length}`);
const mismatches = fromClientBundle.filter((row, index) => row !== fromNode[index]);
check(
  'bundle cliente e módulo servidor produzem a MESMA segmentação de jornada',
  fromClientBundle.length === fromNode.length && mismatches.length === 0,
  mismatches.slice(0, 5).join('\n      '),
);

// ---------------------------------------------------------------------------
// 3. Invariantes de jornada verificados a partir do bundle do cliente.
// ---------------------------------------------------------------------------
const clientRows = clientBundle.journeySummary(roster);
const byFlight = (flightNumber) => clientRows.find((row) => row.flightNumber === flightNumber);

// A contagem depende do estado do parser (o preparado lê a fixture inteira),
// então o invariante é "nada se perde", não um número mágico.
const parsedLegTotal = days.reduce((sum, day) => sum + (day.legs || []).length, 0);
check(
  'nenhuma perna publicada some entre parser e derivação no caminho do cliente',
  clientRows.length === parsedLegTotal,
  `parser=${parsedLegTotal} derivadas=${clientRows.length}`,
);
check(
  'LA3899/LA3861/LA3308 (evidência #440) sobrevivem no caminho do cliente',
  ['LA3899', 'LA3861', 'LA3308'].every((flightNumber) => Boolean(byFlight(flightNumber))),
);

// A fixture publica apresentação própria para LA3463 (18:50) e LA3899 (15:05):
// são jornadas novas dentro de um dia que já tinha jornada anterior.
for (const [flightNumber, presentation] of [['LA3463', '18:50'], ['LA3899', '15:05'], ['LA3197', '02:05'], ['LA3149', '12:45']]) {
  const row = byFlight(flightNumber);
  check(
    `${flightNumber} abre jornada com a apresentação publicada ${presentation}`,
    Boolean(row) && row.showPresentation === true && row.presentation === presentation
      && row.journeyBoundary === 'apresentacao-publicada-da-etapa',
    `showPresentation=${row && row.showPresentation} presentation=${row && row.presentation} boundary=${row && row.journeyBoundary}`,
  );
}

const bogusGround = clientRows.filter((row) => row.groundBeforeMinutes != null && row.groundBeforeMinutes >= 240);
check(
  'nenhum "Conexão/Solo" acima de 4h sobrevive (intervalo entre jornadas não é conexão)',
  bogusGround.length === 0,
  bogusGround.map((row) => `${row.flightNumber}=${row.groundBeforeMinutes}min`).join(', '),
);

// Continuação dentro da mesma jornada mantém o mesmo journeyId.
const la3861 = byFlight('LA3861');
const la3899 = byFlight('LA3899');
check(
  'LA3861 continua na jornada aberta por LA3899 (mesmo journeyId)',
  Boolean(la3899 && la3861) && la3899.journeyId === la3861.journeyId && la3861.showPresentation === false,
  `journeyId LA3899=${la3899 && la3899.journeyId} / LA3861=${la3861 && la3861.journeyId}`,
);

nodeHarness.cleanup();
fs.rmSync(outDir, { recursive: true, force: true });
process.exit(checker.report() > 0 ? 1 : 0);
