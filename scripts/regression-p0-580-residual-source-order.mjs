import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { freezeFixtureClock } from './p0-580-transposed-vc-boundary/fixed-clock.mjs';

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-580-residual-source-order-'));

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
}

const leg = (flightNumber, origin, destination, departureTime) => ({ flightNumber, origin, destination, departureTime });
const flightDay = (date, pairingCode, flightNumber, origin, destination, departureTime, dutyReport) => ({
  date,
  type: 'FLIGHT',
  pairingCode,
  dutyReport,
  legs: [leg(flightNumber, origin, destination, departureTime)],
});

const baseRoster = (year, month, days, rawText) => ({
  crewName: 'TRIPULANTE TESTE',
  crewId: '00000000',
  base: 'BSB',
  year,
  month,
  rawText,
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
  localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'crew-residual', email: 'crew@example.test' }));

  const august = baseRoster(2026, 8, [
    flightDay('29/08/2026', 'AUG-A', 'TST100', 'BSB', 'AAA', '08:00', '07:00'),
    flightDay('01/09/2026', 'AUG-B', 'TST101', 'AAA', 'BBB', '09:00', '08:00'),
    flightDay('02/09/2026', 'AUG-C', 'TST102', 'BBB', 'CCC', '10:00', '09:00'),
  ], 'AUGUST-PRIMARY');

  const september = baseRoster(2026, 9, [
    flightDay('2026-08-29', 'SEP-A', 'TST100', 'BSB', 'AAA', '08:00', '07:10'),
    flightDay('2026-09-01', 'SEP-B', 'TST101', 'AAA', 'BBB', '09:00', '08:10'),
    flightDay('2026-09-02', 'SEP-C', 'TST102', 'BBB', 'CCC', '10:00', '09:10'),
    { date: '2026-09-03', type: 'CRM', pairingCode: 'EMER', legs: [] },
    flightDay('2026-09-04', 'SEP-LATE', 'TST103', 'CCC', 'BSB', '11:00', '10:00'),
  ], 'SEPTEMBER-RESIDUAL');

  localStorage.setItem('crewcheck_local_history_v11_crew-residual', JSON.stringify([
    {
      id: 'local-august-residual', checksum: 'august-residual', createdAt: '2026-08-31T14:00:00.000Z',
      sourceFileName: 'august-residual.pdf', roster: august, compliance: { score: 100, alerts: [] }, gym: [],
    },
    {
      id: 'local-september-residual', checksum: 'september-residual', createdAt: '2026-08-30T14:00:00.000Z',
      sourceFileName: 'september-residual.pdf', roster: september, compliance: { score: 100, alerts: [] }, gym: [],
    },
  ]));

  const { openActiveRoster } = await import(`${pathToFileURL(path.join(outDir, 'database-client.mjs')).href}?v=${Date.now()}`);

  const assertResidualBlocked = (result, label) => {
    assert.ok(!(result.roster.days || []).some((day) => day.pairingCode === 'EMER'), `${label}: atividade residual sem legs não pode ser anexada`);
    assert.ok(!(result.roster.days || []).some((day) => day.pairingCode === 'SEP-LATE'), `${label}: voo posterior compatível não pode autorizar pular atividade residual`);
  };

  globalThis.fetch = async (input) => {
    if (String(input) === '/api/rosters/active') {
      return new Response(JSON.stringify({
        ok: true,
        roster: { id: 'remote-august-residual', checksum: 'august-residual', year: 2026, month: 8, isActive: true },
        data: { roster: august, compliance: { score: 100, alerts: [] }, gym: [] },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: false, message: 'not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
  };
  assertResidualBlocked(await openActiveRoster(), 'online reconciliado');

  globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, message: 'offline' }), {
    status: 503,
    headers: { 'content-type': 'application/json' },
  });
  assertResidualBlocked(await openActiveRoster(), 'offline');

  const databaseSource = fs.readFileSync('client/src/lib/databaseClient.ts', 'utf8');
  assert.match(databaseSource, /P0_580_RESIDUAL_SOURCE_ORDER_GUARD/, 'produção materializada deve carregar o guard de ordem-fonte residual');
  assert.match(databaseSource, /for \(const day of residualDays\)/, 'continuidade deve percorrer atividades residuais, não apenas âncoras com legs');
  assert.doesNotMatch(databaseSource, /for \(const anchor of nextAnchors\)/, 'travessia anchor-only não pode sobreviver no contrato materializado');

  console.log('[p0-580-residual-source-order] OK — atividade residual sem legs bloqueia âncora posterior online/offline.');
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
