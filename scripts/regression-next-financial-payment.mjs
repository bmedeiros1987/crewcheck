import assert from 'node:assert/strict';
import {build} from 'vite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const outDir=mkdtempSync(path.join(tmpdir(),'next-payment-'));
try{
 await build({configFile:false,logLevel:'silent',build:{lib:{entry:path.resolve('client/src/lib/nextFinancialPayment.ts'),formats:['es'],fileName:()=> 'subject.mjs'},outDir,minify:false}});
 const {nextAllowancePayment,nextPayrollPayment}=await import(pathToFileURL(path.join(outDir,'subject.mjs')));
 const days=['2032-01-28','2032-01-29','2032-01-30','2032-01-31','2032-02-01','2032-02-02','2032-02-03'];
 const rows=days.map(iso=>({iso,label:'Synthetic meal',currency:'BRL',value:10,convertedBRL:10,source:'Synthetic'}));
 const now=new Date('2032-02-05T15:00:00Z');
 const payment=nextAllowancePayment([...rows,{...rows[0],iso:'2032-02-20',value:99999}],[],['2032-01','2032-02'],now,days);
 assert.deepEqual(payment.totals,{BRL:70});assert.equal(payment.range.start,'2032-01-28');assert.equal(payment.range.end,'2032-02-03');assert.equal(payment.lines.length,7);
 assert.equal(nextAllowancePayment(rows,[],['2032-02'],now,days).totals,null,'cross-month coverage required');
 assert.equal(nextAllowancePayment(rows,[],['2032-01','2032-02'],now,days.slice(1)).totals,null,'missing published days cannot become zero');
 assert.equal(nextAllowancePayment(rows,[{iso:'',airport:'ZZZ'}],['2032-01','2032-02'],now,days).totals,null);
 assert.equal(nextAllowancePayment([],[],['2032-01','2032-02'],now,days).totals,null);
 assert.equal(nextAllowancePayment([...rows,{...rows[0],iso:'2032-01-32'}],[],['2032-01','2032-02'],now,days).totals,null,'invalid calendar dates cannot enter a cycle total');
 const candidate={creditMonth:'2032-02',operationalMonth:'2031-12',fixedMonth:'2032-01',range:{start:'2031-12-01',end:'2032-01-31',valid:true,kind:'custom'},lines:[{...rows[0],value:100},{...rows[1],value:20}],issues:[]};
 assert.deepEqual(nextPayrollPayment([candidate],now).totals,{BRL:120});
 assert.equal(nextPayrollPayment([{...candidate,lines:[{...rows[0],value:null}]},{...candidate,creditMonth:'2032-03'}],now).totals,null,'do not skip an incomplete earliest cycle');
 assert.equal(nextPayrollPayment([{...candidate,creditMonth:'2032-01'}],now).totals,null,'past cycle is not next payment');
 assert.equal(nextPayrollPayment([],now).totals,null);
 console.log('PASS next payment: eligible closed cycle, cross-month own rows, coverage/day/invalid/no-data guards; reviewed payroll month, own-line total and incomplete earliest cycle.');
}finally{rmSync(outDir,{recursive:true,force:true});}
