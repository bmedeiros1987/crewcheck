import assert from 'node:assert/strict';
import fs from 'node:fs';

const fixturePath = 'scripts/fixtures/official-roster-2026-06-canonical-anonymized.json';
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const { cases, expected } = fixture;

const route = cases.carryIn.legs.reduce((items, leg, index) => {
  if (index === 0) items.push(leg.origin);
  items.push(leg.destination);
  return items;
}, []);

assert.equal(cases.carryIn.legs.length, expected.carryInLegCount, 'Carry-in deve preservar todas as pernas oficiais.');
assert.deepEqual(route, expected.carryInRoute, 'Carry-in não pode criar teletransporte nem trocar origem/destino.');
assert.equal(cases.carryIn.startDate, '30/05/2026');
assert.equal(cases.carryIn.endDate, '01/06/2026');
assert.equal(cases.carryIn.debrief, '09:40(+2)');

const activities02June = cases.sameDayActivities.filter((item) => item.date === '02/06/2026');
assert.equal(activities02June.length, expected.sameDayActivityCountOn02June, 'CBF e EMER devem permanecer como duas atividades legítimas no mesmo dia.');
assert.deepEqual(activities02June.map((item) => item.type), expected.mustPreserveDistinctSameDayActivities);
assert.equal(new Set(activities02June.map((item) => `${item.date}|${item.type}|${item.start}|${item.end}`)).size, 2, 'Atividades distintas não podem ser deduplicadas.');

const unactivated = cases.standbyAndReserve.filter((item) => item.activated === false);
assert.equal(unactivated.length, expected.unactivatedStandbyOrReserveCount);
assert.ok(unactivated.every((item) => ['HSBE', 'ASB'].includes(item.type)), 'Fixture só deve classificar disponibilidade publicada sem acionamento.');

assert.equal(cases.recovery.length, expected.recoveryCountInCoveredSlice);
assert.ok(cases.recovery.every((item) => ['DO', 'DR'].includes(item.type)), 'Recuperação formal deve permanecer separada de programação.');

assert.equal(cases.psGroundPs.activities.length, expected.psGroundPsActivityCount);
assert.deepEqual(cases.psGroundPs.activities.map((item) => item.type), ['PS', 'C32F', 'PS']);
assert.equal(cases.psGroundPs.activities[0].destination, cases.psGroundPs.activities[1].location, 'Atividade de solo deve ocorrer na localidade alcançada pelo primeiro PS.');
assert.equal(cases.psGroundPs.activities[1].location, cases.psGroundPs.activities[2].origin, 'Segundo PS deve partir da localidade da atividade de solo.');
assert.equal(cases.psGroundPs.activities[2].destination, 'BSB', 'Bloco deve retornar à base publicada.');

for (const prohibitedType of expected.mustNotCreateSmartDepartureFor) {
  assert.ok(['DO', 'DR', 'HSBE', 'ASB'].includes(prohibitedType));
}

assert.ok(expected.mustNotInfer.includes('folga em dia sem código formal'));
assert.ok(expected.mustNotInfer.includes('acionamento de HSBE'));
assert.ok(expected.mustNotInfer.includes('acionamento de ASB'));

console.log('[v14.3.60] Escala oficial de junho: carry-in, atividades múltiplas, disponibilidade e recuperação validados.');
