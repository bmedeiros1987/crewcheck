import assert from 'node:assert/strict';
import {loadClientModules} from './lib/ts-module-harness.mjs';
const modules=loadClientModules({files:['client/src/lib/financialHistoryPeriods.ts','client/src/lib/financialComparisonPeriods.ts'],prefix:'synthetic-comparison-'});
try {
 const {financialRange}=modules.load('financialHistoryPeriods');const {financialComparisonPeriods:periods}=modules.load('financialComparisonPeriods');
 for(const [month,days] of [['2031-02',28],['2032-02',29],['2032-04',30],['2032-10',31]]){
  const scope=financialRange('month',month,'','',''),weeks=periods(scope,'week');
  assert.equal(weeks[0].range.start,scope.start);assert.equal(weeks.at(-1).range.end,scope.end);
  assert.equal(weeks.reduce((n,item)=>n+(Date.parse(item.range.end)-Date.parse(item.range.start))/86400000+1,0),days);
  for(let i=1;i<weeks.length;i++)assert.equal(Date.parse(weeks[i].range.start)-Date.parse(weeks[i-1].range.end),86400000);
  assert.ok(weeks.filter(item=>item.complete).every(item=>(Date.parse(item.range.end)-Date.parse(item.range.start))/86400000===6));
 }
 const clipped=periods(financialRange('custom','','','2032-01-31','2032-03-01'),'month');
 assert.deepEqual(clipped.map(item=>item.complete),[false,true,false]);assert.equal(clipped[1].range.end,'2032-02-29');
 assert.equal(periods(financialRange('year','2032-02','','',''),'month').length,12);
 assert.deepEqual(periods(financialRange('custom','','','2032-02-30','2032-03-01'),'month'),[]);
 console.log('PASS comparison civil periods, leap months, adjacent coverage, partial exclusions');
}finally{modules.cleanup();}
