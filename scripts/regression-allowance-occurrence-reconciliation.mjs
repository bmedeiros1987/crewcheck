import assert from 'node:assert/strict';
import {loadClientModules} from './lib/ts-module-harness.mjs';
const h=loadClientModules({files:['client/src/lib/financialStatementLearning.ts'],prefix:'synthetic-allowance-reconciliation-'});
try{
 const {learnFinancialStatement}=h.load('financialStatementLearning');
 const header='DEMONSTRATIVO DE DIARIAS\nDe 2032-09-09 até 2032-09-16\nPagamento em 2032-09-18';
 const row=(label,amount='109,44',date='2032-09-09')=>`${date} QA9001 SYN SYN ${label} R$ ${amount}`;
 const one=[header,...Array.from({length:8},(_,i)=>row('ALMOCO','109,44','2032-09-'+String(9+i).padStart(2,'0'))),row('CAFE','27,36'),'Total depositado na data 2032-09-18: R$ 902,88'].join('\n');
 let result=learnFinancialStatement(one,'SYNTHETIC-only.pdf');assert.equal(result.allowanceReconciliation.state,'balanced');assert.equal(result.allowanceReconciliation.sumMinor,90288);assert.deepEqual(result.allowanceReconciliation.counts,{lunch:8,breakfast:1});assert.equal(result.rates.some(r=>r.key==='per_diem.taxi'),false,'absent taxi is not a zero tariff');
 const pages=[{page:1,origin:'pdf-physical',text:[header,...Array.from({length:7},()=>row('JANTAR')),row('CAFE','27,36'),'Total depositado na data 2032-09-18: R$ 848,16'].join('\n')},{page:2,origin:'pdf-physical',text:[row('TAXI','27,36'),row('CAFE','27,36'),'Total depositado na data 2032-09-18: R$ 848,16','Adiantamentos anteriores','Total depositado na data 2032-09-01: R$ 999,00',row('CAFE','99,00','2032-09-01')].join('\n')}];
 const text=pages.map(p=>p.text).join('\f');result=learnFinancialStatement(text,'SYNTHETIC-two-pages.pdf',pages);const r=result.allowanceReconciliation;assert.equal(r.state,'balanced');assert.equal(r.sumMinor,84816);assert.equal(r.depositedMinor,84816);assert.deepEqual(r.counts,{dinner:7,breakfast:2,taxi:1});assert.equal(r.rows.filter(r=>r.page===2&&['taxi','breakfast'].includes(r.rubric)).length,2);assert.equal(result.rates.find(r=>r.key==='per_diem.breakfast').value,27.36,'old advance amount cannot become current tariff');
 result=learnFinancialStatement(text.replaceAll('848,16','848,17'),'SYNTHETIC-cent-error.pdf');assert.equal(result.allowanceReconciliation.state,'mismatch');assert(result.warnings.some(w=>/obrigatória/.test(w)));
 result=learnFinancialStatement(one.replace('ALMOCO R$ 109,44','ALMOCO R$ 109,45'),'SYNTHETIC-line-cent.pdf');assert.equal(result.allowanceReconciliation.state,'mismatch');assert(result.warnings.some(w=>/Tarifas.*divergentes/.test(w)));
 result=learnFinancialStatement([header,row('CAFE','0,00'),'Total depositado na data 2032-09-18: R$ 0,00'].join('\n'),'SYNTHETIC-zero.pdf');assert.equal(result.allowanceReconciliation.state,'balanced');assert.equal(result.allowanceReconciliation.sumMinor,0);assert.equal(result.rates[0].value,0);
 result=learnFinancialStatement(header+'\nTotal depositado na data 2032-09-18: R$ 0,00','SYNTHETIC-absence.pdf');assert.equal(result.allowanceReconciliation.state,'unavailable');assert.equal(result.allowanceReconciliation.sumMinor,null);
 result=learnFinancialStatement(header+'\nCAFE R$ 27,36\nTotal depositado na data 2032-09-18: R$ 27,36','SYNTHETIC-missing-date.pdf');assert.equal(result.allowanceReconciliation.state,'unavailable');
 console.log('PASS synthetic allowance occurrences:902.88/848.16, coffee/taxi distinct, physical pages, repeated footer once, advances excluded, cent mismatch, conflicting rates and absent versus explicit zero');
}finally{h.cleanup();}
