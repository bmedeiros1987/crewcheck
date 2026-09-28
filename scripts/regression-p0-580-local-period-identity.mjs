import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-580-local-period-identity-'));

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
}

function resetEnvironment() {
  globalThis.localStorage = new MemoryStorage();
  globalThis.sessionStorage = new MemoryStorage();
  globalThis.window = { location: { origin: 'https://crewcheck.test' }, dispatchEvent() {} };
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, message: 'offline' }), {
    status: 503,
    headers: { 'content-type': 'application/json' },
  });
  localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'device-account', email: 'device@example.test' }));
}

const roster = (crewName, suffix, flightNumber) => ({
  crewName,
  crewId: '',
  base: 'BSB',
  year: 2026,
  month: 9,
  rawText: `RAW-${suffix}`,
  days: [{
    date: '05/09/2026',
    type: 'FLIGHT',
    pairingCode: `P-${suffix}`,
    dutyReport: '07:00',
    legs: [{ flightNumber, origin: 'BSB', destination: 'AAA', departureTime: '08:00' }],
  }],
});

async function loadModule(tag) {
  return import(`${pathToFileURL(path.join(outDir, 'database-client.mjs')).href}?${tag}-${Date.now()}-${Math.random()}`);
}

async function saveReloadReopen(firstRoster, secondRoster, label) {
  resetEnvironment();
  const firstModule = await loadModule(`${label}-save`);
  const first = await firstModule.saveRosterAnalysis({ roster: firstRoster, compliance: { score: 100, alerts: [] }, gym: [], sourceFileName: `${label}-1.pdf` });
  const second = await firstModule.saveRosterAnalysis({ roster: secondRoster, compliance: { score: 100, alerts: [] }, gym: [], sourceFileName: `${label}-2.pdf` });

  assert.notEqual(first.id, second.id, `${label}: identidade não verificável não pode reutilizar o mesmo id/slot local`);

  const history = JSON.parse(localStorage.getItem('crewcheck_local_history_v11_device-account') || '[]');
  assert.equal(history.length, 2, `${label}: duas publicações não verificáveis da mesma competência devem sobreviver no histórico`);

  const reloaded = await loadModule(`${label}-reload`);
  const openedFirst = await reloaded.openSavedRoster(first.id, first);
  const openedSecond = await reloaded.openSavedRoster(second.id, second);
  assert.equal(openedFirst.roster.rawText, firstRoster.rawText, `${label}: após reload, a primeira publicação deve reabrir a si própria`);
  assert.equal(openedSecond.roster.rawText, secondRoster.rawText, `${label}: após reload, a segunda publicação deve reabrir a si própria`);
}

try {
  const source = fs.readFileSync('client/src/lib/databaseClient.ts', 'utf8');
  assert.match(source, /P0_580_LOCAL_PERIOD_IDENTITY_GUARD/, 'o guard de identidade mensal local deve estar materializado');
  assert.match(source, /function localRosterPeriodIdentity\(roster: CrewRoster\): string \| null/, 'identidade de período não verificável deve ser representada como null');
  assert.match(source, /const crew = crewIdentityToken\(roster\);/, 'period identity deve usar a mesma política canônica de crewIdentityToken');
  assert.match(source, /const previous = periodIdentity\s*\?/, 'publicação sem identidade verificável não pode procurar previous por competência');
  assert.match(source, /!periodIdentity \|\| localRosterPeriodIdentity\(candidate\.roster\) !== periodIdentity/, 'merge local deve preservar publicações não verificáveis existentes');

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

  await saveReloadReopen(
    roster('Tripulante', 'generic-a', 'LA8100'),
    roster('Tripulante', 'generic-b', 'LA8200'),
    'generic-default-name',
  );

  await saveReloadReopen(
    roster('', 'empty-a', 'LA8300'),
    roster('', 'empty-b', 'LA8400'),
    'empty-identity',
  );

  console.log('[p0-580-local-period-identity] OK — generic/empty crew identities do not collapse save→localStorage→reload→reopen publications.');
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
