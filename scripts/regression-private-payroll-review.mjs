import assert from 'node:assert/strict';
import fs from 'node:fs';
import {jsPDF} from 'jspdf';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {loadClientModules} from './lib/ts-module-harness.mjs';
const modules=loadClientModules({files:['client/src/lib/financialStatementLearning.ts','client/src/lib/financialPdfText.ts'],stubs:{authClient:'exports.getStoredUser=()=>({id:"synthetic-private-owner",role:"user"});exports.getToken=()=>"synthetic-local";'}});
const old={localStorage:globalThis.localStorage,window:globalThis.window};
try {
 const learning=modules.load('financialStatementLearning');
 const {learnPayrollStatement:learn}=learning;
 const pdfText=modules.load('financialPdfText');
 const header='DEMONSTRATIVO DE PAGAMENTO\nRUBRICA\nCompetência: 08/2032\n';
 const base='Salário-base mensal R$ 3.000,00';
 const totals='TOTAIS 3.000,00 300,00\nLíquido 2.700,00';
 const parse=body=>learn(header+body,'synthetic-private.pdf');
 // 1: Actual caller's old PDF item join fails closed; geometry path is the production helper.
 const lines=(header+base+'\n'+totals).trim().split('\n');
 const items=lines.flatMap((line,row)=>line.split(' ').map((str,col)=>({str,transform:[10,0,0,10,col*70,800-row*20]})));
 const flattened=learn(items.map(item=>item.str).join(' '),'synthetic-flat.pdf');
 assert.equal(flattened.payrollExtraction.layout,'unstructured'); assert.equal(flattened.payrollExtraction.incomplete,true);assert.equal(flattened.rates.length,0);
 const document={numPages:2,getPage:async page=>({getTextContent:async()=>({items:page===1?items:[]})})};
 const pages=await pdfText.extractFinancialPdfPages(document);
 assert.equal(pages[0].origin,'pdf-physical');assert.equal(pages[1].text,'');
 const reconstructed=learn(pdfText.financialPdfPagesText(pages.slice(0,1)),'synthetic-geometry.pdf',pages.slice(0,1));
 assert.equal(reconstructed.rates[0].value,3000);assert.equal(reconstructed.rates[0].evidence[0].origin,'pdf-physical');
 assert.equal(reconstructed.payrollExtraction.reconciliation,'balanced');
 assert.equal(learn(pdfText.financialPdfPagesText(pages),'synthetic-scanned-page.pdf',pages).payrollExtraction.incomplete,true);
 assert.throws(()=>pdfText.financialPdfPageLines([{str:'Salário-base 100,00'}]),/geometria/);
 const importer=fs.readFileSync('client/src/components/finance/FinancialStatementImporter.tsx','utf8');
 assert.match(importer,/learnFinancialStatement\(financialPdfPagesText\(pages\), file.name, pages\)/);
 assert.match(importer,/extractFinancialPdfPages\(pdf\)/);
 // Exercise real PDF.js text items from a newly generated, wholly fictional PDF, including an empty scanned-like page.
 const syntheticPdf=new jsPDF();
 lines.forEach((line,row)=>syntheticPdf.text(line.normalize('NFD').replace(/[\u0300-\u036f]/g,''),20,20+row*10));
 syntheticPdf.addPage();
 const loadingTask=pdfjs.getDocument({data:new Uint8Array(syntheticPdf.output('arraybuffer')),useSystemFonts:true});
 try {
  const physicalPages=await pdfText.extractFinancialPdfPages(await loadingTask.promise);
  const actual=learn(pdfText.financialPdfPagesText(physicalPages.slice(0,1)),'synthetic-generated.pdf',physicalPages.slice(0,1));
  assert.equal(actual.rates[0].value,3000);assert.equal(actual.rates[0].evidence[0].line,4);
  assert.equal(actual.payrollExtraction.reconciliation,'balanced');assert.equal(physicalPages[1].text,'');
 } finally {await loadingTask.destroy();}
 // 2: Negative signs remain negative; no artificial balanced result.
 for(const notation of ['-100,00','−100,00','(100,00)','100,00-','R$ -100,00','(R$ 100,00)']) {
  const result=parse(base+'\nLíquido '+notation);
  assert.equal(result.payrollExtraction.totals.net.candidates[0].value,-100,notation);
  assert.equal(result.payrollExtraction.reconciliation,'unavailable');assert.equal(result.rates.length,0);
 }
 for(const notation of ['100,00 D','100,00 C','Débito 100,00','Crédito 100,00']) {
  const result=parse(base+'\nLíquido '+notation);assert.equal(result.payrollExtraction.totals.net.state,'conflict');assert.equal(result.payrollExtraction.reconciliation,'unavailable');
 }
 // 3: Raw page text stays ephemeral; even injected evidence text is excluded on actual save.
 const values=new Map();globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value))};globalThis.window=new EventTarget();
 const rate=reconstructed.rates[0]; assert.equal('text' in rate.evidence[0],false);
 assert.equal(learning.saveConfirmedFinancialRates([{...rate,confirmed:true,evidence:[{...rate.evidence[0],text:'SYNTHETIC_PRIVATE_PAGE_TEXT',nested:{secret:'SYNTHETIC_PRIVATE_PAGE_TEXT'}}]}]),true);
 assert.ok(![...values.values()].join('').includes('SYNTHETIC_PRIVATE_PAGE_TEXT'));
 assert.deepEqual(Object.keys(learning.readConfirmedFinancialRates()[0].evidence[0]).sort(),['field','line','origin','page','value']);
 // 4: Multi-column/invalid/redacted fields cannot be repaired by later simple lines, in either order.
 for(const pair of [['INSS 10,00 20,00','INSS 10,00'],['INSS 10,00','INSS 10,00 20,00']]) {
  const result=parse(base+'\nDESCONTOS\n'+pair.join('\n')+'\n'+totals);const item=result.payrollExtraction.items[0];
  assert.equal(item.amount.state,'conflict');assert.equal(item.amount.unresolvedSources.length,1);assert.equal(item.amount.candidates.length,1);
  assert.equal(result.rates.length,0);assert.equal(result.payrollExtraction.reconciliation,'unavailable');
 }
 for(const ambiguous of ['TOTAIS 3.000,00 300,00 123,00','TOTAIS [REDIGIDO]','Total descontos 300,00 123,00','Líquido [REDIGIDO]']) {
  for(const ordered of [ambiguous+'\n'+totals,totals+'\n'+ambiguous]) {
   const result=parse(base+'\n'+ordered);assert.equal(result.payrollExtraction.incomplete,true,ambiguous);assert.equal(result.payrollExtraction.reconciliation,'unavailable',ambiguous);
  }
 }
 for(const other of ['Salário-base mensal 3.000,00 100,00','Salário-base mensal [REDIGIDO]']) {
  for(const body of [base+'\n'+other,other+'\n'+base]) { assert.equal(parse(body).rates.length,0); assert.equal(parse(body).payrollExtraction.monthlyBase.state,'conflict'); }
 }
 // 5: Debit/credit classification is retained before vacation/13th nature.
 const tax=parse('DESCONTOS\nINSS férias 100,00\nIRRF 13º salário 50,00\nPROVENTOS\nFérias 300,00\n13º salário 200,00').payrollExtraction.items;
 assert.deepEqual(tax.map(i=>[i.kind,i.direction,i.nature]),[['deduction','debit','vacation'],['deduction','debit','thirteenth'],['vacation','credit','vacation'],['thirteenth','credit','thirteenth']]);
 // 6: Prefix codes and multiple rows map match offsets, without persisting any text.
 const km=parse('001 100,00 1 KM V CMS - D 100,00\n002 100,00 1 KM V CMS - N 100,00');
 assert.equal(km.rates.length,2);assert.deepEqual(km.rates.map(r=>r.evidence[0].line),[4,5]);
 assert.ok(km.rates.every(r=>r.evidence.length && r.evidence.every(e=>!('text' in e))));
 assert.equal(km.rates[0].evidence[0].origin,'document-logical');
 assert.equal(parse('001 -100,00 1 KM V CMS - D 100,00').rates.length,0);
 assert.equal(parse('001 100,00 1 KM V CMS - D (100,00)').rates.length,0);
 const inline=parse('PROVENTOS\nAdicional 100,00 INSS 10,00');assert.equal(inline.payrollExtraction.incomplete,true);assert.equal(inline.payrollExtraction.items[0].amount.state,'conflict');
 // 7: Duplicates preserve every location; zero stays distinct from missing, conflicts never choose a value.
 const duplicate=parse('DESCONTOS\nINSS 0,00\nINSS 0,00');assert.equal(duplicate.payrollExtraction.items[0].amount.state,'zero');assert.equal(duplicate.payrollExtraction.items[0].amount.candidates[0].sources.length,2);
 assert.equal(parse('').payrollExtraction.monthlyBase.state,'absent');
 const multi=parse(base+'\nCompetência 09/2032\n'+base);assert.equal(multi.rates.length,0);
 // Renewed review: only an explicit monthly reference is a monthly base, not a rubric substring.
 for (const [body,direction,nature] of [
  ['DESCONTOS\nDesconto salário-base R$ 100,00','debit',undefined],
  ['PROVENTOS\nDiferença salário-base R$ 100,00','credit',undefined],
  ['Salário-base de férias R$ 1.000,00','unknown','vacation'],
 ]) {
  const result=parse(body);assert.equal(result.payrollExtraction.monthlyBase.state,'absent',body);
  assert.ok(!result.rates.some(r=>r.key==='salary.base'),body);
  assert.equal(result.payrollExtraction.items[0].direction,direction,body);
  assert.equal(result.payrollExtraction.items[0].nature,nature,body);
 }
 assert.equal(parse('PROVENTOS\nSalário-base mensal R$ 3.000,00').rates[0].value,3000,'explicit monthly base remains a candidate');
 for (const suffix of ['D','C']) {
  const result=parse('001 100,00 1 KM V CMS - D 100,00 '+suffix);
  assert.equal(result.rates.length,0,suffix);assert.equal(result.payrollExtraction.incomplete,true,suffix);assert.equal(result.payrollExtraction.unresolvedSources[0].line,4,suffix);
  assert.ok(result.warnings.some(w=>w.includes('débito/crédito')),suffix);
 }
 const refund=parse('PROVENTOS\nRestituição INSS 100,00').payrollExtraction.items[0];
 assert.equal(refund.direction,'credit');assert.equal(refund.kind,'earning');assert.equal(refund.amount.candidates[0].value,100);
 const contradictory=parse('DESCONTOS\nRestituição INSS 100,00').payrollExtraction.items[0];assert.equal(contradictory.amount.state,'conflict');
 console.log('PASS seven original plus six renewed review fixtures: real caller geometry/flat/scanned, signs, serialization privacy, sticky ambiguity, debit nature, rate offsets, duplicate/zero/competence');
} finally {modules.cleanup();globalThis.localStorage=old.localStorage;globalThis.window=old.window;}
