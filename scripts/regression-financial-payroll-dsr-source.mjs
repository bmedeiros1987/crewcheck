import {syntheticDsrPayroll} from './fixtures/synthetic-dsr-payroll.mjs';
import assert from 'node:assert/strict';
import {loadClientModules} from './lib/ts-module-harness.mjs';
import {assessCabinDsr} from '../shared/financialSalaryDsr.mjs';
const modules=loadClientModules({files:['client/src/lib/financialStatementLearning.ts','client/src/lib/payrollDsrEvidence.ts'],stubs:{authClient:'exports.getStoredUser=()=>globalThis.fixtureUser;exports.getToken=()=>globalThis.fixtureToken;'}});
try {
 const learning=modules.load('financialStatementLearning'),producer=modules.load('payrollDsrEvidence');
 globalThis.fixtureUser={id:'synthetic-A',role:'crew'};globalThis.fixtureToken='synthetic-token-A';
 const store=new Map();globalThis.localStorage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value)};globalThis.window={dispatchEvent:()=>{}};
 const document=syntheticDsrPayroll;
 const learn=(text=document)=>learning.learnFinancialStatement(text,'synthetic-payroll.pdf',[{page:1,text,origin:'pdf-physical'}]);
 const result=learn();assert.equal(result.payrollExtraction.incomplete,false);assert.equal(result.payrollDsrDraft?.regime,'NB');
 const printedRest=learn(document.replace('1326 DSR','1330 Repouso Remunerado'));
 assert.equal(printedRest.payrollExtraction.incomplete,false);
 assert.equal(printedRest.payrollDsrDraft?.regime,'NB','ordinary printed Repouso Remunerado must feed the existing reviewed DSR flow');
 assert.deepEqual(printedRest.payrollDsrDraft.basisMinor,result.payrollDsrDraft.basisMinor);
 assert.equal(printedRest.payrollDsrDraft.reportedDsrMinor,result.payrollDsrDraft.reportedDsrMinor);
 for(const label of ['1330 Repouso Remunerado CMS','1330 repouso remunerado','1330 Descanso Semanal Remunerado']) {
  assert.equal(learn(document.replace('1326 DSR',label)).payrollDsrDraft?.regime,'NB');
 }
 for(const label of ['1330 Ajuste Repouso Remunerado','1330 Repouso Remunerado Férias','1330 Diferença Repouso Remunerado','1330 Repouso Remunerado complementar']) {
  assert.equal(learn(document.replace('1326 DSR',label)).payrollDsrDraft,undefined,'qualified/adjustment rubrics cannot be adopted as ordinary DSR');
 }
 assert.equal(learn(document.replace('1326 DSR','1330 Repouso Remunerado').replace('880,00','879,99')).payrollDsrDraft,undefined,'the alias never bypasses reconciliation');
 assert.deepEqual(result.payrollDsrDraft.basisMinor,{production:220000,reserve:22000,standby:0});
 assert.equal(result.payrollDsrDraft.operationalMonth,'2026-08');assert.equal(result.payrollDsrDraft.payrollMonth,'2026-09');
 assert.equal(learning.confirmedPayrollDsrContext('2026-08'),null,'import draft does not adopt evidence');
 const incoming=learning.applyReviewedPayrollCycle(result).filter(rate=>rate.valueOrigin==='printed').map(rate=>({...rate,confirmed:true}));
 assert.equal(incoming.some(rate=>rate.payrollDsrEvidence),true);
 const saved=learning.mergeConfirmedRates([],incoming);assert.equal(learning.saveConfirmedFinancialRates(saved),true);
 const context=learning.confirmedPayrollDsrContext('2026-08');assert.equal(context.profile.regime,'NB');assert.equal(context.reportedDsr.amountMinor,88000);assert.equal(context.sourcePayrollMonth,'2026-09');
 const components=['production','reserve','standby'].map(key=>({...context.basisReview,key,amountMinor:result.payrollDsrDraft.basisMinor[key],currency:'BRL',status:'estimated'}));
 assert.equal(assessCabinDsr({...context,ownerId:'synthetic-A',competence:'2026-08',components}).amountMinor,88000,'real reader -> real model');
 assert.equal(learning.confirmedPayrollDsrContext('2026-09'),null,'no future/month carry-forward');
 assert.equal(learning.mergeConfirmedRates(learning.readConfirmedFinancialRates(),incoming).length,saved.length,'same evidence reimport is idempotent');
 assert(!JSON.stringify(learning.readConfirmedFinancialRates()).includes('TAM LINHAS AEREAS'),'no full source text saved');
 assert(!JSON.stringify(result.payrollDsrDraft).includes('Gratificação'),'only amounts/classification/source locations');
 for(const altered of [document.replace('TAM LINHAS AEREAS S/A','OTHER COMPANY'),document.replace('COMISSARIO VOO','PILOTO'),document.replace('880,00','879,99'),document.replace('1324 Reserva','1399 Reserva'),document.replace('6.210,00','6.211,00'),document+'\nFROTA WB',document+'\nEMPRESA: OTHER COMPANY',document+'\nCARGO: PILOTO',document+'\nCARGO PILOTO',document+'\nFUNCAO PILOTO',document+'\nEMPRESA OTHER COMPANY',document.replace('1326 DSR','1326 Ajuste DSR'),document.replace('2.200,00','[OCULTO]')])assert.equal(learn(altered).payrollDsrDraft,undefined);
 const wrongPages=learning.learnFinancialStatement(document,'synthetic-other.pdf',[{page:1,text:document+'\nOTHER SOURCE',origin:'pdf-physical'}]);assert.equal(wrongPages.payrollDsrDraft,undefined);
 assert.equal(learn(document.replace('1326 DSR','1326 Férias')).payrollDsrDraft,undefined);
 const withAdvance=learn(document.replace('INSS R$ 100,00','INSS R$ 100,00\nAdiantamento R$ 50,00').replace('6.210,00 100,00','6.210,00 150,00').replace('6.110,00','6.060,00'));assert.equal(withAdvance.payrollDsrDraft?.regime,'NB','nonbasis advance reconciles without becoming recurring or changing DSR basis');
 const unknownHsb=learn(document.replace('1326 DSR','1399 HSB R$ 0,01\n1326 DSR').replace('6.210,00','6.210,01').replace('6.110,00','6.110,01'));assert.equal(unknownHsb.payrollExtraction.incomplete,false);assert.equal(unknownHsb.payrollDsrDraft,undefined,'unsupported HSB code cannot become zero by rounding coincidence');
 const info=learn(document.replace('1037 Gratificação', 'R001 Base CO R$ 333,33\n1037 Gratificação'));assert.equal(info.payrollDsrDraft?.regime,'NB','informational CO does not become additional earnings');
 // A previously reviewed tariff can be enriched only by a fresh reviewed import;
 // keep the old entry, identical value, and source fingerprint as history.
 store.clear();const noMetadata=incoming.map(({payrollDsrEvidence,...rate})=>rate);const old=learning.mergeConfirmedRates([],noMetadata);assert.equal(learning.saveConfirmedFinancialRates(old),true);assert.equal(learning.confirmedPayrollDsrContext('2026-08'),null);
 const archived=learning.readConfirmedFinancialRates();
 const enriched=learning.mergeConfirmedRates(learning.readConfirmedFinancialRates(),incoming);assert.equal(enriched.length,old.length+1);assert.equal(learning.saveConfirmedFinancialRates(enriched),true);assert.equal(learning.confirmedPayrollDsrContext('2026-08').profile.regime,'NB');
 for(const prior of archived)assert.deepEqual(learning.readConfirmedFinancialRates().find(rate=>rate.key===prior.key&&rate.revision===prior.revision&&rate.sourceFingerprint===prior.sourceFingerprint),prior,'prior values remain unchanged');
 const wb=learn(document.replace('880,00','1.037,14').replace('6.210,00','6.367,14').replace('6.110,00','6.267,14'));
 assert.equal(wb.payrollDsrDraft?.regime,'WB');const wbRates=learning.applyReviewedPayrollCycle(wb).filter(rate=>rate.valueOrigin==='printed').map(rate=>({...rate,confirmed:true}));
 assert.equal(learning.saveConfirmedFinancialRates(learning.mergeConfirmedRates(learning.readConfirmedFinancialRates(),wbRates)),true);assert.equal(learning.confirmedPayrollDsrContext('2026-08'),null,'conflicting reported regimes require resolution, never latest-wins');
 globalThis.fixtureUser={id:'synthetic-B',role:'crew'};globalThis.fixtureToken='synthetic-token-B';assert.equal(learning.confirmedPayrollDsrContext('2026-08'),null);assert.equal(learning.saveConfirmedFinancialRates(enriched),false);
 assert.equal(producer.validPayrollDsrEvidence({...result.payrollDsrDraft,text:document}),false,'raw text cannot enter metadata');
 assert.equal(producer.validPayrollDsrEvidence({...result.payrollDsrDraft,reportedDsrMinor:1}),false);
 assert.equal(producer.validPayrollDsrEvidence({...result.payrollDsrDraft,basisMinor:{production:1,reserve:0,standby:0},reportedDsrMinor:0}),false,'archive validator also requires unique ratio');
 store.clear();globalThis.fixtureUser={id:'synthetic-A',role:'crew'};globalThis.fixtureToken='synthetic-token-A';
 const printedRates=learning.applyReviewedPayrollCycle(printedRest).filter(rate=>rate.valueOrigin==='printed').map(rate=>({...rate,confirmed:true}));
 assert.equal(learning.saveConfirmedFinancialRates(learning.mergeConfirmedRates([],printedRates)),true);
 const printedContext=learning.confirmedPayrollDsrContext('2026-08');
 assert.equal(printedContext.reportedDsr.amountMinor,88000,'actual alias -> review -> archive -> operational-month reader');
 assert.equal(printedContext.sourcePayrollMonth,'2026-09');
 assert.equal(learning.confirmedPayrollDsrContext('2026-09'),null,'no alias carries the source into another operational competence');
 assert.equal(learning.mergeConfirmedRates(learning.readConfirmedFinancialRates(),printedRates).length,printedRates.length,'reimport remains idempotent');
 globalThis.fixtureUser={id:'synthetic-B',role:'crew'};
 assert.equal(learning.confirmedPayrollDsrContext('2026-08'),null,'the printed alias does not relax owner isolation');
 console.log('PASS actual payroll extraction -> review/cycle -> immutable owner archive -> DSR source/model: company/cabin, reconciled inventory, CO exclusion, unknown/zero, scope, conflicts, idempotent enrichment, account isolation, no source-text persistence; synthetic only');
}finally{modules.cleanup();}
