import assert from 'node:assert/strict';
import {build} from 'vite';
import {mkdtempSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=mkdtempSync(path.join(tmpdir(),'payroll-coverage-'));
try{
 const entry=path.join(dir,'entry.ts');
 writeFileSync(entry,`export {composePayrollPayment,payrollOperationalCoverage,composeOperationalPayrollEstimate} from '${path.resolve('client/src/lib/payrollPaymentComposition.ts')}';export {composeSalaryWithDsr} from '${path.resolve('shared/financialSalaryDsr.mjs')}';export {nextPayrollPayment} from '${path.resolve('client/src/lib/nextFinancialPayment.ts')}';`);
 await build({configFile:false,logLevel:'silent',plugins:[{name:'baseline-counterproof',enforce:'pre',transform(code,id){if(!process.env.FINANCIAL_BASELINE_DIR)return;const file=path.join(process.env.FINANCIAL_BASELINE_DIR,path.relative(process.cwd(),id));if(existsSync(file))return readFileSync(file,'utf8');}}],build:{lib:{entry,formats:['es'],fileName:()=> 'subject.mjs'},outDir:dir,emptyOutDir:false,minify:false}});
 const {composePayrollPayment,payrollOperationalCoverage,composeOperationalPayrollEstimate,nextPayrollPayment,composeSalaryWithDsr}=await import(pathToFileURL(path.join(dir,'subject.mjs')));
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
 const complete=candidate(days);assert(complete.issues.some(issue=>issue.includes('Inventário')));assert.equal(nextPayrollPayment([complete],new Date('2032-02-02T15:00:00Z')).totals,null,'published calendar alone cannot certify zero by category');assert.deepEqual(nextPayrollPayment([complete],new Date('2032-02-02T15:00:00Z')).calculationTotals,{BRL:3000});
 assert.equal(payrollOperationalCoverage('2032-02',Array.from({length:29},(_,i)=>String(i+1).padStart(2,'0')+'/02/2032')).complete,true);
 assert.equal(payrollOperationalCoverage('2032-02',['2032-02-30']).complete,false);
 const flight={iso:'2031-12-01',flight:'SYN1',route:'BSB-CNF',total:120,timeKnown:true,distanceKnown:true,source:'Synthetic flight'};
 const withFlight={...salary,rows:[flight],production:100,chief:20};
 const withKnownFlight=composePayrollPayment(cycle,[fixed,{month:'2031-12',salary:withFlight,publishedDays:days.slice(0,1)}]);assert.equal(withKnownFlight.lines.find(line=>line.label.includes('SYN1')).value,120);assert(withKnownFlight.issues.length>0);
 const fullFlight=composePayrollPayment(cycle,[fixed,{month:'2031-12',salary:withFlight,publishedDays:days}]);assert.equal(nextPayrollPayment([fullFlight],new Date('2032-02-02T15:00:00Z')).totals,null);assert.deepEqual(nextPayrollPayment([fullFlight],new Date('2032-02-02T15:00:00Z')).calculationTotals,{BRL:3120},'known flight supplements are retained exactly once, without certifying inventory');
 const operational=composeOperationalPayrollEstimate({month:'2031-12',salary:withFlight,publishedDays:days});
 assert.equal(operational.estimationBasis,'operational_month');assert.deepEqual(operational.calculationTotals,{BRL:3120});assert.equal(operational.timing,'Mês de crédito a confirmar');
 const missingBase=composeOperationalPayrollEstimate({month:'2031-12',salary:{...withFlight,config:{...salary.config,baseConfigured:false,fixedAdditionsConfigured:false},reserveAssessment:{pendingCount:1}},publishedDays:days});
 assert.equal(missingBase.totals,null);assert.deepEqual(missingBase.calculationTotals,{BRL:120});assert.equal(missingBase.calculationPartial,true);
 const missingAddition=composeOperationalPayrollEstimate({month:'2031-12',salary:{...withFlight,config:{...salary.config,fixedAdditions:0,fixedAdditionsConfigured:false}},publishedDays:days});assert.equal(missingAddition.totals,null);assert.deepEqual(missingAddition.calculationTotals,{BRL:3020});
 const explicitZero=composeOperationalPayrollEstimate({month:'2031-12',salary:{...withFlight,config:{...salary.config,fixedAdditions:0,fixedAdditionsConfigured:true}},publishedDays:days});assert.equal(explicitZero.totals,null);assert.deepEqual(explicitZero.calculationTotals,{BRL:3020},'explicit fixed zero is known but not evidence of other categories');
 for(const basePay of [-1,Number.MAX_VALUE]){const invalid=composeOperationalPayrollEstimate({month:'2031-12',salary:{...withFlight,config:{...salary.config,basePay,fixedAdditions:basePay}},publishedDays:days});assert.equal(invalid.totals,null);assert.equal(invalid.calculationPartial,true);}
 // Adapter-level positive proof comes from the shared composition, NOT from
 // the calendar. This fixture is not an implementation of the missing producer.
 const month='2026-11',published=Array.from({length:30},(_,i)=>month+'-'+String(i+1).padStart(2,'0'));
 const source={ownerId:'SYNTHETIC-A',competence:month,sourceId:'synthetic-reviewed-category-inventory',revision:1,effectiveFrom:month+'-01',effectiveTo:month+'-30'};
 const amounts={base:290000,fixedAdditions:10000,production:10000,reserve:0,standby:0,chief:2000,instructor:0};
 const components=Object.entries(amounts).map(([key,amountMinor])=>({...source,key,amountMinor,currency:'BRL',status:'estimated'}));
 const composition=composeSalaryWithDsr({...source,components,componentsExcludeDsr:true,profile:{...source,company:'TAM',role:'cabin',regime:'NB',review:'confirmed',sourceKind:'owner_reviewed'},basisReview:{...source,review:'confirmed'}});
 assert.equal(composition.state,'complete');assert.equal(composition.grossMinor,315636);
 let current=true;
 const dsr={current:true,isCurrent:()=>current,inventoryComplete:true,composition,components,observedParts:components.map(({key,amountMinor})=>({key,amountMinor}))};
 const full={...withFlight,dsr};
 const project=salary=>composeOperationalPayrollEstimate({month,salary,publishedDays:published});
 assert.deepEqual(project(full).totals,{BRL:3156.36});assert.deepEqual(project(full).calculationTotals,{BRL:3156.36});assert.equal(project(full).lines.filter(line=>line.label==='DSR').length,1,'same canonical DSR once');
 assert.equal(project({...full,dsr:{...dsr,inventoryComplete:false}}).totals,null,'canonical amount without category proof stays partial');
 assert.equal(project({...full,dsr:{...dsr,composition:{...composition,competence:'2026-10'}}}).totals,null,'other competence cannot authorize total');
 assert.equal(project({...full,dsr:{...dsr,components:components.map(c=>c.key==='reserve'?{...c,amountMinor:null}:c)}}).totals,null,'omitted zero is unknown');
 assert.equal(project({...full,dsr:{...dsr,components:components.map(c=>({...c,ownerId:'SYNTHETIC-B'}))}}).totals,null,'other account proof rejected');
 current=false;assert.equal(project(full).totals,null,'revoked/session/source revision fence immediately invalidates summary');current=true;
 const unprovedInstructor={...full,rows:[{...flight,total:9999}],dsr:{...dsr,inventoryComplete:false,observedParts:dsr.observedParts.map(p=>p.key==='instructor'?{...p,amountMinor:null}:p)}};
 assert.deepEqual(project(unprovedInstructor).calculationTotals,{BRL:3120},'global/raw instructor row total cannot enter canonical observed subtotal');
 assert.equal(project(unprovedInstructor).lines.find(line=>line.label==='Instrutoria').value,null);
 const fixedMonth='2026-12',fixedSource={...source,competence:fixedMonth,effectiveFrom:fixedMonth+'-01',effectiveTo:fixedMonth+'-31'};
 const fixedComponents=components.map(c=>({...c,...fixedSource,amountMinor:['base','fixedAdditions'].includes(c.key)?c.amountMinor:null,status:['base','fixedAdditions'].includes(c.key)?'estimated':'unavailable'}));
 const fixedDsr={...dsr,inventoryComplete:false,components:fixedComponents,composition:{...composition,competence:fixedMonth,state:'partial',grossMinor:null},observedParts:fixedComponents.map(({key,amountMinor})=>({key,amountMinor}))};
 const differentCycle={operationalVariableMonth:month,fixedMonth,expectedCreditMonth:'2027-01'};
 const cross=composePayrollPayment(differentCycle,[{month,salary:full,publishedDays:published},{month:fixedMonth,salary:{...salary,dsr:fixedDsr},publishedDays:[]}]);
 assert.deepEqual(nextPayrollPayment([cross],new Date('2027-01-01T12:00:00Z')).totals,{BRL:3156.36},'complete operational variables plus confirmed fixed components of another month do not require future variable inventory');
 const foreignFixed={...fixedDsr,components:fixedComponents.map(c=>({...c,ownerId:'SYNTHETIC-B'})),composition:{...fixedDsr.composition,ownerId:'SYNTHETIC-B'}};
 const conflict=composePayrollPayment(differentCycle,[{month,salary:full,publishedDays:published},{month:fixedMonth,salary:{...salary,dsr:foreignFixed},publishedDays:[]}]);
 assert.equal(nextPayrollPayment([conflict],new Date('2027-01-01T12:00:00Z')).calculationTotals,null,'another account never supplies fixed components');
 const sameMonthCycle={operationalVariableMonth:month,fixedMonth:month,expectedCreditMonth:'2026-12'};
 assert.deepEqual(nextPayrollPayment([composePayrollPayment(sameMonthCycle,[{month,salary:full,publishedDays:published}])],new Date('2026-12-01T12:00:00Z')).totals,{BRL:3156.36},'reviewed cycle consumes same composition, no legacy omission');
 console.log('PASS payroll coverage: empty/one-day/partial/duplicate/wrong-month/leap/full; known fixed and flight portions remain separate from complete forecast; no fabricated zero or duplicate supplements.');
}finally{rmSync(dir,{recursive:true,force:true});}
