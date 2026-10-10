import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import ts from 'typescript';
const { chromium } = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || import.meta.url)('playwright');
const output=path.resolve(process.env.WELLHUB_EVIDENCE_DIR || 'artifacts/wellhub-hours');fs.mkdirSync(output,{recursive:true});
const source=fs.readFileSync('client/src/pages/Home.tsx','utf8'), ast=ts.createSourceFile('Home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let results,detail;
function walk(node){if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(ast)==='section'&&node.openingElement.attributes.getText(ast).includes('cc-wellhub-results'))results=node.getText(ast);if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(ast)==='section'&&node.openingElement.attributes.getText(ast).includes('cc-wellhub-detail'))detail=node.getText(ast);ts.forEachChild(node,walk);}walk(ast);assert.ok(results,'actual prepared Wellhub result JSX is required');
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {wellhubOpeningStatus} from '${path.resolve('shared/wellhub-hours.mjs')}';
import {Dumbbell as Icon,Map as MapIcon,Navigation,UserRound,Trash2,ChevronRight,Search,Plus,X,Phone} from 'lucide-react';const SelectedIcon=Icon;
const wellhubPlanLabel=x=>x==='basic-plus'?'Basic+':x;
const category='gym',plan='wellhub',categoryMeta={label:'Academia',plural:'Academias'},onlyOpen=false;
const internalMapUrl=null,selectedDestination='Endereço sintético',requestCurrentLocation=()=>{}; const safe=(x,f)=>x||f,crowdFor=()=>null,categoryIcon=()=>Icon,setSelected=()=>{},checkIn=()=>{},removeManualPlace=()=>{},search=()=>{},setManualOpen=()=>{};
import { isOfficialWellhubUrl, WELLHUB_UBER_FALLBACK_URL } from '${path.resolve('shared/wellhub-links.mjs')}';
const currentWellhubStatus=p=>wellhubOpeningStatus(p.wellhubHoursPartner,new Date('2026-10-10T21:32:00Z'));
import {WellhubConciergeAnswer} from '${path.resolve('client/src/components/WellhubConciergeAnswer.tsx')}';
const visiblePlaces=['Academia Exemplo com nome longo e atividades de força e recuperação','Academia Exemplo 24h com nome muito longo e várias modalidades','Academia Exemplo sem horário informado'].map((name,i)=>({name,wellhubMinimumPlan:'basic-plus',wellhubVerifiedAt:'2026-10-10',wellhubAccessConditions:i===1?'Agendamento necessário para atividade; consulte a unidade.':'Basic tem horários restritos. Confirme a faixa aplicável.',openingHours:i===2?[]:i===1?['seg-dom 00:00-23:59']:['sab 08:00-16:00'],wellhubSourceUrl:'https://wellhub.com/pt-br/search/partners/synthetic-example/',address:'Avenida Exemplo de Teste, 9393 - Loja 01 - Bairro Sintético, Cidade Exemplo - CE, 60000-000',wellhubHoursPartner:{verifiedAt:'2026-10-10',timeZone:'America/Fortaleza',openingHours:i===2?[]:i===1?['seg-dom 00:00-23:59']:['sab 08:00-16:00'],is24Hours:i===1}})),allPlaces=visiblePlaces;
visiblePlaces.sort((a,b)=>({open:0,unknown:1,closed:2}[currentWellhubStatus(a).status]-{open:0,unknown:1,closed:2}[currentWellhubStatus(b).status]));
const selected=visiblePlaces[0]; createRoot(document.getElementById('root')).render(<main className="cz-app" data-view="gyms" data-version="14.4.11" data-ipad-layout-v14394="contained" data-menu-open="false" data-layout-v14343="premium-contained" data-layout-v14344="web-icon-menu" data-layout-v14351="p0-stable-shell"><header id="fixture-top">CrewCheck · fixture sintética</header>${results}<section id="detail-fixture">${detail}</section><footer id="fixture-bottom">FlightDeck · Roster · Saída · Alerts</footer><section id=\"concierge-fixture\"><WellhubConciergeAnswer text={'Academias · Cidade Exemplo · Silver+\\n\\n<img src=evil> & \"teste\"\\nhttps://wellhub.com/pt-br/search/partners/synthetic?x=%26%22\\nhttps://wellhub.com.evil.invalid/pt-br/search/'} /></section></main>);`;
await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'},bundle:true,outfile:path.join(output,'fixture.js'),platform:'browser',jsx:'automatic'});
const cssRoot=process.env.WELLHUB_CSS_DIST || 'dist';
const baseline=process.env.WELLHUB_BASELINE==='1';
const cssFiles=fs.readdirSync(cssRoot+'/assets').filter(f=>f.endsWith('.css'));
const shippingCss=cssFiles.map(f=>fs.readFileSync(cssRoot+'/assets/'+f,'utf8')).join('\n') + (baseline ? '' : '\n' + fs.readFileSync('client/src/styles/wellhub-hours.css','utf8'));
const script=fs.readFileSync(path.join(output,'fixture.js'),'utf8');
const browser=await chromium.launch({headless:true,executablePath:process.env.WELLHUB_CHROMIUM_PATH || undefined,args:['--no-sandbox']});
try{
for(const theme of (baseline?['light']:['light','dark']))for(const width of (baseline?[390]:[320,390,768]))for(const scale of [1,1.5]){
 const page=await browser.newPage({viewport:{width,height:844}});await page.route('**/*',r=>r.abort());
 await page.setContent(`<style>${shippingCss}\n*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}#fixture-top,#fixture-bottom{position:fixed;inset-inline:0;height:60px;background:#15243d;color:white;z-index:99;display:grid;place-items:center}#fixture-top{top:0}#fixture-bottom{bottom:0}.cz-app[data-view=gyms]{padding-top:85px!important;padding-bottom:100px!important}.cc-wellhub-results{margin:0 12px} html{font-size:${16*scale}px!important}</style><div id="root"></div><script>${script}</script>`);
 await page.evaluate(theme => document.documentElement.setAttribute('data-crew-theme', theme), theme);
 await page.locator('.cz-place-result-card').first().waitFor();
 assert.ok(Number.parseFloat(await page.locator('.cz-place-result-card h3').first().evaluate(e=>getComputedStyle(e).fontSize))>=16*scale,'enlarged root font must actually affect the title');
 const geometry=await page.locator('.cz-place-result-card').evaluateAll(cards=>cards.map(c=>{const copy=c.querySelector('.cz-roster-copy').getBoundingClientRect(),action=c.querySelector('.cz-tool-actions').getBoundingClientRect(),card=c.getBoundingClientRect();return{copyBottom:copy.bottom,actionsTop:action.top,actionsBottom:action.bottom,cardBottom:card.bottom,accessWidth:c.querySelector('.cc-wellhub-card-access').getBoundingClientRect().width,actionOverflow:c.querySelector('.cz-tool-actions').scrollHeight-c.querySelector('.cz-tool-actions').clientHeight,cardWidth:card.width,overflow:c.scrollWidth-c.clientWidth,text:c.textContent}}));
 if(!baseline) for(const g of geometry){assert.ok(g.copyBottom<=g.actionsTop,JSON.stringify({width,scale,g}));assert.ok(g.actionsBottom<=g.cardBottom+1);assert.ok(g.overflow<=1);assert.ok(g.actionOverflow<=1,'all action rows must fit');assert.ok(g.accessWidth>=g.cardWidth-40,'access copy must occupy card width');}
 console.log(JSON.stringify({theme,width,scale,baseline,overlap:geometry.some(g=>g.copyBottom>g.actionsTop),geometry}));
 assert.equal(await page.locator('.cc-wellhub-card-hours').count(),3);assert.equal(await page.locator('.cc-wellhub-card-access details').count(),3);
 await page.locator('.cc-wellhub-card-access summary').first().click();assert.ok((await page.locator('.cc-wellhub-card-access details').first().innerText()).includes('Agendamento necessário'));
 const expanded=await page.locator('.cz-place-result-card').first().evaluate(c=>({text:c.querySelector('details p').getBoundingClientRect().bottom,actions:c.querySelector('.cz-tool-actions').getBoundingClientRect().top}));assert.ok(expanded.text<=expanded.actions,'expanded access conditions must stay before actions');
 await page.locator('#fixture-top,#fixture-bottom').evaluateAll(es=>es.forEach(e=>e.style.visibility='hidden'));
 const captureOverlayStyle=await page.addStyleTag({content:'.cz-app::before,.cz-app::after{display:none!important}'});
 const ancestorStyles=await page.locator('.cz-place-result-card').first().evaluate(e=>{const saved=[];for(let p=e.parentElement;p;p=p.parentElement){saved.push([p,p.getAttribute('style')]);p.style.setProperty('overflow','visible','important');p.style.setProperty('height','auto','important');p.style.setProperty('max-height','none','important');} window.__wellhubCaptureAncestors=saved;return saved.length;});
 await page.setViewportSize({width,height:Math.ceil((await page.locator('.cz-place-result-card').first().boundingBox()).height)+200});
 await page.locator('.cz-place-result-card').first().screenshot({path:path.join(output,`card-expanded-${theme}-${width}-${scale}.png`)});
 await page.locator('.cc-wellhub-card-access summary').first().click();
 await page.setViewportSize({width,height:Math.ceil((await page.locator('.cz-place-result-card').first().boundingBox()).height)+200});
 await page.locator('.cz-place-result-card').first().screenshot({path:path.join(output,`card-whole-${theme}-${width}-${scale}.png`)});
 await page.locator('.cc-wellhub-traceability summary').click();
 const detailText=await page.locator('.cc-wellhub-traceability').innerText(); for(const expected of ['Plano mínimo','2026-10-10','fonte oficial','Agendamento necessário'])assert.ok(detailText.includes(expected),expected);
 await page.setViewportSize({width,height:Math.ceil((await page.locator('.cc-wellhub-detail').boundingBox()).height)+200});
 await page.locator('.cc-wellhub-detail').screenshot({path:path.join(output,`detail-expanded-${theme}-${width}-${scale}.png`)});
 await page.setViewportSize({width,height:844});
 await captureOverlayStyle.evaluate(e=>e.remove());
 await page.evaluate(()=>{for(const [e,s] of window.__wellhubCaptureAncestors){if(s===null)e.removeAttribute('style');else e.setAttribute('style',s);}delete window.__wellhubCaptureAncestors;});
 await page.locator('#fixture-top,#fixture-bottom').evaluateAll(es=>es.forEach(e=>e.style.visibility=''));
 assert.equal(await page.locator('#concierge-fixture a').count(),1);assert.equal(await page.locator('#concierge-fixture a').innerText(),'Ver no Wellhub');assert.equal(await page.locator('#concierge-fixture img').count(),0);assert.ok((await page.locator('#concierge-fixture').innerText()).includes('<img src=evil>'));
 assert.ok(geometry.some(g=>g.text.includes('🟢 Aberta pelo horário cadastrado')));assert.ok(geometry.some(g=>g.text.includes('🔴 Fechada pelo horário cadastrado')));assert.ok(geometry.some(g=>g.text.includes('🟡 Horário cadastrado incerto')));
 if(!baseline) for(const position of ['first','last']){const card=position==='first'?page.locator('.cz-place-result-card').first().locator('h3'):page.locator('.cz-place-result-card').last().locator('.cz-tool-actions button').last();await card.scrollIntoViewIfNeeded();await card.evaluate(e=>e.scrollIntoView({block:'center'}));const bounds=await card.boundingBox();assert.ok(bounds.y>=60&&bounds.y+bounds.height<=784,`card ${position} must clear fixed bars at ${width}/${scale}: ${JSON.stringify(bounds)}`);}
 await page.screenshot({path:path.join(output,`cards-${theme}-${width}-${scale}-last.png`)});
 await page.locator('.cz-place-result-card').first().evaluate(e=>e.scrollIntoView({block:'start'}));
 await page.screenshot({path:path.join(output,`cards-${theme}-${width}-${scale}.png`)});await page.close();
}
}finally{await browser.close();}
console.log(baseline ? 'Synthetic baseline geometry recorded; no positive layout assertion' : 'Actual prepared Wellhub card JSX/shipping CSS: long names/addresses, 320/390/768, enlarged font, no overlap, first/last clear fixed bars: PASS');
