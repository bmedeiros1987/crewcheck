import assert from 'node:assert/strict';
import {loadClientModules} from './lib/ts-module-harness.mjs';
const h=loadClientModules({files:['client/src/lib/financialStatementLearning.ts'],prefix:'synthetic-allowance-page-continuity-'});
const header='DEMONSTRATIVO DE DIARIAS\nDe 2032-09-09 até 2032-09-16\nPagamento em 2032-09-18';
const row=(label,value,date='2032-09-09')=>`${date} QA9001 SYN SYN ${label} R$ ${value}`;
const deposit=value=>`Total depositado na data 2032-09-18: R$ ${value}`;
const cases=[];
try{
 const {learnFinancialStatement}=h.load('financialStatementLearning');
 const read=texts=>{const pages=texts.map((text,index)=>({text,page:index+1,origin:'pdf-physical'}));return learnFinancialStatement(pages.map(p=>p.text).join('\f'),'SYNTHETIC-page-continuity.pdf',pages);};
 const check=(name,fn)=>{try{fn();cases.push({name,status:'PASS'});}catch(error){cases.push({name,status:'FAIL',message:error.message});}};
 check('ambiguous heading cannot authorize a bare unit on next physical page',()=>{
  const value=read([header+'\n2032-09-10 a 2032-09-11','CAFE R$ 27,36\n'+deposit('27,36')]);
  assert.equal(value.rates.length,0);assert.equal(value.allowanceReconciliation.unitCandidates.length,0);assert(value.warnings.some(w=>/obrigatória/.test(w)),'ambiguous source must block reviewed application');
 });
 check('repeated period header does not leave historical advances',()=>{
  const value=read([header+'\nAdiantamentos anteriores',header+'\nCAFE R$ 99,00\n'+deposit('99,00')]);
  assert.equal(value.rates.length,0);assert.equal(value.allowanceReconciliation.sumMinor,null);assert.notEqual(value.allowanceReconciliation.state,'balanced');
 });
 check('legitimate dated continuation retains equal coffee and taxi separately',()=>{
  const value=read([header+'\n'+row('CAFE','27,36'),header+'\n'+row('TAXI','27,36')+'\n'+deposit('54,72')]);
  assert.equal(value.allowanceReconciliation.state,'balanced');assert.equal(value.allowanceReconciliation.sumMinor,5472);assert.deepEqual(value.allowanceReconciliation.counts,{breakfast:1,taxi:1});assert.deepEqual(value.allowanceReconciliation.rows.map(r=>[r.page,r.rubric,r.iso]),[[1,'breakfast','2032-09-09'],[2,'taxi','2032-09-09']]);
 });
 check('current structured occurrence can resume after historical footer',()=>{
  const value=read([header+'\nAdiantamentos anteriores\n'+row('CAFE','99,00','2032-09-01'),header+'\n'+row('CAFE','27,36')+'\n'+deposit('27,36')]);
  assert.equal(value.allowanceReconciliation.state,'balanced');assert.equal(value.rates[0].value,27.36);assert.equal(value.allowanceReconciliation.rows[0].page,2);assert.equal(value.allowanceReconciliation.rows[0].origin,'pdf-physical');
 });
 check('line quantity/subtotal is not evidence of a unit tariff',()=>{
  for(const text of ['ALMOCO QTD 2 R$ 218,88','ALMOCO 2 R$ 218,88','2 ALMOCO R$ 218,88','ALMOCO UNITARIO R$ 109,44 SUBTOTAL R$ 218,88']){
   const value=read([header+'\n2032-09-09 QA9001 SYN SYN '+text+'\n'+deposit('218,88')]);
   assert.equal(value.rates.length,0,text);assert.equal(value.allowanceReconciliation.unitCandidates.length,0,text);assert.equal(value.allowanceReconciliation.state,'conflict',text);assert(value.warnings.some(w=>/obrigatória/.test(w)),text);
  }
 });
 check('an ISO date is not an implicit quantity',()=>{
  const value=read([header+'\n2032-09-09 CAFE R$ 27,36\n'+deposit('27,36')]);assert.equal(value.allowanceReconciliation.state,'balanced');assert.equal(value.rates[0].value,27.36);
 });
 console.log(JSON.stringify(cases,null,2));assert(cases.every(c=>c.status==='PASS'),'page continuity counterproofs failed');
}finally{h.cleanup();}
