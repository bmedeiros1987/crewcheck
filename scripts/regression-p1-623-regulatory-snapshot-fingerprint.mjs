import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-623-snapshot-fingerprint-'));

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
  clear() { this.#values.clear(); }
}

const pad2 = (value) => String(value).padStart(2, '0');
const civil = (year, month, day) => `${pad2(day)}/${pad2(month)}/${year}`;
const off = (date) => ({ date, type: 'DO', pairingCode: 'DO', isDayOff: true, legs: [] });

function januaryRoster() {
  const days = [];
  for (let day = 1; day <= 31; day += 1) days.push(off(civil(2032, 1, day)));
  return {
    crewName: 'TRIPULANTE TESTE', crewId: 'BP12345678', base: 'BSB', rank: 'CCM',
    airline: 'LATAM', year: 2032, month: 1, rawText: 'A320', days,
  };
}

function februaryRoster(flyingHours) {
  const days = [];
  for (let day = 1; day <= 29; day += 1) days.push(off(civil(2032, 2, day)));
  days[0] = {
    date: civil(2032, 2, 1),
    type: 'FLIGHT',
    pairingCode: 'PAIR-NO-LEGS',
    dutyReport: null,
    dutyDebrief: null,
    flyingHours,
    legs: [],
  };
  return {
    crewName: 'TRIPULANTE TESTE', crewId: 'BP12345678', base: 'BSB', rank: 'CCM',
    airline: 'LATAM', year: 2032, month: 2, rawText: 'A320', days,
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
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
  localStorage.setItem('crewcheck_auth_token', 'test-token');
  localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'crew-623-fingerprint', email: 'crew@example.test' }));

  const database = await import(`${pathToFileURL(path.join(outDir, 'database-client.mjs')).href}?v=${Date.now()}`);
  assert.equal(typeof database.recomputeComplianceWithRegulatoryHistory, 'function');

  const jan = januaryRoster();
  const janSummary = {
    id: 'jan-fingerprint', checksum: 'jan-fingerprint-checksum', createdAt: '2032-01-31T12:00:00.000Z',
    crewName: jan.crewName, crewId: jan.crewId, base: jan.base, rank: jan.rank, airline: jan.airline,
    year: 2032, month: 1, sourceFileName: 'jan.pdf', score: 100, intensityScore: 0,
    alertsCount: 0, criticalAlertsCount: 0, isActive: false,
  };
  const febSummary = {
    id: 'feb-fingerprint', checksum: 'feb-fingerprint-checksum', createdAt: '2032-02-01T12:00:00.000Z',
    crewName: 'TRIPULANTE TESTE', crewId: 'BP12345678', base: 'BSB', rank: 'CCM', airline: 'LATAM',
    year: 2032, month: 2, sourceFileName: 'feb.pdf', score: 100, intensityScore: 0,
    alertsCount: 0, criticalAlertsCount: 0, isActive: true,
  };

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.startsWith('/api/rosters?')) return json({ ok: true, rosters: [febSummary, janSummary] });
    if (url.includes('/api/rosters/jan-fingerprint')) return json({ ok: true, data: { roster: jan, compliance: null, gym: [] } });
    return json({ ok: false }, 404);
  };

  const first = await database.recomputeComplianceWithRegulatoryHistory(februaryRoster(4));
  assert.equal(first.history.previousPeriodFound, true);
  assert.equal(first.compliance.metrics.totalFlightHours, 4,
    'baseline sem pernas deve usar flyingHours=4');

  const changed = await database.recomputeComplianceWithRegulatoryHistory(februaryRoster(5));
  assert.equal(changed.history.previousPeriodFound, true);
  assert.equal(changed.compliance.metrics.totalFlightHours, 5,
    'snapshot deve invalidar quando flyingHours consumido pelo compliance muda');

  console.log('[regression:p1-623-snapshot-fingerprint] PASS — snapshot invalida mudança regulatória em flyingHours.');
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
