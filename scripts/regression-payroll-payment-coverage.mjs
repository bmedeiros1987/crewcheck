import assert from 'node:assert/strict';
import {build} from 'vite';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=mkdtempSync(path.join(tmpdir(),'payroll-coverage-'));
try{
 const entry=path.join(dir,'entry.ts');
 writeFileSync(entry,`export {composePayrollPayment,payrollOperationalCoverage,composeOperationalPayrollEstimate} from '${path.resolve('client/src/lib/payrollPaymentComposition.ts')}';export {nextPayrollPayment} from '${path.resolve('client/src/lib/nextFinancialPayment.ts')}';`);
 await build({configFile:false,logLevel:'silent',build:{lib:{entry,formats:['es'],fileName:()=> 'subject.mjs'},outDir:dir,emptyOutDir:false,minify:false}});
 const {composePayrollPayment,payrollOperationalCoverage,composeOperationalPayrollEstimate,nextPayrollPayment}=await import(pathToFileURL(path.join(dir,'subject.mjs')));
 const cycle={operationalVariableMonth:'2031-12',fixedMonth:'2032-01',expectedCreditMonth:'2032-02'};
 const salary={configured:true,config:{baseConfigured:true,fixedAdditionsConfigured:true,basePay:2900,fixedAdditions:100,requiresManualFunction:false,source:'Synthetic reviewed reference'},production:0,reserve:0,standby:0,chief:0,instructorPay:0,rows:[],reserveAssessment:{pendingCount:0},standbyAssessment:{pendingCount:0}};
 const days=Array.from({length:31},(_,i)=>'2031-12-'+String(i+1).padStart(2,'0'));
 const fixed={month:'2032-01',salary,publishedDays:[]};
 const candidate=dates=>composePayrollPayment(cycle,[fixed,{month:'2031-12',salary,publishedDays:dates}]);
 for(const dates of [[],days.slice(0,1),days.slice(0,30),Array(31).fill(days[0]),days.map(date=>date.replace('2031','2030'))]){
  const partial=candidate(dates);assert(partial.issues.length>0);assert.equal(partial.lines.find(line=>line.label==='Salário-base').value,2900,'known fixed pay stays inspectable');
  assert.equal(partial.lines.find(line=>line.label==='Reserva').value,null,'missing operational days do not become a zero variable');
  assert.equal(nextPayrollPayment([partial],new Date('2032-02-02T15:00:00Z')).totals,null,'one day with no activities must never imply a complete payment');
 }
 const complete=candidate(days);assert.deepEqual(complete.issues,[]);assert.deepEqual(nextPayrollPayment([complete],new Date('2032-02-02T15:00:00Z')).totals,{BRL:3000},'fully published rest/no-variable month can have an evidenced zero variable');
 assert.equal(payrollOperationalCoverage('2032-02',Array.from({length:29},(_,i)=>String(i+1).padStart(2,'0')+'/02/2032')).complete,true);
 assert.equal(payrollOperationalCoverage('2032-02',['2032-02-30']).complete,false);
 const flight={iso:'2031-12-01',flight:'SYN1',route:'BSB-CNF',total:120,timeKnown:true,distanceKnown:true,source:'Synthetic flight'};
 const withFlight={...salary,rows:[flight],production:100,chief:20};
 const withKnownFlight=composePayrollPayment(cycle,[fixed,{month:'2031-12',salary:withFlight,publishedDays:days.slice(0,1)}]);assert.equal(withKnownFlight.lines.find(line=>line.label.includes('SYN1')).value,120);assert(withKnownFlight.issues.length>0);
 const fullFlight=composePayrollPayment(cycle,[fixed,{month:'2031-12',salary:withFlight,publishedDays:days}]);assert.deepEqual(nextPayrollPayment([fullFlight],new Date('2032-02-02T15:00:00Z')).totals,{BRL:3120},'flight supplements are not counted twice');
 const operational=composeOperationalPayrollEstimate({month:'2031-12',salary:withFlight,publishedDays:days});
 assert.equal(operational.estimationBasis,'operational_month');assert.deepEqual(operational.calculationTotals,{BRL:3120});assert.equal(operational.timing,'Mês de crédito a confirmar');
 const missingBase=composeOperationalPayrollEstimate({month:'2031-12',salary:{...withFlight,config:{...salary.config,baseConfigured:false,fixedAdditionsConfigured:false},reserveAssessment:{pendingCount:1}},publishedDays:days});
 assert.equal(missingBase.totals,null);assert.deepEqual(missingBase.calculationTotals,{BRL:120});assert.equal(missingBase.calculationPartial,true);
 const missingAddition=composeOperationalPayrollEstimate({month:'2031-12',salary:{...withFlight,config:{...salary.config,fixedAdditions:0,fixedAdditionsConfigured:false}},publishedDays:days});assert.equal(missingAddition.totals,null);assert.deepEqual(missingAddition.calculationTotals,{BRL:3020});
 const explicitZero=composeOperationalPayrollEstimate({month:'2031-12',salary:{...withFlight,config:{...salary.config,fixedAdditions:0,fixedAdditionsConfigured:true}},publishedDays:days});assert.deepEqual(explicitZero.totals,{BRL:3020});
 for(const basePay of [-1,Number.MAX_VALUE]){const invalid=composeOperationalPayrollEstimate({month:'2031-12',salary:{...withFlight,config:{...salary.config,basePay,fixedAdditions:basePay}},publishedDays:days});assert.equal(invalid.totals,null);assert.equal(invalid.calculationPartial,true);}
 console.log('PASS payroll coverage: empty/one-day/partial/duplicate/wrong-month/leap/full; known fixed and flight portions remain separate from complete forecast; no fabricated zero or duplicate supplements.');
}finally{rmSync(dir,{recursive:true,force:true});}
