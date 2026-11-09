import test from 'node:test';
import assert from 'node:assert/strict';
import {financialPreviewMetadata as read} from '../../shared/financialPreviewMetadata.mjs';
const base={periodStart:'2032-12-01',periodEnd:'2032-12-02',revision:2,aggregationLevel:'item'};
test('absent legacy context stays unknown, explicit valid metadata is unchanged',()=>{assert.deepEqual(read({}),{state:'unknown'});assert.deepEqual(read(base),{state:'known',periodStart:base.periodStart,periodEnd:base.periodEnd,revision:2});});
for(const patch of [{periodStart:'2032-02-30'},{periodStart:'2033-01-01'},{revision:0},{revision:1.5},{aggregationLevel:'total'},{periodEnd:undefined}])test('reject invalid context '+JSON.stringify(patch),()=>assert.equal(read({...base,...patch}).state,'invalid'));
test('payroll competences remain distinct; absent payroll context is not fabricated',()=>{assert.equal(read({...base,category:'payroll'}).state,'invalid');const result=read({...base,category:'payroll',operationalMonth:'2032-10',payrollMonth:'2032-11',rateMonth:'2032-11',expectedCreditMonth:'2032-12',amountBasis:'net_credit'});assert.equal(result.operationalMonth,'2032-10');assert.equal(result.payrollMonth,'2032-11');assert.equal(result.expectedCreditMonth,'2032-12');});
