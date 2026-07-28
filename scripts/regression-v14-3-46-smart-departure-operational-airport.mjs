import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const fixture = read('scripts/fixtures/crew-roster-august-2026.txt');
const chain = read('scripts/v139/apply.mjs');
const clientParser = read('client/src/lib/pdfParser.ts');
const serverParser = read('server/rosterParser.mjs');
const canonical = read('client/src/lib/canonicalRoster.ts');
const home = read('client/src/pages/Home.tsx');
const departurePatch = read('scripts/v14331/apply.mjs');
const applySource = read('scripts/v14346/apply.mjs');

assert.ok(chain.trimEnd().endsWith("await import('../v14346/apply.mjs');"), 'v14.3.46 deve encerrar a preparação canônica');
assert.ok(clientParser.includes("(day as any).operationalAirport = match[2].toUpperCase();"), 'cliente deve guardar o aeroporto operacional da MCK');
assert.ok(serverParser.includes('day.operationalAirport = match[2].toUpperCase();'), 'servidor deve guardar o aeroporto operacional da MCK');
assert.ok(canonical.includes("const operationalAirport = String((day as any).operationalAirport || (day as any).airport || day.base || '')"), 'evento canônico deve priorizar o aeroporto operacional');
assert.ok(canonical.includes('origin: operationalAirport,\n      destination: operationalAirport,'), 'evento canônico de solo deve entregar o aeroporto operacional');
assert.ok(home.includes("const base = safe((day as any).operationalAirport || (day as any).airport || event.origin || (day as any).base"), 'projeção Web deve preservar o aeroporto operacional antes da base contratual');
assert.ok(departurePatch.includes("return event.kind === 'duty'"), 'atividade presencial deve continuar elegível para a Saída Inteligente');
assert.ok(departurePatch.includes('DO|DOF|DOP|DOPR|DR|OFF'), 'folga e DR devem continuar inelegíveis');
assert.ok(departurePatch.includes('return eventRouteDestination(event);'), 'rota terrestre deve terminar no aeroporto de origem do evento selecionado');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-v14346-'));
try {
  const testModulePath = path.join(tempDir, 'rosterParser-smart-departure-test.mjs');
  const exported = serverParser.replace(
    'export { parsePdfOnServer };',
    'export { parsePdfOnServer, parseServerRosterReport, rebuildServerCrewRosterOffsetDays, finalizeServerDays };',
  );
  assert.notEqual(exported, serverParser, 'hooks internos do parser não foram habilitados');
  fs.writeFileSync(testModulePath, exported, 'utf8');
  const parser = await import(`${pathToFileURL(testModulePath).href}?v=${Date.now()}`);
  const initial = parser.parseServerRosterReport(fixture, [], 'CrewRosterReport-August-2026.pdf');
  const rebuilt = parser.rebuildServerCrewRosterOffsetDays(initial.days, fixture, 8, 2026, 'BSB');
  const days = parser.finalizeServerDays(rebuilt, 8, 2026, 'BSB');
  const byDate = (date) => days.filter((day) => day.date === date);
  const firstFlightOrigin = (date) => byDate(date).flatMap((day) => day.legs || [])[0]?.origin || '';

  const mck = byDate('07/08/2026').filter((day) => /^MCK/.test(day.pairingCode || ''));
  assert.equal(mck.length, 2, '07/08 deve manter as duas MCK');
  assert.deepEqual(mck.map((day) => day.operationalAirport), ['CGH', 'CGH'], 'MCK deve entregar CGH à Saída Inteligente sem alterar a base BSB');
  assert.deepEqual(mck.map((day) => day.base), ['BSB', 'BSB'], 'base contratual deve permanecer separada do local operacional');
  assert.deepEqual(mck.map((day) => `${day.dutyReport}-${day.dutyDebrief}`), ['09:00-13:00', '14:00-18:00']);

  assert.equal(firstFlightOrigin('01/08/2026'), 'GRU');
  assert.equal(firstFlightOrigin('06/08/2026'), 'BSB');
  assert.equal(firstFlightOrigin('08/08/2026'), 'CGH');
  assert.equal(firstFlightOrigin('10/08/2026'), 'THE');
  assert.equal(firstFlightOrigin('20/08/2026'), 'LDB');
  assert.equal(firstFlightOrigin('25/08/2026'), 'BEL');
  assert.equal(firstFlightOrigin('01/09/2026'), 'FLN');
  assert.equal(byDate('13/08/2026').some((day) => day.type === 'DR'), true);
  assert.equal(byDate('17/08/2026').some((day) => day.type === 'HSB' && day.base === 'BSB'), true);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

for (const protectedPath of ['client/src/lib/financialRules.ts', 'client/src/lib/regulationEngine.ts', 'server/platform.mjs', 'server/v14342/maps-budget.mjs']) {
  assert.ok(!applySource.includes(`update('${protectedPath}'`), `v14.3.46 não pode alterar ${protectedPath}`);
}

const tracked = ['client/src/lib/pdfParser.ts', 'server/rosterParser.mjs', 'client/src/lib/canonicalRoster.ts', 'client/src/pages/Home.tsx', 'client/src/App.tsx', 'client/index.html', 'client/public/sw.js', 'client/public/release.json'];
const before = new Map(tracked.map((relative) => [relative, read(relative)]));
const apply = spawnSync(process.execPath, [path.join(root, 'scripts/v14346/apply.mjs')], { cwd: root, encoding: 'utf8' });
assert.equal(apply.status, 0, apply.stderr || apply.stdout || 'segunda aplicação v14.3.46 falhou');
for (const relative of tracked) assert.equal(read(relative), before.get(relative), `v14.3.46 deve ser idempotente em ${relative}`);

console.log('v14.3.46 Smart Departure handoff: MCK operational airport CGH, contractual base BSB, first-event airport matrix, rest exclusions and idempotency validated.');
