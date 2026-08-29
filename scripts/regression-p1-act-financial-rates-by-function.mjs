import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const amountsSource = read('client/src/lib/financialAmounts.ts');
const financialRulesSource = read('client/src/lib/financialRules.ts');
const homeSource = read('client/src/pages/Home.tsx');
const premiumRulesSource = read('client/src/lib/crewcheckPremiumRules.ts');

const transformed = ts.transpileModule(amountsSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const amounts = await import(`data:text/javascript;base64,${Buffer.from(transformed.outputText).toString('base64')}`);

assert.equal(amounts.ACT_DOMESTIC_MAIN_MEAL_BRL, 109.95);
assert.equal(amounts.ACT_BREAKFAST_PERCENT, 0.25);
assert.equal(amounts.perDiemSlotAmount(109.95, 'breakfast'), 27.49);
assert.equal(amounts.perDiemSlotAmount(109.95, 'lunch'), 109.95);
assert.equal(amounts.perDiemSlotAmount(109.95, 'dinner'), 109.95);
assert.equal(amounts.perDiemSlotAmount(109.95, 'supper'), 109.95);
assert.equal(amounts.perDiemSlotAmount(Number.NaN, 'breakfast'), 0);
assert.equal(amounts.perDiemSlotAmount(-1, 'lunch'), 0);

const checks = [
  ['versioned SNA R$ 109,95 rules', /ACT-LATAM-2025-2027\.2025-12-SNA-109\.95/],
  ['effective date 01/12/2025', /ACT_FINANCIAL_RULES_EFFECTIVE_FROM = '2025-12-01'/],
  ['official SNA source URL', /ACT_FINANCIAL_RULES_SOURCE_URL = 'https:\/\/www\.aeronautas\.org\.br\/pilotos-e-comissarios-da-latam-aprovam-propostas-de-acts-por-funcao\/'/],
  ['domestic table uses the canonical value', /key: 'domestic'[\s\S]*?mainMeal: ACT_DOMESTIC_MAIN_MEAL_BRL/],
  ['North America USD 28,70', /key: 'north_america'[\s\S]*?mainMeal: 28\.70/],
  ['Europe EUR 25,00', /key: 'europe'[\s\S]*?mainMeal: 25\.00/],
  ['cabin day KM 0,058547', /const CABIN_RATES[\s\S]*?dayKm: 0\.058547/],
  ['cabin night KM 0,117095', /const CABIN_RATES[\s\S]*?nightKm: 0\.117095/],
  ['cabin reserve R$ 49,77\/h', /const CABIN_RATES[\s\S]*?reserveHour: 49\.77/],
  ['cabin standby R$ 16,59\/h', /const CABIN_RATES[\s\S]*?standbyHour: 16\.59/],
  ['copilot reserve R$ 121,71\/h', /first_officer:[\s\S]*?reserveHour: 121\.71/],
  ['commander reserve R$ 183,62\/h', /commander:[\s\S]*?reserveHour: 183\.62/],
  ['Embraer copilot reserve R$ 55,99\/h', /embraer_first_officer:[\s\S]*?reserveHour: 55\.99/],
  ['Embraer commander reserve R$ 137,72\/h', /embraer_commander:[\s\S]*?reserveHour: 137\.72/],
  ['copilot standby R$ 40,57\/h', /first_officer:[\s\S]*?standbyHour: 40\.57/],
  ['commander standby R$ 61,20\/h', /commander:[\s\S]*?standbyHour: 61\.20/],
  ['function-key segregation exported', /ACT_SALARY_RATES_BY_FUNCTION/],
  ['cabin chief has an independent rates object', /const CABIN_CHIEF_RATES[\s\S]*?cabin_chief: CABIN_CHIEF_RATES/],
  ['pilot first officer segregated explicitly', /pilot_first_officer: PILOT_RATES\.first_officer/],
  ['pilot commander segregated explicitly', /pilot_commander: PILOT_RATES\.commander/],
  ['unknown pilot function fails closed', /key: 'unknown'[\s\S]*?rates: EMPTY_SALARY_RATES[\s\S]*?manual: true/],
  ['profile exposes effective date', /effectiveFrom: ACT_FINANCIAL_RULES_EFFECTIVE_FROM/],
  ['profile exposes source URL', /sourceUrl: ACT_FINANCIAL_RULES_SOURCE_URL/],
];

for (const [label, pattern] of checks) assert.match(financialRulesSource, pattern, label);

assert.match(homeSource, /perDiemSlotAmount\(rate\.mainMeal, slot, cfg\.breakfastPercent\)/);
assert.match(homeSource, /roundCurrencyAmount\(cfg\.learnedBreakfast\)/);
assert.doesNotMatch(homeSource, /rate\.mainMeal \* cfg\.breakfastPercent/);
assert.match(premiumRulesSource, /CREWCHECK_MAIN_MEAL_VALUE = 109\.95/);
assert.match(premiumRulesSource, /CREWCHECK_BREAKFAST_VALUE = 27\.49/);

console.log(`regression-p1-act-financial-rates-by-function: ${checks.length + 12}/${checks.length + 12} checks passed`);
