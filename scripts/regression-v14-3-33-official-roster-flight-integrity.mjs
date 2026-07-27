import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chain = fs.readFileSync(path.join(root, 'scripts/v139/apply.mjs'), 'utf8');
const clientSource = fs.readFileSync(path.join(root, 'client/src/lib/pdfParser.ts'), 'utf8');
const serverSource = fs.readFileSync(path.join(root, 'server/rosterParser.mjs'), 'utf8');

assert.ok(chain.includes("await import('../v14333/loader.mjs');"), 'baseline v14.3.33 deve permanecer na preparação canônica');
assert.ok(chain.includes("await import('../v14340/apply.mjs');"), 'correção permissiva v14.3.40 deve vir após a baseline');

for (const marker of [
  'function assertCrewRosterReportIntegrity(',
  'const sourceHasFlights = crewRosterSourceHasFlights(fullText);',
  '&& (!sourceHasFlights || transposedFlightCount > 0);',
  'const rescuedDays = rescueFlightsFromFullText(mergedDays, fullText, header.month, header.year, header.base);',
  'function rescueFlightsFromVisualRows(',
  "replace(/\\bLA\\s+(\\d{3,4})\\b/gi, 'LA$1')",
]) assert.ok(clientSource.includes(marker), `proteção/resgate ausente no cliente: ${marker}`);

for (const marker of [
  'function buildServerRosterRescueBlocks(',
  'function extractServerRosterFlightLegs(',
  'function rescueServerRosterFlightsFromText(',
  'function buildServerVisualRows(',
  'function rescueServerFlightsFromVisualPages(',
  'const selectedDays = columnDays.length >= 8',
]) assert.ok(serverSource.includes(marker), `proteção/resgate ausente no servidor: ${marker}`);

assert.ok(!clientSource.includes('A importação foi bloqueada para não salvar uma escala incompleta'), 'cliente não deve bloquear o PDF');
assert.ok(!serverSource.includes('importação parcial bloqueada'), 'servidor não deve bloquear o PDF');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-v14333-compat-'));
try {
  const testModulePath = path.join(tempDir, 'rosterParser-test.mjs');
  const exported = serverSource.replace(
    'export { parsePdfOnServer };',
    'export { parsePdfOnServer, buildServerRosterRescueBlocks, extractServerRosterFlightLegs, rescueServerRosterFlightsFromText };',
  );
  assert.notEqual(exported, serverSource, 'não foi possível habilitar hooks internos');
  fs.writeFileSync(testModulePath, exported, 'utf8');
  const parser = await import(`${pathToFileURL(testModulePath).href}?v=${Date.now()}`);

  const official = `Roster Report 01-Jul-2026 to 31-Jul-2026 BRUNO | 123456 | X | BSB | CCM
31-Jul-2026 Fri LA3264/310726/JJCC320-P 11:30 LA3264 OP BSB 12:25 GRU 14:10 01:45
LA3286 OP GRU 15:30 CWB 16:30 01:00
LA3111 OP CWB 17:35 BSB 19:30 01:55
LA3384 OP BSB 20:40 VCP 22:15 22:45 01:35`;
  const block = parser.buildServerRosterRescueBlocks(official, 2026).find((item) => item.marker.day === 31);
  assert.ok(block, 'bloco oficial não encontrado');
  const legs = parser.extractServerRosterFlightLegs(block.text);
  assert.deepEqual(legs.map((leg) => `${leg.flightNumber}:${leg.origin}-${leg.destination}`), [
    'LA3264:BSB-GRU', 'LA3286:GRU-CWB', 'LA3111:CWB-BSB', 'LA3384:BSB-VCP',
  ]);
  const rescued = parser.rescueServerRosterFlightsFromText([], official, 7, 2026, 'BSB');
  assert.equal(rescued.find((day) => day.date === '31/07/2026')?.legs?.length, 4);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('v14.3.33 baseline preservada com importação permissiva e resgate visual v14.3.40');
