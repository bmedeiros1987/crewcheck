import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const orientationPath = path.join(root, 'scripts/v14345/orientation-hotfix.mjs');
const applyPath = fs.existsSync(orientationPath) ? orientationPath : path.join(root, 'scripts/v14345/apply.mjs');
const chainPath = path.join(root, 'scripts/v139/apply.mjs');
const clientPath = path.join(root, 'client/src/lib/pdfParser.ts');
const serverPath = path.join(root, 'server/rosterParser.mjs');

const applySource = fs.readFileSync(applyPath, 'utf8');
const chainSource = fs.readFileSync(chainPath, 'utf8');
const clientBefore = fs.readFileSync(clientPath, 'utf8');
const serverBefore = fs.readFileSync(serverPath, 'utf8');

assert.ok(chainSource.includes("await import('../v14345/apply.mjs');"), 'v14.3.45 deve integrar a preparação canônica');
assert.ok(applySource.includes("const VERSION = '14.3.45';"), 'release web deve avançar para 14.3.45');
assert.ok(applySource.includes("next.replace(anchor, () =>"), 'inserção não pode interpretar $& do escape de RegExp');

for (const [source, marker, label] of [
  [clientBefore, 'function preferredRotatedTextDirection(', 'orientação adaptativa no cliente'],
  [clientBefore, "const tolerance = axis === 'x' ? 7 : 4;", 'baseline tolerante no cliente'],
  [clientBefore, 'function findColumnarDebriefForLastLeg(', 'debrief oficial no cliente'],
  [serverBefore, 'function preferredServerRotatedDirection(', 'orientação adaptativa no servidor'],
  [serverBefore, "const tolerance = axis === 'x' ? 7 : 4;", 'baseline tolerante no servidor'],
  [serverBefore, 'const reportGap = timing.departureAbsolute - reportAbsolute;', 'apresentação plausível no servidor'],
]) {
  assert.ok(source.includes(marker), `v14.3.45: ausente ${label}`);
}
assert.ok(
  serverBefore.includes('function rebuildServerCrewRosterOffsetDays(')
    || serverBefore.includes('function normalizeServerCrewRosterContinuationDays('),
  'v14.3.45: ausente continuidade multijornada no servidor',
);
assert.ok(
  serverBefore.includes('function serverCrewRosterMckDays(')
    || serverBefore.includes('function rescueServerOffsetGroundActivities('),
  'v14.3.45: ausente MCK por data civil no servidor',
);
assert.ok(!serverBefore.includes("function scoreServerRosterDays(');"), 'escape de RegExp do servidor não pode corromper a função seguinte');

const applied = spawnSync(process.execPath, [applyPath], { cwd: root, encoding: 'utf8' });
assert.equal(applied.status, 0, applied.stderr || applied.stdout || 'reaplicação v14.3.45 falhou');
assert.equal(fs.readFileSync(clientPath, 'utf8'), clientBefore, 'patch do cliente deve ser idempotente');
assert.equal(fs.readFileSync(serverPath, 'utf8'), serverBefore, 'patch do servidor deve ser idempotente');

function rotatedRow(x, tokens, direction, page = 1, jitterIndex = -1) {
  return tokens.map((str, index) => ({
    str,
    x: x + (index === jitterIndex ? 6 : 0),
    y: direction === 'ascending' ? 20 + index * 13 : 320 - index * 13,
    width: String(str).length * 5,
    page,
  }));
}

