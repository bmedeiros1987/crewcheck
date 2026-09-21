import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-623-review-blockers-'));

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
const flight = (date, hours) => ({
  date,
  type: 'FLIGHT',
  pairingCode: `PAIR-${date}`,
  dutyReport: '08:00',
  dutyDebrief: '10:00',
  legs: [{
    flightNumber: 'LA9000', origin: 'AAA', destination: 'BBB',
    departureTime: '08:00', arrivalTime: '10:00', duration: hours,
    aircraftType: 'A320',
  }],
});

function januaryRoster({ overlapHours = 0 } = {}) {
  const days = [];
  for (let day = 1; day <= 31; day += 1) days.push(off(civil(2032, 1, day)));
  if (overlapHours > 0) days.push(flight('01/02/2032', overlapHours));
  return {
    crewName: 'TRIPULANTE TESTE', crewId: 'BP12345678', base: 'BSB', rank: 'CCM',
    airline: 'LATAM', year: 2032, month: 1, rawText: 'A320', days,
  };
}

function februaryRoster(hours = 50) {
  const days = [];
  for (let day = 1; day <= 29; day += 1) days.push(off(civil(2032, 2, day)));
  days[0] = flight(civil(2032, 2, 1), hours);
  return {
    crewName: 'TRIPULANTE TESTE', crewId: 'BP12345678', base: 'BSB', rank: 'CCM',
    airline: 'LATAM', year: 2032, month: 2, rawText: 'A320', days,
  };
}

const violation = (result) => (result.alerts || []).some((alert) =>
  alert?.title === 'Limite de 28 dias de horas de voo excedido' && alert?.classification === 'confirmada');
const incomplete = (result) => (result.alerts || []).some((alert) => /28 dias.*incompleta/i.test(String(alert?.title || '')));

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
  const auth = () => {
    localStorage.setItem('crewcheck_auth_token', 'test-token');
    localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'crew-623', email: 'crew@example.test' }));
  };
  auth();

  const database = await import(`${pathToFileURL(path.join(outDir, 'database-client.mjs')).href}?v=${Date.now()}`);
  assert.equal(typeof database.recomputeComplianceWithRegulatoryHistory, 'function');

  const feb = februaryRoster(50);
  const febSummary = {
    id: 'feb-id', checksum: 'feb-checksum', createdAt: '2032-02-01T12:00:00.000Z',
    crewName: feb.crewName, crewId: feb.crewId, base: feb.base, rank: feb.rank, airline: feb.airline,
    year: 2032, month: 2, sourceFileName: 'feb.pdf', score: 100, intensityScore: 0,
    alertsCount: 0, criticalAlertsCount: 0, isActive: true,
  };

  // BLOCKER 1: conta sem janeiro + janeiro apenas local nunca pode provar cobertura online.
  const janLocal = januaryRoster();
  globalThis.fetch = async () => json({ ok: false }, 503);
  await database.saveRosterAnalysis({
    roster: janLocal,
    compliance: { score: 100, alerts: [], metrics: {} },
    gym: [],
    sourceFileName: 'jan-local.pdf',
  });
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.startsWith('/api/rosters?')) return json({ ok: true, rosters: [febSummary] });
    return json({ ok: false }, 404);
  };
  const localOnly = await database.recomputeComplianceWithRegulatoryHistory(feb);
  assert.equal(localOnly.history.complete, false,
    'conta sem competência anterior não pode aceitar publicação apenas local como prova regulatória');
  assert.equal(localOnly.history.previousPeriodFound, false,
    'competência anterior deve ser considerada ausente quando não existe na resposta da conta');
  assert.equal(incomplete(localOnly.compliance), true,
    'ausência remota da competência anterior deve preservar avaliação incompleta');

  // BLOCKER 2: carry-out de janeiro em 01/02 não pode duplicar o dia soberano de fevereiro.
  localStorage.clear();
  sessionStorage.clear();
  auth();
  const janOverlap = januaryRoster({ overlapHours: 50 });
  const janSummary = {
    id: 'jan-id', checksum: 'jan-overlap-checksum', createdAt: '2032-01-31T12:00:00.000Z',
    crewName: janOverlap.crewName, crewId: janOverlap.crewId, base: janOverlap.base, rank: janOverlap.rank, airline: janOverlap.airline,
    year: 2032, month: 1, sourceFileName: 'jan.pdf', score: 100, intensityScore: 0,
    alertsCount: 0, criticalAlertsCount: 0, isActive: false,
  };
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.startsWith('/api/rosters?')) return json({ ok: true, rosters: [febSummary, janSummary] });
    if (url.includes('/api/rosters/jan-id')) return json({ ok: true, data: { roster: janOverlap, compliance: null, gym: [] } });
    return json({ ok: false }, 404);
  };
  const overlap = await database.recomputeComplianceWithRegulatoryHistory(feb);
  assert.equal(overlap.history.complete, true, 'janeiro remoto comprovado deve completar o histórico');
  assert.equal(overlap.compliance.metrics.totalFlightHours, 50, 'KPI de fevereiro deve permanecer 50h');
  assert.equal(violation(overlap.compliance), false,
    '01/02 deve ser contado uma única vez, com precedência da publicação nominal de fevereiro');

  console.log('[p0-623-review-blockers] PASS — prova remota obrigatória e overlap nominal deduplicado.');
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
