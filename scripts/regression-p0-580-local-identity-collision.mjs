// P0 #580 — local publication identity must be unique per crew member.
//
// The generated local id was `local-<scope>-<year>-<month>`, where <scope> is the
// ACCOUNT that owns the history on the device, not the crew member the publication
// belongs to. The history itself keeps two crew members' rosters for the same
// competence apart (periodHistoryKey carries the crew), so both entries are retained
// — and both answer to the same id.
//
// findLocalRoster then returned the first entry with that id, which after sorting by
// createdAt is simply the one saved most recently. The correct publication was chosen
// by summary and the wrong one opened by id, and assertExpectedRosterPeriod could not
// see it: both rosters really are the same competence. The result is one crew member's
// duty schedule rendered inside another's session, with every downstream consumer
// (compliance, Smart Departure, alerts, Watch) then reasoning about the wrong person.
//
// Fail-before, through saveRosterAnalysis + openSavedRoster with no internals mocked:
//   summary A -> id=local-device-account-2026-08 crew=ANA PILOTO
//   summary B -> id=local-device-account-2026-08 crew=BRUNO COPILOTO
//   abrir pelo summary de ANA -> crewName=BRUNO COPILOTO
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-580-identity-collision-'));

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
}

const leg = (flightNumber, origin, destination, departureTime) => ({ flightNumber, origin, destination, departureTime });
const flightDay = (date, pairingCode, flightNumber, origin, destination, departureTime, dutyReport) => ({
  date, type: 'FLIGHT', pairingCode, dutyReport, legs: [leg(flightNumber, origin, destination, departureTime)],
});
const publication = (crewName, crewId, days) => ({
  crewName, crewId, base: 'BSB', year: 2026, month: 8, rawText: `${crewId}-RAW`, days,
});

