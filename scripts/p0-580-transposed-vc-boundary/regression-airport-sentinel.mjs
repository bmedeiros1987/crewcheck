import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { freezeFixtureClock } from './fixed-clock.mjs';

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-580-airport-sentinel-'));

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
}

const flightDay = (date, pairingCode, origin, destination) => ({
  date,
  type: 'FLIGHT',
  pairingCode,
  dutyReport: '08:00',
  legs: [{ flightNumber: pairingCode, origin, destination, departureTime: '09:00' }],
});

const roster = (year, month, days) => ({
  crewName: 'TRIPULANTE TESTE',
  crewId: '00000000',
  base: 'BSB',
  year,
  month,
  rawText: '',
  days,
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

  // Pin the harness clock to the epoch these fixtures describe. See fixed-clock.mjs.
  freezeFixtureClock();
  globalThis.localStorage = new MemoryStorage();
  globalThis.sessionStorage = new MemoryStorage();
  globalThis.window = { location: { origin: 'https://crewcheck.test' }, dispatchEvent() {} };
  localStorage.setItem('crewcheck_auth_token', 'test-token');
  localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'crew-580-airport', email: 'crew@example.test' }));

  const august = roster(2026, 8, [flightDay('31/08/2026', 'AUG-TAIL', 'AAA', 'UNK')]);
  const septemberUnknown = roster(2026, 9, [flightDay('01/09/2026', 'SEP-UNKNOWN', 'UNKNOWN', 'BBB')]);
  const septemberLegitUnk = roster(2026, 9, [flightDay('01/09/2026', 'SEP-UNK', 'UNK', 'BBB')]);

  const seed = (septemberRoster, suffix) => {
    localStorage.setItem('crewcheck_local_history_v11_crew-580-airport', JSON.stringify([
      {
        id: `local-august-${suffix}`, checksum: `august-${suffix}`, createdAt: '2026-08-31T18:00:00.000Z',
        sourceFileName: 'august-synthetic.pdf', roster: august, compliance: { score: 100, alerts: [] }, gym: [],
      },
      {
        id: `local-september-${suffix}`, checksum: `september-${suffix}`, createdAt: '2026-08-30T18:00:00.000Z',
        sourceFileName: 'september-synthetic.pdf', roster: septemberRoster, compliance: { score: 100, alerts: [] }, gym: [],
      },
    ]));
  };

  const { openActiveRoster } = await import(`${pathToFileURL(path.join(outDir, 'database-client.mjs')).href}?v=${Date.now()}`);

  seed(septemberUnknown, 'unknown');
  globalThis.fetch = async (input) => {
    if (String(input) === '/api/rosters/active') {
      return new Response(JSON.stringify({
        ok: true,
        roster: { id: 'remote-august-unknown', checksum: 'august-unknown', year: 2026, month: 8, isActive: true },
        data: { roster: august, compliance: { score: 100, alerts: [] }, gym: [] },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: false }), { status: 404, headers: { 'content-type': 'application/json' } });
  };
  const onlineUnknown = await openActiveRoster();
  assert.ok(!(onlineUnknown.roster.days || []).some((day) => day.pairingCode === 'SEP-UNKNOWN'), 'online: UNKNOWN nunca pode ser truncado para o IATA legítimo UNK e autorizar continuidade');

  globalThis.fetch = async () => new Response(JSON.stringify({ ok: false }), { status: 503, headers: { 'content-type': 'application/json' } });
  const offlineUnknown = await openActiveRoster();
  assert.ok(!(offlineUnknown.roster.days || []).some((day) => day.pairingCode === 'SEP-UNKNOWN'), 'offline: UNKNOWN deve bloquear a continuidade em modo fail-closed');

  seed(septemberLegitUnk, 'legit');
  const offlineLegit = await openActiveRoster();
  assert.ok((offlineLegit.roster.days || []).some((day) => day.pairingCode === 'SEP-UNK'), 'o IATA legítimo UNK deve continuar válido como âncora de continuidade');

  const databaseSource = fs.readFileSync('client/src/lib/databaseClient.ts', 'utf8');
  const helperStart = databaseSource.indexOf('function mergeAirportForLocal(value?: string | null): string {');
  const helperEnd = databaseSource.indexOf('\n}\n\nfunction isOffLikeLocalDay', helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart, 'helper de aeroporto da continuidade deve existir');
  const helper = databaseSource.slice(helperStart, helperEnd + 2);
  assert.match(helper, /P0_580_CONTINUITY_AIRPORT_SENTINEL_GUARD/, 'guard contextual de sentinelas deve estar materializado');
  assert.doesNotMatch(helper, /\.slice\(0, 3\)/, 'normalização de continuidade não pode truncar valores longos para IATA');

  console.log('[p0-580-airport-sentinel] OK — UNKNOWN falha fechado online/offline e UNK legítimo permanece válido.');
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
