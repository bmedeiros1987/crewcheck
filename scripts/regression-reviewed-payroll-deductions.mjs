import assert from 'node:assert/strict';
import {loadClientModules} from './lib/ts-module-harness.mjs';
const modules=loadClientModules({files:['client/src/lib/reviewedPayrollDeductions.ts','client/src/lib/privatePayrollExtraction.ts']});
try{
 const {planReviewedPayrollDeductions:plan,payrollDeductionRows:rows}=modules.load('reviewedPayrollDeductions');
 const {extractPrivatePayroll:extract}=modules.load('privatePayrollExtraction');
 const f='sha256:'+'a'.repeat(64),val=amountMinor=>({amountMinor,currency:'BRL',kind:'deduction',source:'manual',sourceId:'synthetic',recurrence:'once'});
 const text=(body='INSS 100,00\nIRRF 50,00\nPlano 20,00',totals='TOTAIS 1000,00 170,00\nLiquido 830,00')=>'Competencia 02/2032\nDESCONTOS\n'+body+'\n'+totals;
 const make=(extraction=extract(text()))=>({ownerId:'synthetic-A',expectedSession:'session-A',currentSession:'session-A',documentFingerprint:f,documentKind:'monthly',month:'2032-02',current:{schema:1,ownerId:'synthetic-A',month:'2032-02',revision:3,closed:false,values:{inss:val(9000),irrf:val(4000),rubric_other:val(123)}},expectedRevision:3,extraction,selection:rows(extraction).filter(r=>r.eligible).map(r=>({rowId:r.rowId,bucket:r.bucket})),completeBuckets:['inss','irrf','other_deductions'],ownershipAndMonthConfirmed:true});
 let count=0;const test=(id,fn)=>{fn();count++;console.log('PASS',id);};const clone=x=>JSON.parse(JSON.stringify(x));
 test('D01',()=>{const r=plan(make());assert.equal(r.reviewable,true);assert.deepEqual(Object.values(r.changes).map(v=>v.amountMinor),[10000,5000,2000]);});
 test('D02',()=>assert.equal(Object.values(plan(make()).changes).reduce((s,v)=>s+v.amountMinor,0),17000));
 test('D03',()=>{const e=extract('Competencia 02/2032\nPROVENTOS\nRestituicao INSS 100,00');assert.equal(rows(e)[0].eligible,false);});
 test('D04',()=>{const r=plan(make(extract(text('INSS 0,00',''))));assert.equal(r.changes.inss.amountMinor,0);assert.equal(Object.hasOwn(r.changes,'irrf'),false);});
 test('D05',()=>{const a=make();a.selection=a.selection.slice(0,1);const before=JSON.stringify(a.current);const r=plan(a);assert.deepEqual(Object.keys(r.changes),['inss']);assert.equal(JSON.stringify(a.current),before);});
 test('D06',()=>{const r=plan(make());assert.equal(r.beforeAfter[0].before.amountMinor,9000);assert.equal(r.beforeAfter[0].after.amountMinor,10000);});
 test('D07',()=>{const a=make();a.selection.push({...a.selection[0],bucket:'other_deductions'});assert.equal(plan(a).reviewable,false);});
 test('D08',()=>{const a=make();a.extraction.items[0].amount.candidates[0].sources.push({...a.extraction.items[0].amount.candidates[0].sources[0],page:2});assert.equal(plan(a).reviewable,false);});
 test('D09',()=>{const a=make();a.extraction.items.push(clone(a.extraction.items[0]));a.selection.push({rowId:'row-3',bucket:'inss'});assert.match(plan(a).reasons.join(' '),/mesma origem/);});
 test('D10',()=>{const r=plan(make(extract(text('INSS 100,00 200,00',''))));assert.equal(r.reviewable,false);});
 test('D11',()=>assert.equal(plan(make(extract(text('INSS -100,00','')))).reviewable,false));
 test('D12',()=>assert.equal(plan(make(extract(text()+'\nCompetencia 03/2032'))).reviewable,false));
 test('D13',()=>{const a=make();a.month='2032-03';assert.equal(plan(a).reviewable,false);});
 test('D14',()=>assert.equal(plan(make(extract(text('INSS 100,00','TOTAIS 3000,00 100,00\nLiquido 2800,00')))).reviewable,false));
 test('D15',()=>{assert.equal(plan(make(extract(text('INSS 100,00','TOTAIS 3000,00 100,00\nLiquido 2900,00')))).reviewable,true);const a=make();a.ownershipAndMonthConfirmed=false;assert.equal(plan(a).reviewable,false);});
 test('D16',()=>{const r=plan(make(extract(text('INSS 100,00',''))));assert.equal(r.reviewable,true);assert.equal(r.reconciliation,'unavailable');assert.equal(Object.hasOwn(r.changes,'other_deductions'),false);});
 test('D17',()=>{const r=plan(make(extract(text('INSS 100,00','TOTAIS 1000,00 170,00\nLiquido 830,00'))));assert.equal(r.changes.inss.amountMinor,10000);assert.equal(Object.hasOwn(r.changes,'other_deductions'),false,'no guessed residual');});
 test('D18',()=>{const a=make(extract(text('INSS 100,00\nINSS ajuste 10,00','')));a.selection=a.selection.slice(0,1);assert.equal(plan(a).reviewable,false);});
 test('D19',()=>{for(const kind of ['special','unknown']){const a=make();a.documentKind=kind;assert.equal(plan(a).reviewable,false);}});
 test('D20',()=>{const r=plan(make(extract(text('Adiantamento 20,00',''))));assert.equal(r.changes.other_deductions.recurrence,'once');});
 test('D21',()=>{const a=make();a.current.ownerId='synthetic-B';assert.equal(plan(a).reviewable,false);});
 test('D22',()=>{const a=make();a.currentSession='renewed-session';assert.equal(plan(a).reviewable,false);});
 test('D23',()=>{const a=make();a.current.revision++;assert.equal(plan(a).reviewable,false);});
 test('D24',()=>{const r=plan(make());assert.equal(r.applicationAvailable,false);assert.match(r.applicationReason,/gravação segura/);});
 test('D25',()=>{for(const change of [a=>a.current=null,a=>a.current.closed=true,a=>a.expectedRevision=NaN]){const a=make();change(a);assert.equal(plan(a).reviewable,false);}});
 test('D26',()=>{const a=make();a.expectedSession='';assert.equal(plan(a).reviewable,false);a.expectedSession='session-A';a.documentFingerprint='changed';assert.equal(plan(a).reviewable,false);});
 test('D27',()=>{const r=plan(make());assert.ok(!JSON.stringify(r).includes('DESCONTOS'));assert.ok(r.rows.every(row=>row.locations.every(source=>!Object.hasOwn(source,'text'))));});
 test('D28',()=>assert.equal(plan(make()).rollbackAvailable,false,'undo executor stays disabled until proof'));
 test('D29',()=>{const a=make();a.current.revision++;const r=plan(a);assert.equal(r.rollbackAvailable,false);assert.equal(r.reviewable,false);});
 test('D30',()=>{const a=clone(make());assert.equal(plan(a).applicationAvailable,false,'reload cannot make disabled writes available');});
 test('D31',()=>{const a=make(),before=JSON.stringify(a);const r=plan(a);assert.equal(JSON.stringify(a),before);assert.equal(Object.hasOwn(r,'paymentConfirmed'),false);});
 test('D32',()=>assert.equal(plan(make()).futureEstimate.enabled,false));
 test('D33',()=>assert.equal(plan(make()).futureEstimate.reason,'Faltam regras e base para projetar os descontos.'));
 test('D34',()=>{const r=plan(make());assert.ok(Object.values(r.changes).every(v=>v.recurrence==='once'));assert.equal(r.futureEstimate.enabled,false);});
 test('D35',()=>{const a=make();a.month='2032-10';assert.equal(plan(a).reviewable,false);});

 test('C01-qualified-INSS',()=>{const r=plan(make(extract(text('Desconto INSS 100,00',''))));assert.equal(r.reviewable,true);assert.equal(r.changes.inss.amountMinor,10000);assert.equal(Object.hasOwn(r.changes,'other_deductions'),false);});
 test('C02-qualified-IRRF',()=>{const r=plan(make(extract(text('Retencao IRRF 50,00',''))));assert.equal(r.reviewable,true);assert.equal(r.changes.irrf.amountMinor,5000);});
 test('C03-mixed-tax',()=>{const a=make(extract(text('INSS IRRF 100,00','')));assert.equal(rows(a.extraction)[0].classification,'conflict');assert.equal(rows(a.extraction)[0].bucket,null);assert.equal(plan(a).reviewable,false);});
 test('C04-omitted-complement',()=>{const a=make(extract(text('INSS 100,00\nDesconto INSS complementar 20,00','')));a.selection=a.selection.slice(0,1);const r=plan(a);assert.equal(r.reviewable,false);assert.match(r.reasons.join(' '),/omitidas/);});
 test('C05-complete-complement',()=>{const r=plan(make(extract(text('INSS 100,00\nDesconto INSS complementar 20,00',''))));assert.equal(r.reviewable,true);assert.equal(r.changes.inss.amountMinor,12000);});
 test('C06-unknown-not-other',()=>{const a=make(extract(text('Rubrica desconhecida 20,00','')));assert.equal(rows(a.extraction)[0].classification,'unknown');assert.equal(rows(a.extraction)[0].bucket,null);assert.equal(plan(a).reviewable,false);});
 test('C07-omitted-ambiguous',()=>{const a=make(extract(text('INSS 100,00\nINSS IRRF 20,00','')));a.selection=a.selection.filter(x=>x.rowId==='row-0');assert.equal(plan(a).reviewable,false);});
 test('C08-base-not-tax',()=>{const a=make(extract(text('Base INSS 100,00','')));assert.equal(rows(a.extraction)[0].bucket,null);assert.equal(plan(a).reviewable,false);});

 test('C09-selected-exceeds-balanced-total',()=>{const a=make(extract(text('INSS 100,00','TOTAIS 1000,00 90,00\nLiquido 910,00')));assert.equal(a.extraction.reconciliation,'balanced');const r=plan(a);assert.equal(r.reviewable,false);assert.match(r.reasons.join(' '),/excede o total impresso/);});
 test('C10-legitimate-partial-selection',()=>{const a=make();a.selection=a.selection.slice(0,1);const r=plan(a);assert.equal(r.reviewable,true);assert.deepEqual(Object.keys(r.changes),['inss']);assert.equal(r.changes.inss.amountMinor,10000);});
 test('C11-absent-total-not-zero',()=>{const a=make(extract(text('Desconto INSS 100,00','')));assert.equal(a.extraction.totals.deductions.state,'absent');assert.equal(plan(a).reviewable,true);});
 test('C12-explicit-total-zero',()=>{assert.equal(plan(make(extract(text('INSS 100,00','TOTAIS 1000,00 0,00\nLiquido 1000,00')))).reviewable,false);assert.equal(plan(make(extract(text('INSS 0,00','TOTAIS 1000,00 0,00\nLiquido 1000,00')))).reviewable,true);});

 test('C13-conflict-no-preferred-value',()=>{const a=make(extract(text('INSS 100,00\nINSS 200,00','')));const row=rows(a.extraction)[0];assert.equal(row.amountMinor,null);assert.equal(row.amountState,'conflict');assert.deepEqual(row.candidates.map(x=>x.amountMinor),[10000,20000]);assert.deepEqual(row.locations.map(x=>x.line),[3,4]);assert.ok(row.locations.every(x=>x.origin==='document-logical'));assert.equal(plan(a).reviewable,false);});
 test('C14-physical-conflict-origins',()=>{const a=make(extract([{page:7,origin:'pdf-physical',text:text('INSS 100,00\nINSS 200,00','')}]));const row=rows(a.extraction)[0];assert.equal(row.amountMinor,null);assert.deepEqual(row.candidates.map(x=>x.locations[0]),[{page:7,line:3,origin:'pdf-physical'},{page:7,line:4,origin:'pdf-physical'}]);});

 for(const [id,label] of [['C15','Base de calculo INSS'],['C16','INSS base de calculo'],['C17','Base de calculo Retencao IRRF'],['C18','Retencao IRRF base de calculo'],['C19','INSS valor informativo']])test(id,()=>{const a=make(extract(text(label+' 1000,00','')));const row=rows(a.extraction)[0];assert.equal(row.classification,'informational');assert.equal(row.bucket,null);assert.equal(row.eligible,false);assert.equal(plan(a).reviewable,false);});
 test('C20-tax-with-information',()=>{const a=make(extract(text('INSS base de calculo 1000,00\nDesconto INSS 100,00','TOTAIS 1000,00 100,00\nLiquido 900,00')));const r=plan(a);assert.equal(r.reviewable,true);assert.equal(r.changes.inss.amountMinor,10000);assert.equal(r.selectedRows.length,1);});
 test('C21-legitimate-tax-qualifiers',()=>{for(const label of ['Desconto INSS complementar','Retencao IRRF ferias','INSS sobre remuneracao']){const r=plan(make(extract(text(label+' 100,00',''))));assert.equal(r.reviewable,true,label);assert.equal(Object.values(r.changes)[0].amountMinor,10000);}});
 assert.equal(count,56);console.log('PASS56 pure review cases (original35 +21classification/total/provenance/informational counterproofs). No save/undo execution or atomicity proof claimed.');
}finally{modules.cleanup();}
