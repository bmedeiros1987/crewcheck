import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../client/src/lib/financialRules.ts', import.meta.url), 'utf8');

const checks = [
  ['versioned 2025/26 financial rules', /ACT-LATAM-2025-2027\.2025-12-INPC-4\.18/],
  ['domestic main meal R$ 109,44', /key: 'domestic'[\s\S]*?mainMeal: 109\.44/],
  ['North America USD 28,70', /key: 'north_america'[\s\S]*?mainMeal: 28\.70/],
  ['Europe EUR 25,00', /key: 'europe'[\s\S]*?mainMeal: 25\.00/],
  ['cabin day KM 0,058547', /const CABIN_RATES[\s\S]*?dayKm: 0\.058547/],
  ['cabin night KM 0,117095', /const CABIN_RATES[\s\S]*?nightKm: 0\.117095/],
  ['cabin reserve R$ 49,77/h', /const CABIN_RATES[\s\S]*?reserveHour: 49\.77/],
  ['cabin standby R$ 16,59/h', /const CABIN_RATES[\s\S]*?standbyHour: 16\.59/],
  ['copilot reserve R$ 121,71/h', /first_officer:[\s\S]*?reserveHour: 121\.71/],
  ['commander reserve R$ 183,62/h', /commander:[\s\S]*?reserveHour: 183\.62/],
  ['Embraer copilot reserve R$ 55,99/h', /embraer_first_officer:[\s\S]*?reserveHour: 55\.99/],
  ['Embraer commander reserve R$ 137,72/h', /embraer_commander:[\s\S]*?reserveHour: 137\.72/],
  ['copilot standby R$ 40,57/h', /first_officer:[\s\S]*?standbyHour: 40\.57/],
  ['commander standby R$ 61,20/h', /commander:[\s\S]*?standbyHour: 61\.20/],
  ['function-key segregation exported', /ACT_SALARY_RATES_BY_FUNCTION/],
  ['cabin chief segregated explicitly', /cabin_chief: CABIN_RATES/],
  ['pilot first officer segregated explicitly', /pilot_first_officer: PILOT_RATES\.first_officer/],
  ['pilot commander segregated explicitly', /pilot_commander: PILOT_RATES\.commander/],
  ['unknown pilot function fails closed', /key: 'unknown'[\s\S]*?rates: EMPTY_SALARY_RATES[\s\S]*?manual: true/],
];

for (const [label, pattern] of checks) {
  assert.match(source, pattern, label);
}

console.log(`regression-p1-act-financial-rates-by-function: ${checks.length}/${checks.length} checks passed`);
