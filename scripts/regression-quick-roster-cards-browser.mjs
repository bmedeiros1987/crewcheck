import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import ts from 'typescript';
import vm from 'node:vm';
import {loadClientModules,TYPE_ONLY_PDF_PARSER_STUB} from './lib/ts-module-harness.mjs';
const exactArtifact=createRequire(import.meta.url)('./ui-artifact-evidence.cjs').artifactEvidence();
const require=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||import.meta.url);
const {chromium}=require('playwright');
const output=path.resolve(process.env.CARD_EVIDENCE_DIR||'artifacts/quick-roster-cards');
fs.mkdirSync(output,{recursive:true});
const make=(id,type,extra={})=>({id,kind:'duty',origin:'BSB',day:{date:'2032-10-19',type,pairingCode:type},canonical:{date:'2032-10-19',kind:'duty',publishedDay:{date:'2032-10-19',type,pairingCode:type}},...extra});
const events=[
 make('base-rest','DESCANSO_BASE_CONTINUIDADE',{kind:'stay',presentation:'12:30',departure:'12:30',arrival:'04:10',day:{date:'2032-10-19',type:'DESCANSO_BASE_CONTINUIDADE',pairingCode:'DESCANSO BASE ENTRE JORNADAS'},canonical:{date:'2032-10-19',kind:'stay',startDateTime:'2032-10-19T15:30:00Z',endDateTime:'2032-10-20T07:10:00Z',publishedDay:{type:'DESCANSO_BASE_CONTINUIDADE'}}}),
 make('overnight','PERNOITE_CONTINUIDADE',{kind:'stay',origin:'GIG',presentation:'12:30',departure:'13:00',arrival:'05:20(+1)',day:{date:'2032-10-19',type:'PERNOITE_CONTINUIDADE',hotel:'Hotel Teste Inventado'},canonical:{date:'2032-10-19',kind:'stay',isNextDay:true,startDateTime:'2032-10-19T16:00:00Z',endDateTime:'2032-10-20T08:20:00Z',publishedDay:{type:'PERNOITE_CONTINUIDADE',hotel:'Hotel Teste Inventado'}}}),
 make('night-nohotel','PERNOITE_CONTINUIDADE',{kind:'stay',origin:'GRU',canonical:{date:'2032-10-19',kind:'stay',publishedDay:{type:'PERNOITE_CONTINUIDADE'}}}),
 make('off','DO',{presentation:'09:00'}),
 make('reserve','ASB',{presentation:'06:30',departure:'06:30',arrival:'12:30'}),
 make('standby','HSB',{departure:'06:00',arrival:'12:00'}),
 make('flight','FLIGHT',{kind:'flight',flightNumber:'TESTE 0001',origin:'GRU',destination:'GIG',departure:'10:00',arrival:'11:00'}),
 make('missing','',{origin:'',title:'Atividade sem dados'}),
 make('same-brt','DESCANSO_BASE_CONTINUIDADE',{kind:'stay',departure:'20:30',arrival:'22:00',canonical:{date:'2032-10-19',kind:'stay',startDateTime:'2032-10-19T23:30:00Z',endDateTime:'2032-10-20T01:00:00Z',publishedDay:{type:'DESCANSO_BASE_CONTINUIDADE'}}}),
 make('unproved-rollover','DESCANSO_BASE_CONTINUIDADE',{kind:'stay',departure:'12:30',arrival:'04:10'}),
 make('bad-date','ASB',{canonical:{date:'invalid',kind:'duty'},day:{date:'invalid',type:'ASB'}}),
];
// Reuse the canonical midnight regression's fixture, not a second producer/clock policy.
const midnightAst=ts.createSourceFile('midnight.mjs',fs.readFileSync('scripts/regression-p0-canonical-midnight-presentation.mjs','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const midnightNodes=midnightAst.statements.filter(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(item=>['leg','day','roster'].includes(item.name.getText(midnightAst))));assert.equal(midnightNodes.length,3);
const midnightScope=vm.createContext({});vm.runInContext(midnightNodes.map(node=>node.getText(midnightAst)).join('\n')+'\nglobalThis.rosterFixture=roster;',midnightScope);
const canonicalHarness=loadClientModules({prefix:'quick-roster-midnight-',stubs:TYPE_ONLY_PDF_PARSER_STUB,files:['client/src/lib/rosterContinuity.ts','client/src/lib/canonicalRoster.ts']});
const canonicalMidnight=canonicalHarness.load('canonicalRoster').buildCanonicalRosterEvents(midnightScope.rosterFixture).find(event=>event.flightNumber==='LA9102');assert(canonicalMidnight);assert.equal(canonicalMidnight.startDateTime,'2026-10-05T03:05:00.000Z');assert.equal(canonicalMidnight.presentation,'23:18');canonicalHarness.cleanup();
const midnightEvent={...canonicalMidnight,day:canonicalMidnight.publishedDay,canonical:canonicalMidnight};
const midnightInputs=[midnightEvent,
 {...midnightEvent,id:'multi-day',canonical:{...canonicalMidnight,endDateTime:'2026-10-06T06:20:00.000Z'}},
 {...midnightEvent,id:'unknown-instant',canonical:{...canonicalMidnight,startDateTime:'unconfirmed',endDateTime:'unconfirmed'}},
 {...midnightEvent,id:'partial-instant',canonical:{...canonicalMidnight,endDateTime:'unconfirmed'}},
 {...midnightEvent,id:'unknown-publication',canonical:{...canonicalMidnight,date:'invalid',publishedDay:{...canonicalMidnight.publishedDay,date:'invalid'}}},
];
const componentSource=path.resolve(process.env.CARD_COMPONENT_SOURCE||'client/src/components/v1391/HomeRosterPreview.tsx');
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {HomeRosterPreview} from ${JSON.stringify(componentSource)};import {peekPendingNavigationContext} from './client/src/lib/navigationContext';import {applyCrewCheckTheme} from './client/src/lib/themeRuntime';window.__theme=applyCrewCheckTheme;const input=${JSON.stringify(events)};function freeze(v){if(v&&typeof v==='object'){Object.freeze(v);Object.values(v).forEach(freeze)}return v;}freeze(input);window.__fixture=input;window.__inputBefore=JSON.stringify(input);window.__peek=peekPendingNavigationContext;const root=createRoot(document.getElementById('root'));function mount(next,key){freeze(next);window.__fixture=next;window.__inputBefore=JSON.stringify(next);root.render(<main className='cz-app' data-version='synthetic'><HomeRosterPreview key={key} events={next} onNavigate={view=>window.__destination=view}/></main>)}window.__midnightInputs=${JSON.stringify(midnightInputs)};window.__midnightId=${JSON.stringify(canonicalMidnight.id)};window.__mountFixture=(next,instant)=>{window.__fixtureNow=Date.parse(instant);mount(next,instant)};mount(input,'initial');`;
await build({stdin:{contents:entry,loader:'jsx',resolveDir:process.cwd()},bundle:true,jsx:'automatic',format:'iife',outfile:path.join(output,'app.js'),plugins:[{name:'offline-next-flight',setup(b){b.onResolve({filter:/NextFlightGateCard$/},()=>({path:'next',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const NextFlightGateCard=()=>null;'}));}}],logLevel:'silent'});
const built=fs.readFileSync('dist/index.html','utf8');const links=[...built.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/g)].map(m=>m[0]).join('');assert(links);
fs.writeFileSync(path.join(output,'index.html'),`<html><head><meta name="viewport" content="width=device-width,initial-scale=1">${links}</head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`);
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://local');let p=url.pathname==='/fixture.js'?path.join(output,'app.js'):url.pathname==='/'?path.join(output,'index.html'):path.join(process.cwd(),'dist',url.pathname);if(!fs.existsSync(p)){res.writeHead(404).end();return;}res.setHeader('Content-Type',p.endsWith('.css')?'text/css':p.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(p));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});const results=[];
console.log('fixture ready',origin);
try{for(const width of [320,390,430,768,1440])for(const theme of ['light','dark'])for(const size of [100,200]){
 const context=await browser.newContext({viewport:{width,height:900},timezoneId:width===320?'Asia/Tokyo':width===390?'America/Los_Angeles':'UTC',serviceWorkers:'block'});let external=0;const errors=[];
 await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():(external++,r.abort()));
 await context.addInitScript(({theme,size})=>{const RealDate=Date;const now=RealDate.parse('2032-10-19T15:00:00Z');globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[window.__fixtureNow??now]));}static now(){return window.__fixtureNow??now;}};},{theme,size});
 const page=await context.newPage();console.log('case start',width,theme,size);page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});await page.goto(origin,{waitUntil:'domcontentloaded',timeout:15000});await page.evaluate(({theme,size})=>{window.__theme(theme);document.documentElement.dataset.crewTextSize=String(size);document.documentElement.style.setProperty('--cc-text-scale',String(size/100));},{theme,size});await page.locator('[data-roster-event-id="base-rest"]').waitFor();await page.evaluate(async()=>{await document.fonts.ready;document.body.offsetHeight;await new Promise(r=>requestAnimationFrame(r));for(const a of document.getAnimations())if(Number.isFinite(a.effect?.getComputedTiming().endTime))try{a.finish()}catch{}await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
 const card=id=>page.locator('[data-roster-event-id="'+id+'"]');
 const weekdays=await page.locator('.cc-home-roster-days button>small').evaluateAll(elements=>elements.map(el=>{const range=document.createRange();range.selectNodeContents(el);return{text:el.textContent,lines:new Set([...range.getClientRects()].filter(r=>r.width&&r.height).map(r=>Math.round(r.top))).size,whiteSpace:getComputedStyle(el).whiteSpace,wordBreak:getComputedStyle(el).wordBreak};}));
 assert.ok(weekdays.every(day=>day.lines===1),'Weekday abbreviations render whole on one line: '+JSON.stringify(weekdays));
 if(size===200&&width<=600){const days=page.locator('.cc-home-roster-days');assert.ok(await days.evaluate(el=>el.scrollWidth>el.clientWidth),'Large weekdays use an internal horizontal scroller');await days.locator('button').last().scrollIntoViewIfNeeded();assert.ok(await days.evaluate(el=>el.scrollLeft)>0,'Last whole weekday is reachable by internal scrolling');assert.equal(await page.evaluate(()=>scrollX),0,'Weekday scrolling never shifts the page');await days.evaluate(el=>el.scrollTo({left:0,behavior:'instant'}));}

 assert.equal(await card('base-rest').locator('.cc-home-roster-copy>strong').innerText(),'Descanso');
 assert.doesNotMatch(await card('base-rest').innerText(),/Apresentação|DESCANSO BASE ENTRE/);assert.match(await card('base-rest').innerText(),/Fim · dia seguinte/);
 assert.match(await card('overnight').innerText(),/Pernoite · Rio de Janeiro/);assert.match(await card('overnight').innerText(),/Hotel · Hotel Teste Inventado/);assert.doesNotMatch(await card('overnight').innerText(),/Apresentação/);assert.match(await card('overnight').innerText(),/dia seguinte/);
 assert.doesNotMatch(await card('night-nohotel').innerText(),/Hotel|Apresentação/);assert.equal(await card('night-nohotel').locator('.cc-home-roster-clock').innerText(),'Início\n—\nFim\n—');
 assert.equal(await card('off').locator('.cc-home-roster-copy>strong').innerText(),'Folga');assert.doesNotMatch(await card('off').innerText(),/Apresentação/);
 assert.equal(await card('reserve').getAttribute('data-card-tone'),'reserve');assert.match(await card('reserve').innerText(),/ASB/);assert.match(await card('reserve').innerText(),/Apresentação 06:30/);
 assert.equal(await card('standby').getAttribute('data-card-tone'),'standby');assert.equal(await card('flight').getAttribute('data-card-tone'),'flight');
 assert.doesNotMatch(await card('same-brt').innerText(),/dia seguinte/,'UTC midnight must not change BRT civil-day label');assert.doesNotMatch(await card('unproved-rollover').innerText(),/dia seguinte/,'Earlier end clock alone does not prove rollover');
 assert.equal(await card('bad-date').count(),0);assert.match(await page.getByRole('status').innerText(),/1 atividade com data não confirmada/);
 const measure=()=>page.evaluate(()=>{const failures=[];const cards=[...document.querySelectorAll('.cc-home-roster-list>button')];for(const card of document.querySelectorAll('.cc-home-roster button')){const box=card.getBoundingClientRect(),walker=document.createTreeWalker(card,NodeFilter.SHOW_TEXT);let n;while(n=walker.nextNode())for(let i=0;i<n.textContent.length;i++){if(/\s/.test(n.textContent[i]))continue;const r=document.createRange();r.setStart(n,i);r.setEnd(n,i+1);for(const b of r.getClientRects())if(b.left<box.left-1||b.right>box.right+1||b.top<box.top-1||b.bottom>box.bottom+1)failures.push({id:card.dataset.rosterEventId,text:n.textContent});}}return {failures,overflow:document.documentElement.scrollWidth-innerWidth,buttons:[...document.querySelectorAll('button')].map(e=>e.getBoundingClientRect().height),rootFont:parseFloat(getComputedStyle(document.documentElement).fontSize),font:parseFloat(getComputedStyle(document.querySelector('.cc-home-roster-copy>strong')).fontSize),tones:cards.map(e=>({id:e.dataset.rosterEventId,tone:e.dataset.cardTone,accent:getComputedStyle(e).borderInlineStartColor,text:getComputedStyle(e).color,bg:getComputedStyle(e).backgroundColor})),unchanged:JSON.stringify(window.__fixture)===window.__inputBefore};});
 const metrics=await measure();assert.deepEqual(metrics.failures,[],'Text remains inside actual cards');assert.ok(metrics.overflow<=1);assert.ok(metrics.buttons.every(h=>h>=44));assert.equal(metrics.unchanged,true);assert.ok(metrics.font>=metrics.rootFont*.94*size/100-.1,JSON.stringify(metrics));
 const reserve=metrics.tones.find(e=>e.id==='reserve').accent,rest=metrics.tones.find(e=>e.id==='base-rest').accent,night=metrics.tones.find(e=>e.id==='overnight').accent;assert.notEqual(reserve,rest);assert.notEqual(rest,night);
 function luminance(s){const [r,g,b]=s.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return .2126*r+.7152*g+.0722*b;}
 for(const tone of metrics.tones){const a=luminance(tone.text),b=luminance(tone.bg);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,'AA text contrast: '+JSON.stringify(tone));}
 await card('base-rest').focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>window.__destination),'roster');const nav=await page.evaluate(()=>window.__peek());assert.equal(nav.programId,'base-rest');assert.equal(nav.returnView,'cockpit');
 await page.screenshot({path:path.join(output,`${width}-${theme}-${size}-synthetic.png`),fullPage:true});
 await page.evaluate(()=>window.__mountFixture(window.__midnightInputs,'2026-10-04T15:00:00Z'));
 const midnightId=await page.evaluate(()=>window.__midnightId);await card(midnightId).waitFor();await page.evaluate(()=>document.fonts.ready);
 const actualClock=await card(midnightId).locator('.cc-home-roster-clock').innerText();assert.match(actualClock,/Início · dia seguinte/);assert.match(actualClock,/Fim · dia seguinte/);assert.match(actualClock,/00:05/);assert.match(actualClock,/03:20/);assert.match(await card(midnightId).innerText(),/Apresentação 23:18/);
 const multipleClock=await card('multi-day').locator('.cc-home-roster-clock').innerText();assert.match(multipleClock,/Início · dia seguinte/);assert.match(multipleClock,/Fim · 6 de outubro de 2026/);assert.doesNotMatch(multipleClock,/Fim · dia seguinte/);
 assert.doesNotMatch(await card('unknown-instant').locator('.cc-home-roster-clock').innerText(),/dia seguinte/);assert.match(await card('unknown-instant').innerText(),/Virada de dia indicada; datas a confirmar/);
 assert.match(await card('partial-instant').locator('.cc-home-roster-clock').innerText(),/Início · dia seguinte/);assert.doesNotMatch(await card('partial-instant').locator('.cc-home-roster-clock').innerText(),/Fim · dia seguinte/);assert.equal(await card('unknown-publication').count(),0);const accessibleUncertainty={};for(const id of ['unknown-instant','partial-instant']){assert.equal(await page.getByRole('button',{name:/Virada de dia indicada; datas a confirmar/}).and(card(id)).count(),1,'Computed accessible name retains uncertainty for '+id);accessibleUncertainty[id]=await card(id).ariaSnapshot();assert.match(accessibleUncertainty[id],/datas a confirmar/);}
 assert.equal(await page.evaluate(()=>JSON.stringify(window.__fixture)===window.__inputBefore),true,'Canonical inputs retain identity, clocks and instants');const midnightGeometry=await measure();assert.deepEqual(midnightGeometry.failures,[],'Canonical midnight labels remain inside actual controls');assert.ok(midnightGeometry.overflow<=1);
 await page.screenshot({path:path.join(output,`${width}-${theme}-${size}-midnight-synthetic.png`),fullPage:true});assert.deepEqual(errors,[]);results.push({width,theme,size,metrics,weekdays,midnight:{actualClock,multipleClock,accessibleUncertainty,geometry:midnightGeometry},externalBlocked:external});await context.close();console.log('PASS quick roster cards',width,theme,size);
}}finally{await browser.close();server.close();}
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({artifact:exactArtifact,scope:'Real HomeRosterPreview and shipped CSS, frozen synthetic input; unrelated NextFlightGateCard omitted; browser timezone variants and text-scale emulation; no physical Android or finance calculation.',results},null,2));
