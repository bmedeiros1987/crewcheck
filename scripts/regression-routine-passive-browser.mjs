import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
const {chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||import.meta.url)('playwright');
const server=await createServer({configFile:false,root:path.resolve('client'),esbuild:{jsx:'automatic'},resolve:{alias:{'@':path.resolve('client/src')}},optimizeDeps:{noDiscovery:true,include:['react','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime','lucide-react','sonner']},plugins:[{name:'synthetic-passive-routine',enforce:'pre',transform(code,id){if(id.endsWith('/RoutineDailyConcierge.tsx'))return code.replace("'@/lib/lifePlaces'","'virtual:places'");},resolveId(id){if(id==='virtual:places'||id==='@/lib/lifePlaces'||/\/lib\/lifePlaces(?:\.ts)?$/.test(id))return '\0stub-places';if(id==='virtual:routine-test')return '\0routine-test';},load(id){if(id==='\0stub-places')return `
export const loadLifeLocation=()=>window.testLocation;
export const lifeLocationLabel=()=> 'Synthetic location';
export const lifePlaceCategoryLabel=x=>x;
export const placeDistanceLabel=()=>'';
export const openLifePlace=()=>{};
export const requestLifeLocation=async()=>{window.calls.locate++;return {latitude:1,longitude:2,capturedAt:new Date().toISOString()}};
export const reverseGeocodeLifeLocation=async()=>{window.calls.reverse++;return 'Synthetic location'};
export const searchLifePlaceSet=async()=>{window.calls.search++;return []};`;
if(id==='\0routine-test')return `import React from 'react';import{createRoot}from'react-dom/client';import Routine from '/src/components/v14314/RoutineDailyConcierge.tsx';const root=createRoot(document.getElementById('root'));window.renderRoutine=(events=[])=>root.render(React.createElement(Routine,{events}));window.renderRoutine();`;},configureServer(s){s.middlewares.use(async(req,res,next)=>{if(req.url==='/__routine'){res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml(req.url,'<div id="root"></div><script type="module">import "virtual:routine-test";</script>'));}else next();});}}],server:{host:'127.0.0.1',port:0}});
let browser;
try{
 await server.listen();const origin=server.resolvedUrls.local[0];browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 for(const cache of ['none','fresh','stale'])for(const automatic of [true,false]){
  const context=await browser.newContext();let external=0;
  await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(origin).origin?route.continue():(external++,route.abort()));
  await context.addInitScript(({cache,automatic})=>{window.calls={locate:0,reverse:0,search:0,notification:0,health:0};window.testLocation=cache==='none'?null:{latitude:1,longitude:2,capturedAt:new Date(Date.now()-(cache==='stale'?3600000:1000)).toISOString()};localStorage.setItem('crewcheck:life:daily-guide-settings:v1',JSON.stringify({autoLocation:automatic}));window.Notification={requestPermission:async()=>{window.calls.notification++;return 'denied'}};window.CrewCheckNative={openHealthConnect:()=>{window.calls.health++;return false}};}, {cache,automatic});
  const page=await context.newPage();page.on('pageerror',e=>console.error('Synthetic component error:',e.message));await page.goto(origin+'__routine');await page.locator('.cc-life-day-shell').waitFor();await page.waitForTimeout(200);
  assert.deepEqual(await page.evaluate(()=>window.calls),{locate:0,reverse:0,search:0,notification:0,health:0},'mount must be passive: '+cache+'/'+automatic);
  await page.evaluate(()=>window.renderRoutine([{id:'synthetic',kind:'flight',canonical:{startDateTime:'2032-11-11T12:00:00Z',endDateTime:'2032-11-11T14:00:00Z'}}]));await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.calls.search),0,'plan update must not search');
  await page.getByRole('button',{name:/Café, preparação e flexibilidade/}).click();await page.getByRole('button',{name:'Salvar ajustes'}).click();assert.equal(await page.evaluate(()=>window.calls.locate+window.calls.search),0,'saving preferences is not location consent');
  await page.getByRole('button',{name:cache==='none'?'Usar minha localização':'Atualizar localização',exact:true}).click();await page.waitForFunction(()=>window.calls.search===1);assert.equal(await page.evaluate(()=>window.calls.locate),1,'explicit location action stays available');await page.getByRole('button',{name:'Atualizar',exact:true}).click();await page.waitForFunction(()=>window.calls.search===2);assert.equal(await page.evaluate(()=>window.calls.locate),automatic?2:1,'explicit refresh honors the saved preference');assert.equal(external,0);await context.close();
 }
 console.log('PASS real Routine component: six synthetic cache/preference combinations, passive mount/plan changes, explicit location/search, zero external requests');
}finally{if(browser)await browser.close();await server.close();}
