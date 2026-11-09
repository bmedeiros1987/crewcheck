import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {jsPDF} from 'jspdf';
const require=createRequire(import.meta.url),{chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||import.meta.url)('playwright');
const worker=fs.readFileSync(require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs'));
const entry=`import React from 'react';import {createRoot}from'react-dom/client';import Importer from './client/src/components/finance/FinancialStatementImporter';createRoot(document.getElementById('root')).render(<Importer mode="per_diem"/>);`;
const output=await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outfile:'/tmp/SYNTHETIC-allowance-continuity.js',format:'iife',jsx:'automatic',loader:{'.css':'empty'},plugins:[{name:'local-worker',setup(b){b.onResolve({filter:/pdf\.worker\.min\.mjs\?url$/},()=>({path:'worker',namespace:'synthetic'}));b.onLoad({filter:/.*/,namespace:'synthetic'},()=>({contents:'export default "/worker.mjs"',loader:'js'}));}}]});
const js=output.outputFiles.find(f=>f.path.endsWith('.js')).text;
const server=http.createServer((req,res)=>{res.setHeader('content-type',req.url==='/worker.mjs'?'application/javascript; charset=utf-8':'text/html; charset=utf-8');res.end(req.url==='/worker.mjs'?worker:'<div id="root"></div><script>'+js.replaceAll('</script','<\\/script')+'</script>');});
const header=['DEMONSTRATIVO DE DIARIAS','De 2032-09-09 até 2032-09-16','Pagamento em 2032-09-18'];
const row=(name,value)=>`2032-09-09 QA9001 SYN SYN ${name} R$ ${value}`;
function pdf(pages){const doc=new jsPDF();doc.setFontSize(10);pages.forEach((lines,p)=>{if(p)doc.addPage();lines.forEach((line,i)=>doc.text(line,12,12+i*8));});return Buffer.from(doc.output('arraybuffer'));}
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 await page.addInitScript(()=>{localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'SYN-import-owner',role:'user'}));localStorage.setItem('crewcheck_auth_token','SYN-token');localStorage.setItem('crewcheck_language','pt');});await page.goto(origin);
 const bytes=()=>page.evaluate(()=>localStorage.getItem('crewcheck_financial_learned_rates_v2:SYN-import-owner'));
 const upload=async(pages,name)=>{await page.locator('input[type=file]').setInputFiles({name,mimeType:'application/pdf',buffer:pdf(pages)});await page.locator('.finance-learning-review').waitFor();};
 await upload([[...header,row('CAFE','27,36')],[...header,row('TAXI','27,36'),'Total depositado na data 2032-09-18: R$ 54,72']],'SYNTHETIC-positive.pdf');
 assert.equal(await bytes(),null,'preview never stores rates');assert.equal(await page.locator('[data-allowance-occurrence-reconciliation]').getAttribute('data-allowance-occurrence-reconciliation'),'balanced');
 await page.getByLabel(/Conferi que o documento pertence/).check();await page.getByRole('button',{name:'Confirmar valores',exact:true}).click();await page.locator('.finance-learning-review').waitFor({state:'hidden'});
 const before=await bytes();assert(before);const parsed=JSON.parse(before);assert.equal(parsed.rates.filter(r=>['per_diem.breakfast','per_diem.taxi'].includes(r.key)&&r.value===27.36).length,2);
 for(const [name,pages,state] of [
  ['ambiguous',[[...header,'2032-09-10 a 2032-09-11'],['CAFE R$ 27,36','Total depositado na data 2032-09-18: R$ 27,36']],'conflict'],
  ['advance',[[...header,'Adiantamentos anteriores'],[...header,'CAFE R$ 99,00','Total depositado na data 2032-09-18: R$ 99,00']],'unavailable'],
  ['quantity',[[...header,'2032-09-09 QA9001 SYN SYN ALMOCO QTD 2 R$ 218,88','Total depositado na data 2032-09-18: R$ 218,88']],'conflict'],
 ]){
  await upload(pages,'SYNTHETIC-'+name+'.pdf');assert.equal(await page.locator('[data-allowance-occurrence-reconciliation]').getAttribute('data-allowance-occurrence-reconciliation'),state);await page.getByLabel(/Conferi que o documento pertence/).check();assert(await page.getByRole('button',{name:'Confirmar valores',exact:true}).isDisabled(),'ambiguous/historical source cannot be promoted after review checkbox');assert.equal(await bytes(),before,'previous owner record is unchanged');await page.getByRole('button',{name:'Descartar',exact:true}).click();assert.equal(await bytes(),before);
 }
 await upload([[...header,row('CAFE','0,00'),'Total depositado na data 2032-09-18: R$ 0,00']],'SYNTHETIC-explicit-zero.pdf');assert.equal(await page.locator('[data-allowance-occurrence-reconciliation]').getAttribute('data-allowance-occurrence-reconciliation'),'balanced');assert.equal(await bytes(),before,'explicit zero still requires confirmation');
 await page.evaluate(()=>{window.dispatchEvent(new Event('crewcheck:auth-will-change'));localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'SYN-other',role:'user'}));localStorage.setItem('crewcheck_auth_token','SYN-other');window.dispatchEvent(new Event('crewcheck:auth-changed'));});await page.locator('.finance-learning-review').waitFor({state:'hidden'});assert.equal(await bytes(),before);assert.equal(await page.evaluate(()=>localStorage.getItem('crewcheck_financial_learned_rates_v2:SYN-other')),null);assert.deepEqual(errors,[]);
 console.log('PASS actual synthetic PDF.js import: physical continuation, equal coffee/taxi distinct, explicit review, ambiguous/advance rejection, prior record preserved, zero not auto-saved and account fence');
}finally{await browser.close();await new Promise(r=>server.close(r));}
