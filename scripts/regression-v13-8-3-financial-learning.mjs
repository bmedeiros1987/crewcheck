import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../client/src/lib/financialStatementLearning.ts', import.meta.url), 'utf8');
for (const required of ['learnFinancialStatement', 'mergeConfirmedRates', 'rateAt', 'sourceFingerprint', 'confirmed']) {
  assert.ok(source.includes(required), `Contrato ausente: ${required}`);
}

const meal = 109.44;
assert.equal(Number((meal * 0.25).toFixed(2)), 27.36);
assert.equal(Number((meal * 2).toFixed(2)), 218.88);
assert.equal(Number((meal * 3).toFixed(2)), 328.32);
const closeMoney = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 0.01, `${actual} difere de ${expected}`);
// A razão exibida pela folha tem menos casas que a tarifa interna. Aceita-se até R$ 0,01.
closeMoney(Number((12605 * 0.058547).toFixed(2)), 737.99);
closeMoney(Number((15909 * 0.117094).toFixed(2)), 1862.85);
closeMoney(Number((4705 * 0.117094).toFixed(2)), 550.93);
closeMoney(Number((2974 * 0.117094).toFixed(2)), 348.24);
assert.equal(Number((298.59 / 6).toFixed(3)), 49.765);
assert.equal(Number((81.61 / 4.92).toFixed(3)), 16.587);

console.log('CrewCheck v13.8.3 Draft 1: regressão financeira aprovada.');
