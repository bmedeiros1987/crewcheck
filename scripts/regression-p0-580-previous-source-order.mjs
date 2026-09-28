import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { freezeFixtureClock } from './p0-580-transposed-vc-boundary/fixed-clock.mjs';

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-580-previous-source-order-'));

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
}

const flightDay = (date, pairingCode, flightNumber, origin, destination, departureTime) => ({
  date, type: 'FLIGHT', pairingCode, dutyReport: '07:00',
  legs: [{ flightNumber, origin, destination, departureTime }],
});
const roster = (year, month, days) => ({
  crewId: 'CREW-A', crewName: 'Tripulante Alpha', base: 'BSB', rank: 'CCM', airline: 'LATAM', year, month, rawText: '', days,
});
const localItem = (id, checksum, createdAt, data) => ({
  id, checksum, createdAt, sourceFileName: `${id}.pdf`, roster: data, compliance: { score: 100, alerts: [] }, gym: [],
});

try {
  await build({
    configFile: false,
    logLevel: 'silent',
    resolve: { alias: { '@shared': path.resolve('shared') } },
    build: {
      lib: { entry: path.resolve('client/src/lib/databaseClient.ts'), formats: ['es'], fileName: () => 'database-client.mjs' },
      outDir, emptyOutDir: true, minify: false,
    },
  });

  const restoreClock = freezeFixtureClock('2026-09-02T15:00:00.000Z');
  try {
    globalThis.localStorage = new MemoryStorage();
    globalThis.sessionStorage = new MemoryStorage();
    globalThis.window = { location: { origin: 'https://crewcheck.test' }, dispatchEvent() {} };
    localStorage.setItem('crewcheck_auth_token', 'test-token');
    localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'crew-580', email: 'crew@example.test' }));

    const { openActiveRoster } = await import(`${pathToFileURL(path.join(outDir, 'database-client.mjs')).href}?v=${Date.now()}`);

    async function runScenario(previousRoster, currentRoster, mode) {
      localStorage.setItem('crewcheck_local_history_v11_crew-580', JSON.stringify([
        localItem('local-september', 'september-current', '2026-09-02T12:00:00.000Z', currentRoster),
        localItem('local-august', 'august-previous', '2026-09-01T12:00:00.000Z', previousRoster),
      ]));
      if (mode === 'online') {
        globalThis.fetch = async (input) => {
          const url = String(input);
          if (url === '/api/rosters/active') {
            return new Response(JSON.stringify({
              ok: true,
              roster: { id: 'remote-september', checksum: 'september-current', year: 2026, month: 9, crewId: 'CREW-A', crewName: 'Tripulante Alpha', isActive: true },
              data: { roster: currentRoster, compliance: { score: 100, alerts: [] }, gym: [] },
            }), { status: 200, headers: { 'content-type': 'application/json' } });
          }
          return new Response(JSON.stringify({ ok: false, message: 'not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
        };
      } else {
        globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, message: 'offline' }), {
          status: 503, headers: { 'content-type': 'application/json' },
        });
      }
      return openActiveRoster();
    }

    const september = roster(2026, 9, [flightDay('02/09/2026', 'SEP-NEW', 'LA8204', 'CCC', 'BSB', '11:00')]);
    const previousWithBoundary = roster(2026, 8, [
      flightDay('30/08/2026', 'AUG-OLD', 'LA8201', 'BSB', 'AAA', '08:00'),
      { date: '31/08/2026', type: 'OFF', pairingCode: 'DO', legs: [] },
      flightDay('01/09/2026', 'AUG-CARRY', 'LA8202', 'AAA', 'CCC', '10:00'),
    ]);

    for (const mode of ['online', 'offline']) {
      const result = await runScenario(previousWithBoundary, september, mode);
      assert.ok(result.roster.days.some((day) => day.pairingCode === 'AUG-CARRY'), `${mode}: carry após a folga deve ser preservado`);
      assert.ok(!result.roster.days.some((day) => day.pairingCode === 'AUG-OLD'), `${mode}: carry não pode atravessar a folga para uma jornada anterior`);
      assert.ok(!result.roster.days.some((day) => day.pairingCode === 'DO'), `${mode}: folga não pode ser descartada para conectar jornadas`);
      assert.ok(result.roster.days.some((day) => day.pairingCode === 'SEP-NEW'), `${mode}: escala corrente deve permanecer`);
    }

    const previousWithUncertainTail = roster(2026, 8, [
      flightDay('31/08/2026', 'AUG-ANCHOR', 'LA8301', 'BSB', 'CCC', '09:00'),
      { date: '01/09/2026', type: 'CRM', pairingCode: 'UNKNOWN-ACTIVITY', legs: [] },
    ]);

    for (const mode of ['online', 'offline']) {
      const result = await runScenario(previousWithUncertainTail, september, mode);
      assert.ok(!result.roster.days.some((day) => day.pairingCode === 'AUG-ANCHOR'), `${mode}: âncora anterior não pode autorizar linha-fonte incerta posterior`);
      assert.ok(!result.roster.days.some((day) => day.pairingCode === 'UNKNOWN-ACTIVITY'), `${mode}: atividade incerta anterior não pode ser anexada`);
      assert.ok(result.roster.days.some((day) => day.pairingCode === 'SEP-NEW'), `${mode}: escala corrente deve permanecer após rejeitar o carry anterior`);
    }

    const databaseSource = fs.readFileSync('client/src/lib/databaseClient.ts', 'utf8');
    assert.match(databaseSource, /P0_580_PREVIOUS_SOURCE_ORDER_GUARD/, 'materialização deve manter o guard de ordem-fonte anterior');
    assert.match(databaseSource, /previousSourceDays\.slice\(previous\.index \+ 1, current\.index\)\.length/, 'carry anterior deve respeitar linhas intermediárias');
    assert.match(databaseSource, /previousSourceDays\.slice\(last\.index \+ 1\)\.length/, 'linhas posteriores à última âncora devem falhar fechado');

    console.log('[p0-580-previous-source-order] PASS');
  } finally {
    restoreClock();
  }
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
