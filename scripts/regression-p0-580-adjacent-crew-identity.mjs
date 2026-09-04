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

const historyItem = (id, checksum, createdAt, rosterValue) => ({
  id, checksum, createdAt, sourceFileName: `${id}.pdf`, roster: rosterValue,
  compliance: { score: 100, alerts: [] }, gym: [],
});

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

    const setHistory = (items) => localStorage.setItem('crewcheck_local_history_v11_crew-580', JSON.stringify(items));
    setHistory([
      historyItem('local-august-alpha', 'august-alpha', '2026-08-31T12:00:00.000Z', augustAlpha),
      historyItem('local-september-alpha', 'september-alpha', '2026-08-30T12:00:00.000Z', septemberAlpha),
      historyItem('local-september-bravo', 'september-bravo', '2026-08-31T14:00:00.000Z', septemberBravo),
    ]);

    const { openActiveRoster } = await import(`${pathToFileURL(path.join(outDir, 'database-client.mjs')).href}?v=${Date.now()}`);

    const onlineResponse = (bodyRoster, summary) => async (input) => {
      const url = String(input);
      if (url === '/api/rosters/active') {
        return new Response(JSON.stringify({
          ok: true,
          roster: summary,
          data: { roster: bodyRoster, compliance: { score: 100, alerts: [] }, gym: [] },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: false, message: 'not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
    };
    const offlineResponse = async () => new Response(JSON.stringify({ ok: false, message: 'offline' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });

    globalThis.fetch = onlineResponse(augustAlpha, {
      id: 'remote-august-alpha', checksum: 'august-alpha', year: 2026, month: 8,
      crewId: 'CREW-A', crewName: 'Tripulante Alpha', isActive: true,
    });

    const online = await openActiveRoster();
    assert.ok(online.roster.days.some((day) => day.pairingCode === 'SEP-ALPHA'), 'online deve anexar a publicação adjacente do mesmo tripulante');
    assert.ok(!online.roster.days.some((day) => day.pairingCode === 'SEP-BRAVO'), 'online nunca pode anexar publicação adjacente de outro tripulante');

    globalThis.fetch = offlineResponse;
    const offline = await openActiveRoster();
    assert.ok(offline.roster.days.some((day) => day.pairingCode === 'SEP-ALPHA'), 'offline deve anexar a publicação adjacente do mesmo tripulante');
    assert.ok(!offline.roster.days.some((day) => day.pairingCode === 'SEP-BRAVO'), 'offline nunca pode anexar publicação adjacente de outro tripulante');

    // Sentinel crew IDs do not prove identity. UNKNOWN on both publications must
    // fall back to normalized names, so a newer Bravo publication cannot outrank
    // the correct Alpha publication merely because the placeholder IDs compare equal.
    const augustUnknown = roster('UNKNOWN', 'Tripulante Alpha', 2026, 8, augustAlpha.days);
    const septemberAlphaUnknown = roster('UNKNOWN', 'Tripulante Alpha', 2026, 9, septemberAlpha.days);
    const septemberBravoUnknown = roster('UNKNOWN', 'Tripulante Bravo', 2026, 9, septemberBravo.days);
    setHistory([
      historyItem('local-august-unknown', 'august-unknown', '2026-08-31T12:00:00.000Z', augustUnknown),
      historyItem('local-september-alpha-unknown', 'september-alpha-unknown', '2026-08-30T12:00:00.000Z', septemberAlphaUnknown),
      historyItem('local-september-bravo-unknown', 'september-bravo-unknown', '2026-08-31T14:00:00.000Z', septemberBravoUnknown),
    ]);
    globalThis.fetch = onlineResponse(augustUnknown, {
      id: 'remote-august-unknown', checksum: 'august-unknown', year: 2026, month: 8,
      crewId: 'UNKNOWN', crewName: 'Tripulante Alpha', isActive: true,
    });
    const sentinelOnline = await openActiveRoster();
    assert.ok(sentinelOnline.roster.days.some((day) => day.pairingCode === 'SEP-ALPHA'), 'crewId UNKNOWN deve cair para o nome verificável do mesmo tripulante');
    assert.ok(!sentinelOnline.roster.days.some((day) => day.pairingCode === 'SEP-BRAVO'), 'crewId UNKNOWN não pode autorizar publicação mais recente de outro nome');
    globalThis.fetch = offlineResponse;
    const sentinelOffline = await openActiveRoster();
    assert.ok(sentinelOffline.roster.days.some((day) => day.pairingCode === 'SEP-ALPHA'), 'offline: crewId UNKNOWN deve cair para nome verificável');
    assert.ok(!sentinelOffline.roster.days.some((day) => day.pairingCode === 'SEP-BRAVO'), 'offline: placeholder compartilhado não pode misturar tripulantes');

    // A stale remote summary cannot override the identity carried by the verified
    // roster body. The mismatch must fail authorization and fall back to safe local
    // reconciliation instead of selecting Bravo through summary metadata.
    setHistory([
      historyItem('local-august-alpha', 'august-alpha', '2026-08-31T12:00:00.000Z', augustAlpha),
      historyItem('local-september-alpha', 'september-alpha', '2026-08-30T12:00:00.000Z', septemberAlpha),
      historyItem('local-september-bravo', 'september-bravo', '2026-08-31T14:00:00.000Z', septemberBravo),
    ]);
    globalThis.fetch = onlineResponse(augustAlpha, {
      id: 'remote-august-stale-crew', checksum: 'august-alpha', year: 2026, month: 8,
      crewId: 'CREW-B', crewName: 'Tripulante Bravo', isActive: true,
    });
    const staleSummary = await openActiveRoster();
    assert.ok(staleSummary.roster.days.some((day) => day.pairingCode === 'SEP-ALPHA'), 'mismatch resumo/corpo deve recair para reconciliação local segura do Alpha');
    assert.ok(!staleSummary.roster.days.some((day) => day.pairingCode === 'SEP-BRAVO'), 'resumo stale de Bravo não pode direcionar adjacência do corpo Alpha');

    const databaseSource = fs.readFileSync('client/src/lib/databaseClient.ts', 'utf8');
    assert.match(databaseSource, /P0_580_ADJACENT_CREW_IDENTITY_GUARD/, 'materialização deve manter o guard de identidade do tripulante');
    assert.match(databaseSource, /P0_580_CREW_IDENTITY_SENTINEL_GUARD/, 'IDs sentinela devem ser rejeitados antes da comparação');
    assert.match(databaseSource, /P0_580_REMOTE_CREW_BODY_BINDING/, 'identidade remota deve permanecer vinculada ao corpo verificado');
    assert.match(databaseSource, /ACTIVE_ROSTER_CREW_MISMATCH/, 'mismatch de identidade entre resumo e corpo deve falhar fechado');
    assert.match(databaseSource, /sameRosterCrew\(current, item\)/, 'seleção adjacente deve filtrar pelo mesmo tripulante antes de createdAt');

    console.log('[p0-580-adjacent-crew-identity] PASS');
  } finally {
    restoreClock();
  }
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
