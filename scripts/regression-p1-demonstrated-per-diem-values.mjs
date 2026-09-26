import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync('client/src/lib/financialAmounts.ts', 'utf8');
const transformed = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const amounts = await import(`data:text/javascript;base64,${Buffer.from(transformed.outputText).toString('base64')}`);

assert.equal(amounts.DOMESTIC_MAIN_MEAL_BRL, 109.44);
assert.equal(amounts.DOMESTIC_BREAKFAST_BRL, 27.36);
assert.equal(amounts.BREAKFAST_PERCENT, 0.25);
assert.equal(amounts.DOMESTIC_PER_DIEM_SOURCE, 'confirmed_statement');
assert.equal(amounts.DOMESTIC_PER_DIEM_SOURCE_PERIOD, '2026-08-05/2026-09-01');
assert.equal(amounts.perDiemSlotAmount(109.44, 'breakfast'), 27.36);
assert.equal(amounts.perDiemSlotAmount(109.44, 'lunch'), 109.44);

const total = (mainMeals, breakfasts) => amounts.roundCurrencyAmount(
  mainMeals * amounts.DOMESTIC_MAIN_MEAL_BRL
    + breakfasts * amounts.DOMESTIC_BREAKFAST_BRL,
);

// Fechamentos reproduzidos do demonstrativo anonimizado confirmado.
assert.equal(total(7, 2), 820.80);
assert.equal(total(5, 0), 547.20);
assert.equal(total(9, 1), 1012.32);
assert.equal(total(11, 0), 1203.84);
assert.equal(total(32, 3), 3584.16);

const financialRules = fs.readFileSync('client/src/lib/financialRules.ts', 'utf8');
const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
assert.match(financialRules, /mainMeal: DOMESTIC_MAIN_MEAL_BRL/);
assert.match(financialRules, /breakfastPercent: BREAKFAST_PERCENT/);
assert.match(home, /classification\.rateKey === 'domestic'[\s\S]{0,100}?DOMESTIC_BREAKFAST_BRL/);
assert.match(home, /perDiemSlotAmount\(rate\.mainMeal, slot, cfg\.breakfastPercent\)/);
assert.match(home, /roundCurrencyAmount\(cfg\.learnedBreakfast\)/);

console.log('CrewCheck demonstrated domestic per-diem values regression OK');
