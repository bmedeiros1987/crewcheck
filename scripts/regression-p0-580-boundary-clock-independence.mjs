// P0 #580 — adversarial counter-proof: the summary/body integrity contract must not
// depend on which publication happens to be locally active today.
//
// /api/rosters/active answers with an AUTHORIZED August summary (its checksum matches
// a publication the device already holds) but a body belonging to the September
// publication. That response is internally inconsistent and must always surface as
// ROSTER_PERIOD_MISMATCH.
//
// Fail-before: while the coherence check ran *after* reconcileActiveRosterIdentity,
// the answer depended on the calendar. Inside August the device compared August with
// August, reconciliation said "match", and the mismatch surfaced correctly. From
// 2026-09-01 the locally active publication became September, reconciliation reported
// "checksum-mismatch" first, and the corrupt pairing was reshaped into
// ACTIVE_ROSTER_CONFLICT — a device-versus-server confirmation prompt that hides a
// corrupt server response and asks the crew member to arbitrate it.
//
// This runs under a post-boundary clock on purpose: it is the case the pinned-clock
// fixtures cannot observe.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { freezeFixtureClock } from './p0-580-transposed-vc-boundary/fixed-clock.mjs';

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-580-boundary-clock-'));

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
const publication = (year, month, days, rawText) => ({
  crewName: 'TRIPULANTE TESTE',
  crewId: '00000000',
  base: 'BSB',
  year,
  month,
  rawText,
  days,
});

// Every clock in this list must produce the same verdict. They straddle the
// competence boundary and the year rollover.
const CLOCKS = [
  '2026-08-15T12:00:00.000Z',
  '2026-08-31T15:00:00.000Z',
  '2026-09-01T09:00:00.000Z',
  '2026-09-20T12:00:00.000Z',
  '2027-01-04T12:00:00.000Z',
];

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

  const august = publication(2026, 8, [
    flightDay('29/08/2026', 'AUG-A', 'LA8100', 'BSB', 'AAA', '08:00', '07:00'),
    flightDay('01/09/2026', 'AUG-B', 'LA8101', 'AAA', 'BBB', '09:00', '08:00'),
  ], 'AUGUST-PRIMARY');
  const september = publication(2026, 9, [
    flightDay('2026-09-01', 'SEP-A', 'LA8101', 'AAA', 'BBB', '09:00', '08:10'),
    flightDay('2026-09-02', 'SEP-B', 'LA8102', 'BBB', 'CCC', '10:00', '09:10'),
  ], 'SEPTEMBER-PRIMARY');

  const { openActiveRoster } = await import(`${pathToFileURL(path.join(outDir, 'database-client.mjs')).href}?v=${Date.now()}`);

  for (const iso of CLOCKS) {
    const restore = freezeFixtureClock(iso);
    try {
      globalThis.localStorage = new MemoryStorage();
      globalThis.sessionStorage = new MemoryStorage();
      globalThis.window = { location: { origin: 'https://crewcheck.test' }, dispatchEvent() {} };
      localStorage.setItem('crewcheck_auth_token', 'test-token');
      localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'crew-boundary', email: 'crew@example.test' }));
      localStorage.setItem('crewcheck_local_history_v11_crew-boundary', JSON.stringify([
        {
          id: 'local-august', checksum: 'august-authorized', createdAt: '2026-08-31T12:00:00.000Z',
          sourceFileName: 'august.pdf', roster: august, compliance: { score: 100, alerts: [] }, gym: [],
        },
        {
          id: 'local-september', checksum: 'september-authorized', createdAt: '2026-08-30T12:00:00.000Z',
          sourceFileName: 'september.pdf', roster: september, compliance: { score: 100, alerts: [] }, gym: [],
        },
      ]));

      globalThis.fetch = async (input) => {
        if (String(input) === '/api/rosters/active') {
          return new Response(JSON.stringify({
            ok: true,
            // Authorized August identity, September body. Internally inconsistent.
            roster: { id: 'remote-august', checksum: 'august-authorized', year: 2026, month: 8, isActive: true },
            data: { roster: september, compliance: { score: 100, alerts: [] }, gym: [] },
          }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        return new Response(JSON.stringify({ ok: false, message: 'not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
      };

      await assert.rejects(
        () => openActiveRoster(),
        (error) => {
          assert.equal(
            error?.code,
            'ROSTER_PERIOD_MISMATCH',
            `com o relógio em ${iso}, summary autorizado de Agosto com corpo de Setembro deve continuar sendo mismatch nominal, nunca um conflito dispositivo/servidor`,
          );
          return true;
        },
        `mismatch interno da resposta remota não pode mudar de natureza conforme a data (${iso})`,
      );
    } finally {
      restore();
    }
  }

  const databaseSource = fs.readFileSync('client/src/lib/databaseClient.ts', 'utf8');
  const guardIndex = databaseSource.indexOf('if (payload.roster) assertExpectedRosterPeriod(payload.data.roster, payload.roster);');
  const reconcileIndex = databaseSource.indexOf('const reconciliation = reconcileActiveRosterIdentity(');
  assert.ok(guardIndex >= 0, 'o guard de coerência summary/corpo deve existir no materializado');
  assert.ok(reconcileIndex >= 0, 'a reconciliação de identidade deve existir no materializado');
  assert.ok(guardIndex < reconcileIndex, 'o guard de coerência deve preceder a reconciliação de identidade');

  console.log(`[p0-580-boundary-clock-independence] OK — mismatch nominal estável em ${CLOCKS.length} relógios, incluindo pós-boundary e rollover de ano.`);
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
