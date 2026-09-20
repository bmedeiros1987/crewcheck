import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

const regulatory = read('client/src/lib/regulatoryHistory.ts');
const database = read('client/src/lib/databaseClient.ts');
const compliance = read('client/src/lib/complianceEngine.ts');
const home = read('client/src/pages/Home.tsx');

assert.match(regulatory, /export function selectRegulatoryCarryIn/, 'stable-identity evidence selector must exist');
assert.match(database, /selectRegulatoryCarryIn/, 'runtime carry-in must delegate evidence selection to regulatoryHistory.ts');
assert.match(database, /recomputeComplianceWithRegulatoryHistory/, 'runtime must expose fail-closed regulatory recomputation');
assert.match(database, /historyProven/, 'runtime must require proven account history before marking coverage complete');
assert.match(database, /account_verified/, 'runtime proof must be account-verified');
const runtimeStart = database.indexOf('export async function recomputeComplianceWithRegulatoryHistory');
const runtimeEnd = database.indexOf('\nexport async function deleteRosterAnalysis', runtimeStart);
assert.ok(runtimeStart >= 0 && runtimeEnd > runtimeStart, 'regulatory recompute runtime must be extractable');
const runtimeCarryIn = database.slice(runtimeStart, runtimeEnd);
assert.doesNotMatch(runtimeCarryIn, /crewName[^\n]{0,80}(?:===|==|includes\(|historyProven|complete)/i,
  'display name must not be compared or promoted as regulatory proof inside carry-in runtime');
assert.match(compliance, /regulatoryHistory/, 'compliance must accept historical observations explicitly');
assert.match(compliance, /flightHoursObservations/, 'history may feed rolling flight-hours observations');
assert.match(home, /recomputeComplianceWithRegulatoryHistory/, 'Home must recompute compliance when active roster changes');
assert.match(home, /setBundle/, 'recomputed result must still flow through canonical bundle state');

// Safety invariants: this slice may not modify parser/journey/APZ contracts to make carry-in green.
const apply = fs.existsSync('scripts/p1-623-runtime-carry-in/apply.mjs')
  ? read('scripts/p1-623-runtime-carry-in/apply.mjs')
  : '';
if (apply) {
  assert.doesNotMatch(apply, /rosterParser|aimsParser|parseAims|APZ|journeyId|#532/i,
    'runtime carry-in materializer must not patch parser/APZ/journey/#532');
  assert.match(apply, /selectRegulatoryCarryIn/, 'materializer must reuse stable evidence selector instead of duplicating identity logic');
}

console.log('OK regression-p1-623-runtime-carry-in-cleanroom');
