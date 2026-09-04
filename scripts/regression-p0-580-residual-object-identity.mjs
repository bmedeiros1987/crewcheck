// P0 #580 — adversarial counter-proof: the residual continuity scan must reuse the
// objects produced by the count-aware overlap filter, not re-derive them.
//
// dedupeAdjacentRosterDays returns the original day object when every leg survives,
// but returns a CLONE ({ ...clearPartialDutyMetadata(day), legs: kept }) when a day is
// only partially consumed. continuationTailLocal builds nextAnchors from one filtered
// result and then matches each residual day back to its anchor by reference
// (`candidate.day === day`).
//
// Fail-before: while the scan re-derived its own dedupe
// (`const residualDays = dedupeAdjacentRosterDays(previousRoster.days || [], nextRoster.days || [])`)
// the two calls produced two distinct clones of the partially-consumed boundary day.
// The reference lookup then found no anchor and the fail-closed branch discarded the
// whole continuation — so a legitimate physical continuation across the boundary was
// silently lost whenever the boundary day carried a partial leg overlap.
//
// This is the case that makes the two spellings inequivalent, which is why the
// materialized contract pins the referential form.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { freezeFixtureClock } from './p0-580-transposed-vc-boundary/fixed-clock.mjs';

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-580-residual-identity-'));

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

  freezeFixtureClock();
  globalThis.localStorage = new MemoryStorage();
  globalThis.sessionStorage = new MemoryStorage();
  globalThis.window = { location: { origin: 'https://crewcheck.test' }, dispatchEvent() {} };
  localStorage.setItem('crewcheck_auth_token', 'test-token');
  localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'crew-identity', email: 'crew@example.test' }));

  const august = publication(2026, 8, [
    flightDay('29/08/2026', 'AUG-A', 'LA9300', 'BSB', 'AAA', '08:00', '07:00'),
    flightDay('30/08/2026', 'AUG-B', 'LA9301', 'AAA', 'BBB', '09:00', '08:00'),
  ], 'AUGUST-PRIMARY');

  // The boundary day is only PARTIALLY consumed by the overlap: LA9301 repeats the
  // August carry-out, LA9302 is genuinely new. This is what forces the clone.
  const partiallyOverlappingBoundaryDay = {
    date: '2026-08-30',
    type: 'FLIGHT',
    pairingCode: 'SEP-BOUNDARY',
    dutyReport: '08:10',
    legs: [
      leg('LA9301', 'AAA', 'BBB', '09:00'),
      leg('LA9302', 'BBB', 'CCC', '12:00'),
    ],
  };
  const september = publication(2026, 9, [
    partiallyOverlappingBoundaryDay,
    flightDay('2026-09-01', 'SEP-NEXT', 'LA9303', 'CCC', 'BSB', '10:00', '09:00'),
  ], 'SEPTEMBER-PRIMARY');

  localStorage.setItem('crewcheck_local_history_v11_crew-identity', JSON.stringify([
    {
      id: 'local-august-identity', checksum: 'august-identity', createdAt: '2026-08-31T12:00:00.000Z',
      sourceFileName: 'august-identity.pdf', roster: august, compliance: { score: 100, alerts: [] }, gym: [],
    },
    {
      id: 'local-september-identity', checksum: 'september-identity', createdAt: '2026-08-30T12:00:00.000Z',
      sourceFileName: 'september-identity.pdf', roster: september, compliance: { score: 100, alerts: [] }, gym: [],
    },
  ]));

  const { openActiveRoster } = await import(`${pathToFileURL(path.join(outDir, 'database-client.mjs')).href}?v=${Date.now()}`);

  globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, message: 'offline' }), {
    status: 503,
    headers: { 'content-type': 'application/json' },
  });

  const result = await openActiveRoster();
  const flightNumbers = (result.roster.days || []).flatMap((day) => (day.legs || []).map((item) => item.flightNumber));

  assert.equal(
    flightNumbers.filter((value) => value === 'LA9301').length,
    1,
    'a perna repetida no boundary deve ser consumida exatamente uma vez pelo dedupe count-aware',
  );
  assert.ok(
    flightNumbers.includes('LA9302'),
    'a perna nova do dia parcialmente sobreposto precisa sobreviver: é ela que prova que o clone do dedupe foi reaproveitado por referência',
  );
  assert.ok(
    flightNumbers.includes('LA9303'),
    'a continuação física posterior não pode ser descartada por falha de casamento referencial no dia parcialmente sobreposto',
  );

  console.log('[p0-580-residual-object-identity] OK — continuidade sobrevive ao clone de overlap parcial; identidade referencial preservada.');
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
