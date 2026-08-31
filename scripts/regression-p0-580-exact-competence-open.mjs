import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-580-exact-competence-'));

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
}

function roster(year, month, dates) {
  return {
    crewName: 'TRIPULANTE TESTE',
    crewId: '00000000',
    base: 'BSB',
    year,
    month,
    rawText: '',
    days: dates.map((date) => ({ date, type: 'DO', isDayOff: true, legs: [] })),
  };
}

const leg = (flightNumber, origin, destination, departureTime) => ({
  flightNumber,
  origin,
  destination,
  departureTime,
});

const flightDay = (date, pairingCode, flightNumber, origin, destination, departureTime, dutyReport) => ({
  date,
  type: 'FLIGHT',
  pairingCode,
  dutyReport,
  legs: [leg(flightNumber, origin, destination, departureTime)],
});

function canonicalDate(value) {
  const raw = String(value || '');
  let match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  return raw;
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
  localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'crew-580', email: 'crew@example.test' }));

  const august = roster(2026, 8, Array.from({ length: 31 }, (_, index) => `${String(index + 1).padStart(2, '0')}/08/2026`));
  const september = roster(2026, 9, [
    '29/08/2026', '30/08/2026', '31/08/2026',
    ...Array.from({ length: 30 }, (_, index) => `${String(index + 1).padStart(2, '0')}/09/2026`),
  ]);

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes('/api/rosters/wrong-competence-id')) {
      return new Response(JSON.stringify({
        ok: true,
        data: { roster: september, compliance: { score: 100, alerts: [] }, gym: [] },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url === '/api/rosters/active') {
      return new Response(JSON.stringify({
        ok: true,
        roster: { id: 'september-id', year: 2026, month: 9, isActive: true },
        data: { roster: september, compliance: { score: 100, alerts: [] }, gym: [] },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: false, message: 'Histórico indisponível neste backend.' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  };

  const { openSavedRoster, openActiveRoster } = await import(`${pathToFileURL(path.join(outDir, 'database-client.mjs')).href}?v=${Date.now()}`);

  await assert.rejects(
    () => openSavedRoster('august-id'),
    /histórico|competência|abrir|localizada/i,
    'abrir Agosto nunca pode cair silenciosamente na escala ativa de Setembro',
  );
  await assert.rejects(
    () => openSavedRoster('wrong-competence-id', { year: 2026, month: 8 }),
    /competência retornada não corresponde/i,
    'o payload de Setembro nunca pode satisfazer uma seleção nominal de Agosto',
  );

  assert.equal(august.days.length, 31, 'o oracle de Agosto deve representar a competência completa');
  assert.equal(september.days.filter((day) => /\/08\/2026$/.test(day.date)).length, 3, 'o oracle de Setembro deve conter carry-in de Agosto');
  assert.equal(september.days.filter((day) => /\/09\/2026$/.test(day.date)).length, 30, 'o oracle de Setembro deve manter a própria competência completa');

  // Production-path proof: seed the same local-history storage consumed by
  // openActiveRoster(), with nominal August carrying into September and the
  // September publication carrying August back in. Both successful online fetch
  // and offline fallback must reconcile the same adjacent nominal periods.
  const augustCarry = {
    ...roster(2026, 8, []),
    rawText: 'AUGUST-PRIMARY-RAW',
    days: [
      { date: '01/08/2026', type: 'DO', isDayOff: true, legs: [] },
      flightDay('29/08/2026', 'AUG-A', 'LA9100', 'BSB', 'AAA', '08:00', '07:00'),
      flightDay('01/09/2026', 'AUG-B', 'LA9101', 'AAA', 'BBB', '09:00', '08:00'),
      flightDay('02/09/2026', 'AUG-C', 'LA9102', 'BBB', 'CCC', '10:00', '09:00'),
    ],
  };
  const septemberCarry = {
    ...roster(2026, 9, []),
    rawText: 'SEPTEMBER-RAW STALE-OVERLAP-LA9102 NEW-LA9103',
    days: [
      flightDay('2026-08-29', 'SEP-X', 'LA9100', 'BSB', 'AAA', '08h00', '07:05'),
      flightDay('2026-09-01', 'SEP-Y', 'LA9101', 'AAA', 'BBB', '09:00', '08:10'),
      flightDay('2026-09-02', 'SEP-Z', 'LA9102', 'BBB', 'CCC', '10:00', '09:20'),
      flightDay('2026-09-03', 'SEP-N', 'LA9103', 'CCC', 'BSB', '11:00', '10:00'),
    ],
  };

  localStorage.setItem('crewcheck_local_history_v11_crew-580', JSON.stringify([
    {
      id: 'local-august-carry', checksum: 'august-carry', createdAt: '2026-08-31T12:00:00.000Z',
      sourceFileName: 'august-synthetic.pdf', roster: augustCarry, compliance: { score: 100, alerts: [] }, gym: [],
    },
    {
      id: 'local-september-carry', checksum: 'september-carry', createdAt: '2026-08-30T12:00:00.000Z',
      sourceFileName: 'september-synthetic.pdf', roster: septemberCarry, compliance: { score: 100, alerts: [] }, gym: [],
    },
  ]));

  // Fail-before on 289d7f18fc0ced132ed0a22f2e56df1c7b562060: the
  // summary/body mismatch was detected and then swallowed by the outer catch,
  // which silently returned the local August roster. A trusted checksum must not
  // authorize a body from another nominal publication.
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === '/api/rosters/active') {
      return new Response(JSON.stringify({
        ok: true,
        roster: { id: 'remote-august-carry', checksum: 'august-carry', year: 2026, month: 8, isActive: true },
        data: { roster: septemberCarry, compliance: { score: 100, alerts: [] }, gym: [] },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: false, message: 'Histórico indisponível neste backend.' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  };

  await assert.rejects(
    () => openActiveRoster(),
    (error) => {
      assert.equal(error?.code, 'ROSTER_PERIOD_MISMATCH', 'summary Agosto/body Setembro deve preservar o código de conflito nominal');
      return true;
    },
    'mismatch interno da resposta remota nunca pode ser mascarado por fallback local',
  );

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === '/api/rosters/active') {
      return new Response(JSON.stringify({
        ok: true,
        roster: { id: 'remote-august-carry', year: 2026, month: 8, isActive: true },
        data: { roster: augustCarry, compliance: { score: 100, alerts: [] }, gym: [] },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: false, message: 'Histórico indisponível neste backend.' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  };

  await assert.rejects(
    () => openActiveRoster(),
    (error) => {
      assert.equal(error?.code, 'ACTIVE_ROSTER_CONFLICT', 'identidade remota ambígua deve exigir confirmação');
      return true;
    },
    'mesma competência sem identidade estável nunca pode escolher silenciosamente remoto ou local',
  );

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === '/api/rosters/active') {
      return new Response(JSON.stringify({
        ok: true,
        roster: { id: 'remote-august-carry', checksum: 'august-carry', year: 2026, month: 8, isActive: true },
        data: { roster: augustCarry, compliance: { score: 100, alerts: [] }, gym: [] },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: false, message: 'Histórico indisponível neste backend.' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  };

  const onlineContinuous = await openActiveRoster();
  assert.equal(Number(onlineContinuous.summary?.year), 2026, 'online reload deve manter a publicação nominal de Agosto como primária');
  assert.equal(Number(onlineContinuous.summary?.month), 8, 'online reload deve manter Agosto como competência primária');
  assert.ok((onlineContinuous.roster.days || []).some((day) => canonicalDate(day.date) === '2026-09-03' && day.pairingCode === 'SEP-N'), 'online reload também deve anexar a continuidade física da publicação adjacente');
  assert.doesNotMatch(String(onlineContinuous.roster.rawText || ''), /STALE-OVERLAP-LA9102|SEPTEMBER-RAW/, 'online reload não pode reintroduzir rawText stale da publicação filtrada');

  globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, message: 'offline' }), {
    status: 503,
    headers: { 'content-type': 'application/json' },
  });

  const continuous = await openActiveRoster();
  assert.equal(Number(continuous.summary?.year), 2026, 'offline reload deve manter a publicação nominal de Agosto como primária');
  assert.equal(Number(continuous.summary?.month), 8, 'offline reload deve manter Agosto como competência primária');

  const counts = new Map();
  for (const day of continuous.roster.days || []) {
    const key = canonicalDate(day.date);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  assert.equal(counts.get('2026-08-29'), 1, 'carry-in 29/08 da publicação de Setembro não pode duplicar Agosto');
  assert.equal(counts.get('2026-09-01'), 1, 'carry-in 01/09 da publicação de Setembro não pode duplicar carry-out de Agosto');
  assert.equal(counts.get('2026-09-02'), 1, 'carry-in 02/09 da publicação de Setembro não pode duplicar carry-out de Agosto');
  assert.equal(counts.get('2026-09-03'), 1, 'continuidade física nova de 03/09 deve ser anexada pelo fluxo real');
  assert.ok((continuous.roster.days || []).some((day) => canonicalDate(day.date) === '2026-09-03' && day.pairingCode === 'SEP-N'), 'a perna nova da publicação adjacente precisa sobreviver');
  assert.doesNotMatch(String(continuous.roster.rawText || ''), /STALE-OVERLAP-LA9102|SEPTEMBER-RAW/, 'rawText agregado da publicação filtrada não pode reintroduzir atividade removida');

  // Fresh production counterexample for retained multiplicity: after count-aware
  // overlap consumes one adjacent copy, a second legitimate copy remains before a
  // later physical continuation. That proven retained occurrence may be skipped
  // while searching for the later matching continuation.
  const augustMultiplicity = {
    ...roster(2026, 8, []),
    rawText: 'AUGUST-MULTIPLICITY',
    days: [
      { date: '01/08/2026', type: 'DO', isDayOff: true, legs: [] },
      flightDay('29/08/2026', 'AUG-M1', 'LA9200', 'BSB', 'AAA', '08:00', '07:00'),
      flightDay('01/09/2026', 'AUG-M2', 'LA9201', 'AAA', 'BBB', '09:00', '08:00'),
      flightDay('02/09/2026', 'AUG-M3', 'LA9202', 'BBB', 'CCC', '10:00', '09:00'),
    ],
  };
  const repeatedOverlapDay = flightDay('2026-08-29', 'SEP-M1', 'LA9200', 'BSB', 'AAA', '08:00', '07:05');
  repeatedOverlapDay.legs.push(leg('LA9200', 'BSB', 'AAA', '08:00'));
  const septemberMultiplicity = {
    ...roster(2026, 9, []),
    rawText: 'SEPTEMBER-MULTIPLICITY-STALE',
    days: [
      repeatedOverlapDay,
      flightDay('2026-09-01', 'SEP-M2', 'LA9201', 'AAA', 'BBB', '09:00', '08:10'),
      flightDay('2026-09-02', 'SEP-M3', 'LA9202', 'BBB', 'CCC', '10:00', '09:20'),
      flightDay('2026-09-03', 'SEP-M4', 'LA9203', 'CCC', 'BSB', '11:00', '10:00'),
    ],
  };

  localStorage.setItem('crewcheck_local_history_v11_crew-580', JSON.stringify([
    {
      id: 'local-august-multiplicity', checksum: 'august-multiplicity', createdAt: '2026-08-31T13:00:00.000Z',
      sourceFileName: 'august-multiplicity.pdf', roster: augustMultiplicity, compliance: { score: 100, alerts: [] }, gym: [],
    },
    {
      id: 'local-september-multiplicity', checksum: 'september-multiplicity', createdAt: '2026-08-30T13:00:00.000Z',
      sourceFileName: 'september-multiplicity.pdf', roster: septemberMultiplicity, compliance: { score: 100, alerts: [] }, gym: [],
    },
  ]));

  const withMultiplicity = await openActiveRoster();
  const retainedOverlapLegs = (withMultiplicity.roster.days || [])
    .filter((day) => canonicalDate(day.date) === '2026-08-29')
    .flatMap((day) => day.legs || [])
    .filter((item) => item.flightNumber === 'LA9200');
  assert.equal(retainedOverlapLegs.length, 2, 'uma ocorrência primária deve consumir somente uma das duas cópias adjacentes e preservar a multiplicidade legítima');
  assert.ok((withMultiplicity.roster.days || []).some((day) => canonicalDate(day.date) === '2026-09-03' && day.pairingCode === 'SEP-M4'), 'a multiplicidade retida anterior não pode vetar a continuação física posterior');
  assert.doesNotMatch(String(withMultiplicity.roster.rawText || ''), /SEPTEMBER-MULTIPLICITY-STALE/, 'rawText adjacente filtrado continua inválido no cenário de multiplicidade');

  // An arbitrary incompatible duty is not a retained overlap duplicate. It must
  // block continuity even if a later anchor would happen to match the primary tail.
  const septemberBrokenChain = {
    ...roster(2026, 9, []),
    rawText: 'SEPTEMBER-BROKEN-CHAIN',
    days: [
      flightDay('2026-08-29', 'SEP-BX', 'LA9100', 'BSB', 'AAA', '08:00', '07:10'),
      flightDay('2026-09-01', 'SEP-BY', 'LA9101', 'AAA', 'BBB', '09:00', '08:15'),
      flightDay('2026-09-02', 'SEP-BZ', 'LA9102', 'BBB', 'CCC', '10:00', '09:25'),
      flightDay('2026-09-03', 'SEP-BAD', 'LA9300', 'XXX', 'YYY', '11:00', '10:00'),
      flightDay('2026-09-04', 'SEP-LATE', 'LA9301', 'CCC', 'BSB', '12:00', '11:00'),
    ],
  };
  localStorage.setItem('crewcheck_local_history_v11_crew-580', JSON.stringify([
    {
      id: 'local-august-broken', checksum: 'august-broken', createdAt: '2026-08-31T14:00:00.000Z',
      sourceFileName: 'august-broken.pdf', roster: augustCarry, compliance: { score: 100, alerts: [] }, gym: [],
    },
    {
      id: 'local-september-broken', checksum: 'september-broken', createdAt: '2026-08-30T14:00:00.000Z',
      sourceFileName: 'september-broken.pdf', roster: septemberBrokenChain, compliance: { score: 100, alerts: [] }, gym: [],
    },
  ]));
  const brokenChain = await openActiveRoster();
  assert.ok(!(brokenChain.roster.days || []).some((day) => day.pairingCode === 'SEP-BAD'), 'âncora incompatível arbitrária deve bloquear anexação da publicação adjacente');
  assert.ok(!(brokenChain.roster.days || []).some((day) => day.pairingCode === 'SEP-LATE'), 'uma âncora compatível posterior não pode autorizar pular uma jornada incompatível anterior');

  const databaseSource = fs.readFileSync('client/src/lib/databaseClient.ts', 'utf8');
  const historyGenerator = fs.readFileSync('scripts/v14338/apply.mjs', 'utf8');
  const historyUiGenerator = fs.readFileSync('scripts/v14339/apply.mjs', 'utf8');
  const platformSource = fs.readFileSync('server/platform.mjs', 'utf8');
  const watchSource = fs.readFileSync('client/src/pages/WatchPage.tsx', 'utf8');
  const workflowSource = fs.readFileSync('.github/workflows/p0-580-vc-boundary.yml', 'utf8');
  assert.doesNotMatch(databaseSource, /Fallback premium:[\s\S]*?\/api\/rosters\/active/, 'abrir por ID não pode cair na escala ativa');
  assert.match(databaseSource, /if \(adjacentWasFiltered\) adjacent = \{ \.\.\.adjacent, rawText: '' \};/, 'overlap parcial deve invalidar rawText agregado adjacente');
  assert.match(databaseSource, /const residualDays = dedupeAdjacentRosterDays\(previousRoster\.days \|\| \[\], nextRoster\.days \|\| \[\]\);/, 'continuidade deve partir das atividades residuais depois do dedupe count-aware');
  assert.match(databaseSource, /for \(const day of residualDays\)/, 'continuidade deve percorrer atividades residuais em ordem de fonte');
  assert.match(databaseSource, /dedupeAdjacentRosterDays\(previousRoster\.days \|\| \[\], \[day\]\)\.length === 0/, 'somente overlap individualmente comprovado pode ser ignorado durante a varredura residual');
  assert.match(databaseSource, /await buildSmartLocalContinuousRoster\(remoteSummary, remoteData\)/, 'fetch ativo online deve reconciliar competências adjacentes antes de retornar');
  assert.match(databaseSource, /\['ACTIVE_ROSTER_CONFLICT', 'ROSTER_PERIOD_MISMATCH'\]\.includes\(String\(error\?\.code \|\| ''\)\.toUpperCase\(\)\)/, 'mismatch nominal remoto deve atravessar o catch sem fallback local');
  assert.match(historyUiGenerator, /openSavedRoster\(item\.id, item\)/, 'a UI materializada deve informar a competência nominal selecionada');
  assert.match(watchSource, /openSavedRoster\(best\.id, best\)/, 'o relógio também deve validar a competência nominal escolhida');
  assert.match(workflowSource, /client\/src\/pages\/WatchPage\.tsx/, 'o gate de competência deve disparar quando o consumidor Watch mudar');
  assert.match(historyUiGenerator, /toast\.error\(error instanceof Error \? error\.message : 'Não consegui abrir esta escala do histórico\.'\)/, 'a UI materializada deve expor o conflito de competência em vez de mascará-lo');
  assert.match(historyGenerator, /persistRosterHistoryLocally\(payload\)/, 'a preparação deve persistir cada publicação localmente por competência');
  assert.match(historyGenerator, /saveRosterAnalysis\(\{ roster, compliance: newCompliance, gym: newGym, sourceFileName: file\.name \}/, 'toda importação de PDF deve acionar o histórico local-first');
  assert.match(platformSource, /function rosterKey\(roster\)[\s\S]*roster\?\.year[\s\S]*roster\?\.month/, 'a chave remota deve usar ano/mês nominais da publicação');

  console.log('[p0-580-exact-competence] OK — seleção nominal, mismatch remoto fail-closed, carry online/offline, multiplicidade e âncora exercitados.');
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}