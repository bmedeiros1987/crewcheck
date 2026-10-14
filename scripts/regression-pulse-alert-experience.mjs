import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { build } from 'esbuild';
import ts from 'typescript';
import { createRequire } from 'node:module';
const { chromium } = createRequire(process.env.PULSE_PLAYWRIGHT_PACKAGE || import.meta.url)('playwright');
const out=path.resolve(process.env.PULSE_EVIDENCE_DIR || 'artifacts/pulse-alert-experience');fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync('client/src/pages/Home.tsx','utf8'),ast=ts.createSourceFile('Home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const names=['Brand','CrewCheckMark','actionableComplianceAlerts','currentCompliance','reviewableCompliance'];
const fns=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text)).map(n=>n.getText(ast)).join('\n');
const home=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='Home');
const producer=home.body.statements.find(n=>ts.isExpressionStatement(n)&&n.getText(ast).includes("reconcileCrewCheckPulse('compliance'"));assert(producer,'exercise actual Home producer');
const entry=`import React,{useEffect,useState} from 'react';import {createRoot} from 'react-dom/client';import {Plane,Menu} from 'lucide-react';
import CrewCheckPulse from '${path.resolve('client/src/components/pulse/CrewCheckPulse.tsx')}';
import {InternalHeaderFrame} from '${path.resolve('client/src/components/navigation/InternalHeaderFrame.tsx')}';
import {AlertCenter} from '${path.resolve('client/src/components/alerts/AlertCenter.tsx')}';
import * as reviews from '${path.resolve('client/src/lib/alertReviewStore.ts')}';
import {alertText} from '${path.resolve('client/src/lib/alertExperienceText.ts')}';
import {getSavedLanguage} from '${path.resolve('client/src/lib/i18n.ts')}';
import {alertRosterOwned} from '${path.resolve('client/src/lib/alertRosterOwnership.ts')}';
import * as runtime from '${path.resolve('client/src/components/pulse/pulseRuntime.ts')}';
import * as nav from '${path.resolve('client/src/lib/navigationContext.ts')}';
import {isActionableComplianceAlert} from '${path.resolve('client/src/lib/complianceAlertSemantics.ts')}';
const {alertAccount,alertIsReviewed,complianceAlertIdentity,ALERT_REVIEW_EVENT}=reviews;
const {reconcileCrewCheckPulse,publishCrewCheckNotice}=runtime;
const analyzeSafe=()=>({alerts:[]});
${fns}
const initial={roster:{year:2032,month:10,days:[{date:'01/10/2032',type:'VOO',dutyReport:'01:00',dutyDebrief:'04:30',legs:[]}]},compliance:{alerts:[{id:'alert_1',code:'SYNTHETIC',title:'Jornada sintética',description:'Evidência sintética 40min',date:'01/10/2032',severity:'warning',actionable:true}],metrics:{}},source:'SYNTHETIC ONLY'};
function bind(bundle){const id=JSON.parse(localStorage.getItem('crewcheck_auth_user')||'null')?.id;if(id)localStorage.setItem('crewcheck_roster_choice_v1_'+encodeURIComponent(id.toLowerCase()),JSON.stringify({owner:id.toLowerCase(),roster:bundle.roster}));}
window.fixture={runtime,reviews,nav,lang:getSavedLanguage,bind};
function Harness(){const[bundle,setBundle]=useState(initial),[view,setView]=useState('cockpit'),[alertExperienceRevision,bump]=useState(0);const compliance=currentCompliance(bundle);
window.fixture.update=(next,bindSelection=true)=>{if(bindSelection)bind(next);setBundle(next)};window.fixture.bundle=bundle;window.fixture.open=()=>setView('alerts');
useEffect(()=>{const sync=()=>bump(v=>v+1);const navigate=e=>setView(e.detail);for(const name of [ALERT_REVIEW_EVENT,'crewcheck:auth-changed','crewcheck:language-change','crewcheck:locale-change'])window.addEventListener(name,sync);window.addEventListener('crewcheck:set-view',navigate);return()=>{for(const name of [ALERT_REVIEW_EVENT,'crewcheck:auth-changed','crewcheck:language-change','crewcheck:locale-change'])window.removeEventListener(name,sync);window.removeEventListener('crewcheck:set-view',navigate)}},[]);
${producer.getText(ast)}
return <main className='cz-app' data-version='synthetic' data-view={view}><InternalHeaderFrame><Brand back={view!=='cockpit'}/></InternalHeaderFrame><Brand back/><div id='priority-program'>SYNTHETIC PROGRAM</div>{view==='alerts'&&<AlertCenter key={alertAccount()||'unbound'} alerts={actionableComplianceAlerts(compliance,true)} roster={bundle.roster} onImport={()=>window.fixture.imported=true} onChoose={()=>window.fixture.chosen=true}/>}</main>};createRoot(document.getElementById('root')).render(<Harness/>);`;
await build({stdin:{contents:entry,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',outfile:path.join(out,'app.js'),jsx:'automatic',tsconfig:'tsconfig.json',logLevel:'silent'});
// Real shipped cascade, plus the terminal integrated style, in the same order.
const css=['client/src/index.css','client/src/styles/internal-global-header.css','client/src/styles/ipad-header-recovery.css','client/src/styles/fixed-navigation-headers.css','client/src/components/pulse/integrated-header.css'];
await build({stdin:{contents:css.map(p=>`@import '${path.resolve(p)}';`).join('\n'),loader:'css',resolveDir:process.cwd()},bundle:true,outfile:path.join(out,'shell.css'),loader:{'.woff2':'empty','.woff':'empty','.png':'empty','.svg':'empty'},logLevel:'silent',external:['https://*','tailwindcss','/assets/*']});
fs.writeFileSync(path.join(out,'index.html'),`<html data-crew-theme='dark'><head><meta name='viewport' content='width=device-width,initial-scale=1'><link rel='stylesheet' href='shell.css'><link rel='stylesheet' href='app.css'></head><body><div id='root'></div><script src='app.js'></script></body></html>`);
const server=http.createServer((req,res)=>{const file=path.join(out,new URL(req.url,'http://local').pathname==='/'?'index.html':new URL(req.url,'http://local').pathname);if(!file.startsWith(out)||!fs.existsSync(file)){res.writeHead(404).end();return}res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file))});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,...(process.env.PULSE_CHROMIUM_PATH?{executablePath:process.env.PULSE_CHROMIUM_PATH}:{})}),results=[];
try{
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();const errors=[];page.on('pageerror',e=>{errors.push(String(e));console.error('PAGEERROR',String(e))});page.setDefaultTimeout(8000);
 await page.addInitScript(()=>{if(!localStorage.getItem('fixture-init')){localStorage.setItem('fixture-init','1');for(const id of ['SYN-A','SYN-B'])localStorage.setItem('crewcheck:notification-preferences:v1:'+id,JSON.stringify({ownerId:id,revision:0,preferences:{settings:{crewcheck_pulse_enabled:true}}}));localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'SYN-A'}));localStorage.setItem('crewcheck_auth_token','SYNTHETIC_TOKEN');localStorage.setItem('crewcheck_language','pt-BR');localStorage.setItem('crewcheck_roster_choice_v1_syn-a',JSON.stringify({owner:'syn-a',roster:{year:2032,month:10,days:[{date:'01/10/2032',type:'VOO',dutyReport:'01:00',dutyDebrief:'04:30',legs:[]}]}}))}window.Notification=class{static permission='denied';constructor(){throw Error('No real notifications allowed')}}});
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForSelector('.cc-pulse-compact-trigger');
 assert.equal(await page.locator('.cz-global-header').count(),1);assert.equal(await page.locator('.cz-brand-row').count(),1);assert.equal(await page.locator('.cc-pulse-compact').count(),1);
 assert.equal(await page.evaluate(()=>fixture.lang()),'pt');
 await page.locator('.cc-pulse-compact-trigger').click();await page.getByRole('button',{name:'Dispensar aviso',exact:true}).click();await page.waitForFunction(()=>!fixture.runtime.currentCrewCheckPulseState().message);
 assert.equal(await page.evaluate(()=>fixture.reviews.readAlertReviews()[0].state),'dismissed');
 await page.reload();await page.waitForFunction(()=>window.fixture?.bundle);assert.equal(await page.locator('.cc-pulse-compact').count(),0,'dismissal survives reload/login');
 await page.evaluate(()=>{window.dispatchEvent(new Event('crewcheck:auth-will-change'));localStorage.removeItem('crewcheck_auth_token');localStorage.removeItem('crewcheck_auth_user');window.dispatchEvent(new Event('crewcheck:auth-changed'))});
 assert.equal(await page.evaluate(()=>fixture.reviews.readAlertReviews().length),0,'logout exposes no account history');
 await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'SYN-B'}));localStorage.setItem('crewcheck_auth_token','SYN-B-TOKEN');window.dispatchEvent(new Event('crewcheck:auth-changed'))});
 assert.equal(await page.locator('.cc-pulse-compact').count(),0,'old roster cannot publish into new account');
 await page.evaluate(()=>{fixture.bind(fixture.bundle);fixture.update(structuredClone(fixture.bundle))});await page.waitForSelector('.cc-pulse-compact-trigger');assert.equal(await page.evaluate(()=>fixture.reviews.readAlertReviews().length),0,'B does not inherit A review');
 await page.evaluate(()=>{window.dispatchEvent(new Event('crewcheck:auth-will-change'));localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'SYN-A'}));localStorage.setItem('crewcheck_auth_token','SYN-A-NEW-TOKEN');window.dispatchEvent(new Event('crewcheck:auth-changed'))});await page.waitForTimeout(50);assert.equal(await page.locator('.cc-pulse-compact').count(),0,'same account token rotation preserves disposition');
 await page.evaluate(()=>{const next=structuredClone(fixture.bundle);next.roster.days.push({date:'20/10/2032',type:'DO',legs:[]});next.compliance.alerts[0].id='alert_99';fixture.update(next)});await page.waitForTimeout(50);assert.equal(await page.locator('.cc-pulse-compact').count(),0,'unrelated date and positional ID do not reopen');
 await page.evaluate(()=>{const next=structuredClone(fixture.bundle);next.compliance.alerts[0].description='Evidência sintética 41min';fixture.update(next)});await page.waitForSelector('.cc-pulse-compact-trigger');
 await page.locator('.cc-pulse-compact-trigger').click();await page.getByRole('button',{name:'Revisar',exact:true}).click();await page.waitForSelector('[data-alert-selected=true]');assert.equal(await page.locator('[data-alert-selected=true]').count(),1,'Pulse targets exact occurrence/version');
 await page.getByRole('button',{name:'Marcar como revisado',exact:true}).click();await page.waitForFunction(()=>!fixture.runtime.currentCrewCheckPulseState().message);assert.equal(await page.evaluate(()=>fixture.reviews.readAlertReviews().length),2,'historical material versions preserved');
 // Reconcile a changed roster selectively, leaving an unrelated critical notice.
 await page.evaluate(()=>{fixture.runtime.publishCrewCheckPulse({id:'synthetic-critical',title:'Synthetic critical',priority:'critica',category:'general',systemNotification:'never'});const next=structuredClone(fixture.bundle);next.compliance.alerts=[];fixture.update(next)});await page.waitForTimeout(50);assert.equal(await page.evaluate(()=>fixture.runtime.currentCrewCheckPulseState().message?.id),'synthetic-critical');
 await page.evaluate(()=>{fixture.runtime.clearCrewCheckPulse();fixture.nav.setPendingNavigationContext({targetView:'alerts',policy:'once',alertOccurrence:'removed',alertVersion:'old'});window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'alerts'}))});await page.getByText('Esta ocorrência mudou ou não está mais na escala selecionada.',{exact:true}).waitFor();
 for(const lang of ['en-US','es-ES','fr-FR','it-IT','de-DE','pt-BR']){await page.evaluate(lang=>{localStorage.setItem('crewcheck_language',lang);window.dispatchEvent(new Event('crewcheck:locale-change'))},lang);assert.equal(await page.evaluate(()=>fixture.lang()),lang.slice(0,2));assert.equal(await page.evaluate(()=>fixture.reviews.readAlertReviews().length),2)}
 await page.evaluate(()=>{fixture.update({...fixture.bundle,roster:{year:2032,month:10,days:[]},compliance:{alerts:[],metrics:{}}})});await page.getByText('Nenhuma escala publicada definida.',{exact:true}).waitFor();await page.getByRole('button',{name:'Escolher escala salva',exact:true}).click();assert.equal(await page.evaluate(()=>fixture.chosen),true);
 // Geometry uses actual Header/Brand/Pulse/CSS, including large text.
 for(const theme of ['dark','light'])for(const width of [320,768,1440])for(const scale of [100,200]){
  await page.setViewportSize({width,height:900});await page.evaluate(({theme,scale})=>{document.documentElement.dataset.crewTheme=theme;document.documentElement.dataset.crewTextSize=String(scale);document.documentElement.style.setProperty('--cc-text-scale',String(scale/100));window.scrollTo(0,0);fixture.runtime.clearCrewCheckPulse();fixture.runtime.publishCrewCheckPulse({id:'geometry',dedupeKey:'geometry',title:'Revisar · 01/10/2032',detail:'SYNTHETIC ONLY '.repeat(30),systemNotification:'never',priority:'alta'})},{theme,scale});await page.waitForSelector('.cc-pulse-compact-trigger');
  const g=await page.evaluate(()=>{const trigger=document.querySelector('.cc-pulse-compact-trigger').getBoundingClientRect(),header=document.querySelector('.cz-global-header').getBoundingClientRect(),program=document.querySelector('#priority-program').getBoundingClientRect();return {touch:[trigger.width,trigger.height],overflow:document.documentElement.scrollWidth-innerWidth,headerBottom:header.bottom,programTop:program.top,headers:document.querySelectorAll('.cz-brand-row').length,font:parseFloat(getComputedStyle(document.querySelector('.cc-pulse-compact-trigger>strong')).fontSize)}});assert(g.touch.every(x=>x>=44));console.log('GEOMETRY',JSON.stringify({theme,width,scale,...g}));assert(g.font>=14*(scale/100),'header text follows enlarged root text');assert.equal(g.overflow,0);assert(g.programTop>=g.headerBottom,'header does not cover priority program');assert.equal(g.headers,1);
  await page.locator('.cc-pulse-compact-trigger').focus();await page.keyboard.press('Enter');await page.waitForSelector('.cc-pulse-popover');assert(await page.getByRole('button',{name:'Dispensar aviso',exact:true}).isVisible());await page.keyboard.press('Escape');await page.waitForSelector('.cc-pulse-popover',{state:'detached'});if(process.env.PULSE_VISUAL_REVIEW==='true'&&width===320&&scale===200&&theme==='dark')await page.screenshot({path:path.join(out,'synthetic-header.png')});results.push({theme,width,scale,...g});
 }
 assert.deepEqual(errors,[]);await context.close();
}finally{await browser.close();await new Promise(r=>server.close(r))}
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({scope:'Synthetic actual Home producer and Brand, real Pulse/runtime/account review store/AlertCenter/Header; no App startup/PDF/provider execution, no personal data, no external sends. Chromium component integration, not full app E2E.',results},null,2));console.log('PASS account login/logout/relogin isolation, material/unrelated roster changes, exact/stale destinations, review history, locale normalization, selective queue and12 theme/size/text geometry cases');