const ascendingItems = [
  ...rotatedRow(20, ['Roster', 'Report', '01-Aug-2026', 'to', '01-Sep-2026'], 'ascending'),
  ...rotatedRow(50, ['TRIPULANTE', 'TESTE', '|', '12345678', '|', 'JJCC320', 'BSB', 'CCM'], 'ascending'),
  ...rotatedRow(100, ['01-Aug-2026', 'Sat', 'LA3286', 'OP', 'GRU', '15:35', 'CWB', '16:35'], 'ascending', 1, 6),
];
const descendingItems = [
  ...rotatedRow(20, ['Roster', 'Report', '01-Aug-2026', 'to', '01-Sep-2026'], 'descending', 2),
  ...rotatedRow(50, ['TRIPULANTE', 'TESTE', '|', '12345678', '|', 'JJCC320', 'BSB', 'CCM'], 'descending', 2),
  ...rotatedRow(100, ['31-Aug-2026', 'Mon', 'LA3543', 'OP', 'GYN', '14:55', 'GRU', '16:35'], 'descending', 2, 5),
];

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-v14345-'));
try {
  const serverTestPath = path.join(tempDir, 'rosterParser-test.mjs');
  const expandedServer = serverBefore.replace(
    'export { parsePdfOnServer };',
    'export { parsePdfOnServer, buildServerVisualRows, parseServerHeader, parseServerRosterReport };',
  );
  assert.notEqual(expandedServer, serverBefore, 'não foi possível habilitar hooks internos do servidor');
  fs.writeFileSync(serverTestPath, expandedServer, 'utf8');
  const server = await import(`${pathToFileURL(serverTestPath).href}?v=${Date.now()}`);

  const ascendingServerRows = server.buildServerVisualRows([{ pageNo: 1, items: ascendingItems }]);
  assert.ok(
    ascendingServerRows.some((row) => row.text === '01-Aug-2026 Sat LA3286 OP GRU 15:35 CWB 16:35'),
    'servidor deve reconstruir página JasperReports com eixo Y ascendente e variação de 6 pontos',
  );
  const descendingServerRows = server.buildServerVisualRows([{ pageNo: 2, items: descendingItems }]);
  assert.ok(
    descendingServerRows.some((row) => row.text === '31-Aug-2026 Mon LA3543 OP GYN 14:55 GRU 16:35'),
    'servidor deve preservar PDFs anteriores com eixo Y descendente',
  );

  const headerText = 'Roster Report 01-Aug-2026 to 01-Sep-2026 TRIPULANTE TESTE | 12345678 | JJCC320 BSB CCM DH : 142:35 | FH : 67:40';
  const header = server.parseServerHeader(headerText, 'CrewRosterReport.pdf');
  assert.deepEqual(
    { crewName: header.crewName, crewId: header.crewId, base: header.base, rank: header.rank, month: header.month, year: header.year },
    { crewName: 'TRIPULANTE TESTE', crewId: '12345678', base: 'BSB', rank: 'CCM', month: 8, year: 2026 },
    'cabeçalho sem pipes entre equipamento, base e função deve ser lido',
  );

  const legendRoster = server.parseServerRosterReport(
    `${headerText}\n01-Aug-2026 Sat DO BSB\nLEGEND\nHSB Home Stand by\nDO Day off\nDR Requested day off`,
    [],
    'CrewRosterReport.pdf',
  );
  assert.ok(
    !legendRoster.days.some((day) => /Home Stand by|Day off|Requested day off/i.test(day.rawText || '')),
    'legenda não pode criar atividades operacionais',
  );

  let clientSource = clientBefore.replace(/^import .*;\s*$/gm, '');
  clientSource = [
    "const isAimsFormat = () => false;",
    "const parseAimsRoster = () => { throw new Error('not used'); };",
    'const getRosterCodeDefinition = () => null;',
    'const isKnownRosterCode = () => false;',
    "const pdfWorkerUrl = '';",
    'const normalizeRosterDays = roster => roster;',
    clientSource,
    'export { buildRows, bestRotatedRows, parseHeader };',
  ].join('\n');
  const compiledClient = ts.transpileModule(clientSource, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText;
  const clientTestPath = path.join(tempDir, 'pdfParser-test.mjs');
  fs.writeFileSync(clientTestPath, compiledClient, 'utf8');
  const client = await import(`${pathToFileURL(clientTestPath).href}?v=${Date.now()}`);

  assert.ok(
    client.bestRotatedRows(ascendingItems).some((row) => row.text === '01-Aug-2026 Sat LA3286 OP GRU 15:35 CWB 16:35'),
    'cliente deve reconstruir orientação ascendente',
  );
  assert.ok(
    client.bestRotatedRows(descendingItems).some((row) => row.text === '31-Aug-2026 Mon LA3543 OP GYN 14:55 GRU 16:35'),
    'cliente deve preservar orientação descendente',
  );
  const clientHeader = client.parseHeader(headerText);
  assert.deepEqual(
    { crewName: clientHeader.crewName, crewId: clientHeader.crewId, base: clientHeader.base, rank: clientHeader.rank, month: clientHeader.month, year: clientHeader.year },
    { crewName: 'TESTE', crewId: '12345678', base: 'BSB', rank: 'CCM', month: 8, year: 2026 },
  );
  assert.equal(clientHeader.totals.flightHours, 67 + 40 / 60);
  assert.equal(clientHeader.totals.dutyHours, 142 + 35 / 60);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('v14.3.45 orientação adaptativa, baseline, cabeçalho e debrief: OK');
