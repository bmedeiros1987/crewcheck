import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync('client/src/lib/regulatoryHistory.ts', 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  fileName: 'regulatoryHistory.ts',
}).outputText;
const mod = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

const { previousCompetence, regulatoryCrewIdentity, selectRegulatoryCarryIn } = mod;

assert.deepEqual(previousCompetence(2026, 2), { year: 2026, month: 1 });
assert.deepEqual(previousCompetence(2026, 1), { year: 2025, month: 12 });
assert.equal(previousCompetence(2026, 13), null);
assert.equal(regulatoryCrewIdentity({ crewId: '  abc-123 ', crewName: 'Outro Nome' }), 'ID:ABC-123');
assert.equal(regulatoryCrewIdentity({ crewId: null, crewName: 'José da Silva' }), null, 'nome de exibição nunca pode provar identidade regulatória');
assert.equal(regulatoryCrewIdentity({ crewId: null, crewName: null }), null);

const active = { year: 2026, month: 2, crewId: 'crew-7', crewName: 'Tripulante' };
const older = { id: 'jan-old', createdAt: '2026-01-05T10:00:00Z', year: 2026, month: 1, crewId: 'crew-7' };
const newest = { id: 'jan-new', createdAt: '2026-01-20T10:00:00Z', year: 2026, month: 1, crewId: 'crew-7' };
const wrongCrew = { id: 'jan-wrong', createdAt: '2026-01-25T10:00:00Z', year: 2026, month: 1, crewId: 'crew-8' };
const wrongPeriod = { id: 'dec', createdAt: '2026-01-30T10:00:00Z', year: 2025, month: 12, crewId: 'crew-7' };
const summaries = [older, newest, wrongCrew, wrongPeriod];

const verified = selectRegulatoryCarryIn({
  summaries,
  authority: 'account_verified',
  authenticated: true,
  accountQuerySucceeded: true,
}, active);
assert.equal(verified.historyProven, true);
assert.equal(verified.reason, 'ok');
assert.equal(verified.summary?.id, 'jan-new', 'a publicação mais nova da competência anterior deve vencer');
assert.equal(verified.expectedYear, 2026);
assert.equal(verified.expectedMonth, 1);

const networkFallback = selectRegulatoryCarryIn({
  summaries,
  authority: 'local_after_account_failure',
  authenticated: true,
  accountQuerySucceeded: false,
}, active);
assert.equal(networkFallback.summary?.id, 'jan-new', 'o local pode fornecer observações sem virar prova de completude');
assert.equal(networkFallback.historyProven, false);
assert.equal(networkFallback.reason, 'account_not_verified');

const noSession = selectRegulatoryCarryIn({
  summaries,
  authority: 'local_no_session',
  authenticated: false,
  accountQuerySucceeded: false,
}, active);
assert.equal(noSession.historyProven, false, 'ausência de token não pode declarar cobertura completa');
assert.equal(noSession.reason, 'account_not_verified');

const absent = selectRegulatoryCarryIn({
  summaries: [wrongCrew, wrongPeriod],
  authority: 'account_verified',
  authenticated: true,
  accountQuerySucceeded: true,
}, active);
assert.equal(absent.summary, null);
assert.equal(absent.historyProven, false);
assert.equal(absent.reason, 'previous_competence_absent');

const unverifiedActive = selectRegulatoryCarryIn({
  summaries,
  authority: 'account_verified',
  authenticated: true,
  accountQuerySucceeded: true,
}, { year: 2026, month: 2, crewId: null, crewName: 'Tripulante' });
assert.equal(unverifiedActive.summary, null, 'sem crewId estável nem mesmo observação de homônimo pode ser selecionada');
assert.equal(unverifiedActive.historyProven, false);
assert.equal(unverifiedActive.reason, 'active_identity_unverified');

// P1 blocker reproducer: duas pessoas distintas podem ter exatamente o mesmo nome.
// Uma delas possui uma publicação anterior; a ativa não possui identificador estável.
// O contrato antigo juntava por NAME:JOSE DA SILVA e podia declarar historyProven=true.
// O carry-in regulatório deve falhar fechado, mesmo com authority=account_verified.
const sameNameCollision = selectRegulatoryCarryIn({
  summaries: [
    { id: 'other-person', createdAt: '2026-01-31T12:00:00Z', year: 2026, month: 1, crewId: 'crew-other', crewName: 'José da Silva' },
    { id: 'name-only-publication', createdAt: '2026-01-30T12:00:00Z', year: 2026, month: 1, crewId: null, crewName: 'José da Silva' },
  ],
  authority: 'account_verified',
  authenticated: true,
  accountQuerySucceeded: true,
}, { year: 2026, month: 2, crewId: null, crewName: 'José da Silva' });
assert.equal(sameNameCollision.summary, null);
assert.equal(sameNameCollision.crewIdentity, null);
assert.equal(sameNameCollision.historyProven, false, 'homônimo nunca pode produzir historyProven=true sem identificador estável');
assert.equal(sameNameCollision.reason, 'active_identity_unverified');

// Mesmo quando a ativa possui crewId estável, uma publicação name-only não pode ser
// promovida a evidência só porque o nome coincide. Apenas o mesmo crewId é elegível.
const candidateWithoutStableId = selectRegulatoryCarryIn({
  summaries: [
    { id: 'same-name-no-id', createdAt: '2026-01-31T12:00:00Z', year: 2026, month: 1, crewId: null, crewName: 'Tripulante' },
  ],
  authority: 'account_verified',
  authenticated: true,
  accountQuerySucceeded: true,
}, active);
assert.equal(candidateWithoutStableId.summary, null);
assert.equal(candidateWithoutStableId.historyProven, false);
assert.equal(candidateWithoutStableId.reason, 'previous_competence_absent');

console.log('[regression:p1-623-history-evidence] PASS — exact stable crew/competence and fail-closed authority contract pinned.');
