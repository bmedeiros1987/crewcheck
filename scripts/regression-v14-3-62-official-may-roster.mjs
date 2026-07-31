import assert from 'node:assert/strict';
import fs from 'node:fs';

const fixturePath = 'scripts/fixtures/official-roster-2026-05-canonical-anonymized.json';
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const { formalRecoveryOpening, internationalOvernightPairing, mustPreserve } = fixture.cases;

assert.equal(fixture.period.start, '01/05/2026');
assert.equal(fixture.period.end, '31/05/2026');
assert.equal(formalRecoveryOpening.length, 8);
assert.equal(formalRecoveryOpening.filter((item) => item.type === 'DOF').length, 2);
assert.equal(formalRecoveryOpening.filter((item) => item.type === 'DO').length, 6);

assert.equal(internationalOvernightPairing.started, '09/05/2026');
assert.equal(internationalOvernightPairing.report, '13:25');
assert.deepEqual(internationalOvernightPairing.route, ['BSB', 'POA', 'CNF', 'POA', 'GRU', 'EZE', 'GRU']);
assert.equal(internationalOvernightPairing.touchesNextDay, true);
assert.equal(internationalOvernightPairing.mustKeepInternationalStation, 'EZE');
assert.equal(internationalOvernightPairing.workTypes.every((type) => type === 'OP'), true);

assert.ok(mustPreserve.includes('DO e DOF como recuperações distintas'));
assert.ok(mustPreserve.includes('nenhuma Saída Inteligente em DO ou DOF'));
assert.ok(mustPreserve.includes('continuidade internacional sem teletransporte'));

const raw = fs.readFileSync(fixturePath, 'utf8');
const sensitivePatterns = [
  /BRUNO SARAIVA/i,
  /04453812/,
  /AIRCOM_SQS/i,
  /SCHEDULER/i,
  /LA\d{4}/,
];
for (const pattern of sensitivePatterns) {
  assert.equal(pattern.test(raw), false, `fixture contém dado que deveria estar anonimizado: ${pattern}`);
}

console.log('v14.3.62 official May roster audit OK');
