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

  // --- 5. The same collision is destructive on the delete path: removing "every entry
  // with this id" wiped the other crew member's roster as collateral. ---
  resetEnvironment('device-account');
  const historyKey = 'crewcheck_local_history_v11_device-account';
  localStorage.setItem(historyKey, JSON.stringify([
    { id: collidingId, checksum: 'bruno-legacy', createdAt: '2026-08-31T14:00:00.000Z', sourceFileName: 'bruno.pdf', roster: bruno, compliance: { score: 100, alerts: [] }, gym: [] },
    { id: collidingId, checksum: 'ana-legacy', createdAt: '2026-08-30T14:00:00.000Z', sourceFileName: 'ana.pdf', roster: ana, compliance: { score: 100, alerts: [] }, gym: [] },
  ]));
  const { deleteRosterAnalysis } = await import(`${pathToFileURL(path.join(outDir, 'database-client.mjs')).href}?v=${Date.now()}-delete`);
  await deleteRosterAnalysis(collidingId, { crewId: ana.crewId, crewName: ana.crewName });
  const remaining = JSON.parse(localStorage.getItem(historyKey));
  assert.equal(remaining.length, 1, 'apagar sob um id compartilhado não pode levar junto a escala do outro tripulante');
  assert.equal(remaining[0].roster.crewId, bruno.crewId, 'a publicação que sobra deve ser exatamente a que não foi pedida');

  // Ambiguous id with no identity given: refuse rather than guess on a destructive op.
  resetEnvironment('device-account');
  localStorage.setItem(historyKey, JSON.stringify([
    { id: collidingId, checksum: 'bruno-legacy', createdAt: '2026-08-31T14:00:00.000Z', sourceFileName: 'bruno.pdf', roster: bruno, compliance: { score: 100, alerts: [] }, gym: [] },
    { id: collidingId, checksum: 'ana-legacy', createdAt: '2026-08-30T14:00:00.000Z', sourceFileName: 'ana.pdf', roster: ana, compliance: { score: 100, alerts: [] }, gym: [] },
  ]));
  await deleteRosterAnalysis(collidingId);
  assert.equal(JSON.parse(localStorage.getItem(historyKey)).length, 2, 'id ambíguo sem identidade não pode apagar nada');

  // --- 6. Fail-open in assertExpectedRosterCrew: a verifiable expectation must not be
  // satisfied by an answer whose own identity cannot be verified. The remote branch is
  // where this bites — the local branch already refuses earlier, in the lookup — so the
  // scenarios below drive a non-local id through the server attempts.
  //
  // Fail-before on 664b656: `if (!wanted || !actual || wanted === actual) return;`
  // returned silently whenever the answer carried no crew, so a crew-less body of the
  // right competence was accepted as Alpha's roster.
  const alpha = publication('ALPHA TRIPULANTE', '33333333', [flightDay('06/08/2026', 'AL1', 'LA4000', 'BSB', 'AAA', '08:00', '07:00')]);
  const crewless = { ...publication('', '', [flightDay('06/08/2026', 'XX1', 'LA4000', 'BSB', 'AAA', '08:00', '07:00')]) };
  const remoteId = 'remote-alpha-2026-08';
  const expectedAlpha = { id: remoteId, year: 2026, month: 8, crewId: alpha.crewId, crewName: alpha.crewName };

  const serveRemote = (roster) => {
    globalThis.fetch = async (input) => {
      if (String(input).startsWith(`/api/rosters/${remoteId}`) || String(input).includes(`id=${remoteId}`)) {
        return new Response(JSON.stringify({ ok: true, data: { roster, compliance: { score: 100, alerts: [] }, gym: [] } }), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: false, message: 'not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
    };
  };

  // (1) expected Alpha + corpo da mesma competência sem identidade => recusa explícita.
  resetEnvironment('device-account');
  serveRemote(crewless);
  await assert.rejects(
    () => openSavedRoster(remoteId, expectedAlpha),
    (error) => {
      assert.equal(error?.code, 'ROSTER_IDENTITY_MISMATCH', 'corpo sem identidade verificável não pode satisfazer uma expectativa verificável');
      assert.equal(error?.actualCrew, 'unverified', 'a recusa deve dizer que a identidade do corpo não pôde ser verificada');
      return true;
    },
    'ausência de identidade no corpo não é prova de concordância',
  );

  // (2) expected Alpha + corpo Alpha => passa.
  resetEnvironment('device-account');
  serveRemote(alpha);
  const openedAlpha = await openSavedRoster(remoteId, expectedAlpha);
  assert.equal(openedAlpha.roster.crewId, alpha.crewId, 'corpo do próprio tripulante deve continuar abrindo normalmente');

  // (3) expectativa sem identidade não pode adivinhar entre candidatos ambíguos.
  resetEnvironment('device-account');
  localStorage.setItem('crewcheck_local_history_v11_device-account', JSON.stringify([
    { id: collidingId, checksum: 'bruno-ambiguous', createdAt: '2026-08-31T14:00:00.000Z', sourceFileName: 'bruno.pdf', roster: bruno, compliance: { score: 100, alerts: [] }, gym: [] },
    { id: collidingId, checksum: 'ana-ambiguous', createdAt: '2026-08-30T14:00:00.000Z', sourceFileName: 'ana.pdf', roster: ana, compliance: { score: 100, alerts: [] }, gym: [] },
  ]));
  await assert.rejects(
    () => openSavedRoster(collidingId, { id: collidingId, year: 2026, month: 8 }),
    () => true,
    'sem identidade na expectativa, um id ambíguo não pode devolver um dos candidatos por sorteio',
  );

  // --- 7. Generic/default crew names are not identity.
  //
  // crewIdentityToken rejected sentinel crewIds but accepted ANY non-empty crewName, so
  // the parser's own default label reached it as an ordinary string and became
  // NAME:TRIPULANTE. Two unrelated publications of the same competence, neither with a
  // verifiable id, both carrying the default name, then looked like one crew member to
  // periodHistoryKey, findLocalRoster and openSavedRoster alike.
  const genericOne = {
    ...publication('Tripulante', '', [flightDay('07/08/2026', 'G1', 'LA5000', 'BSB', 'AAA', '08:00', '07:00')]),
    rawText: 'GENERIC-ONE',
  };
  const genericTwo = {
    ...publication('TRIPULANTE', 'UNKNOWN', [flightDay('07/08/2026', 'G2', 'LA6000', 'BSB', 'ZZZ', '09:00', '08:00')]),
    rawText: 'GENERIC-TWO',
  };
  const genericId = 'local-device-account-2026-08';

  // (1) legacy collision + generic identity: never the first candidate.
  resetEnvironment('device-account');
  localStorage.setItem('crewcheck_local_history_v11_device-account', JSON.stringify([
    { id: genericId, checksum: 'generic-two', createdAt: '2026-08-31T14:00:00.000Z', sourceFileName: 'two.pdf', roster: genericTwo, compliance: { score: 100, alerts: [] }, gym: [] },
    { id: genericId, checksum: 'generic-one', createdAt: '2026-08-30T14:00:00.000Z', sourceFileName: 'one.pdf', roster: genericOne, compliance: { score: 100, alerts: [] }, gym: [] },
  ]));
  await assert.rejects(
    () => openSavedRoster(genericId, { id: genericId, year: 2026, month: 8, crewId: '', crewName: 'Tripulante' }),
    () => true,
    'nome default não pode selecionar entre publicações distintas sob um id compartilhado',
  );

  // The two entries must also remain distinct in history rather than collapsing into a
  // single slot through the generic name.
  {
    const stored = JSON.parse(localStorage.getItem('crewcheck_local_history_v11_device-account'));
    assert.equal(stored.length, 2, 'as duas publicações genéricas devem continuar distintas no histórico');
  }

  // (2) remote body with generic identity does not authorize a verifiable expectation.
  resetEnvironment('device-account');
  serveRemote(genericOne);
  await assert.rejects(
    () => openSavedRoster(remoteId, expectedAlpha),
    (error) => {
      assert.equal(error?.code, 'ROSTER_IDENTITY_MISMATCH', 'corpo remoto com nome genérico não autoriza match com identidade verificável');
      return true;
    },
    'nome default no corpo remoto não é identidade',
  );

  // (3) Alpha + Alpha still passes — a real human name and a real id stay strong.
  resetEnvironment('device-account');
  serveRemote(alpha);
  const alphaAgain = await openSavedRoster(remoteId, expectedAlpha);
  assert.equal(alphaAgain.roster.crewId, alpha.crewId, 'identidade real deve continuar autorizando a abertura');

  const bravo = publication('BRAVO TRIPULANTE', '44444444', [flightDay('07/08/2026', 'BR1', 'LA7000', 'BSB', 'BBB', '08:00', '07:00')]);
  resetEnvironment('device-account');
  serveRemote(alpha);
  await assert.rejects(
    () => openSavedRoster(remoteId, { id: remoteId, year: 2026, month: 8, crewId: bravo.crewId, crewName: bravo.crewName }),
    (error) => {
      assert.equal(error?.code, 'ROSTER_IDENTITY_MISMATCH', '(4) Alpha esperado x Bravo pedido deve recusar');
      return true;
    },
    'dois tripulantes reais distintos nunca podem casar',
  );

  // A real human name that merely contains the default word must keep working as
  // identity when neither side exposes an id. Both sides are name-only on purpose: the
  // token prefers ID over NAME, so mixing an id-bearing body with a name-only
  // expectation would be testing that preference, not the sentinel policy.
  const namedOnly = publication('BRAVO TRIPULANTE', '', [flightDay('07/08/2026', 'BR2', 'LA7001', 'BSB', 'BBB', '08:00', '07:00')]);
  resetEnvironment('device-account');
  serveRemote(namedOnly);
  const openedNamed = await openSavedRoster(remoteId, { id: remoteId, year: 2026, month: 8, crewId: null, crewName: namedOnly.crewName });
  assert.equal(openedNamed.roster.crewName, namedOnly.crewName, 'nome humano real que contém a palavra default continua sendo identidade válida');

  // ...and it must not be confused with the bare default label.
  resetEnvironment('device-account');
  serveRemote(genericOne);
  await assert.rejects(
    () => openSavedRoster(remoteId, { id: remoteId, year: 2026, month: 8, crewId: null, crewName: namedOnly.crewName }),
    (error) => {
      assert.equal(error?.code, 'ROSTER_IDENTITY_MISMATCH', 'o rótulo default não pode satisfazer um nome humano real');
      return true;
    },
    'nome real x rótulo default deve recusar',
  );

  const databaseSource = fs.readFileSync('client/src/lib/databaseClient.ts', 'utf8');
  assert.match(databaseSource, /function crewIdentityToken\(/, 'a normalização de identidade deve existir em um único lugar');
  assert.match(databaseSource, /P0_580_CREW_NAME_SENTINEL_GUARD/, 'a política de nome genérico deve estar presente');
  assert.match(databaseSource, /const name = normalizeRosterCrewName\(source\?\.crewName\);/, 'o token deve consumir a política canônica de nome, não uma lista própria');
  assert.match(databaseSource, /const id = normalizeRosterCrewId\(source\?\.crewId\);/, 'o token deve consumir a política canônica de id');
  assert.doesNotMatch(databaseSource, /return normalizedName \? `NAME:\$\{normalizedName\}` : '';/, 'o fallback genérico permissivo não pode voltar');
  assert.equal((databaseSource.match(/^function normalizeRosterCrewName\(/gm) || []).length, 1, 'a política de nome deve ter uma única definição');
  assert.equal((databaseSource.match(/^function normalizeRosterCrewId\(/gm) || []).length, 1, 'a política de id deve ter uma única definição');
  assert.match(databaseSource, /function findLocalRoster\(id: string, expected\?/, 'a busca por id deve receber a identidade esperada');
  assert.match(databaseSource, /assertExpectedRosterCrew\(local\.roster, expected\);/, 'a abertura local deve validar identidade, não só competência');
  assert.match(databaseSource, /assertExpectedRosterCrew\(payload\.data\.roster, expected\);/, 'a resposta remota também deve validar identidade');
  assert.doesNotMatch(databaseSource, /if \(!wanted \|\| !actual \|\| wanted === actual\) return;/, 'a expectativa verificável não pode ser satisfeita por identidade ausente');
  assert.doesNotMatch(databaseSource, /return readLocalHistory\(\)\.find\(\(item\) => item\.id === id \|\| item\.checksum === id\) \|\| null;/, 'a busca por id sem identidade não pode sobreviver');
  const historyGenerator = fs.readFileSync('scripts/v14338/apply.mjs', 'utf8');
  assert.match(historyGenerator, /localRosterIdentitySlug\(roster\)/, 'o id gerado deve carregar a identidade do tripulante');
  assert.match(databaseSource, /function deleteLocalRoster\(id: string, expected\?/, 'a remoção local também deve ser resolvida por identidade');

  console.log('[p0-580-local-identity-collision] OK — id local único por tripulante, id legado desambiguado por identidade e fail-closed quando a identidade pedida não está no dispositivo.');
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
