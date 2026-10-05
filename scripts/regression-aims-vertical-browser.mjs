import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import ts from 'typescript';
const { chromium } = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || import.meta.url)('playwright');
const output = path.resolve(process.env.AIMS_EVIDENCE_DIR || 'artifacts/aims-vertical');
const dist = path.resolve(process.env.AIMS_CSS_DIST || 'dist');
fs.mkdirSync(output, { recursive: true });
const home = ts.createSourceFile('Home.tsx', fs.readFileSync('client/src/pages/Home.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const shellProps = { className: 'cz-app', 'data-view': 'roster' };
let rootTag;
function readShell(node) {
 if(ts.isVariableDeclaration(node) && node.name.getText(home)==='DEFAULT_VERSION' && node.initializer && ts.isStringLiteral(node.initializer)) shellProps['data-version']=node.initializer.text;
 if((ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)) && node.attributes.properties.some(a=>ts.isJsxAttribute(a)&&a.name.text==='data-ipad-layout-v14394')) {
  rootTag=node.tagName.getText(home);
  for(const a of node.attributes.properties) if(ts.isJsxAttribute(a)&&a.name.text.startsWith('data-')&&a.initializer&&ts.isStringLiteral(a.initializer))shellProps[a.name.text]=a.initializer.text;
 }
 ts.forEachChild(node,readShell);
}
readShell(home);
assert.equal(rootTag,'main');assert.ok(shellProps['data-version']);assert.equal(shellProps['data-ipad-layout-v14394'],'contained');

// Synthetic events only. Render the actual component, publication runtime, and
// shipping stylesheet. The harness supplies props, never replaces renderer logic.
const entry = `
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {setCrewCheckThemePreference} from '${path.resolve('client/src/lib/themeRuntime.ts')}';
window.setAimsTheme=setCrewCheckThemePreference;
import {AimsRosterTable} from '${path.resolve('client/src/components/v1391/AimsRosterTable.tsx')}';
import '${path.resolve('client/src/components/v1391/roster-layout.css')}';
import {recordPublication,currentPublicationReview} from '${path.resolve('client/src/lib/rosterPublicationRuntime.ts')}';
const canonical = departure => ({kind:'flight',date:'2026-10-12',flightNumber:'QA1001',origin:'AAA',destination:'BBB',presentation:'07:00',departure,arrival:'09:00'});
const flight = (id,code,date,departure='08:00') => ({id,kind:'flight',flightNumber:code,day:{date},presentation:'07:00',departure,arrival:'09:00',origin:'AAA',destination:'BBB',subtitle:'Detalhes sintéticos publicados '+code,canonical:{...canonical(departure),date,flightNumber:code}});
const fixtures = [flight('flight-1','QA1001','2026-10-12'),flight('duplicate','QA1002','2026-10-12','11:00'),flight('duplicate','QA1003','2026-10-12','15:00'),{id:'off',kind:'rest',day:{date:'2026-10-13',type:'DO',startTime:'00:00',endTime:'23:59'},title:'Folga publicada',origin:'BBB',destination:'BBB'},{id:'standby',kind:'duty',day:{date:'2026-10-14',type:'HSB',startTime:'03:00',endTime:'15:00'},origin:'CCC',destination:'CCC'},flight('unknown','QA2001','2026-02-31')];
localStorage.setItem('crewcheck_auth_token','synthetic-local-only');
localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'aims-test-a'}));
window.readReview = currentPublicationReview;
window.publishChanged = async () => {await recordPublication('aims-test-a',[canonical('07:55')]);await recordPublication('aims-test-a',[canonical('08:00')]);};
function App(){const [events,setEvents]=useState(fixtures),[visible,setVisible]=useState(true),[dayView,setDayView]=useState(false),[focus,setFocus]=useState(undefined);
window.setAimsTest = patch => {if(patch.events==='empty')setEvents([]);if(patch.events==='default')setEvents(fixtures);if(patch.events==='other')setEvents([flight('other','QA9000','2026-11-01')]);if(patch.visible!==undefined)setVisible(patch.visible);if(patch.dayView!==undefined){setDayView(patch.dayView);setEvents(patch.dayView?fixtures.slice(0,3):fixtures);}if(patch.focus!==undefined)setFocus(patch.focus);};
return <main {...${JSON.stringify(shellProps)}}><div className="cc-roster-premium-v1397" style={{maxWidth:1100,margin:'0 auto',padding:12}}>{visible&&<AimsRosterTable events={events} dayView={dayView} focusEventId={focus}/>}</div></main>}
createRoot(document.getElementById('root')).render(<App/>);
`;
await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'},bundle:true,jsx:'automatic',format:'iife',outfile:path.join(output,'app.js'),tsconfig:'tsconfig.json',define:{'process.env.NODE_ENV':'"production"'},logLevel:'error'});
const index = fs.readFileSync(path.join(dist,'index.html'),'utf8');
const links = [...index.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/g)].map(m=>m[0]).filter(tag=>!tag.includes('https://')).join('\n');
fs.writeFileSync(path.join(output,'index.html'),`<!doctype html><html lang="pt-BR" data-crew-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${links}<link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>`);
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;const base=pathname.startsWith('/assets/')?dist:output;const file=path.resolve(base,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(base+path.sep)||!fs.existsSync(file))return res.writeHead(404).end();res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':file.endsWith('.woff2')?'font/woff2':'text/html');res.end(fs.readFileSync(file));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
let browser;const results=[];const failures=[];
try{
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});
 const page=await browser.newPage();page.on('pageerror',e=>failures.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
 await page.goto(origin);await page.locator('.cc-aims-activity').first().waitFor();
 assert.equal(await page.locator('.cc-aims-day').count(),4);
 assert.equal(await page.locator('[data-roster-event-id]').count(),6);
 assert.deepEqual(await page.locator('.cc-aims-day').first().locator('[data-roster-event-id]').evaluateAll(es=>es.map(e=>e.dataset.rosterEventId)),['flight-1','duplicate','duplicate']);
 assert.equal(await page.locator('.cc-aims-date').last().innerText(),'Data não confirmada');
 assert.match(await page.locator('[data-roster-event-id="flight-1"] .cc-aims-source-details').innerText(),/Detalhes sintéticos publicados QA1001/,'published details remain visible without opening history');
 for(const width of [320,390,844,1024,1440])for(const theme of ['dark','light'])for(const font of [16,32]){
  await page.setViewportSize({width,height:900});await page.evaluate(({theme,font})=>{window.setAimsTheme(theme);document.documentElement.style.setProperty('font-size',font+'px','important');},{theme,font});
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).fontSize),font+'px','actual root text scale');
  const dims=await page.locator('.cc-aims-vertical').evaluate(root=>({overflow:root.scrollWidth>root.clientWidth+1,bodyOverflow:document.documentElement.scrollWidth>innerWidth+1,clipped:[...root.querySelectorAll('.cc-aims-activity-toggle,.cc-aims-published-fields dd,.cc-aims-date')].filter(e=>e.scrollWidth>e.clientWidth+1).length,vertical:[...root.querySelectorAll('.cc-aims-published-fields')].every(dl=>{const boxes=[...dl.children].map(e=>e.getBoundingClientRect());return boxes.every((b,i)=>!i||b.top>=boxes[i-1].bottom);}),touch:[...root.querySelectorAll('.cc-aims-activity-toggle')].every(e=>e.getBoundingClientRect().height>=44)}));
  assert.deepEqual(dims,{overflow:false,bodyOverflow:false,clipped:0,vertical:true,touch:true},JSON.stringify({width,theme,font,dims}));
  const colors=await page.locator('.cc-aims-activity-toggle').first().evaluate(e=>({background:getComputedStyle(e).backgroundColor,text:getComputedStyle(e.querySelector('strong')).color,label:getComputedStyle(e.querySelector('small')).color}));
  const lum=c=>{const a=c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return a[0]*.2126+a[1]*.7152+a[2]*.0722;};
  const ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
  assert.ok(ratio(colors.text,colors.background)>=4.5,JSON.stringify(colors));assert.ok(ratio(colors.label,colors.background)>=4.5,JSON.stringify(colors));
  await page.screenshot({path:path.join(output,`${width}-${theme}-${font}.png`),fullPage:width<=390});results.push({width,theme,font,...dims,colors});
 }
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.style.fontSize='16px');
 const duplicateButtons=page.locator('[data-roster-event-id="duplicate"] .cc-aims-activity-toggle');
 await duplicateButtons.nth(1).click();assert.equal(await duplicateButtons.nth(1).getAttribute('aria-expanded'),'true');assert.equal(await duplicateButtons.nth(0).getAttribute('aria-expanded'),'false');
 await duplicateButtons.nth(1).press('Enter');assert.equal(await duplicateButtons.nth(1).getAttribute('aria-expanded'),'false');
 await duplicateButtons.nth(0).focus();await page.keyboard.press('Space');assert.equal(await duplicateButtons.nth(0).getAttribute('aria-expanded'),'true');await page.keyboard.press('Space');
 await page.evaluate(()=>window.publishChanged());await page.waitForFunction(()=>window.readReview()?.version===2);
 assert.equal(await page.evaluate(()=>window.readReview().history[0].seen),false);
 for(let i=0;i<3;i++){await page.evaluate(()=>window.setAimsTest({visible:false}));await page.evaluate(()=>window.setAimsTest({visible:true}));await page.locator('.cc-aims-activity').first().waitFor();}
 assert.equal(await page.evaluate(()=>window.readReview().history[0].seen),false,'navigation must not acknowledge changes');
 await page.locator('[data-roster-event-id="flight-1"] .cc-aims-activity-toggle').click();await page.locator('.cc-aims-activity-detail .cc-publication-change').scrollIntoViewIfNeeded();await page.waitForFunction(()=>window.readReview().history[0].seen);
 await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'aims-test-b'}));window.dispatchEvent(new StorageEvent('storage',{key:'crewcheck_auth_user'}));window.setAimsTest({events:'other'});});
 await page.waitForFunction(()=>!document.querySelector('.cc-aims-activity-detail'));assert.equal(await page.evaluate(()=>window.readReview()),null);assert.doesNotMatch(await page.locator('.cc-publication-history').innerText(),/QA1001/);
 await page.evaluate(()=>window.setAimsTest({dayView:true}));assert.equal(await page.locator('.cc-aims-day').count(),1);assert.equal(await page.locator('[data-roster-event-id]').count(),3);
 await page.evaluate(()=>window.setAimsTest({dayView:false,focus:'duplicate'}));await page.waitForFunction(()=>document.querySelectorAll('.cc-aims-activity-toggle[aria-expanded="true"]').length===1);
 await page.evaluate(()=>window.setAimsTest({events:'empty'}));await page.getByRole('status').filter({hasText:'Nenhuma programação'}).waitFor();
 assert.deepEqual(failures,[]);
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({results,checks:['original event order and duplicate IDs','unconfirmed date remains explicit','monthly and daily vertical fields','20 viewport/theme/200% text cases','keyboard, repeat toggle and repeated navigation','navigation does not acknowledge publication','explicit visible detail records only its change','account switch closes detail and isolates history','focus and empty state'],realAPIRequests:0,failures},null,2));
 console.log('PASS: vertical AIMS, 20 responsive cases, keyboard/repeated navigation, owner history isolation; synthetic data only');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
