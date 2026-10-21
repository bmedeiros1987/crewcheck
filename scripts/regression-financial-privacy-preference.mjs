import assert from 'node:assert/strict';
import {loadClientModules} from './lib/ts-module-harness.mjs';
const harness=loadClientModules({files:['client/src/lib/financialPrivacyPreference.ts']});
try {
 const p=harness.load('financialPrivacyPreference'),map=new Map();
 globalThis.localStorage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
 assert.equal(p.financialValuesHidden(null),true);
 assert.equal(p.financialValuesHidden('synthetic-A'),false);
 p.toggleFinancialValues('synthetic-A');assert.equal(p.financialValuesHidden('synthetic-A'),true);
 assert.equal(map.get(p.FINANCIAL_PRIVACY_PREFIX+'synthetic-A'),'hidden');
 assert.equal(p.financialValuesHidden('synthetic-B'),false,'account switch does not inherit A');
 p.toggleFinancialValues('synthetic-B');p.toggleFinancialValues('synthetic-B');assert.equal(p.financialValuesHidden('synthetic-B'),false);
 assert.equal(p.financialValuesHidden('synthetic-A'),true);
 map.set(p.FINANCIAL_PRIVACY_PREFIX+'synthetic-A','shown');assert.equal(p.financialValuesHidden('synthetic-A'),false,'cross-tab storage is observed synchronously');
 map.set(p.FINANCIAL_PRIVACY_PREFIX+'synthetic-A','broken');assert.equal(p.financialValuesHidden('synthetic-A'),true);
 globalThis.localStorage={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}};
 assert.equal(p.financialValuesHidden('synthetic-C'),true,'blocked storage starts concealed');
 p.toggleFinancialValues('synthetic-C');assert.equal(p.financialValuesHidden('synthetic-C'),false,'reversible memory fallback');
 map.set(p.FINANCIAL_PRIVACY_PREFIX+'synthetic-D','shown');
 globalThis.localStorage={getItem:k=>map.get(k)??null,setItem(){throw Error('quota')}};
 p.toggleFinancialValues('synthetic-D');assert.equal(p.financialValuesHidden('synthetic-D'),true,'write-only storage failure conceals despite old shown preference');
 p.invalidateFinancialPrivacyPreference(undefined);assert.equal(p.financialValuesHidden('synthetic-D'),true,'legacy storage event without key is ignored');
 p.invalidateFinancialPrivacyPreference('unrelated');assert.equal(p.financialValuesHidden('synthetic-D'),true);
 p.invalidateFinancialPrivacyPreference(p.FINANCIAL_PRIVACY_PREFIX+'synthetic-D');assert.equal(p.financialValuesHidden('synthetic-D'),false,'new cross-tab preference supersedes failed-write overlay');
 console.log('PASS privacy preference: synchronous account/device preference, unknown-owner/blocked-storage concealment, account switch and storage-event reads, memory fallback');
} finally {harness.cleanup();}
