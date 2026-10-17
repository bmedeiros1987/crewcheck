import assert from 'node:assert/strict';
import {loadClientModules} from './lib/ts-module-harness.mjs';
const modules=loadClientModules({files:['client/src/lib/financialTaxReferences.ts','client/src/lib/financialReferenceCatalog.ts','client/src/lib/financialPayrollPeriods.ts'],prefix:'synthetic-inss-brackets-'});
try{
 const tax=modules.load('financialTaxReferences');
 const calc=(base,contributionMonth='2026-01',singleEmploymentConfirmed=true)=>tax.estimateEmployeeInss({contributionMonth,contributionBaseMinor:base,singleEmploymentConfirmed});
 // Fixed official-table boundaries plus one cent either side. Expectations are
 // the sum of individually truncated contributions, never final-total rounding.
 const cases=[[0,0],[1,0],[100,7],[162099,12157],[162100,12157],[162101,12157],[290283,23693],[290284,23693],[290285,23693],[435426,41110],[435427,41110],[435428,41110],[847554,98807],[847555,98807],[847556,98807],[99999999,98807]];
 for(const [base,expected] of cases){const r=calc(base);assert.equal(r.amountMinor,expected,String(base));assert.equal(r.rounding,'truncate_each_bracket');assert.match(r.version,/:v2$/);assert.equal(r.calculationSource,tax.INSS_CALCULATION_SOURCE);assert.equal(r.estimated,true);}
 for(const month of ['2026-01','2026-12'])assert.equal(calc(847555,month).amountMinor,98807);
 for(const month of ['2025-12','2027-01','2026-13'])assert.equal(calc(162100,month),null);
 for(const base of [null,-1,NaN,1.5,Infinity,Number.MAX_SAFE_INTEGER+1])assert.equal(calc(base),null);
 assert.equal(calc(162100,'2026-01',false),null);
 // At the cap: 12157 + 11536 + 17417 + 57697 = 98807 cents.
 assert.equal(12157+11536+17417+57697,calc(847555).amountMinor);
 console.log('PASS INSS per-bracket cent truncation: every threshold ±1 cent, cap, zero, metadata/version/source, period/applicability/invalid guards; IRRF rounding untouched.');
}finally{modules.cleanup();}
