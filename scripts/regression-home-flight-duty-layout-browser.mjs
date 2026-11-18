// Real cards/hooks/storage and production CSS. Synthetic fixtures; all external traffic blocked.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {build} from 'esbuild';

const {inspectDutyContrast}=createRequire(import.meta.url)('./fixtures/duty-card-visual-checks.cjs');
const out=path.resolve('artifacts/home-flight-duty-layout');fs.mkdirSync(out,{recursive:true});
const code=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {NextFlightGateCard,gateSourceLabel} from '@/components/nextflight/NextFlightGateCard';
import {CanonicalDutyCard} from '@/components/CanonicalDutyCard';
import {setCrewCheckThemePreference} from '@/lib/themeRuntime';
import * as gate from '@/lib/nextFlightGate';
const instant=Date.parse('2032-10-20T08:40:00Z'),NativeDate=Date;
window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[instant]))}static now(){return instant}};
const event={id:'synthetic-next-flight',kind:'flight',flightNumber:'QA4002',origin:'CGH',destination:'CNF',departure:'07:30',presentation:'06:30',canonical:{date:'20/10/2032',startDateTime:'2032-10-20T10:30:00.000Z'},date:new Date('2032-10-20T10:30:00.000Z')};
const owner=gate.manualGateAccountKey({id:'synthetic-layout'}),cacheKey=gate.radarSnapshotStorageKey(event);
const measurement={state:'available',journeyId:'synthetic-reserve',date:'20/10/2032',base:'BSB',label:'Reserva publicada',program:'ASB',minutes:360,start:'2032-10-20T09:30:00Z',end:'2032-10-20T15:30:00Z',reasons:[],source:'canonical_published_roster',limitConfirmed:false};
window.configure=(theme,size)=>{setCrewCheckThemePreference(theme);document.documentElement.dataset.crewTextSize=String(size);document.documentElement.style.setProperty('--cc-text-scale',String(size/100));};
function App(){const [model,setModel]=useState(measurement);window.scenario=name=>{
  localStorage.clear();localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic-layout',name:'Synthetic'}));
  localStorage.setItem('crewcheck_auth_token','synthetic-offline');
  const snapshot={ok:true,flight:event.flightNumber,operationalDate:'2032-10-20',origin:'CGH',destination:'CNF',sourceOrigin:'CGH',sourceDestination:'CNF',scheduledDepartureUtc:event.canonical.startDateTime,updatedAt:instant-60000,gate:'9',status:'Programado',operationalEvidence:{gate:{version:1,value:'9',sourceObservedAt:new Date(instant-60000).toISOString(),provenance:'synthetic-layout'},status:{version:1,value:'Programado',sourceObservedAt:new Date(instant-60000).toISOString(),provenance:'synthetic-layout'}}};
  if(name==='gate-only')delete snapshot.operationalEvidence.status;
  if(name==='status-only')delete snapshot.operationalEvidence.gate;
  if(name==='stale')snapshot.gateEvidenceReceivedAt=instant-45*60000;
  if(name==='conflict')snapshot.operationalConflicts=['gate','status'];
  if(['manual','conflict'].includes(name))gate.writeManualGate(localStorage,owner,event,{gate:'24',author:'Autoria sintética com proveniência longa preservada para consulta nos detalhes'},instant-120000);
  if(name==='unlinked')localStorage.setItem('crewcheck:manual-gate:v1:'+owner,JSON.stringify({[gate.manualGateIdentity(event)]:{gate:'24',flight:event.flightNumber,date:'2032-10-20',origin:'CGH',destination:'CNF',setAtEpochMs:instant-120000,author:'Synthetic'}}));
  if(!['missing','unlinked','incomplete'].includes(name))localStorage.setItem(cacheKey,JSON.stringify(snapshot));
  setModel(name==='incomplete'?{...measurement,state:'incomplete',minutes:null,reasons:['Início/fim da programação não comprovados. Motivo sintético completo para revisão.']}:measurement);
  window.dispatchEvent(new Event('crewcheck:radar-updated'));
  window.expectedGateSource=gateSourceLabel(gate.resolveNextFlightGate({event,radar:name==='missing'?null:snapshot,now:instant}));
};return <main className='cz-app' data-version='synthetic-layout' style={{maxWidth:900,margin:'auto',padding:12}}><NextFlightGateCard events={[event]}/><CanonicalDutyCard measurement={model} onOpen={()=>window.opened=(window.opened||0)+1}/></main>;}createRoot(document.getElementById('root')).render(<App/>);`;
await build({stdin:{contents:code,loader:'tsx',resolveDir:process.cwd()},bundle:true,jsx:'automatic',format:'iife',outfile:path.join(out,'app.js'),define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{}'},logLevel:'error'});
const links=[...fs.readFileSync('dist/index.html','utf8').matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/g)].map(m=>m[0]).filter(t=>!t.includes('https://')).join('');
fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">${links}<link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>`);
const dist=path.resolve('dist'),server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname,base=pathname.startsWith('/assets/')?dist:out,file=path.resolve(base,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(base+path.sep)||!fs.existsSync(file))return res.writeHead(404).end();res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(file));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port,{chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||import.meta.url)('playwright');
let browser;const results=[],errors=[];
async function geometry(locator){return locator.evaluate(el=>{const box=el.getBoundingClientRect(),violations=[];const walk=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while(n=walk.nextNode())for(let i=0;i<n.textContent.length;i++){if(/\s/.test(n.textContent[i])||(n.parentElement.closest('details:not([open])')&&!n.parentElement.closest('summary')))continue;const r=document.createRange();r.setStart(n,i);r.setEnd(n,i+1);for(const b of r.getClientRects())if(b.width&&b.height&&(b.left<box.left-1||b.right>box.right+1||b.top<box.top-1||b.bottom>box.bottom+1))violations.push(n.textContent[i]);}return {width:box.width,height:box.height,violations,overflow:document.documentElement.scrollWidth>innerWidth+1};});}
try{browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
for(const width of [320,360,390,1440])for(const theme of ['light','dark'])for(const size of [100,200]){
  const page=await browser.newPage({viewport:{width,height:900},timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
  await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.locator('.cc-next-gate-summary').waitFor();await page.evaluate(({theme,size})=>window.configure(theme,size),{theme,size});
  const summary=page.locator('.cc-next-gate-summary'),card=page.locator('.cc-next-gate'),duty=page.locator('.cc-canonical-duty-tools');
  for(const state of ['missing','gate-only','status-only','manual','conflict','stale','unlinked','incomplete']){
    await page.evaluate(state=>window.scenario(state),state);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const gateText=await card.locator('.cc-next-gate-gate b').innerText(),status=await card.locator('.cc-next-gate-facts b').innerText();
    if(state==='missing'){assert.equal(gateText,'-');assert.equal(status,'-');assert.doesNotMatch(await summary.innerText(),/não confirmado/i);assert.equal(await summary.getByRole('img',{name:'Portão de embarque não confirmado'}).count(),1);assert.equal(await summary.getByRole('img',{name:'Status operacional não confirmado'}).count(),1);}
    if(state==='gate-only'){assert.equal(gateText,'9');assert.equal(status,'-');}
    // Gate without its own observation instant is shown as provider-reported (docs/gate-behavior-rule.md).
    if(state==='status-only'){assert.equal(gateText,'9');assert.equal(status,'Programado');assert.match(await summary.innerText(),/a confirmar/);}
    if(state==='manual'){assert.equal(gateText,'24');assert.match(await summary.innerText(),/Portão manual/);assert.match(await summary.innerText(),/o Radar indica 9/);assert.doesNotMatch(await summary.innerText(),/Autoria sintética/);}
    if(state==='conflict'){assert.equal(gateText,'24');assert.equal(status,'-');assert.match(await summary.innerText(),/divergência nos dados operacionais/);}
    if(state==='stale')assert.match(await summary.innerText(),/Desatualizado/);
    if(state==='unlinked')assert.match(await summary.innerText(),/Confirme o vínculo/);
    if(state==='incomplete'){assert.equal(await duty.getByRole('img',{name:'Duração pendente',exact:true}).innerText(),'-');assert.doesNotMatch(await duty.innerText(),/6h00|0h00|06:30|12:30/);}
    for(const locator of [card,duty]){const m=await geometry(locator);assert.deepEqual(m.violations,[],state);assert.equal(m.overflow,false,state);assert.ok(m.height>=44);}
    await summary.focus();await summary.press('Enter');assert.equal(await summary.getAttribute('aria-expanded'),'true');
    assert.ok(await summary.evaluate(el=>el===document.activeElement&&parseFloat(getComputedStyle(el).outlineWidth)>=2));
    assert.match(await card.locator('.cc-next-gate-details').innerText(),/Fonte do portão/);if(state==='missing')assert.match(await card.locator('.cc-next-gate-details').innerText(),/Não confirmado|não confirmado/);
    if(state==='manual')assert.match(await card.locator('.cc-next-gate-details').innerText(),/Informado por Autoria sintética/);
    const expanded=await geometry(card);assert.deepEqual(expanded.violations,[]);assert.equal(expanded.overflow,false);
    await summary.press('Space');assert.equal(await summary.getAttribute('aria-expanded'),'false');
    const details=page.locator('.cc-canonical-duty-details');await details.locator('summary').focus();await details.locator('summary').press('Enter');assert.equal(await details.getAttribute('open'),'');assert.match(await details.innerText(),/Etapas da jornada: ASB/);
    if(state==='incomplete')assert.match(await details.innerText(),/Motivo sintético completo/);
    const dm=await geometry(duty);assert.deepEqual(dm.violations,[]);assert.equal(dm.overflow,false);await details.locator('summary').press('Enter');
    const contrast=await inspectDutyContrast(page);results.push({width,theme,size,state,contrast,synthetic:true});
  }
  await page.evaluate(()=>window.scenario('missing'));await page.evaluate(()=>{document.activeElement?.blur();return document.fonts.ready;});const facts=await card.locator('.cc-next-gate-main').boundingBox(),summaryBox=await summary.boundingBox();assert.ok(facts.width>=summaryBox.width-40,'Facts use the available card width');if(width>=390&&size===100){const fields=await card.locator('.cc-next-gate-main>span').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().x));assert.ok(fields[0]<fields[1]&&fields[1]<fields[2],'Normal facts occupy three columns');}
  await card.screenshot({path:path.join(out,`${width}-${theme}-${size}-flight.png`)});await duty.screenshot({path:path.join(out,`${width}-${theme}-${size}-reserve.png`)});
  await page.locator('.cc-canonical-duty-card').focus();await page.locator('.cc-canonical-duty-card').press('Enter');await page.locator('.cc-canonical-duty-details summary').focus();await page.keyboard.press('Tab');assert.equal(await page.locator('.cc-duty-calculator-shortcut').evaluate(el=>el===document.activeElement),true);await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>window.opened),2);await page.close();
}
assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({synthetic:true,scope:'Real cards, hooks, storage and production CSS; compiled Home with real Settings is covered separately',results,errors},null,2));console.log('PASS 128 layout/state cases: independent gate/status, stale/manual/conflict/unlinked, incomplete reserve, keyboard/focus and character clipping; 32 synthetic card screenshots');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
