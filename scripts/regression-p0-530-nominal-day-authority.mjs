import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-530-nominal-day-'));

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
  clear() { this.#values.clear(); }
}

const leg = (flightNumber, origin, destination, departureTime, arrivalTime) => ({
  flightNumber, origin, destination, departureTime, arrivalTime,
});

const flightDay = (date, pairingCode, legs) => ({
  date,
  type: 'FLIGHT',
  pairingCode,
  dutyReport: '14:00',
  dutyDebrief: '23:30',
  legs,
});

function augustPublication() {
  return {
    crewName: 'CREW TESTE',
    crewId: 'NOMINALDAY',
    base: 'BSB',
    year: 2026,
    month: 8,
    rawText: 'AUGUST PUBLICATION WITH STALE SEPTEMBER CARRY-OUT',
    days: [
      { date: '2026-08-31', type: 'DO', pairingCode: 'DO', isDayOff: true, legs: [] },
      flightDay('2026-09-01', 'AUG-CARRY-OUT', [
        leg('LA1001', 'AAA', 'BBB', '14:30', '16:00'),
        leg('LA1002', 'BBB', 'CCC', '17:00', '18:30'),
      ]),
    ],
  };
}

function septemberPublication() {
  return {
    crewName: 'CREW TESTE',
    crewId: 'NOMINALDAY',
    base: 'BSB',
    year: 2026,
    month: 9,
    rawText: 'SEPTEMBER CORRECTED PUBLICATION',
    days: [
      flightDay('2026-09-01', 'SEP-01', [
        leg('LA2001', 'FLN', 'BSB', '14:40', '16:55'),
        leg('LA2002', 'BSB', 'FLN', '18:05', '19:45'),
        leg('LA2003', 'FLN', 'BSB', '21:05', '23:09'),
      ]),
      { date: '2026-09-02', type: 'DO', pairingCode: 'DO', isDayOff: true, legs: [] },
    ],
  };
}

function dateKey(value) {
  const raw = String(value || '');
  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return raw;
  match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : raw;
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

  globalThis.localStorage = new MemoryStorage();
  globalThis.sessionStorage = new MemoryStorage();
  globalThis.window = { location: { origin: 'https://crewcheck.test' }, dispatchEvent() {} };
  localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'nominal-day-e2e', email: 'nominal-day@example.test' }));

  const database = await import(`${pathToFileURL(path.join(outDir, 'database-client.mjs')).href}?v=${Date.now()}`);
  const compliance = { score: 100, alerts: [] };
  const august = augustPublication();
  const september = septemberPublication();

  await database.saveRosterAnalysis({ roster: august, compliance, gym: [], sourceFileName: 'august.pdf' });
  await database.saveRosterAnalysis({ roster: september, compliance, gym: [], sourceFileName: 'september.pdf' });

  const windowRoster = await database.openRosterDisplayWindow(september);
  const septemberFirst = (windowRoster.days || []).filter((day) => dateKey(day.date) === '2026-09-01');

  assert.equal(
    septemberFirst.length,
    1,
    'nominal September publication must own the entire 01/09 civil day; stale August carry-out must not survive as a second row',
  );
  assert.deepEqual(
    (septemberFirst[0]?.legs || []).map((item) => item.flightNumber),
    ['LA2001', 'LA2002', 'LA2003'],
    'nominal publication must replace the whole boundary day, not append stale carry-over legs by per-leg dedupe',
  );

  console.log('[P0-530] PASS — nominal competence is sovereign for the complete civil day at adjacent-month boundaries.');
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
