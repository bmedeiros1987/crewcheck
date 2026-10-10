import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';

const output = path.resolve(process.env.STAY_EDITOR_ARTIFACTS || 'artifacts/stay-editor');
fs.mkdirSync(output, { recursive: true });
await build({ stdin: { contents: `
import React,{useState,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import Presentation from '@/components/v1391/PresentationStayManagerView';
import {openStayProgramEditor} from '@/lib/stayEditorNavigation';
import {peekPendingNavigationContext} from '@/lib/navigationContext';
import '@/components/v139/v139.css';
const now=Date.now(), day=new Date(now).toISOString().slice(0,10);
const event=(id,hours)=>({id,kind:'stay',title:'Pernoite sintético '+id,date:new Date(now),origin:'FOR',destination:'FOR',hotel:'Hotel sintético '+id,presentation:'01:11',canonical:{startDateTime:new Date(now+hours*3600000).toISOString(),endDateTime:new Date(now+(hours+24)*3600000).toISOString()}});
const fixtures=[event('synthetic-current',-1),event('synthetic-future',48)];
window.stayFixtureDay=day;window.stayFixtureEvents=fixtures;
window.stayNavigation=[];window.stayContext=peekPendingNavigationContext;
function App(){const [view,setView]=useState('hotels'),[events,setEvents]=useState(fixtures);
 useEffect(()=>{window.replaceStayEvents=setEvents;const navigate=e=>{window.stayNavigation.push(e.detail);setView(e.detail)};window.addEventListener('crewcheck:set-view',navigate);return()=>window.removeEventListener('crewcheck:set-view',navigate)},[]);
 return <main className="cc139-root">{view==='hotels'?<><h1>Lançador sintético de pernoites</h1>{events.map(event=><button key={event.id} onClick={()=>openStayProgramEditor(event)}>Abrir {event.id}</button>)}</>:<Presentation events={events}/>}</main>}
createRoot(document.getElementById('root')).render(<App/>);
`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, format: 'esm', platform: 'browser', tsconfig: 'tsconfig.json', outfile: path.join(output, 'harness.js'), jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"', 'import.meta.env': JSON.stringify({ DEV: false, PROD: true, BASE_URL: '/' }) } });
fs.writeFileSync(path.join(output, 'index.html'), '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/harness.css"></head><body><div id="root"></div><script type="module" src="/harness.js"></script></body></html>');
const server = http.createServer((req,res)=>{
  const file=path.resolve(output,'.'+(req.url==='/'?'/index.html':req.url));
  if(!file.startsWith(output+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html');fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const require=createRequire(process.env.STAY_PLAYWRIGHT_PACKAGE || import.meta.url);
const browser=await require('playwright').chromium.launch({headless:true,...(process.env.STAY_CHROMIUM_PATH?{executablePath:process.env.STAY_CHROMIUM_PATH}:{})});
const results=[];
try {
 for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',timezoneId:'America/Fortaleza'});
  const errors=[],writes=[];
  await context.addInitScript(()=>{localStorage.setItem('crewcheck_auth_token','synthetic-token');localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic',email:'test@example.invalid'}));});
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();
   if(route.request().method()!=='GET')writes.push(url.pathname);
   const day=new Date().toISOString().slice(0,10);
   return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,address:null,stays:[{id:'saved-future',rosterEventId:'synthetic-future',stayDate:day,airport:'FOR',hotelName:'Hotel salvo sintético',presentationTime:'05:30',leadMinutes:90}]})});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(origin);
  await page.getByRole('button',{name:'Abrir synthetic-future',exact:true}).click();
  const program=page.getByRole('combobox',{name:'Programação',exact:true});
  await program.waitFor();assert.equal(await program.inputValue(),'synthetic-future');
  const hotel=page.getByRole('textbox',{name:'Hotel',exact:true}),apz=page.getByLabel('APZ no hotel (manual ou salva)',{exact:true});
  await page.waitForFunction(()=>document.querySelector('input[placeholder="Hotel de pernoite ou contingência"]')?.value==='Hotel salvo sintético');
  assert.equal(await apz.inputValue(),'05:30');
  const layout=[];
  for (const scenario of [{theme:'light',font:100,height:900},{theme:'dark',font:150,height:600}]) {
    await page.setViewportSize({width,height:scenario.height});
    await page.evaluate(s=>{document.documentElement.dataset.crewTheme=s.theme;document.documentElement.style.fontSize=`${16*s.font/100}px`},scenario);
    const header=page.locator('.cc-stay-editor-header'), content=page.locator('.cc-stay-editor-content');
    const initial=await header.boundingBox();
    const first=program,last=page.getByRole('heading',{name:'Privacidade',exact:true});
    for(const target of [first,last]) {
      await target.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
      const h=await header.boundingBox(),b=await target.boundingBox(),c=await content.boundingBox();
      assert.ok(h&&b&&c&&initial);
      assert.ok(Math.abs(h.y-initial.y)<1,'Editor header remains fixed');
      assert.ok(b.y>=c.y-1&&b.y+b.height<=c.y+c.height+1,'First/last content remains reachable');
      assert.ok(await target.evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===el||el.contains(hit)}),'No header covers content');
    }
    assert.ok(await content.evaluate(el=>el.scrollHeight>el.clientHeight),'Actual content scrolls');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal clipping');
    await page.screenshot({path:path.join(output,`layout-${width}-${scenario.theme}-${scenario.font}.png`)});
    layout.push(scenario);
  }
  // Reproduce the previous document-scroll layout: header must move, proving
  // the geometric regression detects the missing local scroll owner.
  const broken=await page.addStyleTag({content:'.cc-stay-editor{display:block!important;overflow:visible!important;height:auto!important}.cc-stay-editor-content{overflow:visible!important}'});
  await program.evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));
  const before=await page.locator('.cc-stay-editor-header').boundingBox();
  await page.getByRole('heading',{name:'Privacidade',exact:true}).evaluate(el=>el.scrollIntoView({block:'end',behavior:'instant'}));
  const after=await page.locator('.cc-stay-editor-header').boundingBox();
  assert.ok(before&&after&&Math.abs(before.y-after.y)>1,'Negative control rejects old document scrolling header');
  await broken.evaluate(el=>el.remove());
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.setViewportSize({width,height:900});
  await page.evaluate(()=>document.documentElement.style.fontSize='16px');
  await hotel.fill('Hotel editado sintético');
  await page.getByRole('textbox',{name:'Fuso do hotel',exact:true}).fill('America/Fortaleza');
  const apzDate=page.getByLabel('Data da APZ no hotel',{exact:true});await apzDate.fill('2030-10-11');
  const preview=page.getByRole('region',{name:'Prévia do despertador do pernoite'});
  await preview.getByText('Despertar calculado: 04:00',{exact:false}).waitFor();
  await preview.getByText('1 h 30 min antes da APZ no hotel',{exact:true}).waitFor();
  await preview.locator('summary').click();
  const mode=preview.getByRole('combobox',{name:'Modo do despertador',exact:true});await mode.selectOption('absolute');
  const exact=preview.getByLabel('Data e horário exatos · America/Fortaleza',{exact:true});await exact.fill('2030-10-11T04:00');
  await preview.getByText('1 h 30 min antes da APZ no hotel',{exact:true}).waitFor();
  await apz.fill('06:00');await preview.getByText('2 h antes da APZ no hotel',{exact:true}).waitFor();
  assert.equal(await exact.inputValue(),'2030-10-11T04:00');
  await apz.fill('03:00');await preview.getByRole('alert').filter({hasText:'Sua escolha foi mantida'}).waitFor();
  assert.equal(await exact.inputValue(),'2030-10-11T04:00');
  await apz.fill('');await preview.getByRole('alert').filter({hasText:'APZ no hotel ausente'}).waitFor();
  assert.equal(await preview.getByText(/antes da APZ no hotel$/).count(),0);
  await apz.fill('05:30');
  const defaults=page.getByRole('region',{name:'Antecedência padrão'});await defaults.locator('summary').click();await defaults.getByRole('spinbutton').fill('60');await defaults.getByRole('button').click();
  assert.equal(await mode.inputValue(),'absolute');assert.equal(await exact.inputValue(),'2030-10-11T04:00');
  await mode.selectOption('auto');
  await preview.getByText('Modo ativo: Auto · antecedência padrão',{exact:true}).waitFor();
  await preview.getByText('Despertar calculado: 04:30',{exact:false}).waitFor();
  await mode.selectOption('relative');
  await preview.getByRole('combobox',{name:'Antecedência deste pernoite',exact:true}).selectOption('90');
  await preview.getByText('Despertar calculado: 04:00',{exact:false}).waitFor();
  await mode.selectOption('absolute');await exact.fill('2030-10-11T04:00');
  await program.selectOption('synthetic-current');assert.equal(await apz.inputValue(),'');
  await page.getByText('Atual pela escala',{exact:true}).waitFor();
  await program.selectOption('synthetic-future');assert.equal(await hotel.inputValue(),'Hotel editado sintético');assert.equal(await exact.inputValue(),'2030-10-11T04:00');
  await page.evaluate(()=>window.replaceStayEvents(window.stayFixtureEvents.map(event=>({...event,canonical:{...event.canonical,endDateTime:'2031-01-01T00:00:00Z'}}))));
  await page.getByRole('alert').filter({hasText:'Seus ajustes manuais foram preservados'}).waitFor();assert.equal(await hotel.inputValue(),'Hotel editado sintético');
  await preview.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,`alarm-${width}.png`)});
  await page.getByText('Mais opções da edição',{exact:true}).click();
  await page.getByRole('button',{name:'Descartar edição deste pernoite',exact:true}).click();await page.waitForFunction(()=>document.querySelector('input[placeholder="Hotel de pernoite ou contingência"]')?.value==='Hotel salvo sintético');
  await page.evaluate(()=>window.replaceStayEvents(window.stayFixtureEvents.filter(event=>event.id!=='synthetic-future')));
  await page.getByRole('alert').filter({hasText:'Nenhum outro item foi selecionado automaticamente'}).waitFor();assert.equal(await program.inputValue(),'');
  await page.getByRole('button',{name:'Voltar ao pernoite',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.stayContext('hotels').stayId),'synthetic-future');
  await page.getByRole('button',{name:'Abrir synthetic-current',exact:true}).click();
  await page.getByRole('heading',{name:'Apresentação, hotel e descanso',exact:true}).waitFor();
  await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_token','another-synthetic');window.dispatchEvent(new Event('crewcheck:auth-changed'));});
  await page.waitForFunction(()=>document.querySelector('input[placeholder="Hotel de pernoite ou contingência"]')?.value==='');
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[],'No hotel saves or alarm requests');
  results.push({width,touchIdentity:true,savedApz:true,noRosterApzFallback:true,manualPreserved:true,autoMode:true,modeAbsolute:true,liveGap:true,defaultSeparate:true,current:true,rosterChange:true,itemRemoval:true,cancelEdit:true,contextReturn:true,accountReset:true,layout,negativeControl:true,writes,errors});
  await context.close();
 }
} finally {
 await browser.close();await new Promise(resolve=>server.close(resolve));
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),scope:'Actual PresentationStayManagerView and new preview/navigation helper with synthetic launcher, events and account/API. No Home integration, original image inspection, device alarm programming or private data.',results},null,2));
}
assert.equal(results.length,2);console.log('PASS: actual stay editor component, synthetic touch/return, current/removal/import/manual/modes/live-gap/account isolation; no writes');
