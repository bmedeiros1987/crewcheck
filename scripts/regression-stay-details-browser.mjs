import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const { chromium } = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || import.meta.url)('playwright');
const entry = `import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import{AimsDocumentView}from'./client/src/components/v1391/AimsDocumentView';
import{CalendarRosterView}from'./client/src/components/v1391/CalendarRosterView';
import{readStayOperationalProjection,stayOperationalSignature}from'./client/src/lib/stayOperationalProjection';
import{loadStayEditor,persistStayEditor}from'./client/src/lib/stayEditorStore';
const stay={id:'synthetic-stay',kind:'stay',title:'Pernoite',subtitle:'Hotel/pernoite em Curitiba',day:{date:'21/10/2032',type:'PERNOITE'},origin:'CWB',destination:'CWB',canonical:{date:'2032-10-21',startDateTime:'2032-10-21T03:00:00Z',endDateTime:'2032-10-22T02:59:00Z',publishedDay:{}}};
const flight={id:'synthetic-flight',kind:'flight',flightNumber:'SYN123',day:{date:'22/10/2032'},origin:'CWB',destination:'FOR',canonical:{date:'2032-10-22',startDateTime:'2032-10-22T08:00:00Z',endDateTime:'2032-10-22T11:00:00Z'}};
window.saveStay=(patch={})=>{const state=loadStayEditor();persistStayEditor({...state,lastEditedEventId:stay.id,stays:{[stay.id]:{eventId:stay.id,signature:stayOperationalSignature(stay),draft:{hotelName:'Hotel sintético A',room:'QUARTO-PRIVADO-A',presentationTime:'04:20',stayDate:'2032-10-21'},timeZone:'America/Sao_Paulo',apzDate:'2032-10-22',apzSource:'manual',apzConfirmed:true,choice:{mode:'relative',leadMinutes:90},breakfastPlan:'with',...patch}}},'A');};
function App(){const[events,setEvents]=useState([stay,flight]),[calendar,setCalendar]=useState('');window.calendarBoundary=(day,next)=>{const event={...stay,day:{date:day,type:'PERNOITE'},canonical:{date:day,startDateTime:day+'T03:00:00Z',endDateTime:next+'T02:59:00Z',publishedDay:{}}};const state=loadStayEditor();persistStayEditor({...state,stays:{[event.id]:{...state.stays[stay.id],signature:stayOperationalSignature(event),apzDate:next}}},'A');setEvents([event,{...flight,day:{date:next},canonical:{date:next,startDateTime:next+'T08:00:00Z'}}]);setCalendar(day);};window.changeOccurrence=kind=>setEvents(kind==='duplicate'?[stay,{...stay},flight]:kind==='signature'?[{...stay,canonical:{...stay.canonical,endDateTime:'2032-10-22T02:58:00Z'}},flight]:kind==='next-flight'?[stay,{...flight,origin:'OTHER'}]:[stay,flight]);return calendar?<CalendarRosterView events={events.filter(e=>e.kind==='stay')} operationalEvents={events} month={calendar.slice(0,7)} zoom='day' selectedDay={calendar}/>:<AimsDocumentView events={events.filter(e=>e.kind==='stay')} operationalEvents={events} month='2032-10' day='2032-10-21' describe={()=>({mode:'stay',label:'Pernoite'})}/>;}
createRoot(document.getElementById('root')).render(<App/>);`;
const documentPath='client/src/components/v1391/AimsDocumentView.tsx';
const selectedAnchor='const selected = selection?.owner === owner && events.includes(selection.event) ? selection.event : null;';
const documentSource=fs.readFileSync(documentPath,'utf8');assert(documentSource.includes(selectedAnchor));
const result = await build({plugins:[{name:'synthetic-selection-diagnostic',setup(build){build.onLoad({filter:/AimsDocumentView\.tsx$/},()=>({loader:'tsx',resolveDir:process.cwd()+'/client/src/components/v1391',contents:documentSource.replace(selectedAnchor,selectedAnchor+"window.fixtureSelection={selected:!!selected,owner,selectionOwner:selection?.owner,selectionEnd:selection?.event?.canonical?.endDateTime,eventEnd:events[0]?.canonical?.endDateTime,included:selection?events.includes(selection.event):false};")}));}}],stdin:{contents:entry,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,outfile:'fixture.js',format:'iife',jsx:'automatic',tsconfig:'tsconfig.json',define:{'process.env.NODE_ENV':'"test"'}});
const js=result.outputFiles.find(f=>f.path.endsWith('.js')).text,css=result.outputFiles.find(f=>f.path.endsWith('.css'))?.text || '';
const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'application/javascript':'text/html');res.end(req.url==='/fixture.js'?js:'<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:8px}*{box-sizing:border-box}'+css+'</style><div id="root"></div><script src="/fixture.js"></script>');});
let browser;
try {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
  for (const timezoneId of ['UTC','America/Sao_Paulo','Asia/Tokyo']) {
    const context=await browser.newContext({timezoneId,viewport:{width:390,height:844},serviceWorkers:'block'});let requests=0;
    await context.route('**/*',route=>{const request=route.request(),url=new URL(request.url());if(url.origin!==origin||url.pathname.startsWith('/api/')||request.method()!=='GET'){requests++;return route.abort();}return route.continue();});
    await context.addInitScript(()=>{if(!localStorage.getItem('crewcheck_auth_user')){localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'A'}));localStorage.setItem('crewcheck_auth_token','A');}});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:new Date('2032-10-21T19:00:00Z')});await page.goto(origin);
    const open=async()=>{await page.getByRole('combobox',{name:'Abrir programação publicada'}).selectOption('0');try{await page.locator('.cc-aims-activity-detail').first().waitFor();}catch(error){console.error({timezoneId,errors,selection:await page.evaluate(()=>window.fixtureSelection),picker:await page.getByRole('combobox',{name:'Abrir programação publicada'}).inputValue(),html:await page.locator('#root').innerHTML()});throw error;}};
    await page.evaluate(()=>window.saveStay());await open();
    const detail=page.locator('.cc-aims-activity-detail').first();
    assert.match(await detail.innerText(),/QUARTO-PRIVADO-A/,'actual expanded AIMS stay must read the saved private room, not repeat the published subtitle');
    const expectSaved=async()=>{assert.match(await detail.innerText(),/Hotel sintético A/);assert.match(await detail.innerText(),/22\/10\/2032.*04:20.*America\/Sao_Paulo/s);assert.doesNotMatch(await detail.innerText(),/pickup|MyCrewCare|Atualizado/i);};
    await expectSaved();assert.equal(await page.locator('.cc-aims-published-fields').first().getByText('Hotel/pernoite em Curitiba',{exact:true}).count(),1,'published source remains separate and untouched');
    await page.reload();await open();await expectSaved();
    await page.evaluate(()=>window.saveStay({apzConfirmed:false}));await page.waitForFunction(()=>!document.querySelector('.cc-aims-activity-detail')?.textContent.includes('04:20'));assert.match(await detail.innerText(),/QUARTO-PRIVADO-A/);assert.match(await detail.innerText(),/Não confirmada/);
    await page.evaluate(()=>window.saveStay({apzSource:'legacy-unconfirmed'}));assert.doesNotMatch(await detail.innerText(),/04:20/);
    await page.evaluate(()=>window.saveStay({timeZone:'Invalid/Zone'}));assert.doesNotMatch(await detail.innerText(),/04:20/);
    await page.evaluate(()=>window.saveStay());await expectSaved();
    for(const kind of ['signature','duplicate','next-flight']){
      console.log('Stay detail occurrence transition',timezoneId,kind);
      await page.getByRole('button',{name:'← Voltar à escala inteira'}).click();await page.evaluate(kind=>window.changeOccurrence(kind),kind);await open();assert.doesNotMatch(await detail.innerText(),/04:20/);
      if(kind!=='next-flight')assert.doesNotMatch(await detail.innerText(),/QUARTO-PRIVADO-A|Hotel sintético A/);
      await page.getByRole('button',{name:'← Voltar à escala inteira'}).click();await page.evaluate(()=>window.changeOccurrence('original'));await open();await expectSaved();
    }
    await page.clock.setFixedTime(new Date('2032-10-22T04:00:00Z'));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expectSaved();
    for(const width of [320,390,1280]){await page.setViewportSize({width,height:700});await page.evaluate(()=>document.documentElement.style.fontSize='24px');assert(await detail.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'detail must wrap at enlarged font');}
    if(timezoneId==='UTC'){fs.mkdirSync('artifacts/stay-details',{recursive:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/stay-details/saved-stay.png',fullPage:true});}
    for(const [day,next] of [['2032-10-31','2032-11-01'],['2032-12-31','2033-01-01']]){await page.evaluate(([day,next])=>window.calendarBoundary(day,next),[day,next]);const toggle=page.locator('.cc-aims-activity-toggle').first();if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();await page.waitForFunction(expected=>document.querySelector('.cc-aims-activity-detail')?.textContent.includes(expected),next.split('-').reverse().join('/'));assert.match(await detail.innerText(),/04:20.*America\/Sao_Paulo/s);}
    await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'B'}));localStorage.setItem('crewcheck_auth_token','B');window.dispatchEvent(new Event('crewcheck:auth-changed'));});
    await page.waitForFunction(()=>!document.querySelector('#root').textContent.includes('QUARTO-PRIVADO-A'));assert.doesNotMatch(await page.locator('#root').innerText(),/Hotel sintético A|QUARTO-PRIVADO-A/);
    await page.reload();await open();assert.doesNotMatch(await detail.innerText(),/Hotel sintético A|QUARTO-PRIVADO-A|04:20/);assert.equal(requests,0,'read-only details make no API, external, scheduling or mutation requests');assert.deepEqual(errors,[]);await context.close();
  }
  console.log('PASS actual AIMS stay details: private canonical save/reload, account/occurrence/duplicate fences, legacy/unconfirmed/invalid zone, next-day APZ with full context, day rollover, 3 device zones, enlarged layout, zero requests. Synthetic only.');
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
