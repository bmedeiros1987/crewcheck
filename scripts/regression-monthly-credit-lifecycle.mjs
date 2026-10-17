import assert from 'node:assert/strict';
import {queryFinancialHistory as query} from '../shared/financialReadModel.mjs';
const identity={authenticated:true,role:'owner',ownerId:'synthetic-A'};
const base={id:'A',ownerId:'synthetic-A',revision:1,periodStart:'2026-11-01',periodEnd:'2026-11-30',currency:'BRL',timezone:'America/Sao_Paulo',amountMinor:123400,category:'payroll',amountBasis:'net_credit',aggregationLevel:'month',status:'statement_reported',sourceId:'synthetic-doc',operationalMonth:'2026-09',payrollMonth:'2026-10',rateMonth:'2026-10',expectedCreditMonth:'2026-11'};
const run=(records,aggregationLevel='month')=>query({identity,records,periodStart:'2026-11-01',periodEnd:'2026-11-30',aggregationLevel});
for(const category of ['payroll','vacation']){
 const a={...base,category},settled={...a,id:'B',status:'payment_confirmed',paymentDate:'2026-11-02',evidence:{kind:'settlement',reference:'synthetic-settlement'}};
 for(const records of [[a,settled],[settled,a],[a,{...settled,amountMinor:123401}],[{...a,id:'B',status:'forecast',ruleVersion:'synthetic-rule'},a], [a,{...a,id:'B'}]]){
  const result=run(records);assert.equal(result.state,'incomplete');assert.equal(result.publishable,false);assert.equal(result.records.length,0);assert.equal(result.rejected.length,2);assert(result.rejected.every(x=>x.reason==='duplicate_aggregate_scope'));assert.equal(result.history.length,2,'valid evidence history is preserved despite ambiguous current IDs');assert.equal(result.totals.length,0,'ambiguous monthly credit is not exposed as multiple cash totals');
 }
 const revised=run([a,{...settled,id:'A',revision:2}]);assert.equal(revised.publishable,true);assert.equal(revised.records.length,1);assert.equal(revised.records[0].status,'payment_confirmed');assert.equal(revised.totals[0].amountMinor,123400);assert.deepEqual(revised.history.map(x=>x.revision),[1,2]);
 for(const different of [{sourceId:'other-doc'},{currency:'USD'},{category:category==='payroll'?'vacation':'payroll'}]){
  const result=run([a,{...settled,...different}]);assert.equal(result.publishable,true,'distinct source/currency/category is not silently collapsed');assert.equal(result.records.length,2);
 }
 assert.equal(run([a,{...settled,ownerId:'synthetic-B'}]).records.length,1,'foreign owner cannot create conflict or leak');
}
for(const aggregationLevel of ['day','week']){
 const a={...base,category:'allowance',aggregationLevel,periodStart:'2026-11-01',periodEnd:aggregationLevel==='day'?'2026-11-01':'2026-11-07',status:'forecast',ruleVersion:'synthetic-rule'};
 const b={...a,id:'B',status:'statement_reported'};const result=run([a,b],aggregationLevel);assert.equal(result.publishable,true);assert.equal(result.records.length,2,'forecast versus statement comparison remains available');assert.equal(result.totals.length,2);assert.equal(run([a,{...a,id:'B'}],aggregationLevel).publishable,false,'same-status duplicate aggregate remains rejected');
}
console.log('PASS monthly credit lifecycle: cross-status distinct IDs fail closed, same-ID revisions/history preserved; payroll/vacation, differing amounts, order, source/currency/category/owner isolation, day/week comparison unchanged.');
