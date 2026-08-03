import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const root = process.cwd();
const fixture = fs.readFileSync(path.join(root, 'scripts/fixtures/crew-roster-august-2026-current-p0.txt'), 'utf8');
const serverSource = fs.readFileSync(path.join(root, 'server/rosterParser.mjs'), 'utf8');
const homeSource = fs.readFileSync(path.join(root, 'client/src/pages/Home.tsx'), 'utf8');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-p0-date-'));

function flightNumbers(days, date) {
  return (days || []).filter((day) => day.date === date).flatMap((day) => day.legs || []).map((leg) => leg.flightNumber);
}

try {
  const exposedPath = path.join(tempDir, 'rosterParser-p0.mjs');
  const exposed = serverSource.replace(
    'export { parsePdfOnServer };',
    'export { parsePdfOnServer, parseServerRosterReport, rebuildServerCrewRosterOffsetDays, finalizeServerDays };',
  );
  assert.notEqual(exposed, serverSource, 'não foi possível expor parser CrewRosterReport');
  fs.writeFileSync(exposedPath, exposed, 'utf8');
  const parser = await import(`${pathToFileURL(exposedPath).href}?v=${Date.now()}`);

  const initial = parser.parseServerRosterReport(fixture, [], 'CrewRosterReport-current-p0.pdf');
  const rebuilt = parser.rebuildServerCrewRosterOffsetDays(initial.days, fixture, 8, 2026, 'BSB');
  const parsedDays = parser.finalizeServerDays(rebuilt, 8, 2026, 'BSB');

  assert.deepEqual(flightNumbers(parsedDays, '01/08/2026'), ['LA3558', 'LA3559', 'LA4631'], 'parser: 01/08 deve conter somente LA3558, LA3559, LA4631');
  assert.deepEqual(flightNumbers(parsedDays, '02/08/2026'), ['LA3108'], 'parser: 02/08 deve conter somente LA3108');
  assert.equal(parsedDays.filter((day) => day.date === '03/08/2026').some((day) => String(day.type || day.pairingCode).toUpperCase().includes('ASB')), true, 'parser: 03/08 deve conter ASB');
  assert.deepEqual(flightNumbers(parsedDays, '11/08/2026'), ['LA3895', 'LA3728', 'LA3027'], 'parser: 11/08 deve conter LA3895, LA3728, LA3027');

  await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      lib: { entry: path.resolve('client/src/lib/canonicalRoster.ts'), formats: ['es'], fileName: () => 'canonical.mjs' },
      outDir: tempDir,
      emptyOutDir: false,
      minify: false,
    },
  });
  const canonical = await import(`${pathToFileURL(path.join(tempDir, 'canonical.mjs')).href}?v=${Date.now()}`);
  const roster = { ...initial, month: 8, year: 2026, base: 'BSB', rawText: fixture, days: parsedDays };
  const normalized = canonical.normalizeRosterDays(roster);
  const events = canonical.buildCanonicalRosterEvents(normalized);
  const eventFlights = (date) => events.filter((event) => event.date === date && event.kind === 'flight').map((event) => event.flightNumber);

  assert.deepEqual(eventFlights('01/08/2026'), ['LA3558', 'LA3559', 'LA4631'], 'canônico: 01/08 não pode vazar para 02/08');
  assert.deepEqual(eventFlights('02/08/2026'), ['LA3108'], 'canônico: 02/08 deve conter somente LA3108');
  assert.deepEqual(eventFlights('11/08/2026'), ['LA3895', 'LA3728', 'LA3027'], 'canônico: 11/08 deve manter as três pernas');

  // Segurança: hoje a Home restaura JSON serializado sem reprocessar o PDF de origem.
  // Uma atualização do app, portanto, pode continuar mostrando um roster gerado por parser antigo.
  assert.ok(homeSource.includes("() => sessionStorage.getItem('crewcheck_roster')"), 'Home deve ter cache de roster em sessão');
  assert.ok(homeSource.includes("() => localStorage.getItem('crewcheck_latest_roster_bundle')"), 'Home deve ter cache persistente de roster');
  assert.ok(!/loadRoster\(\)[\s\S]{0,2500}parsePDF\(/.test(homeSource), 'loadRoster não deve fingir que reprocessa PDF: evidência de cache serializado legado');

  console.log('[P0 roster-date] parser CrewRosterReport + canônico estão corretos no fixture atual; risco reproduzido está na restauração de roster serializado legado após atualização do cliente.');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
