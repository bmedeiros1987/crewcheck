import assert from 'node:assert/strict';
import fs from 'node:fs';

const fixturePath = 'scripts/fixtures/official-roster-2026-07-canonical-anonymized.json';
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const { carryIn, reserveActivatedSameDay, formalDaysOff, mustPreserve } = fixture.cases;

assert.equal(fixture.period.start, '01/07/2026');
assert.equal(fixture.period.end, '31/07/2026');
assert.equal(carryIn.started, '29/06/2026');
assert.equal(carryIn.finished, '01/07/2026');
assert.equal(carryIn.continuityDays, 3);
assert.deepEqual(carryIn.route, ['BSB', 'SLZ', 'GIG', 'SSA', 'CGH', 'RAO', 'CGH', 'BSB']);

assert.equal(reserveActivatedSameDay.date, '02/07/2026');
assert.equal(reserveActivatedSameDay.reserve.type, 'ASB');
assert.equal(reserveActivatedSameDay.reserve.end, reserveActivatedSameDay.activation.report);
assert.equal(reserveActivatedSameDay.activation.legs.length, 2);
assert.equal(reserveActivatedSameDay.activation.legs[0].origin, 'BSB');
assert.equal(reserveActivatedSameDay.activation.legs[0].destination, 'CWB');
assert.equal(reserveActivatedSameDay.activation.legs[1].origin, 'CWB');
assert.equal(reserveActivatedSameDay.activation.legs[1].destination, 'BSB');
assert.equal(reserveActivatedSameDay.activation.debrief, '20:32');

assert.deepEqual(formalDaysOff, ['03/07/2026', '04/07/2026']);
assert.ok(mustPreserve.includes('ASB e acionamento como atividades distintas no mesmo dia'));
assert.ok(mustPreserve.includes('folga sem Saída Inteligente'));

const sensitivePatterns = [
  /BRUNO SARAIVA/i,
  /04453812/,
  /AIRCOM_SQS/i,
  /04625508/,
  /LA\d{4}/,
];
const raw = fs.readFileSync(fixturePath, 'utf8');
for (const pattern of sensitivePatterns) {
  assert.equal(pattern.test(raw), false, `fixture contém dado que deveria estar anonimizado: ${pattern}`);
}

console.log('v14.3.61 official July roster audit OK');
