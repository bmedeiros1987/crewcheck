import assert from 'node:assert/strict';
import {build} from 'vite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const outDir=mkdtempSync(path.join(tmpdir(),'next-payment-'));
try{
 await build({configFile:false,logLevel:'silent',build:{lib:{entry:path.resolve('client/src/lib/nextFinancialPayment.ts'),formats:['es'],fileName:()=> 'subject.mjs'},outDir,minify:false}});
 const {nextAllowancePayment,nextPayrollPayment,observedBrlPaymentDate}=await import(pathToFileURL(path.join(outDir,'subject.mjs')));
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
 const pending=nextAllowancePayment(rows,[{iso:days[0],airport:'BSB',reason:'Synthetic APZ evidence absent'}],['2032-01','2032-02'],now,days);
 assert.equal(pending.totals,null);assert.deepEqual(pending.calculationTotals,{BRL:70});assert.equal(pending.calculationPartial,true);assert(pending.issues.some(issue=>issue.includes('Synthetic APZ evidence absent')));
 const partialPayroll=nextPayrollPayment([{...candidate,lines:[{...rows[0],value:100},{...rows[1],value:null}],issues:['Synthetic missing credit evidence']}],now);
 assert.equal(partialPayroll.totals,null);assert.deepEqual(partialPayroll.calculationTotals,{BRL:100});

 const taxi=nextAllowancePayment(rows,[{iso:days[0],airport:'BSB',reason:'Tarifa de táxi confirmada para o período ausente.'}],['2032-01','2032-02'],now,days);assert.deepEqual(taxi.calculationTotals,{BRL:70});assert(taxi.issues.some(x=>x.includes('táxi')));
 const mixed=nextAllowancePayment([...rows,{...rows[0],currency:'USD',value:30,convertedBRL:null},{...rows[0],value:NaN},{...rows[0],value:-50}],[],['2032-01','2032-02'],now,days.slice(1));assert.equal(mixed.totals,null);assert.deepEqual(mixed.calculationTotals,{BRL:70,USD:30});
 for(const timezone of ['UTC','America/Sao_Paulo','Asia/Tokyo']){
  process.env.TZ=timezone;
  const octoberDays=Array.from({length:7},(_,i)=>`2026-10-${14+i}`),octoberRow={iso:'2026-10-14',currency:'BRL',value:37.50,convertedBRL:37.50,label:'SYNTHETIC ONLY',source:'synthetic'};
  const partialDate=nextAllowancePayment([octoberRow],[{iso:'2026-10-14',airport:'BSB',reason:'Synthetic missing published report'}],['2026-10'],new Date('2026-10-18T15:00:00Z'),octoberDays);
  assert.equal(partialDate.range.start,'2026-10-14');assert.equal(partialDate.range.end,'2026-10-20');assert.equal(partialDate.expectedPaymentDates.BRL,'2026-10-22');assert.equal(partialDate.totals,null);assert.deepEqual(partialDate.calculationTotals,{BRL:37.50});
  assert.equal(nextAllowancePayment([],[],['2026-10'],new Date('2026-10-18T15:00:00Z'),octoberDays).expectedPaymentDates.BRL,'2026-10-22','known BRL reference date is independent of an unknown amount');
  assert.equal(observedBrlPaymentDate('2026-01-01'),null,'prior-year Wednesday outside verified calendar is not invented');assert.equal(observedBrlPaymentDate('2026-07-09'),'2026-07-08');assert.equal(observedBrlPaymentDate('2027-10-21'),null,'unverified banking year stays unknown');
 }
 console.log('PASS next payment: eligible closed cycle, cross-month own rows, coverage/day/invalid/no-data guards; reviewed payroll month, own-line total and incomplete earliest cycle.');
}finally{rmSync(outDir,{recursive:true,force:true});}
