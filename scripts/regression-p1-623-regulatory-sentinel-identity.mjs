import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync('client/src/lib/regulatoryHistory.ts', 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  fileName: 'regulatoryHistory.ts',
}).outputText;
const mod = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

const { regulatoryCrewIdentity, selectRegulatoryCarryIn } = mod;

for (const sentinel of ['UNKNOWN', 'unknown', 'UNKNOWN-1', 'INVALID', 'MISSING2', 'NA', 'NONE', 'NULL', 'UNDEFINED', 'TBD', 'TBA', 'PLACEHOLDER']) {
  assert.equal(
    regulatoryCrewIdentity({ crewId: sentinel, crewName: 'Tripulante' }),
    null,
    `crewId sentinela ${sentinel} nunca pode provar identidade regulatória`,
  );
}

const collision = selectRegulatoryCarryIn({
  summaries: [
    { id: 'jan-unknown', createdAt: '2026-01-31T12:00:00Z', year: 2026, month: 1, crewId: 'UNKNOWN', crewName: 'Pessoa B' },
  ],
  authority: 'account_verified',
  authenticated: true,
  accountQuerySucceeded: true,
}, { year: 2026, month: 2, crewId: 'UNKNOWN', crewName: 'Pessoa A' });

assert.equal(collision.summary, null);
assert.equal(collision.crewIdentity, null);
assert.equal(collision.historyProven, false);
assert.equal(collision.reason, 'active_identity_unverified');

console.log('[regression:p1-623-sentinel-identity] PASS — sentinels nunca provam identidade regulatória.');
