import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { freezeFixtureClock } from './p0-580-transposed-vc-boundary/fixed-clock.mjs';

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-580-crew-adjacency-'));

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
}

const flightDay = (date, pairingCode, flightNumber, origin, destination, departureTime) => ({
  date,
  type: 'FLIGHT',
  pairingCode,
  dutyReport: '07:00',
  legs: [{ flightNumber, origin, destination, departureTime }],
});

function roster(crewId, crewName, year, month, days) {
  return { crewId, crewName, base: 'BSB', rank: 'CCM', airline: 'LATAM', year, month, rawText: '', days };
}

try {
  await build({
    configFile: false,
    logLevel: 'silent',
    resolve: { alias: { '@shared': path.resolve('shared') } },
    build: {
      lib: { entry: path.resolve('client/src/lib/databaseClient.ts'), formats: ['es'], fileName: () => 'database-client.mjs' },
      outDir,
      emptyOutDir: true,
      minify: false,
    },
  });

  const restoreClock = freezeFixtureClock();
  try {
    globalThis.localStorage = new MemoryStorage();
    globalThis.sessionStorage = new MemoryStorage();
    globalThis.window = { location: { origin: 'https://crewcheck.test' }, dispatchEvent() {} };
    localStorage.setItem('crewcheck_auth_token', 'test-token');
    localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'crew-580', email: 'crew@example.test' }));

    const augustAlpha = roster('CREW-A', 'Tripulante Alpha', 2026, 8, [
      flightDay('29/08/2026', 'AUG-A1', 'LA8100', 'BSB', 'AAA', '08:00'),
      flightDay('31/08/2026', 'AUG-A2', 'LA8101', 'AAA', 'CCC', '10:00'),
    ]);
    const septemberAlpha = roster('CREW-A', 'Tripulante Alpha', 2026, 9, [
      flightDay('01/09/2026', 'SEP-ALPHA', 'LA8102', 'CCC', 'BSB', '11:00'),
    ]);
    const septemberBravo = roster('CREW-B', 'Tripulante Bravo', 2026, 9, [
      flightDay('01/09/2026', 'SEP-BRAVO', 'LA9902', 'CCC', 'BSB', '11:30'),
    ]);

    localStorage.setItem('crewcheck_local_history_v11_crew-580', JSON.stringify([
      {
        id: 'local-august-alpha', checksum: 'august-alpha', createdAt: '2026-08-31T12:00:00.000Z',
        sourceFileName: 'august-alpha.pdf', roster: augustAlpha, compliance: { score: 100, alerts: [] }, gym: [],
      },
      {
        id: 'local-september-alpha', checksum: 'september-alpha', createdAt: '2026-08-30T12:00:00.000Z',
        sourceFileName: 'september-alpha.pdf', roster: septemberAlpha, compliance: { score: 100, alerts: [] }, gym: [],
      },
      {
        id: 'local-september-bravo', checksum: 'september-bravo', createdAt: '2026-08-31T14:00:00.000Z',
        sourceFileName: 'september-bravo.pdf', roster: septemberBravo, compliance: { score: 100, alerts: [] }, gym: [],
      },
    ]));

    const { openActiveRoster } = await import(`${pathToFileURL(path.join(outDir, 'database-client.mjs')).href}?v=${Date.now()}`);

    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url === '/api/rosters/active') {
        return new Response(JSON.stringify({
          ok: true,
          roster: { id: 'remote-august-alpha', checksum: 'august-alpha', year: 2026, month: 8, crewId: 'CREW-A', crewName: 'Tripulante Alpha', isActive: true },
          data: { roster: augustAlpha, compliance: { score: 100, alerts: [] }, gym: [] },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: false, message: 'not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
    };

    const online = await openActiveRoster();
    assert.ok(online.roster.days.some((day) => day.pairingCode === 'SEP-ALPHA'), 'online deve anexar a publicação adjacente do mesmo tripulante');
    assert.ok(!online.roster.days.some((day) => day.pairingCode === 'SEP-BRAVO'), 'online nunca pode anexar publicação adjacente de outro tripulante');

    globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, message: 'offline' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });

    const offline = await openActiveRoster();
    assert.ok(offline.roster.days.some((day) => day.pairingCode === 'SEP-ALPHA'), 'offline deve anexar a publicação adjacente do mesmo tripulante');
    assert.ok(!offline.roster.days.some((day) => day.pairingCode === 'SEP-BRAVO'), 'offline nunca pode anexar publicação adjacente de outro tripulante');

    const databaseSource = fs.readFileSync('client/src/lib/databaseClient.ts', 'utf8');
    assert.match(databaseSource, /P0_580_ADJACENT_CREW_IDENTITY_GUARD/, 'materialização deve manter o guard de identidade do tripulante');
    assert.match(databaseSource, /sameRosterCrew\(current, item\)/, 'seleção adjacente deve filtrar pelo mesmo tripulante antes de createdAt');

    console.log('[p0-580-adjacent-crew-identity] PASS');
  } finally {
    restoreClock();
  }
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
