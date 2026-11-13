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
const entry = `import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{exportReport}from${JSON.stringify(root + '/client/src/lib/pdfExport.ts')};
import{analyzeCompliance}from${JSON.stringify(root + '/client/src/lib/complianceEngine.ts')};
const Brand=()=>null;${view}
const roster={crewName:'PESSOA SINTETICA',crewId:'SYNTHETIC',rank:'COMISSARIO',base:'AAA',month:10,year:2032,rawText:'PRIVATE RAW MUST NOT EXPORT',days:Array.from({length:31},(_,i)=>({date:String(i+1).padStart(2,'0')+'/10/2032',type:'DO',pairingCode:i===0?'VC':'DO',dutyReport:null,dutyDebrief:null,legs:i===1?Array.from({length:12},(_,n)=>({flightNumber:'QA'+(9900+n),origin:'AAA',destination:'BBB',departureTime:'08:00',arrivalTime:'09:00',workType:'OP'})):[],rawText:'THIRD PARTY NAME MUST NOT EXPORT'}))};
const bundle={roster},compliance=analyzeCompliance(roster),gym=[];const notices=[];
const toast={message:m=>{notices.push(m);window.__notices=notices;},success:m=>{notices.push(m);window.__notices=notices;},error:m=>{notices.push('ERROR '+m);window.__notices=notices;}};
window.__make=async mode=>{const pdf=await exportReport(roster,compliance,[],{mode});return{fileName:pdf.fileName,data:Array.from(new Uint8Array(await pdf.blob.arrayBuffer()))};};
window.__badMonth=()=>roster.month=0;window.__notices=notices;
const actions=new Proxy({pdf:${handlers.pdf},pdfFridge:${handlers.pdfFridge}},{get:(o,k)=>o[k]||(()=>{})});
createRoot(document.getElementById('root')).render(<main className='cz-app'><ExportToolsView actions={actions}/></main>);`;
await build({ stdin: { contents: entry, resolveDir: root, loader: 'tsx' }, bundle: true, format: 'iife', jsx: 'automatic', outfile: out + '/app.js', logLevel: 'silent' });
let css = '';
const assets = path.join(root, 'dist/assets');
if (fs.existsSync(assets)) css = fs.readdirSync(assets).filter(f => f.endsWith('.css')).map(f => fs.readFileSync(path.join(assets, f), 'utf8')).join('\n');
const server = http.createServer((req, res) => {
  if (req.url === '/app.js') { res.setHeader('content-type', 'text/javascript'); res.end(fs.readFileSync(out + '/app.js')); }
  else { res.setHeader('content-type', 'text/html'); res.end(`<meta name="viewport" content="width=device-width"><style>${css}</style><div id="root"></div><script src="/app.js"></script>`); }
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
    await page.getByRole('button', { name: 'PDF regular', exact: true }).focus(); await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'PDF geladeira');
    assert.ok((await page.evaluate(() => window.__notices)).every(m => m.startsWith('Download solicitado:')));
    if (css) assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: `${out}/${theme}-${width}.png`, fullPage: true });
    await page.evaluate(() => window.__badMonth());
    let unexpectedDownload = 0; page.on('download', () => unexpectedDownload++);
    await page.getByRole('button', { name: 'PDF geladeira', exact: true }).click();
    await page.waitForFunction(() => window.__notices.some(m => m.startsWith('ERROR ')));
    assert.equal(unexpectedDownload, 0); assert.deepEqual(errors, []); assert.equal(blocked, 0);
    results.push({ width, theme, downloads: 4, errorWithoutDownload: true, externalRequests: blocked, styled: Boolean(css) });
    await context.close();
  }
  fs.writeFileSync(out + '/browser-results.json', JSON.stringify(results, null, 2));
  console.log('PASS real Home regular/fridge actions, real PDF bytes/download/repetition, error recovery and keyboard; browser only, no Android save claim');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
