import assert from 'node:assert/strict';
import {financialHistoryComparison as compare} from '../shared/financialHistoryComparison.mjs';
import {loadClientModules} from './lib/ts-module-harness.mjs';
const modules=loadClientModules({files:['client/src/lib/financialRules.ts','client/src/lib/actRules.ts'],prefix:'synthetic-may-mercosul-'});
try {
 const {resolvePerDiemRule,perDiemRate}=modules.load('financialRules');
 // Synthetic May2026 only. No assertion about Bruno's actual year/routes/tariff.
 for(const airport of ['ASU','MVD','EZE','AEP','COR','VVI'])for(const [from,to] of [['GRU',airport],[airport,'GRU']]){
  const rule=resolvePerDiemRule(from,to);assert.equal(rule.kind,'international');assert.equal(perDiemRate(rule.rateKey).currency,'USD');
 }
 assert.equal(perDiemRate(resolvePerDiemRule('BSB','GRU').rateKey).currency,'BRL');
 const row=(periodStart,periodEnd,currency,amountMinor,status='forecast',aggregationLevel='day')=>({periodStart,periodEnd,currency,amountMinor,status,aggregationLevel,category:'allowance'});
 for(const tz of ['UTC','America/Sao_Paulo','Asia/Tokyo']){
  process.env.TZ=tz;
  const rows=[row('2026-05-07','2026-05-07','USD',10000),row('2026-05-08','2026-05-08','USD',2000),row('2026-06-08','2026-06-08','USD',20000),row('2026-05-07','2026-05-07','BRL',30000),row('2026-05-07','2026-05-07','USD',5000,'payment_confirmed')];
  const {groups}=compare(rows);assert.equal(groups.length,4);
  assert.equal(groups.find(x=>x.period==='2026-05'&&x.currency==='USD'&&x.status==='forecast').amountMinor,12000);
  assert.equal(groups.find(x=>x.period==='2026-05'&&x.currency==='USD'&&x.status==='payment_confirmed').amountMinor,5000);
  assert.equal(groups.find(x=>x.currency==='BRL').amountMinor,30000);
  assert.equal(compare([...rows,row('2026-05-09','2026-05-09','USD',null)]).groups.find(x=>x.currency==='USD'&&x.period==='2026-05'&&x.status==='forecast').amountMinor,null);
  assert(compare(rows,{incomplete:true}).groups.every(x=>x.amountMinor===null));
  const weeks=[row('2026-05-06','2026-05-12','USD',10000,'forecast','week'),row('2026-05-13','2026-05-19','USD',20000,'forecast','week')];
  assert.deepEqual(compare(weeks,{grouping:'week'}).groups.map(x=>x.period),['2026-05-06/2026-05-12','2026-05-13/2026-05-19']);
  assert.equal(compare(weeks).groups.length,0,'weekly money is never apportioned to calendar months');
  assert.equal(compare([row('2026-05-31','2026-06-01','USD',999)]).excluded,1);
  assert.deepEqual(compare([]),{groups:[],excluded:0,comparableCurrencies:[]});assert.deepEqual(compare([row('2026-05-07','2026-05-07','USD',100),row('2026-06-08','2026-06-08','BRL',200)]).comparableCurrencies,[],'different currencies cannot establish comparable periods');assert.deepEqual(compare(rows).comparableCurrencies,['USD']);
 }
 console.log('PASS persisted month/week comparison3TZ: native BRL/USD, forecast/confirmed separate, null/incomplete/absence never zero; synthetic MayMercosulUSD classification in both directions; no real year/route/tariff inferred.');
}finally{modules.cleanup();}
