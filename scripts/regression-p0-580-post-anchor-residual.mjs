import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { freezeFixtureClock } from './p0-580-transposed-vc-boundary/fixed-clock.mjs';

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-580-post-anchor-'));

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
}

const leg = (flightNumber, origin, destination, departureTime) => ({ flightNumber, origin, destination, departureTime });
const flightDay = (date, pairingCode, flightNumber, origin, destination, departureTime) => ({
  date, type: 'FLIGHT', pairingCode, dutyReport: '07:00', legs: [leg(flightNumber, origin, destination, departureTime)],
});
const roster = (month, days, rawText) => ({ crewName: 'TRIPULANTE TESTE', crewId: '00000000', base: 'BSB', year: 2026, month, rawText, days });

try {
  await build({
    configFile: false,
    logLevel: 'silent',
    resolve: { alias: { '@shared': path.resolve('shared') } },
    build: { lib: { entry: path.resolve('client/src/lib/databaseClient.ts'), formats: ['es'], fileName: () => 'database-client.mjs' }, outDir, emptyOutDir: true, minify: false },
  });

  freezeFixtureClock();
  globalThis.localStorage = new MemoryStorage();
  globalThis.sessionStorage = new MemoryStorage();
  globalThis.window = { location: { origin: 'https://crewcheck.test' }, dispatchEvent() {} };
  localStorage.setItem('crewcheck_auth_token', 'test-token');
  localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'crew-post-anchor', email: 'crew@example.test' }));

  const august = roster(8, [
    flightDay('29/08/2026', 'AUG-A', 'TST200', 'BSB', 'AAA', '08:00'),
    flightDay('01/09/2026', 'AUG-B', 'TST201', 'AAA', 'BBB', '09:00'),
    flightDay('02/09/2026', 'AUG-C', 'TST202', 'BBB', 'CCC', '10:00'),
  ], 'AUGUST-POST-ANCHOR');

  const overlaps = [
    flightDay('2026-08-29', 'SEP-A', 'TST200', 'BSB', 'AAA', '08:00'),
    flightDay('2026-09-01', 'SEP-B', 'TST201', 'AAA', 'BBB', '09:00'),
    flightDay('2026-09-02', 'SEP-C', 'TST202', 'BBB', 'CCC', '10:00'),
  ];

  const blockedSeptember = roster(9, [
    ...overlaps,
    flightDay('2026-09-03', 'FIRST-VALID', 'TST203', 'CCC', 'DDD', '11:00'),
    { date: '2026-09-04', type: 'CRM', pairingCode: 'MISSING', legs: [] },
  ], 'SEPTEMBER-POST-ANCHOR-BLOCKED');

  const validSeptember = roster(9, [
    ...overlaps,
    flightDay('2026-09-03', 'FIRST-VALID', 'TST203', 'CCC', 'DDD', '11:00'),
    flightDay('2026-09-04', 'SECOND-VALID', 'TST204', 'DDD', 'BSB', '12:00'),
  ], 'SEPTEMBER-POST-ANCHOR-VALID');

  const setHistory = (adjacent, checksum) => localStorage.setItem('crewcheck_local_history_v11_crew-post-anchor', JSON.stringify([
    { id: 'local-august-post-anchor', checksum: 'august-post-anchor', createdAt: '2026-08-31T14:00:00.000Z', sourceFileName: 'august.pdf', roster: august, compliance: { score: 100, alerts: [] }, gym: [] },
    { id: `local-${checksum}`, checksum, createdAt: '2026-08-30T14:00:00.000Z', sourceFileName: 'september.pdf', roster: adjacent, compliance: { score: 100, alerts: [] }, gym: [] },
  ]));

  const onlineAugust = async (input) => {
    if (String(input) === '/api/rosters/active') return new Response(JSON.stringify({
      ok: true,
      roster: { id: 'remote-august-post-anchor', checksum: 'august-post-anchor', year: 2026, month: 8, isActive: true },
      data: { roster: august, compliance: { score: 100, alerts: [] }, gym: [] },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ ok: false }), { status: 404, headers: { 'content-type': 'application/json' } });
  };
  const offline = async () => new Response(JSON.stringify({ ok: false, message: 'offline' }), { status: 503, headers: { 'content-type': 'application/json' } });

  const { openActiveRoster } = await import(`${pathToFileURL(path.join(outDir, 'database-client.mjs')).href}?v=${Date.now()}`);

  for (const [label, fetchImpl] of [['online', onlineAugust], ['offline', offline]]) {
    setHistory(blockedSeptember, 'september-blocked');
    globalThis.fetch = fetchImpl;
    const result = await openActiveRoster();
    assert.ok(!result.roster.days.some((day) => day.pairingCode === 'FIRST-VALID'), `${label}: primeira âncora válida não pode autorizar resíduo posterior incerto`);
    assert.ok(!result.roster.days.some((day) => day.pairingCode === 'MISSING'), `${label}: resíduo posterior incerto não pode ser anexado`);
  }

  for (const [label, fetchImpl] of [['online', onlineAugust], ['offline', offline]]) {
    setHistory(validSeptember, 'september-valid');
    globalThis.fetch = fetchImpl;
    const result = await openActiveRoster();
    assert.ok(result.roster.days.some((day) => day.pairingCode === 'FIRST-VALID'), `${label}: primeira perna contínua legítima deve ser preservada`);
    assert.ok(result.roster.days.some((day) => day.pairingCode === 'SECOND-VALID'), `${label}: segunda perna contínua legítima deve ser preservada`);
  }

  const databaseSource = fs.readFileSync('client/src/lib/databaseClient.ts', 'utf8');
  assert.match(databaseSource, /P0_580_POST_ANCHOR_RESIDUAL_GUARD/, 'produção materializada deve validar resíduos posteriores à primeira âncora');
  assert.match(databaseSource, /previousResidualAnchor = anchor;/, 'produção deve avançar a âncora validada ao percorrer toda a cadeia');
  assert.doesNotMatch(databaseSource, /firstNext = anchor;\s*break;/, 'produção não pode encerrar a validação na primeira âncora');

  console.log('[p0-580-post-anchor-residual] OK — resíduos posteriores à primeira âncora são validados online/offline.');
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
