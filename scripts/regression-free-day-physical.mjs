import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
const {chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || import.meta.url)('playwright');
const out=path.resolve('artifacts/free-day-physical');fs.mkdirSync(out,{recursive:true});
// Physical PDF bytes, synthetic identity/flight numbers/year only. PDF.js and
// parsePDF are the production modules; no source flags are injected by tests.
function pdfBytes(lines,grid=false){
 const escape=s=>s.replaceAll('\\','\\\\').replaceAll('(','\\(').replaceAll(')','\\)');
 const linear=['BT /F1 10 Tf 35 800 Td',...lines.flatMap((line,index)=>[...(index?['0 -20 Td']:[]),'('+escape(line)+') Tj']),'ET'].join('\n');
 const content=grid ? ['BT /F1 8 Tf 35 800 Td ('+escape(lines[0])+') Tj ET','BT /F1 8 Tf 35 780 Td ('+escape(lines[1])+') Tj ET',...lines.slice(2,-1).flatMap((line,col)=>line.split(/\s+/).map((token,row)=>`BT /F1 8 Tf ${35+col*60} ${740-row*15} Td (${escape(token)}) Tj ET`)), 'BT /F1 8 Tf 35 300 Td ('+escape(lines.at(-1))+') Tj ET'].join('\n') : linear;
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1200 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Length '+Buffer.byteLength(content)+' >>\nstream\n'+content+'\nendstream'];
 let body='%PDF-1.4\n';const offsets=[0];objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(body));body+=(i+1)+' 0 obj\n'+object+'\nendobj\n';});const xref=Buffer.byteLength(body);body+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';return Buffer.from(body);
}
function lines(clock, zone=true){return ['Escala de Tripulante Convertida para padrao AIMS','Tripulante: SYNTHETIC TEST - BP: 99999999 - Base: BSB - 01/08/2026 31/08/2026',...Array.from({length:10},(_,i)=>`${String(i+1).padStart(2,'0')}Aug Mon LA ${9001+i} 06:05 07:00 BSB GRU 08:00 08:30`),`12Aug Wed DO ${clock} BSB`,'13Aug Thu DR BSB','14Aug Fri DR BSB','15Aug Sat DR BSB','16Aug Sun DR BSB',...(zone?['Timezone -3: Brasilia']:[])];}
const server=await createServer({configFile:false,root:path.resolve('client'),resolve:{alias:{'@':path.resolve('client/src'),'@shared':path.resolve('shared')}},optimizeDeps:{entries:[]},plugins:[{name:'synthetic-duty-probe',configureServer(server){server.middlewares.use((req,res,next)=>{if(req.url==='/__duty_probe'){res.setHeader('content-type','text/html');res.end('<html><body>Synthetic duty source probe</body></html>');}else next();});}}],server:{host:'127.0.0.1',port:0,fs:{allow:[process.cwd(),fs.realpathSync('node_modules')]}}});await server.listen();const origin='http://127.0.0.1:'+server.httpServer.address().port;
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});const results=[];
try{for(const timezoneId of ['UTC','America/Sao_Paulo','Asia/Tokyo']) for(const layout of ['human','grid']) {
 const context=await browser.newContext({timezoneId,serviceWorkers:'block'});await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());const page=await context.newPage();await page.goto(origin+'/__duty_probe');
 const parse=async bytes=>page.evaluate(async base64=>{const {parsePDF}=await import('/src/lib/pdfParser.ts');const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));return parsePDF(new File([bytes],'synthetic-rest.pdf',{type:'application/pdf'}));},bytes.toString('base64'));
 const versions=[];
 for(const [clock,zone] of [['01:46',true],['08:30',true],['',true],['08:30',false]]) {
  const roster=await parse(pdfBytes(lines(clock,zone),layout==='grid'));const rest=roster.days.find(d=>d.date==='12/08/2026');
  assert.ok(rest,'12Aug survives actual PDF.js/parsePDF');assert.equal(rest.freeDayStartEvidence?.clock??null,clock||null);if(clock){assert.equal(rest.freeDayStartEvidence.utcOffsetMinutes,zone?-180:null);assert.equal(rest.freeDayStartEvidence.clockSource,'published');}else assert.notEqual(rest.freeDayStartEvidence?.clockSource,'published');versions.push(roster);
 }
 const result=await page.evaluate(async({before,after})=>{const {reviewFreeDayPostponements}=await import('/src/lib/freeDayPostponement.ts');return reviewFreeDayPostponements({version:2,owner:'synthetic-owner',period:{year:2026,month:8},roster:before,source:'synthetic planned.pdf'},after,'synthetic revised.pdf','synthetic-owner',true);},{before:versions[0],after:versions[1]});
 assert.equal(result.alerts.length,1);assert.equal(result.alerts[0].delayMinutes,404);assert.equal(result.alerts[0].possibleAmount,700);assert.equal(result.alerts[0].payment,'unconfirmed');results.push({timezoneId,layout,result,versions});await context.close();
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({synthetic:true,chain:'physical PDF -> PDF.js -> parsePDF -> rest evidence -> postponement',results},null,2));console.log('PASS physical PDF rest provenance, absent clocks/zone, grouped404min human/grid in3TZ');
}finally{await browser.close();await server.close();}