function resetEnvironment(scopeId) {
  globalThis.localStorage = new MemoryStorage();
  globalThis.sessionStorage = new MemoryStorage();
  globalThis.window = { location: { origin: 'https://crewcheck.test' }, dispatchEvent() {} };
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, message: 'offline' }), {
    status: 503, headers: { 'content-type': 'application/json' },
  });
  localStorage.setItem('crewcheck_auth_token', 'test-token');
  localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: scopeId, email: `${scopeId}@example.test` }));
}

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

  const { saveRosterAnalysis, openSavedRoster } = await import(`${pathToFileURL(path.join(outDir, 'database-client.mjs')).href}?v=${Date.now()}`);

  const ana = publication('ANA PILOTO', '11111111', [flightDay('05/08/2026', 'A1', 'LA1000', 'BSB', 'AAA', '08:00', '07:00')]);
  const bruno = publication('BRUNO COPILOTO', '22222222', [flightDay('05/08/2026', 'B1', 'LA2000', 'BSB', 'ZZZ', '09:00', '08:00')]);

  // --- 1. Two crew members, one competence, one device account. ---
  resetEnvironment('device-account');
  const summaryAna = await saveRosterAnalysis({ roster: ana, compliance: { score: 100, alerts: [] }, gym: [], sourceFileName: 'ana.pdf' });
  const summaryBruno = await saveRosterAnalysis({ roster: bruno, compliance: { score: 100, alerts: [] }, gym: [], sourceFileName: 'bruno.pdf' });

  assert.notEqual(summaryAna.id, summaryBruno.id, 'duas publicações de tripulantes diferentes na mesma competência não podem compartilhar o id local');

  const openedAna = await openSavedRoster(summaryAna.id, summaryAna);
  assert.equal(openedAna.roster.crewId, ana.crewId, 'abrir pelo summary de um tripulante deve devolver a escala dele');
  const openedBruno = await openSavedRoster(summaryBruno.id, summaryBruno);
  assert.equal(openedBruno.roster.crewId, bruno.crewId, 'a segunda publicação também deve abrir a própria escala');

  // --- 2. Entries already stored with the pre-fix colliding id. Changing the id
  // format only protects new saves; devices in the field already hold collisions,
  // so the by-id lookup itself must resolve by identity. ---
  resetEnvironment('device-account');
  const collidingId = 'local-device-account-2026-08';
  localStorage.setItem('crewcheck_local_history_v11_device-account', JSON.stringify([
    { id: collidingId, checksum: 'bruno-legacy', createdAt: '2026-08-31T14:00:00.000Z', sourceFileName: 'bruno.pdf', roster: bruno, compliance: { score: 100, alerts: [] }, gym: [] },
    { id: collidingId, checksum: 'ana-legacy', createdAt: '2026-08-30T14:00:00.000Z', sourceFileName: 'ana.pdf', roster: ana, compliance: { score: 100, alerts: [] }, gym: [] },
  ]));

  const legacyAna = await openSavedRoster(collidingId, { id: collidingId, year: 2026, month: 8, crewId: ana.crewId, crewName: ana.crewName });
  assert.equal(legacyAna.roster.crewId, ana.crewId, 'id legado compartilhado deve ser desambiguado pela identidade pedida, não pelo mais recente');

  const legacyBruno = await openSavedRoster(collidingId, { id: collidingId, year: 2026, month: 8, crewId: bruno.crewId, crewName: bruno.crewName });
  assert.equal(legacyBruno.roster.crewId, bruno.crewId, 'o outro tripulante também deve resolver para a própria escala sob o id compartilhado');

  // --- 3. Fail closed: the asked-for identity is simply not on the device. Returning
  // "the other entry with that id" is the leak this guard exists to stop. ---
  resetEnvironment('device-account');
  localStorage.setItem('crewcheck_local_history_v11_device-account', JSON.stringify([
    { id: collidingId, checksum: 'bruno-only', createdAt: '2026-08-31T14:00:00.000Z', sourceFileName: 'bruno.pdf', roster: bruno, compliance: { score: 100, alerts: [] }, gym: [] },
  ]));
  await assert.rejects(
    () => openSavedRoster(collidingId, { id: collidingId, year: 2026, month: 8, crewId: ana.crewId, crewName: ana.crewName }),
    (error) => {
      assert.equal(error?.code, 'ROSTER_IDENTITY_MISMATCH', 'a recusa deve ser explícita, não um erro genérico de rede');
      return true;
    },
    'pedir a escala de um tripulante ausente nunca pode devolver a de outro',
  );

  // --- 4. An unverifiable expectation must not be treated as agreement with
  // whatever happens to be stored. ---
  resetEnvironment('device-account');
  const anonymous = publication('', '', [flightDay('05/08/2026', 'X1', 'LA3000', 'BSB', 'CCC', '10:00', '09:00')]);
  const summaryAnonymous = await saveRosterAnalysis({ roster: anonymous, compliance: { score: 100, alerts: [] }, gym: [], sourceFileName: 'sem-identidade.pdf' });
  const summaryAna2 = await saveRosterAnalysis({ roster: ana, compliance: { score: 100, alerts: [] }, gym: [], sourceFileName: 'ana.pdf' });
  assert.notEqual(summaryAnonymous.id, summaryAna2.id, 'publicação sem identidade verificável não pode ocupar o mesmo slot de quem tem identidade');
  const openedAna2 = await openSavedRoster(summaryAna2.id, summaryAna2);
  assert.equal(openedAna2.roster.crewId, ana.crewId, 'a publicação identificada continua abrindo a própria escala');

  const databaseSource = fs.readFileSync('client/src/lib/databaseClient.ts', 'utf8');
  assert.match(databaseSource, /function crewIdentityToken\(/, 'a normalização de identidade deve existir em um único lugar');
  assert.match(databaseSource, /function findLocalRoster\(id: string, expected\?/, 'a busca por id deve receber a identidade esperada');
  assert.match(databaseSource, /assertExpectedRosterCrew\(local\.roster, expected\);/, 'a abertura local deve validar identidade, não só competência');
  assert.doesNotMatch(databaseSource, /return readLocalHistory\(\)\.find\(\(item\) => item\.id === id \|\| item\.checksum === id\) \|\| null;/, 'a busca por id sem identidade não pode sobreviver');
  const historyGenerator = fs.readFileSync('scripts/v14338/apply.mjs', 'utf8');
  assert.match(historyGenerator, /localRosterIdentitySlug\(roster\)/, 'o id gerado deve carregar a identidade do tripulante');

  console.log('[p0-580-local-identity-collision] OK — id local único por tripulante, id legado desambiguado por identidade e fail-closed quando a identidade pedida não está no dispositivo.');
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
