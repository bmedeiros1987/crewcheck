import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chain = fs.readFileSync(path.join(root, 'scripts/v139/apply.mjs'), 'utf8');
assert.ok(chain.includes("await import('../v14333/apply.mjs');"), 'v14.3.33 deve estar no fim da preparação canônica');

const clientSource = fs.readFileSync(path.join(root, 'client/src/lib/pdfParser.ts'), 'utf8');
const serverSource = fs.readFileSync(path.join(root, 'server/rosterParser.mjs'), 'utf8');

for (const marker of [
  'function assertCrewRosterReportIntegrity(',
  'const sourceHasFlights = crewRosterSourceHasFlights(fullText);',
  '&& (!sourceHasFlights || transposedFlightCount > 0);',
  'const rescuedDays = rescueFlightsFromFullText(mergedDays, fullText, header.month, header.year, header.base);',
  "A escala oficial contém voos, mas nenhuma etapa foi reconhecida",
  "replace(/\\bLA\\s+(\\d{3,4})\\b/gi, 'LA$1')",
  'const timeFirst = /\\b(LA\\d{3,4})',
]) assert.ok(clientSource.includes(marker), `proteção obrigatória ausente no cliente: ${marker}`);

for (const marker of [
  'function buildServerRosterRescueBlocks(',
  'function extractServerRosterFlightLegs(',
  'function rescueServerRosterFlightsFromText(',
  'importação parcial bloqueada',
  'const selectedDays = columnDays.length >= 8',
]) assert.ok(serverSource.includes(marker), `proteção obrigatória ausente no servidor: ${marker}`);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-v14333-'));
const testModulePath = path.join(tempDir, 'rosterParser-test.mjs');
const exported = serverSource.replace(
  'export { parsePdfOnServer };',
  'export { parsePdfOnServer, buildServerRosterRescueBlocks, extractServerRosterFlightLegs, rescueServerRosterFlightsFromText };',
);
assert.notEqual(exported, serverSource, 'não foi possível habilitar os hooks internos do parser para regressão');
fs.writeFileSync(testModulePath, exported, 'utf8');

