import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

process.env.CREWCHECK_V14380_SKIP_APPLY = '1';
process.env.CREWCHECK_V14381_SKIP_APPLY = '1';
const { patchRosterCacheIntegrityV14380 } = await import('./v14380/apply.mjs');
const { patchRosterCacheOperationalDateV14381, patchRuntimeVersionV14381 } = await import('./v14381/apply.mjs');

const root = process.cwd();
const fixture = fs.readFileSync(path.join(root, 'scripts/fixtures/crew-roster-august-2026-current-p0.txt'), 'utf8');
const serverSource = fs.readFileSync(path.join(root, 'server/rosterParser.mjs'), 'utf8');
const homeSource = fs.readFileSync(path.join(root, 'client/src/pages/Home.tsx'), 'utf8');
const runtimeServerSource = fs.readFileSync(path.join(root, 'server.mjs'), 'utf8');
const platformSource = fs.readFileSync(path.join(root, 'server/platform.mjs'), 'utf8');
const release = JSON.parse(fs.readFileSync(path.join(root, 'client/public/release.json'), 'utf8'));
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
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

  // Segurança: a Home só pode restaurar JSON produzido pelo schema atual. Caches
  // sem marcador pertencem a parsers anteriores e devem falhar fechados.
  assert.ok(homeSource.includes("() => sessionStorage.getItem('crewcheck_roster')"), 'Home deve ter cache de roster em sessão');
  assert.ok(homeSource.includes("() => localStorage.getItem('crewcheck_latest_roster_bundle')"), 'Home deve ter cache persistente de roster');
  assert.ok(homeSource.includes("const ROSTER_CACHE_SCHEMA = 'p0-operational-date-anchor-v2';"), 'Home deve declarar o schema que invalida o roster contaminado pela Updated Date');
  assert.ok(homeSource.includes('if (payload?.cacheSchema !== ROSTER_CACHE_SCHEMA) continue;'), 'cache legado sem schema deve ser rejeitado antes da leitura do roster');
  assert.ok(homeSource.includes("JSON.stringify({ roster, cacheSchema: ROSTER_CACHE_SCHEMA, sourceFileName: source"), 'cache de sessão deve persistir o schema atual');
  assert.ok(homeSource.includes("source: 'crewcheck-v14.3.81-p0-operational-date-anchor', cacheSchema: ROSTER_CACHE_SCHEMA"), 'bundle persistente deve registrar origem e schema atuais');
  assert.equal(patchRosterCacheIntegrityV14380(homeSource), homeSource, 'patch de cache P0 anterior deve respeitar schemas posteriores');
  assert.equal(patchRosterCacheOperationalDateV14381(homeSource), homeSource, 'patch de cache operacional deve ser idempotente');

  assert.equal(packageJson.version, '14.3.81', 'package deve anunciar a versão P0 atual');
  assert.equal(release.version, packageJson.version, 'release Web/PWA deve acompanhar o package');
  const escapedVersion = packageJson.version.replace(/\./g, '\\.');
  assert.match(runtimeServerSource, new RegExp(`url\\.pathname === '/api/release'[^\\r\\n]*version\\s*:\\s*'${escapedVersion}'`), 'endpoint de release deve acompanhar a versão P0');
  assert.match(runtimeServerSource, new RegExp(`url\\.pathname === '/api/health'[^\\r\\n]*version\\s*:\\s*'${escapedVersion}'`), 'endpoint de saúde deve acompanhar a versão P0');
  assert.equal(patchRuntimeVersionV14381(runtimeServerSource), runtimeServerSource, 'patch de versão do servidor deve ser idempotente');
  assert.equal(patchRuntimeVersionV14381(platformSource), platformSource, 'patch de versão da plataforma deve ser idempotente');

  console.log('[P0 roster-date] parser e canônico preservados; cache legado falha fechado e cliente/servidor anunciam a mesma versão.');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
