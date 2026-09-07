import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { jsPDF } from 'jspdf';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const from = home.indexOf('function requestCrewCheckImportConfirmation(');
const to = home.indexOf('async function confirmRosterImport(', from);
assert.ok(from >= 0 && to > from);
const confirmation = home.slice(from, to);
const handlerStart = home.indexOf('  async function handleFile(inputEvent:');
const handler = home.slice(handlerStart, home.indexOf('  async function copyCurrentSummarySilently', handlerStart));
const bridge = fs.readFileSync('scripts/p1-universal-pdf-intake/home-bridge.txt', 'utf8');
// Exercise the actual prepared handler + bridge + confirmation UI, replacing
// only roster parsing/domain services with spies (no P0 fixture or parser edits).
const entry = `
import React, {useEffect, useState, useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {PdfIntakeQueue, decodeSharedPdf} from './client/src/lib/universalPdfIntake';
import {inspectIntakePdf} from './client/src/lib/inspectIntakePdf';
import UniversalPdfChoice from './client/src/components/UniversalPdfChoice';
import CrewLockerView from './client/src/components/v1435/CrewLockerView';
import {listCrewDocuments} from './client/src/lib/crewlockerOffline';
window.testState = {saves:0, parses:0, acks:[], messages:[]};
window.listTestDocuments = listCrewDocuments;
window.AndroidCrewCheckNative = {acknowledgeSharedPdf: id => window.testState.acks.push(id)};
const toast = Object.fromEntries(['message','error','success','info'].map(k => [k, m => window.testState.messages.push(m)]));
${confirmation}
const parsePDFResilient = async () => { window.testState.parses++; return {roster:{days:[{}]},source:'local'}; };
const confirmRosterImport = async () => ({ok:await requestCrewCheckImportConfirmation({summaryText:'Prévia sintética: 1 dia, 1 voo',periodLabel:'Teste'}),hasFuture:true});
const preservePlannedRosterBeforeImport = () => null;
const sameRosterPeriod = () => false;
const compareRosters = () => null;
const saveRoster = () => {window.testState.saves++;return {};};
const getGymRecommendations = () => [];
const storage = {set:()=>{}};
const syncRosterWithTelegramConcierge = async () => {};
const saveRosterAnalysis = async () => {};
const syncPlatformRoster = async () => {};
const sanitizePdfImportError = e => String(e);
function App(){
  const [view,setView] = useState('cockpit');
  const [bundle,setBundle] = useState({roster:{}});
  const [busy,setBusy] = useState(false);
  const fileRef = useRef(null);
  const setLocation = () => {};
  ${handler}
  ${bridge}
  return <><button onClick={()=>setView('crewlocker')}>Crew Wallet</button><button onClick={()=>setView('cockpit')}>Home</button>
    {pdfChoice && <UniversalPdfChoice file={pdfChoice.file} onChoose={pdfChoice.finish}/>}
    {view === 'crewlocker' && <CrewLockerView incoming={walletImport || undefined} onIncomingDone={()=>walletImport?.finish()}/>}
  </>;
}
createRoot(document.getElementById('root')).render(<App/>);
`;
const compiled = await build({ stdin: { contents: entry, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, write: false,
  format: 'esm', platform: 'browser', alias: {'@': `${process.cwd()}/client/src`},
  plugins: [{name:'pdf-worker-url',setup(builder){builder.onResolve({filter:/pdf\.worker.*\?url$/},()=>({path:'worker-url',namespace:'intake'}));
    builder.onLoad({filter:/.*/,namespace:'intake'},()=>({contents:'export default "/pdf.worker.mjs"',loader:'js'}));}}] });
const server = http.createServer((req,res)=>{
  if(req.url === '/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(compiled.outputFiles[0].text);}
  else if(req.url === '/pdf.worker.mjs'){res.setHeader('Content-Type','text/javascript');fs.createReadStream('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs').pipe(res);}
  else res.end('<html><body><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('button',{name:'Crew Wallet',exact:true}).waitFor();
  const pdf = text => { const doc=new jsPDF();doc.text(text,20,20);return Buffer.from(doc.output('arraybuffer')).toString('base64'); };
  const share = async (id,text,name='Documento.pdf') => page.evaluate(payload=>{
    window.__crewcheckPendingNativePdf=payload;
    window.dispatchEvent(new CustomEvent('crewcheck:native-pdf',{detail:payload}));
  },{shareId:id,dataBase64:pdf(text),filename:name});
  const waitAck = id => page.waitForFunction(id=>window.testState.acks.includes(id),id);

  await share('roster-cancel','AIMS Escala Periodo');
  await page.getByRole('heading',{name:'Ativar esta escala?'}).waitFor();
  assert.equal(await page.evaluate(()=>window.testState.saves),0);
  await page.getByRole('button',{name:'Cancelar',exact:true}).click();
  await waitAck('roster-cancel');
  assert.equal(await page.evaluate(()=>window.testState.saves),0);

  await share('roster-accept','Crewtopia Escala Publicado');
  await page.getByRole('heading',{name:'Ativar esta escala?'}).waitFor();
  await page.getByRole('button',{name:'Ativar escala',exact:true}).click();
  await waitAck('roster-accept');
  assert.equal(await page.evaluate(()=>window.testState.saves),1);
  await share('unknown','Unclassified document','CHT.pdf');
  await page.getByRole('heading',{name:'Onde importar este PDF?'}).waitFor();
  assert.equal(await page.evaluate(()=>window.testState.parses),2);
  await page.keyboard.press('Escape');
  await waitAck('unknown');

  await share('wallet','ANAC Certificado Medico Aeronautico','CMA.pdf');
  await page.getByText(/PDF recebido: CMA.pdf/).waitFor();
  assert.equal(await page.evaluate(()=>window.testState.parses),2);
  assert.equal((await page.evaluate(()=>window.listTestDocuments())).length,0);
  await share('queued','Unknown second document');
  assert.equal(await page.getByRole('dialog').count(),0);
  await page.getByPlaceholder('PIN de 6 a 12 números').fill('123456');
  await page.getByRole('button',{name:'Desbloquear',exact:true}).click();
  await page.getByText('Guardar cópia offline').waitFor();
  assert.equal(await page.getByLabel('Tipo',{exact:true}).inputValue(),'CMA');
  await page.getByLabel('Nome do titular').fill('Pessoa Sintética');
  await page.getByRole('button',{name:'Criptografar e guardar offline'}).click();
  await waitAck('wallet');
  const docs = await page.evaluate(()=>window.listTestDocuments());
  assert.equal(docs.length,1);
  assert.equal(docs[0].fileName,'CMA.pdf');
  assert.equal(docs[0].verification.level,'declared');
  await page.getByRole('heading',{name:'Onde importar este PDF?'}).waitFor();
  await page.getByRole('button',{name:'Cancelar',exact:true}).click();
  await waitAck('queued');

  await share('unknown-wallet','Scanned document');
  await page.getByRole('button',{name:'Crew Wallet — Documentos'}).click();
  await page.getByRole('button',{name:'Cancelar importação'}).click();
  await waitAck('unknown-wallet');
  assert.equal((await page.evaluate(()=>window.listTestDocuments())).length,1);
  assert.equal(await page.evaluate(()=>window.testState.saves),1);
  assert.deepEqual(errors,[]);
  console.log('PASS browser: local PDF extraction, roster preview/cancel/activate, duplicate, unknown/Escape, wallet PIN/file/save/cancel, queued share.');
} finally {
  await browser.close();
  await new Promise(r=>server.close(r));
}
