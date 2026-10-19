import assert from 'node:assert/strict';
import {loadClientModules} from './lib/ts-module-harness.mjs';
const modules=loadClientModules({files:['client/src/lib/salaryDisplayBasis.ts'],prefix:'salary-display-basis-'});
try{
 const {salaryDisplaySummary:summary}=modules.load('salaryDisplayBasis');
 const month='2032-02';
 const value=amountMinor=>({amountMinor,kind:'deduction',currency:'BRL',source:'manual',sourceId:'synthetic',recurrence:'once'});
 const record=(m=month)=>({schema:1,ownerId:'synthetic',month:m,revision:1,closed:false,values:{inss:value(10000),irrf:value(0),other_deductions:value(5000)}});
 assert.equal(summary('net',2000,true,[month],[record()]).amount,1850);
 assert.equal(summary('gross',2000,true,[month],[record()]).amount,2000);
 assert.equal(summary('net',null,true,[month],[record()]).amount,null);
 assert.equal(summary('net',2000,false,[month],[record()]).amount,null);
 assert.equal(summary('gross',2000,false,[month],[record()]).amount,2000,'known gross subtotal remains available');
 for(const field of ['inss','irrf','other_deductions'])for(const state of ['absent','null','negative','wrong-kind']){
  const r=record();if(state==='absent')delete r.values[field];else if(state==='wrong-kind')r.values[field].kind='earning';else r.values[field].amountMinor=state==='null'?null:-1;
  assert.equal(summary('net',2000,true,[month],[r]).amount,null,field+':'+state);
 }
 assert.equal(summary('net',2000,true,[month],[null]).amount,null);
 assert.equal(summary('net',2000,true,[month],[record('2032-01')]).amount,null,'previous operational month deductions cannot serve payroll month');
 assert.equal(summary('net',2000,true,[],[]).amount,null,'unlinked cycle unavailable');
 const zero=record();for(const x of Object.values(zero.values))x.amountMinor=0;
 assert.equal(summary('net',0,true,[month],[zero]).amount,0,'evidenced zero retained');
 assert.equal(summary('net',2000,true,[month],[zero]).amount,2000);
 const other=record('2032-03');assert.equal(summary('net',4000,true,[month,'2032-03'],[record(),other]).amount,3700);
 other.ownerId='another';assert.equal(summary('net',4000,true,[month,'2032-03'],[record(),other]).amount,null,'no cross-account composition');
 for(const amount of [NaN,Infinity,-1,Number.MAX_SAFE_INTEGER])assert.equal(summary('net',amount,true,[month],[record()]).amount,null);
 const before=JSON.stringify(record()),r=JSON.parse(before);summary('net',2000,true,[month],[r]);assert.equal(JSON.stringify(r),before,'presentation never mutates source');
 console.log('PASS salary display basis: exact monthly links, cross-cycle/owner isolation, missing versus explicit zero, incomplete gross, invalid amounts, immutable source');
}finally{modules.cleanup();}