try {
  const parser = await import(`${pathToFileURL(testModulePath).href}?v=${Date.now()}`);

  const combinedOfficial = `Roster Report 01-Jul-2026 to 31-Jul-2026 BRUNO | 123456 | X | BSB | CCM
19-Jul-2026 HSB- 7/190726/JJCC320-P 03:00 HSB BSB 03:00 BSB 15:00 15:00 03:59
29-Jul-2026 ASB- 7/290726/JJCC320-P 06:30 ASB BSB 06:30 BSB 12:30 12:30 06:00
31-Jul-2026 Fri LA3264/310726/JJCC320-P 11:30 LA3264 OP BSB 12:25 GRU 14:10 01:45 11:15 31R
LA3286 OP GRU 15:30 CWB 16:30 01:00 328
LA3111 OP CWB 17:35 BSB 19:30 01:55 321
LA3384 OP BSB 20:40 VCP 22:15 22:45 01:35 328`;
  const combinedBlocks = parser.buildServerRosterRescueBlocks(combinedOfficial, 2026);
  const combinedBlock = combinedBlocks.find((block) => block.marker.day === 31);
  assert.ok(combinedBlock, 'bloco oficial de 31-Jul não encontrado');
  const combinedLegs = parser.extractServerRosterFlightLegs(combinedBlock.text);
  assert.deepEqual(combinedLegs.map((leg) => `${leg.flightNumber}:${leg.origin}-${leg.destination}`), [
    'LA3264:BSB-GRU',
    'LA3286:GRU-CWB',
    'LA3111:CWB-BSB',
    'LA3384:BSB-VCP',
  ], 'layout combinado oficial deve preservar as quatro pernas');

  const splitOfficial = `Roster Report 01-Jul-2026 to 31-Jul-2026 BRUNO | 123456 | X | BSB | CCM
19Jul Sun HSB BSB 03:00 BSB 15:00
29Jul Wed ASB BSB 06:30 BSB 12:30
31Jul Fri LA 3264 11:30 12:25 BSB GRU 14:10 (31R)
LA 3286 15:30 GRU CWB 16:30 (328)
LA 3111 17:35 CWB BSB 19:30 (321)
LA 3384 20:40 BSB VCP 22:15 22:45 (328)`;
  const splitBlocks = parser.buildServerRosterRescueBlocks(splitOfficial, 2026);
  const splitBlock = splitBlocks.find((block) => block.marker.day === 31);
  assert.ok(splitBlock, 'data compacta 31Jul deve abrir bloco oficial');
  const splitLegs = parser.extractServerRosterFlightLegs(splitBlock.text);
  assert.deepEqual(splitLegs.map((leg) => `${leg.flightNumber}:${leg.origin}-${leg.destination}`), [
    'LA3264:BSB-GRU',
    'LA3286:GRU-CWB',
    'LA3111:CWB-BSB',
    'LA3384:BSB-VCP',
  ], 'layout quebrado LA + número deve preservar as quatro pernas');

  const rescued = parser.rescueServerRosterFlightsFromText([], combinedOfficial, 7, 2026, 'BSB');
  const july31 = rescued.find((day) => day.date === '31/07/2026');
  assert.equal(july31?.type, 'VOO', 'dia resgatado deve ser programação de voo');
  assert.equal(july31?.legs?.length, 4, 'dia resgatado deve conter quatro pernas');
  assert.equal(july31?.legs?.[0]?.origin, 'BSB', 'primeira origem oficial deve permanecer BSB');
  assert.equal(july31?.legs?.at(-1)?.destination, 'VCP', 'destino final oficial deve permanecer VCP');

  const continuation = `01-Jul-2026 LA3237 OP VCP 05:40(+2) BSB 07:20(+2) 01:40
LA3758 OP BSB 08:35(+2) NAT 11:10(+2) 11:40(+2) 02:35
02:05(+3) LA3445 OP NAT 02:40(+3) GRU 06:05(+3) 321
LA4676 OP GRU 07:25(+3) BSB 09:10(+3) 09:40(+3) 321`;
  const continuationBlock = parser.buildServerRosterRescueBlocks(continuation, 2026)[0];
  const continuationLegs = parser.extractServerRosterFlightLegs(continuationBlock.text);
  assert.ok(continuationLegs.length >= 4, 'continuação (+2)/(+3) não pode apagar pernas empilhadas');
  assert.ok(continuationLegs.some((leg) => leg.flightNumber === 'LA3445' && leg.origin === 'NAT' && leg.destination === 'GRU'), 'LA3445 NAT→GRU deve sobreviver à continuação');

  const transposedDays = Array.from({ length: 30 }, (_, index) => ({ date: `${String(index + 1).padStart(2, '0')}/07/2026`, legs: [], pairingCode: index % 2 ? 'HSB' : 'DO' }));
  const sourceHasFlights = /\bLA\s*\d{3,4}\b/i.test(combinedOfficial);
  const transposedFlightCount = transposedDays.reduce((sum, day) => sum + day.legs.length, 0);
  const useStrongTransposed = transposedDays.length >= 25 && transposedDays.length >= 30 && (!sourceHasFlights || transposedFlightCount > 0);
  assert.equal(useStrongTransposed, false, 'trinta folgas/sobreavisos com zero voos não podem vencer a importação oficial');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

const home = fs.readFileSync(path.join(root, 'client/src/pages/Home.tsx'), 'utf8');
const release = fs.readFileSync(path.join(root, 'client/public/release.json'), 'utf8');
assert.ok(home.includes("const DEFAULT_VERSION = '14.3.33';"), 'versão web 14.3.33 ausente');
assert.ok(release.includes('14.3.33'), 'release.json 14.3.33 ausente');

console.log('v14.3.33 official CrewRosterReport integrity: combined/split LA flights, stacked legs, continuation and zero-flight guard validated.');
