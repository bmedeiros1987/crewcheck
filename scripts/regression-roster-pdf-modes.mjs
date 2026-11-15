import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import ts from 'typescript';

const root = path.resolve(process.env.PDF_EXPORT_SOURCE_ROOT || '.'), out = path.resolve(process.env.PDF_MODES_EVIDENCE_DIR || 'artifacts/pdf-modes');
fs.mkdirSync(out, { recursive: true });
const home = fs.readFileSync(path.join(root, 'client/src/pages/Home.tsx'), 'utf8');
const ast = ts.createSourceFile('Home.tsx', home, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let view; const handlers = {};
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'ExportToolsView') view = node.getText(ast);
  if (ts.isPropertyAssignment(node) && ['pdf', 'pdfFridge'].includes(node.name.getText(ast))) handlers[node.name.getText(ast)] = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
// Fail-first: the published baseline has no second export mode or action.
assert.ok(view && handlers.pdf && handlers.pdfFridge, 'Both real Home PDF actions must exist');
const entry = `import React,{useState}from'react';import{FileText,CalendarDays,Share2,Mail,Phone,Send,Copy,Globe2}from'lucide-react';import{createRoot}from'react-dom/client';
import{exportReport as actualExportReport}from${JSON.stringify(root + '/client/src/lib/pdfExport.ts')};
import{analyzeCompliance}from${JSON.stringify(root + '/client/src/lib/complianceEngine.ts')};
import{RosterFridgeValidationError}from${JSON.stringify(root + '/client/src/lib/rosterFridgePdf.ts')};
const exportReport=(...args)=>{if(window.__internal)throw new TypeError('INTERNAL TECHNICAL DETAIL');return actualExportReport(...args);};
const Brand=()=>null;${view}
const roster={crewName:'PESSOA SINTETICA',crewId:'SYNTHETIC',rank:'COMISSARIO',base:'AAA',month:10,year:2032,rawText:'PRIVATE RAW MUST NOT EXPORT',days:Array.from({length:31},(_,i)=>({date:String(i+1).padStart(2,'0')+'/10/2032',type:'DO',pairingCode:i===0?'VC':'DO',dutyReport:i===1?'05:00':null,dutyDebrief:i===1?'21:00':null,dutyReportSource:'published',dutyDebriefSource:'published',legs:i===1?Array.from({length:12},(_,n)=>({flightNumber:'QA'+(9900+n),origin:'AAA',destination:'BBB',departureTime:'08:00',arrivalTime:'09:00',workType:n===1?'PS':n===2?'':'OP',workTypeSource:n===2||n===3?undefined:'aims-extra-following-v1'})):[],rawText:'THIRD PARTY NAME MUST NOT EXPORT'}))};
const bundle={roster},compliance=analyzeCompliance(roster),gym=[];const notices=[];
const toast={message:m=>{notices.push(m);window.__notices=notices;},success:m=>{notices.push(m);window.__notices=notices;},error:m=>{notices.push('ERROR '+m);window.__notices=notices;}};
window.__make=async mode=>{const pdf=await exportReport(roster,compliance,[],{mode});return{fileName:pdf.fileName,data:Array.from(new Uint8Array(await pdf.blob.arrayBuffer()))};};
window.__dense=async()=>{const dense={...roster,days:roster.days.map(day=>({...day,type:'VOO',pairingCode:'VOO',dutyReport:'05:00',dutyDebrief:'21:00',legs:[{flightNumber:'QA7001',origin:'AAA',destination:'BBB',departureTime:'06:00',arrivalTime:'07:00',workType:'OP',workTypeSource:'aims-extra-following-v1'},{flightNumber:'QA7002',origin:'BBB',destination:'AAA',departureTime:'18:00',arrivalTime:'19:00',workType:'PS',workTypeSource:'aims-extra-following-v1'}]}))};const pdf=await exportReport(dense,compliance,[],{mode:'fridge'});return Array.from(new Uint8Array(await pdf.blob.arrayBuffer()));};
window.__sixWeeks=async(count)=>{const input={...roster,month:8,year:2026,crewName:'MARIA D’AVILA – TESTE',days:Array.from({length:31},(_,i)=>({...roster.days[1],date:String(i+1).padStart(2,'0')+'/08/2026',pairingCode:'SIM – A320',legs:Array.from({length:count},(_,n)=>({...roster.days[1].legs[0],flightNumber:'QA'+(7001+n)}))}))};const pdf=await exportReport(input,compliance,[],{mode:'fridge'});return Array.from(new Uint8Array(await pdf.blob.arrayBuffer()));};
window.__longLeg=async()=>{const input={...roster,month:8,year:2026,crewName:'JOA\u0303O SINTETICO',days:[{...roster.days[1],date:'01/08/2026',pairingCode:'VOO',legs:[1,2,3,4].map(n=>({...roster.days[1].legs[0],flightNumber:n===3?'QA12345678901234567890':'QA'+n}))}]};const pdf=await exportReport(input,compliance,[],{mode:'fridge'});return Array.from(new Uint8Array(await pdf.blob.arrayBuffer()));};
window.__audit=async(name)=>{const day={...roster.days[0],date:'01/10/2032',type:'DO',pairingCode:'DO',legs:[],dutyReport:null,dutyDebrief:null};if(['HSB','HSBE','ASB'].includes(name))Object.assign(day,{type:name,pairingCode:name,dutyReport:'02:07',dutyDebrief:'04:00',dutyReportSource:'published',dutyDebriefSource:'published',legs:[{...roster.days[1].legs[0],presentationTime:'05:10'}]});if(name.startsWith('rest'))day.freeDayStartEvidence={date:name==='rest-mismatch'?'30/09/2032':'01/10/2032',code:'DO',clock:'01:46',clockSource:'published',utcOffsetMinutes:null,timeZoneSource:'unknown',origin:'AIMS published rest tokens',tokenExcerpt:'DO 01:46 BSB',convertedDocument:false};if(name==='rest-conflict')Object.assign(day,{dutyReport:'03:00',dutyReportSource:'published'});if(name==='rest-bad-token')day.freeDayStartEvidence.tokenExcerpt='DO 02:00 BSB';if(name==='rest-zone')Object.assign(day.freeDayStartEvidence,{utcOffsetMinutes:-180,timeZoneSource:'published'});if(name.startsWith('continuity'))Object.assign(day,{type:'LAYOVER',pairingCode:'PERNOITE 2/3',continuityInferred:true,dutyReport:'00:00',dutyDebrief:'23:59',dutyReportSource:undefined,dutyDebriefSource:undefined});if(name==='continuity-published')Object.assign(day,{dutyReport:'19:45',dutyDebrief:'06:30',dutyReportSource:'published',dutyDebriefSource:'published'});if(name==='legacy')delete day.legs;const input={...roster,days:[day]};const before=JSON.stringify(input);const pdf=await exportReport(input,compliance,[],{mode:'fridge'});if(JSON.stringify(input)!==before)throw new Error('source mutated');return Array.from(new Uint8Array(await pdf.blob.arrayBuffer()));};
window.__badName=()=>roster.crewName='ŁUKASZ 李';
window.__edge=async(name)=>{const day={...roster.days[0],type:'HSB',pairingCode:'HSB',legs:[],dutyReport:'22:00',dutyDebrief:'02:00',dutyReportSource:name==='estimated'?'estimated':'published',dutyDebriefSource:name==='estimated'?'estimated':'published',isNextDay:true};const input={...roster,crewName:name==='unicode'?'ŁUKASZ 李':name==='long-name'?'NOME SINTETICO '.repeat(15):name==='too-long-name'?'NOME SINTETICO '.repeat(200):roster.crewName,days:[day]};try{const pdf=await exportReport(input,compliance,[],{mode:'fridge'});return{data:Array.from(new Uint8Array(await pdf.blob.arrayBuffer()))};}catch(error){return{error:error.message};}};
window.__badMonth=()=>roster.month=0;window.__notices=notices;
const actions=new Proxy({pdf:${handlers.pdf},pdfFridge:${handlers.pdfFridge}},{get:(o,k)=>o[k]||(()=>{})});
createRoot(document.getElementById('root')).render(<main className='cz-app'><ExportToolsView actions={actions}/></main>);`;
await build({ stdin: { contents: entry, resolveDir: root, loader: 'tsx' }, bundle: true, format: 'iife', jsx: 'automatic', outfile: out + '/app.js', logLevel: 'silent' });
let css = '';
const assets = path.join(root, 'dist/assets');
if (fs.existsSync(assets)) css = fs.readdirSync(assets).filter(f => f.endsWith('.css')).map(f => fs.readFileSync(path.join(assets, f), 'utf8')).join('\n');
const server = http.createServer((req, res) => {
  if (req.url === '/app.js') { res.setHeader('content-type', 'text/javascript'); res.end(fs.readFileSync(out + '/app.js')); }
  else { res.setHeader('content-type', 'text/html'); res.end(`<meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>${css}</style><div id="root"></div><script src="/app.js"></script>`); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const { chromium } = createRequire(process.env.EXPORT_PLAYWRIGHT_PACKAGE || import.meta.url)('playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
const results = [];
try {
  for (const width of [320, 1280]) for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, acceptDownloads: true, serviceWorkers: 'block' });
    let blocked = 0; const errors = [];
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : (blocked++, route.abort()));
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin); await page.evaluate(theme => { document.documentElement.dataset.theme = theme; document.documentElement.dataset.crewTheme = theme; }, theme);
    const actionButtons = page.locator('.cz-tool-actions button');
    assert.equal(await actionButtons.count(), 9);
    assert.equal(await page.getByRole('button', { name: 'Compartilhar PDF regular', exact: true }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Copiar resumo da escala', exact: true }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Calendário (.ics)', exact: true }).count(), 1);
    for (const button of await actionButtons.all()) {
      assert.equal(await button.locator('svg[aria-hidden="true"]').count(), 1);
      await button.focus();
      assert.ok(await button.evaluate(el => document.activeElement === el));
      if (css) assert.ok(await button.evaluate(el => { const r=el.getBoundingClientRect(); return r.width>=44 && r.height>=44 && r.left>=0 && r.right<=innerWidth; }), 'visible touch targets must fit mobile viewport');
    }
    for (const mode of ['regular', 'fridge']) {
      const generated = await page.evaluate(mode => window.__make(mode), mode);
      assert.ok(Buffer.from(generated.data).subarray(0, 5).equals(Buffer.from('%PDF-')));
      fs.writeFileSync(`${out}/${mode}.pdf`, Buffer.from(generated.data));
      if (mode === 'fridge') assert.match(generated.fileName, /geladeira\.pdf$/);
      const button = page.getByRole('button', { name: mode === 'fridge' ? 'PDF geladeira' : 'PDF regular', exact: true });
      for (let repeat = 0; repeat < 2; repeat++) {
        const pending = page.waitForEvent('download'); await button.click(); const download = await pending;
        const target = `${out}/${theme}-${width}-${mode}-${repeat}.pdf`; await download.saveAs(target);
        assert.equal(await download.failure(), null); assert.ok(fs.statSync(target).size > 1000);
        assert.ok(fs.readFileSync(target).subarray(0, 5).equals(Buffer.from('%PDF-')));
        await button.waitFor({ state: 'visible' }); await page.waitForFunction(() => ![...document.querySelectorAll('button')].some(b => b.disabled));
      }
    }
    if (width === 320 && theme === 'light') {
      for (const name of ['HSB','HSBE','ASB','rest','rest-mismatch','rest-conflict','rest-bad-token','rest-zone','continuity','continuity-published','legacy']) fs.writeFileSync(out + '/audit-' + name + '.pdf', Buffer.from(await page.evaluate(name => window.__audit(name), name)));
      fs.writeFileSync(out + '/dense.pdf', Buffer.from(await page.evaluate(() => window.__dense())));
      fs.writeFileSync(out + '/long-leg-nfd.pdf', Buffer.from(await page.evaluate(() => window.__longLeg())));
      for (const count of [4,6]) fs.writeFileSync(out + '/six-weeks-' + count + '.pdf', Buffer.from(await page.evaluate(count => window.__sixWeeks(count), count)));
      for (const name of ['standby', 'estimated', 'long-name', 'too-long-name', 'unicode']) {
        const edge = await page.evaluate(name => window.__edge(name), name);
        if (name === 'unicode') assert.match(edge.error || '', /não suporta todos os caracteres/);
        else if (name === 'too-long-name') assert.match(edge.error || '', /nome completo não cabe/i);
        else { assert.ok(edge.data); fs.writeFileSync(out + '/' + name + '.pdf', Buffer.from(edge.data)); }
      }
    }
    await page.getByRole('button', { name: 'PDF regular', exact: true }).focus(); await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'PDF geladeira');
    assert.ok((await page.evaluate(() => window.__notices)).every(m => m.startsWith('Download solicitado:')));
    if (css) assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: `${out}/${theme}-${width}.png`, fullPage: true });
    await page.evaluate(() => window.__internal=true);
    await page.getByRole('button', { name: 'PDF geladeira', exact: true }).click();
    await page.waitForFunction(() => window.__notices.some(m => m === 'ERROR Não consegui gerar o PDF geladeira agora.'));
    assert.ok(!(await page.evaluate(() => window.__notices)).some(m => m.includes('INTERNAL TECHNICAL DETAIL')));
    await page.evaluate(() => {window.__internal=false;window.__notices.length=0;});
    await page.evaluate(() => window.__badName());
    let rejectedDownloads = 0; const onRejectedDownload = () => rejectedDownloads++;
    page.on('download', onRejectedDownload);
    await page.getByRole('button', { name: 'PDF geladeira', exact: true }).click();
    await page.waitForFunction(() => window.__notices.some(m => m.includes('não suporta todos os caracteres')));
    assert.equal(rejectedDownloads, 0, 'real Home handler must preserve specific error without download');
    page.off('download', onRejectedDownload);
    await page.evaluate(() => window.__badMonth());
    let unexpectedDownload = 0; page.on('download', () => unexpectedDownload++);
    await page.getByRole('button', { name: 'PDF geladeira', exact: true }).click();
    await page.waitForFunction(() => window.__notices.some(m => m.startsWith('ERROR ')));
    assert.equal(unexpectedDownload, 0); assert.ok((await page.evaluate(() => window.__notices)).some(m => m.includes('Competência da escala inválida'))); assert.deepEqual(errors, []); assert.equal(blocked, 0);
    results.push({ width, theme, downloads: 4, errorWithoutDownload: true, externalRequests: blocked, styled: Boolean(css) });
    await context.close();
  }
  fs.writeFileSync(out + '/browser-results.json', JSON.stringify(results, null, 2));
  console.log('PASS real Home regular/fridge actions, real PDF bytes/download/repetition, error recovery and keyboard; browser only, no Android save claim');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
