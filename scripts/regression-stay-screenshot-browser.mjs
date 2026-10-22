/** Synthetic pixels only. Runs in CI's isolated Chromium; never accesses a real account or screenshot. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

// The shipped HTML has a pre-existing Google Fonts stylesheet unrelated to OCR.
// Exclude that one document-only font link BEFORE loading this synthetic fixture;
// retain every byte of the local production CSS. No network exception is allowed.
// Layout screenshots consequently use the production stack's local fallback font.
const legacyDocumentFont='https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap';
function fixtureStylesheets(html){
  const origin='https://fixture.invalid',local=[],deniedBaseline=[];
  for(const tag of html.match(/<link\b[^>]*>/gi)||[]){
    const attribute=name=>new RegExp(`\\b${name}=["']([^"']+)["']`,'i').exec(tag)?.[1];
    if(attribute('rel')?.toLowerCase()!=='stylesheet')continue;
    const href=attribute('href');assert(href,'Stylesheet has no explicit href');const url=new URL(href,origin);
    if(url.origin!==origin){
      assert.equal(href,legacyDocumentFont,'Unexpected remote stylesheet: no remote dependency may be hidden by this fixture');
      deniedBaseline.push({url:href,resourceType:'stylesheet',disposition:'excluded-before-browser',reason:'Existing document-only external font; synthetic layout uses local fallback'});continue;
    }
    assert(url.pathname.startsWith('/assets/')&&url.pathname.endsWith('.css')&&!url.search&&!url.hash,'Production CSS must use a same-origin build asset without query or fragment');local.push(tag);
  }
  assert(local.length,'Real local production CSS is required');return{links:local.join(''),deniedBaseline};
}
function verifyFixturePolicy(){
  const local='<link rel="stylesheet" crossorigin href="/assets/index-synthetic.css">';
  const result=fixtureStylesheets(`<link href="${legacyDocumentFont}" rel="stylesheet">${local}`);
  assert.equal(result.links,local,'Local production CSS link is byte-preserved');assert.equal(result.deniedBaseline.length,1);assert.equal(result.deniedBaseline[0].disposition,'excluded-before-browser');
  for(const href of ['https://fonts.googleapis.com/css2?family=Injected','https://cdn.example/ocr.css','/assets/index.css?raw=payload','/api/style.css'])assert.throws(()=>fixtureStylesheets(`${local}<link rel="stylesheet" href="${href}">`));
}
verifyFixturePolicy();
if(process.argv.includes('--fixture-policy-only')){console.log('PASS fixture font isolation: exact existing document font denied before browser; local CSS preserved; unexpected remote/query dependencies rejected');process.exit(0);}

const artifacts=path.resolve(process.env.STAY_SCREENSHOT_ARTIFACTS||'artifacts/stay-screenshot');
fs.mkdirSync(artifacts,{recursive:true});
const entry=`import React,{useEffect,useState} from 'react';
import{createRoot}from'react-dom/client';import Editor from './client/src/components/v1391/PresentationStayManagerView';
import{setCrewCheckThemePreference}from'./client/src/lib/themeRuntime';
const stay={id:'synthetic-stay',kind:'stay',title:'Pernoite sintético CWB',date:new Date('2032-10-21T03:00:00Z'),origin:'CWB',destination:'CWB',canonical:{startDateTime:'2032-10-21T03:00:00Z',endDateTime:'2032-10-22T02:59:00Z'}};
const flight={id:'synthetic-flight',kind:'flight',origin:'CWB',destination:'FOR',canonical:{startDateTime:'2032-10-22T08:00:00Z',endDateTime:'2032-10-22T11:00:00Z'}};
window.fixtureTheme=setCrewCheckThemePreference;
function App(){const[events,setEvents]=useState([stay,flight]),[mounted,setMounted]=useState(true);useEffect(()=>{window.fixtureRevision=(window.fixtureRevision||0)+1;},[events,mounted]);window.fixtureChange=kind=>{if(kind==='unmount'){setMounted(false);return;}setMounted(true);setEvents(kind==='removed'?[flight]:kind==='duplicate'?[stay,{...stay},flight]:kind==='signature'?[{...stay,canonical:{...stay.canonical,endDateTime:'2032-10-22T02:58:00Z'}},flight]:[stay,flight]);};return mounted?<Editor events={events} initialStayId={stay.id}/>:<p>Editor fechado</p>;}
createRoot(document.getElementById('root')).render(<App/>);`;
const prebuiltIndex=process.argv.indexOf('--prebuilt-bundle');
const prebuilt=prebuiltIndex>=0?process.argv[prebuiltIndex+1]:null;
if(prebuiltIndex>=0&&!prebuilt)throw new Error('--prebuilt-bundle requires a raw fixture path');
const bundled=prebuilt?null:await build({stdin:{contents:entry,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,outfile:'fixture.js',format:'iife',jsx:'automatic',tsconfig:'tsconfig.json',define:{'process.env.NODE_ENV':'"test"','import.meta.env':'{}'}});
const js=prebuilt?fs.readFileSync(prebuilt,'utf8'):bundled.outputFiles.find(file=>file.path.endsWith('.js')).text;
const css=prebuilt?fs.readFileSync(prebuilt.replace(/\.js$/,'.css'),'utf8'):bundled.outputFiles.find(file=>file.path.endsWith('.css'))?.text||'';
fs.writeFileSync(path.join(artifacts,'fixture.js'),js);fs.writeFileSync(path.join(artifacts,'fixture.css'),css);
if(process.argv.includes('--bundle-only')){console.log('PASS actual screenshot editor browser fixture compiled; browser intentionally not started');process.exit(0);}
const {chromium}=createRequire(process.env.STAY_PLAYWRIGHT_PACKAGE||process.env.MENU_PLAYWRIGHT_PACKAGE||import.meta.url)('playwright');
const publicRoot=path.resolve('client/public');
assert(fs.existsSync(path.join(publicRoot,'ocr/v7/worker.min.js')),'Prepare pinned same-origin OCR assets before this test');
assert(fs.existsSync('dist/index.html'),'Real production CSS required: run npm run build first');
const {links:prodCss,deniedBaseline}=fixtureStylesheets(fs.readFileSync('dist/index.html','utf8'));
fs.writeFileSync(path.join(artifacts,'baseline-font-policy.json'),JSON.stringify({scope:'fixture document only; production assets unchanged',deniedBaseline},null,2));
console.log(`Fixture document policy: ${deniedBaseline.length} existing external font stylesheet excluded before browser; no remote requests permitted`);
const requests=[];
const csp="default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; style-src-elem 'self' 'unsafe-inline'; font-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'";
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');const incoming={method:req.method,path:url.pathname,sentBodyBytes:0};requests.push(incoming);
  res.setHeader('Content-Security-Policy',csp);
  if(req.method!=='GET'){res.writeHead(405).end();return;}
  if(url.pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,stays:[],address:null}));return;}
  if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+prodCss+'<style>body{margin:8px}'+css+'</style><div id="root"></div><script src="/fixture.js"></script></html>');return;}
  if(url.pathname==='/fixture.js'){res.setHeader('Content-Type','application/javascript');res.end(js);return;}
  if(url.pathname==='/fault/ocr-silent.js'){res.setHeader('Content-Type','application/javascript');res.end('self.onmessage=()=>undefined;');return;}
  if(url.pathname==='/fault/ocr-error.js'){res.setHeader('Content-Type','application/javascript');res.end('throw new Error("Synthetic worker startup failure");');return;}
  const root=url.pathname.startsWith('/assets/')?path.resolve('dist'):publicRoot;
  const file=path.resolve(root,'.'+url.pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'application/octet-stream');
  if(url.pathname.startsWith('/ocr/v7/'))res.setHeader('Cache-Control','no-store');
  incoming.sentBodyBytes=fs.statSync(file).size;res.setHeader('Content-Length',incoming.sentBodyBytes);fs.createReadStream(file).pipe(res);
});
const results=[];let browser;
const labels={open:'Importar print de hotel/transporte',file:'Print de hotel ou transporte',apply:'Usar campos selecionados no editor',cancel:'Cancelar importação',hotel:'Hotel no print',apzTime:'APZ no print',apzDate:'Data da APZ no print',apzZone:'Fuso IANA da APZ no print',transport:'Empresa de transporte no print'};
const linesPT=['Hotel: Hotel Sintetico Aurora','APZ no hotel: 22/10/2032 04:40 America/Sao_Paulo','Transportadora: Transporte Sintetico Sol','Local de pickup: Hall principal','Pickup: 22/10/2032 05:10 America/Sao_Paulo','Quarto: ROOM-NEVER-IMPORT-638','DO_NOT_STORE_RAW_7X3'];
const linesEN=['Hotel: Synthetic Harbor Hotel','Hotel report: 22/10/2032 04:40 America/Sao_Paulo','Transport provider: Synthetic Shuttle','Pickup location: Main lobby','Pickup: 22/10/2032 05:10 America/Sao_Paulo','Room: ROOM-NEVER-IMPORT-638','DO_NOT_STORE_RAW_7X3'];
async function makeImage(page,{mime='image/png',lines=linesPT,dark=false,blur=false,width=1800,height=800}={}){
  const data=await page.evaluate(({mime,lines,dark,blur,width,height})=>{const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.fillStyle=dark?'#101820':'#fff';ctx.fillRect(0,0,width,height);ctx.fillStyle=dark?'#fff':'#111';ctx.font='34px Arial';ctx.textBaseline='top';if(blur)ctx.filter='blur(5px)';lines.forEach((line,index)=>ctx.fillText(line,42,42+index*86));return canvas.toDataURL(mime,.96).split(',')[1];},{mime,lines,dark,blur,width,height});
  return{name:'synthetic-private-filename.'+({ 'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[mime]||'bin'),mimeType:mime,buffer:Buffer.from(data,'base64')};
}
async function startImport(page,image){if(!await page.getByLabel(labels.file,{exact:true}).count())await page.getByRole('button',{name:labels.open,exact:true}).click();const input=page.getByLabel(labels.file,{exact:true});if(image.mimeType===''){await input.evaluate((element,{bytes,name})=>{const transfer=new DataTransfer();transfer.items.add(new File([Uint8Array.from(bytes)],name,{type:''}));element.files=transfer.files;element.dispatchEvent(new Event('change',{bubbles:true}));},{bytes:[...image.buffer],name:image.name});}else await input.setInputFiles(image);}
const review=page=>page.locator('.cc-stay-screenshot');
async function waitReview(page){await page.getByRole('button',{name:labels.apply,exact:true}).waitFor({timeout:120000});}
async function saved(page){return page.evaluate(()=>JSON.parse(localStorage.getItem('crewcheck_stay_editor_v2:A')||'null'));}
async function assertRawAbsent(page){
  const state=await page.evaluate(async()=>{
    const cacheNames=await caches.keys(),cacheEntries=[];
    for(const name of cacheNames){const cache=await caches.open(name);for(const request of await cache.keys()){const response=await cache.match(request),bytes=await response.arrayBuffer();const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(byte=>byte.toString(16).padStart(2,'0')).join('');cacheEntries.push({name,url:request.url,method:request.method,bytes:bytes.byteLength,sha256:digest});}}
    return{origin:location.origin,local:Object.fromEntries(Object.entries(localStorage)),session:Object.fromEntries(Object.entries(sessionStorage)),idb:await indexedDB.databases(),cacheNames,cacheEntries};
  });
  const encoded=JSON.stringify({local:state.local,session:state.session});for(const forbidden of ['DO_NOT_STORE_RAW_7X3','ROOM-NEVER-IMPORT-638','synthetic-private-filename','data:image','blob:http','<image','traineddata'])assert(!encoded.includes(forbidden),'No raw image, OCR text/evidence, filename or model database in local/session storage');
  const record=state.local['crewcheck_stay_editor_v2:A'];if(record){const check=value=>{if(!value||typeof value!=='object')return;for(const[key,child]of Object.entries(value)){assert(!/^(?:image|ocr|raw|text|evidence|filename|blob|dataurl)$/i.test(key),'No source payload keys in persisted record');check(child);}};check(JSON.parse(record));}
  assert.deepEqual(state.idb,[],'OCR never opens IndexedDB');
  const manifest=JSON.parse(fs.readFileSync('docs/stay-screenshot/ocr-assets-manifest.json','utf8'));
  assert(state.cacheNames.length<=1,'No unrelated cache is created');for(const name of state.cacheNames)assert.equal(name,manifest.modelCacheName,'Only the dedicated version/hash-scoped public model cache is permitted');
  for(const cached of state.cacheEntries){const url=new URL(cached.url),filename=url.pathname.split('/').pop(),asset=manifest.assets.find(item=>item.name===filename);assert.equal(url.origin,state.origin,'Cached models remain same-origin');assert(['/ocr/v7/eng.traineddata.gz','/ocr/v7/por.traineddata.gz'].includes(url.pathname));assert.equal(url.search,'');assert.equal(cached.method,'GET');assert(asset);assert.equal(cached.bytes,asset.bytes);assert.equal(cached.sha256,asset.sha256,'Cached bytes must be pinned public language models, never source pixels/text');}
}

async function assertReleased(page){await page.waitForFunction(()=>window.ocrAudit.active===0&&window.ocrAudit.urlsActive===0,{},{timeout:5000});const audit=await page.evaluate(()=>window.ocrAudit);assert.equal(audit.created,audit.terminated,'Every worker handle is terminated including failed initialization');assert.equal(audit.urlsCreated,audit.urlsRevoked,'Every preview object URL revoked');}
async function newPage(origin,{timezoneId='UTC',width=390,seed=true}={}){
  const context=await browser.newContext({timezoneId,viewport:{width,height:844},serviceWorkers:'block'}),observed=[],errors=[];
  context.on('request',request=>observed.push({url:request.url(),method:request.method()}));
  await context.addInitScript(({seed})=>{
    if(!localStorage.getItem('crewcheck_auth_user')){localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'A',base:'CWB'}));localStorage.setItem('crewcheck_auth_token','synthetic-A');}
    if(seed&&!localStorage.getItem('crewcheck_stay_editor_v2:A'))localStorage.setItem('crewcheck_stay_editor_v2:A',JSON.stringify({version:2,accountId:'A',defaultLeadMinutes:90,defaultWithoutBreakfastMinutes:60,timeZonePreference:'local',stays:{'synthetic-stay':{eventId:'synthetic-stay',signature:'synthetic-stay|2032-10-21T03:00:00Z|2032-10-22T02:59:00Z|CWB|CWB',draft:{hotelName:'Hotel manual preservado',airport:'CWB',stayDate:'2032-10-21',room:'407-MANUAL',presentationTime:'04:20',leadMinutes:'45',shareSameHotel:false},timeZone:'America/Sao_Paulo',apzDate:'2032-10-22',apzSource:'manual',apzConfirmed:true,choice:{mode:'relative',leadMinutes:45},breakfastPlan:'with',alarmState:'cancelled'}}}));
    window.ocrAudit={created:0,terminated:0,active:0,urlsCreated:0,urlsRevoked:0,urlsActive:0,storageWrites:0,violations:[]};
    const NativeWorker=window.Worker;window.Worker=class extends NativeWorker{constructor(url,options){super(window.ocrFault==='silent'?'/fault/ocr-silent.js':window.ocrFault==='error'?'/fault/ocr-error.js':url,options);this._ocrTracked=String(url).includes('/ocr/v7/');if(this._ocrTracked){window.ocrAudit.created++;window.ocrAudit.active++;}}terminate(){if(this._ocrTracked){window.ocrAudit.terminated++;window.ocrAudit.active--;this._ocrTracked=false;}return super.terminate();}};
    const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL),urls=new Set();URL.createObjectURL=value=>{const url=create(value);urls.add(url);window.ocrAudit.urlsCreated++;window.ocrAudit.urlsActive=urls.size;return url;};URL.revokeObjectURL=url=>{if(urls.delete(url))window.ocrAudit.urlsRevoked++;window.ocrAudit.urlsActive=urls.size;return revoke(url);};
    const set=Storage.prototype.setItem;Storage.prototype.setItem=function(...args){window.ocrAudit.storageWrites++;return set.apply(this,args);};
    window.addEventListener('securitypolicyviolation',event=>window.ocrAudit.violations.push({directive:event.effectiveDirective,blocked:event.blockedURI}));
  },{seed});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.clock.install({time:new Date('2032-10-21T19:00:00Z')});await page.goto(origin);await page.getByRole('textbox',{name:'Hotel',exact:true}).waitFor();await page.waitForFunction(()=>localStorage.getItem('crewcheck_platform_stays_cache_v1')!==null);
  const verify=async()=>{for(const request of observed){const url=new URL(request.url);assert.equal(url.origin,origin,'No remote CDN/telemetry/upload request');assert.equal(request.method,'GET','No API or scheduler writes');assert(!url.search,'No raw values in asset URL query');}assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.ocrAudit.violations),[],'No attempted CSP-blocked exfil');await assertRawAbsent(page);};
  return{context,page,verify,observed,errors};
}
try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
  // Full end-to-end pixels → bundled worker → parser → editable preview → canonical local editor.
  for(const [mime,timezoneId,dark,width] of [['image/png','UTC',false,390],['image/jpeg','Asia/Tokyo',true,1280],['image/webp','America/Sao_Paulo',false,390]]){
    const{context,page,verify}=await newPage(origin,{timezoneId,width});const before=await saved(page);const initialWrites=await page.evaluate(()=>window.ocrAudit.storageWrites);
    const image=await makeImage(page,{mime,dark,lines:mime==='image/webp'?linesEN:linesPT});const started=Date.now();await startImport(page,image);await waitReview(page);
    assert.equal(await page.getByRole('textbox',{name:'Hotel',exact:true}).inputValue(),'Hotel manual preservado','OCR cannot overwrite the editor without selecting/confirming fields');
    assert.deepEqual(await saved(page),before,'OCR preview does not save');assert.equal(await page.evaluate(()=>window.ocrAudit.storageWrites),initialWrites,'OCR writes no local/session storage');
    const candidate=page.getByLabel(labels.hotel,{exact:true});assert.match(await candidate.inputValue(),mime==='image/webp'?/Synthetic Harbor Hotel/i:/Hotel Sintetico Aurora/i,'Actual image pixels must produce the expected hotel');
    assert.equal(await page.getByLabel(labels.apzTime,{exact:true}).inputValue(),'04:40');assert.equal(await page.getByLabel(labels.apzDate,{exact:true}).inputValue(),'2032-10-22');assert.equal(await page.getByLabel(labels.apzZone,{exact:true}).inputValue(),'America/Sao_Paulo');
    assert.equal(await review(page).getByRole('checkbox',{name:'Usar hotel',exact:true}).isChecked(),false,'Import selection is explicit, not prechecked');
    await candidate.fill('Hotel confirmado pelo usuario');await review(page).getByRole('checkbox',{name:'Usar hotel',exact:true}).check();await review(page).getByRole('checkbox',{name:'Usar APZ no hotel',exact:true}).check();await review(page).getByRole('checkbox',{name:'Usar transporte',exact:true}).check();
    await page.evaluate(({dark})=>{window.fixtureTheme(dark?'dark':'light');document.documentElement.style.fontSize=dark?'24px':'16px';},{dark});
    await review(page).evaluate(element=>element.scrollIntoView({block:'center'}));assert(await review(page).evaluate(element=>element.scrollWidth<=element.clientWidth+1),'Review wraps at actual production CSS and enlarged font');await page.screenshot({path:path.join(artifacts,`preview-${mime.split('/')[1]}-${width}.png`),fullPage:true});
    await page.getByRole('button',{name:labels.apply,exact:true}).click();await assertReleased(page);
    assert.equal(await page.getByRole('textbox',{name:'Hotel',exact:true}).inputValue(),'Hotel confirmado pelo usuario');assert.equal(await page.getByLabel('Número do quarto',{exact:true}).inputValue(),'407-MANUAL','MCC screenshot never overwrites manual room');
    assert.equal(await page.getByRole('checkbox',{name:'Confirmo esta data, horário e fuso como APZ no hotel',exact:true}).isChecked(),false,'Import cannot confirm APZ provenance');assert.deepEqual(await saved(page),before,'Applying chosen fields is draft-only');
    await page.getByRole('button',{name:'Salvar alterações do pernoite',exact:true}).click();let record=(await saved(page)).stays['synthetic-stay'];assert.equal(record.apzConfirmed,false);assert.equal(record.draft.hotelName,'Hotel confirmado pelo usuario');assert.equal(record.draft.room,'407-MANUAL');assert.equal(record.alarmState,'cancelled');assert.deepEqual(record.choice,before.stays['synthetic-stay'].choice);assert.equal(record.draft.shareSameHotel,false);assert.match(record.transport.transportProvider,mime==='image/webp'?/Synthetic Shuttle/i:/Transporte Sintetico Sol/i);assert.equal(record.transport.pickupTime,'05:10');assert.equal(record.transport.pickupDate,'2032-10-22');assert.match(JSON.stringify(record),/screenshot/,'Input origin is separate from authenticated MCC');
    await page.getByRole('checkbox',{name:'Confirmo esta data, horário e fuso como APZ no hotel',exact:true}).check();await page.getByRole('button',{name:'Salvar alterações do pernoite',exact:true}).click();record=(await saved(page)).stays['synthetic-stay'];assert.equal(record.apzSource,'manual');assert.equal(record.apzConfirmed,true);assert.equal(record.apzDate,'2032-10-22');assert.equal(record.timeZone,'America/Sao_Paulo');
    const timing=await page.evaluate(()=>performance.getEntriesByType('resource').filter(entry=>entry.name.includes('/ocr/v7/')).map(entry=>({file:new URL(entry.name).pathname.split('/').pop(),transferSize:entry.transferSize,encodedBodySize:entry.encodedBodySize,decodedBodySize:entry.decodedBodySize,durationMs:Math.round(entry.duration)})));results.push({case:'real-pixels-confirm-save',mime,timezoneId,dark,width,elapsedMs:Date.now()-started,resources:timing});
    await assertRawAbsent(page);await page.reload();await page.getByRole('textbox',{name:'Hotel',exact:true}).waitFor();assert.equal(await page.getByRole('textbox',{name:'Hotel',exact:true}).inputValue(),'Hotel confirmado pelo usuario');assert.equal(await page.getByLabel('Número do quarto',{exact:true}).inputValue(),'407-MANUAL');const savedBeforeRemoval=await saved(page);if(mime==='image/jpeg')await page.getByRole('textbox',{name:'Hotel',exact:true}).fill('Hotel editado depois do print');await page.getByRole('button',{name:'Remover campos importados do print',exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'Hotel',exact:true}).inputValue(),mime==='image/jpeg'?'Hotel editado depois do print':'Hotel manual preservado','Removing imported fields restores prior manual values but preserves later edits');assert.deepEqual(await saved(page),savedBeforeRemoval,'Removal requires explicit Save');await page.getByRole('button',{name:'Salvar alterações do pernoite',exact:true}).click();assert.equal((await saved(page)).stays['synthetic-stay'].screenshotImport,undefined);await verify();await context.close();
  }
  console.log('PASS real PNG/JPEG/WebP screenshot pipeline, edit/selection/explicit save, manual APZ, preserved room/alarm/sharing and 3 device zones');
  // Production serves OCR resources no-store. Measure actual public-model CacheStorage reuse;
  // core/worker may download again. CSP guards page AND worker, and every request is audited.
  {
    const{context,page,verify,observed}=await newPage(origin);
    assert(!observed.some(item=>new URL(item.url).pathname.startsWith('/ocr/')),'OCR assets are lazy');
    const image=await makeImage(page);const coldStart=requests.length;await startImport(page,image);await waitReview(page);const cold=requests.slice(coldStart).filter(item=>item.path.startsWith('/ocr/v7/'));
    assert(cold.some(item=>item.path.endsWith('eng.traineddata.gz'))&&cold.some(item=>item.path.endsWith('por.traineddata.gz')),'Both real fast language models load');
    assert.equal(cold.filter(item=>/tesseract-core-.*\.wasm\.js$/.test(item.path)).length,1,'Feature detection chooses exactly one bundled core');
    await page.getByRole('button',{name:labels.cancel,exact:true}).click();await assertReleased(page);
    const warmStart=requests.length;await startImport(page,image);await waitReview(page);const warm=requests.slice(warmStart).filter(item=>item.path.startsWith('/ocr/v7/'));
    assert.equal(warm.filter(item=>item.path.endsWith('.traineddata.gz')).reduce((sum,item)=>sum+item.sentBodyBytes,0),0,'Warm public language models come from the validated model-only cache, not a second transfer');
    results.push({case:'measured-no-store-public-model-cache',compression:'identity (no-store test server; deployed compression may differ)',coldBodyBytes:cold.reduce((sum,item)=>sum+item.sentBodyBytes,0),warmBodyBytes:warm.reduce((sum,item)=>sum+item.sentBodyBytes,0),coldAssets:cold.map(item=>({path:item.path,bytes:item.sentBodyBytes})),warmAssets:warm.map(item=>({path:item.path,bytes:item.sentBodyBytes}))});
    await page.getByRole('button',{name:labels.cancel,exact:true}).click();await assertReleased(page);
    const manifest=JSON.parse(fs.readFileSync('docs/stay-screenshot/ocr-assets-manifest.json','utf8'));
    await page.evaluate(async cacheName=>{const cache=await caches.open(cacheName);await cache.put(new URL('/ocr/v7/eng.traineddata.gz',location.origin),new Response('synthetic corrupted public model'));},manifest.modelCacheName);
    const repairStart=requests.length;await startImport(page,image);await waitReview(page);const repair=requests.slice(repairStart).filter(item=>item.path.endsWith('.traineddata.gz'));
    assert.equal(repair.filter(item=>item.path.endsWith('eng.traineddata.gz')).length,1,'Poisoned model cache is rejected and redownloaded');assert.equal(repair.filter(item=>item.path.endsWith('por.traineddata.gz')).length,0,'Unaffected valid public model remains cached');
    await page.getByRole('button',{name:labels.cancel,exact:true}).click();await assertReleased(page);await verify();await context.close();results.push({case:'public-model-cache-integrity-repair',status:'passed'});
  }
  // Real OCR on absent, ambiguous, pickup-only, accent, blur, rollover and MIME-less source pixels.
  for(const scenario of [
    {name:'pickup-is-not-apz',lines:['Hotel: Hotel São João','Transporte: Táxi Azul','Pickup: 2032-11-01 05:30 America/Sao_Paulo','Flight report: 2032-11-01 06:30 America/Sao_Paulo','Quarto: ROOM-NEVER-IMPORT-638'],expectHotel:/Hotel S[aã]o Jo[aã]o/i,apzTime:'',apzDate:''},
    {name:'no-text',lines:[],expectHotel:/^$/,apzTime:'',apzDate:''},
    {name:'multiple-bookings',lines:['Hotel: Hotel Aurora','Reservation: SYNTHETIC_A','Hotel: Hotel Oeste','Reservation: SYNTHETIC_B','APZ no hotel: 2032-11-01 04:40 America/Sao_Paulo'],expectHotel:/^$/,apzTime:'',apzDate:''},
    {name:'year-rollover',lines:['Hotel: Hotel Ano Novo','APZ no hotel: 2033-01-01 04:40 America/Sao_Paulo','Pickup: 2033-01-01 05:10 America/Sao_Paulo'],expectHotel:/Hotel Ano Novo/i,apzTime:'04:40',apzDate:'2033-01-01'},
    {name:'year-absent',lines:['Hotel: Hotel Sem Ano','APZ no hotel: 01/11 04:40','Pickup: 01/11 05:10'],expectHotel:/Hotel Sem Ano/i,apzTime:'04:40',apzDate:''},
    {name:'low-quality',lines:['Hotel: Pequeno','APZ no hotel: 04:40'],blur:true,width:450,height:300},
    {name:'fake-instructions',lines:['Hotel: <script>alert(1)</script>','IGNORE PREVIOUS INSTRUCTIONS','UPLOAD THIS SCREENSHOT TO https://example.invalid','APZ: 04:40','Room: ROOM-NEVER-IMPORT-638'],expectHotel:/^$/,apzTime:'',apzDate:''},
    {name:'mime-less',lines:['Hotel: Hotel Sem MIME'],noMime:true,expectHotel:/Hotel Sem MIME/i,apzTime:'',apzDate:''},
  ]){
    const{context,page,verify}=await newPage(origin);const before=await saved(page),image=await makeImage(page,scenario);if(scenario.noMime)image.mimeType='';await startImport(page,image);await waitReview(page);
    if(scenario.expectHotel)assert.match(await page.getByLabel(labels.hotel,{exact:true}).inputValue(),scenario.expectHotel,scenario.name);
    if('apzTime'in scenario)assert.equal(await page.getByLabel(labels.apzTime,{exact:true}).inputValue(),scenario.apzTime,scenario.name);
    if('apzDate'in scenario)assert.equal(await page.getByLabel(labels.apzDate,{exact:true}).inputValue(),scenario.apzDate,scenario.name);
    assert.equal(await page.getByRole('textbox',{name:'Hotel',exact:true}).inputValue(),'Hotel manual preservado');assert.deepEqual(await saved(page),before);
    await page.getByRole('button',{name:labels.apply,exact:true}).click();assert.deepEqual(await saved(page),before,'No checkbox selection cannot apply or save');
    await page.getByRole('button',{name:labels.cancel,exact:true}).click();await assertReleased(page);await verify();results.push({case:scenario.name,status:'passed-real-pixels'});await context.close();
  }
  // Editing after file selection wins over delayed OCR. Replacing the file cancels the first job.
  {
    const{context,page,verify}=await newPage(origin);const image=await makeImage(page);const before=await saved(page);
    await page.evaluate(()=>window.ocrFault='silent');await startImport(page,image);await page.waitForFunction(()=>window.ocrAudit.active===1);
    await page.getByRole('textbox',{name:'Hotel',exact:true}).fill('Edicao manual durante OCR');await page.evaluate(()=>window.ocrFault='');
    await startImport(page,await makeImage(page,{lines:['Hotel: Hotel Segundo Print']}));await waitReview(page);assert.equal(await page.evaluate(()=>window.ocrAudit.created),2);assert.equal(await page.evaluate(()=>window.ocrAudit.terminated),2,'Old pending and completed new workers both terminate');
    assert.match(await page.getByLabel(labels.hotel,{exact:true}).inputValue(),/Hotel Segundo Print/i);assert.equal(await page.getByRole('textbox',{name:'Hotel',exact:true}).inputValue(),'Edicao manual durante OCR');
    await page.getByRole('textbox',{name:'Hotel',exact:true}).fill('Edicao manual depois OCR');assert(await review(page).getByRole('checkbox',{name:'Usar hotel',exact:true}).isDisabled(),'Newer manual editing cannot be replaced by stale result');
    await page.getByRole('button',{name:labels.apply,exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'Hotel',exact:true}).inputValue(),'Edicao manual depois OCR');assert.deepEqual(await saved(page),before);
    await page.getByRole('button',{name:labels.cancel,exact:true}).click();await assertReleased(page);await verify();await context.close();results.push({case:'replacement-and-manual-edit-fence',status:'passed'});
  }
  // Canceling an alarm on a previously unsaved stay is NOT an alternative screenshot save route.
  {
    const{context,page,verify}=await newPage(origin,{seed:false});assert.equal(await saved(page),null);
    await page.getByRole('textbox',{name:'Hotel',exact:true}).fill('Hotel manual antes do print');await page.getByLabel('Número do quarto',{exact:true}).fill('407-MANUAL');await page.getByLabel('APZ no hotel (manual ou salva)',{exact:true}).fill('03:55');await page.getByLabel('Data da APZ no hotel',{exact:true}).fill('2032-10-21');await page.getByRole('combobox',{name:'Fuso do hotel',exact:true}).selectOption('America/Sao_Paulo');
    await startImport(page,await makeImage(page,{lines:['Hotel: Hotel Importado Ainda Nao Salvo','APZ no hotel: 2032-10-22 04:40 Europe/London']}));await waitReview(page);assert.match(await page.getByLabel(labels.hotel,{exact:true}).inputValue(),/Hotel Importado Ainda Nao Salvo/i);await review(page).getByRole('checkbox',{name:'Usar hotel',exact:true}).check();await review(page).getByRole('checkbox',{name:'Usar APZ no hotel',exact:true}).check();await page.getByRole('button',{name:labels.apply,exact:true}).click();await assertReleased(page);assert.equal(await saved(page),null,'Applying screenshot is still draft-only');
    await page.getByText('Mais opções da edição',{exact:true}).click();await page.getByRole('button',{name:'Cancelar despertador deste pernoite',exact:true}).click();const record=(await saved(page)).stays['synthetic-stay'];assert.equal(record.alarmState,'cancelled');assert.equal(record.draft.hotelName,'Hotel manual antes do print','Alarm cancel restores pre-import hotel in its first-save fallback');assert.equal(record.draft.presentationTime,'03:55','Alarm cancel cannot save an imported APZ clock');assert.equal(record.apzDate,'2032-10-21');assert.equal(record.timeZone,'America/Sao_Paulo');assert.equal(record.draft.room,'407-MANUAL');assert.equal(record.apzConfirmed,false);assert.equal(record.screenshotImport,undefined);assert.equal(record.transport,undefined);assert(!JSON.stringify(record).includes('Hotel Importado'),'Unsaved import stays out of cancellation storage');await verify();await context.close();results.push({case:'alarm-cancel-cannot-save-unsaved-import',status:'passed'});
  }
  // A hotel-only import/removal may not sanitize an unrelated unfinished manual transport edit.
  {
    const{context,page,verify}=await newPage(origin);const before=await saved(page);await page.locator('.cc-stay-transport summary').click();const zone=page.getByLabel('Fuso IANA de pickup',{exact:true});await zone.fill('America/');
    await startImport(page,await makeImage(page,{lines:['Hotel: Hotel Apenas Nome']}));await waitReview(page);await review(page).getByRole('checkbox',{name:'Usar hotel',exact:true}).check();await page.getByRole('button',{name:labels.apply,exact:true}).click();await assertReleased(page);assert.equal(await zone.inputValue(),'America/','Unselected manual transport draft is not normalized or erased');
    await page.getByRole('button',{name:'Remover campos importados do print',exact:true}).click();assert.equal(await zone.inputValue(),'America/','Removal also preserves the unfinished manual edit');await page.getByRole('button',{name:'Salvar alterações do pernoite',exact:true}).click();assert.deepEqual(await saved(page),before,'Invalid manual IANA edit still blocks save');await verify();await context.close();results.push({case:'unselected-manual-transport-preserved',status:'passed'});
  }
  // Partial screenshot APZ cannot inherit a previously saved operational date or time zone.
  {
    const{context,page,verify}=await newPage(origin);const before=await saved(page);await startImport(page,await makeImage(page,{lines:['Hotel: Hotel Parcial','APZ no hotel: 04:40']}));await waitReview(page);
    await review(page).getByRole('checkbox',{name:'Usar APZ no hotel',exact:true}).check();await page.getByRole('button',{name:labels.apply,exact:true}).click();await assertReleased(page);
    assert.equal(await page.getByLabel('Data da APZ no hotel',{exact:true}).inputValue(),'','Never borrow a prior date');assert.equal(await page.getByRole('combobox',{name:'Fuso do hotel',exact:true}).inputValue(),'','Never borrow a prior zone');
    await page.getByRole('checkbox',{name:'Confirmo esta data, horário e fuso como APZ no hotel',exact:true}).check();await page.getByRole('button',{name:'Salvar alterações do pernoite',exact:true}).click();assert.deepEqual(await saved(page),before,'Invalid/unknown APZ confirmation cannot save');
    await verify();await context.close();results.push({case:'missing-apz-context-no-inference',status:'passed'});
  }
  // Explicitly malformed preview edits are rejected rather than silently normalized into another value.
  {
    const{context,page,verify}=await newPage(origin);const before=await saved(page);await startImport(page,await makeImage(page));await waitReview(page);await review(page).getByRole('checkbox',{name:'Usar APZ no hotel',exact:true}).check();await page.getByLabel(labels.apzZone,{exact:true}).fill('Invalid/Zone');await page.getByRole('button',{name:labels.apply,exact:true}).click();await review(page).getByRole('alert').waitFor();assert.equal(await page.getByLabel('APZ no hotel (manual ou salva)',{exact:true}).inputValue(),'04:20');assert.deepEqual(await saved(page),before);
    await page.getByRole('button',{name:labels.cancel,exact:true}).click();await assertReleased(page);await verify();await context.close();results.push({case:'invalid-edited-zone-rejected',status:'passed'});
  }
  // Cancel while initialize is pending, logout/owner changes, occurrence loss/change/duplication and unmount.
  for(const action of ['cancel','logout','owner','token-rotation','storage-null','signature','removed','duplicate','unmount','pagehide']){
    const{context,page,verify}=await newPage(origin);const before=await saved(page);await page.evaluate(()=>window.ocrFault='silent');await startImport(page,await makeImage(page));await page.waitForFunction(()=>window.ocrAudit.active===1);
    if(action==='cancel')await page.getByRole('button',{name:labels.cancel,exact:true}).click();
    else if(action==='logout'||action==='owner')await page.evaluate(action=>{if(action==='logout'){localStorage.removeItem('crewcheck_auth_token');localStorage.removeItem('crewcheck_auth_user');window.dispatchEvent(new Event('crewcheck:auth-expired'));}else{localStorage.setItem('crewcheck_auth_token','synthetic-B');localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'B'}));window.dispatchEvent(new Event('crewcheck:auth-changed'));}},action);
    else if(action==='token-rotation')await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_token','synthetic-A-new-session');window.dispatchEvent(new Event('crewcheck:auth-changed'));});
    else if(action==='storage-null')await page.evaluate(()=>{localStorage.removeItem('crewcheck_auth_token');window.dispatchEvent(new StorageEvent('storage',{key:null}));});
    else if(action==='pagehide')await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
    else await page.evaluate(action=>window.fixtureChange(action),action);
    await assertReleased(page);assert.equal(await page.getByRole('button',{name:labels.apply,exact:true}).count(),0,'No stale preview survives invalidation');assert.deepEqual(await saved(page),before,'Canceled jobs cannot alter account A');assert.equal(await page.evaluate(()=>localStorage.getItem('crewcheck_stay_editor_v2:B')),null);await verify();await context.close();results.push({case:'pending-'+action,status:'passed'});
  }
  // Startup errors and timeout are fault injection of the worker transport only, never fake OCR results.
  for(const fault of ['error','silent']){
    const{context,page,verify,errors}=await newPage(origin);const before=await saved(page);await page.evaluate(fault=>window.ocrFault=fault,fault);await startImport(page,await makeImage(page));
    if(fault==='silent'){await page.waitForFunction(()=>window.ocrAudit.active===1);await page.clock.runFor(95_000);}
    await review(page).getByRole('alert').waitFor({timeout:15000});await assertReleased(page);assert.deepEqual(await saved(page),before);assert.equal(await page.getByRole('button',{name:labels.apply,exact:true}).count(),0);if(fault==='error')errors.splice(0,errors.length,...errors.filter(message=>!message.includes('Synthetic worker startup failure')));await verify();await context.close();results.push({case:'worker-'+fault,status:'passed'});
  }
  // Byte-level rejects occur before any OCR worker or storage side effect.
  for(const invalid of [
    {name:'unsupported.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')},
    {name:'corrupt.png',mimeType:'image/png',buffer:Buffer.from([137,80,78,71,13,10,26,10])},
    {name:'oversized.png',mimeType:'image/png',buffer:Buffer.alloc(10*1024*1024+1)},
    {name:'dimensions.png',mimeType:'image/png',buffer:(()=>{const b=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.writeUInt32BE(13,8);b.write('IHDR',12);b.writeUInt32BE(12001,16);b.writeUInt32BE(12001,20);return b;})()},
  ]){
    const{context,page,verify}=await newPage(origin);const before=await saved(page);await startImport(page,invalid);await review(page).getByRole('alert').waitFor();assert.equal(await page.evaluate(()=>window.ocrAudit.created),0,'Invalid image rejected before worker allocation');await assertReleased(page);assert.deepEqual(await saved(page),before);await verify();await context.close();results.push({case:'reject-'+invalid.name,status:'passed'});
  }
  {
    const{context,page,verify}=await newPage(origin);const before=await saved(page);const image=await makeImage(page);image.mimeType='image/jpeg';await startImport(page,image);await review(page).getByRole('alert').waitFor();assert.equal(await page.evaluate(()=>window.ocrAudit.created),0,'Conflicting declared MIME and PNG signature is rejected before OCR');await assertReleased(page);assert.deepEqual(await saved(page),before);await verify();await context.close();results.push({case:'reject-mime-signature-mismatch',status:'passed'});
  }
  // Native Android chooser has not been patched in this web-only feature and must not promise support.
  {
    const{context,page,verify}=await newPage(origin);await page.evaluate(()=>{window.AndroidCrewCheckNative={};window.fixtureChange('signature');});await page.waitForFunction(()=>document.body.textContent.includes('seletor do app Android ainda não aceita imagens'));assert.equal(await page.getByRole('button',{name:labels.open,exact:true}).count(),0);await verify();await context.close();results.push({case:'honest-native-availability',status:'passed'});
  }
  assert(requests.every(request=>request.method==='GET'),'No server mutation or alarm request across suite');
  fs.writeFileSync(path.join(artifacts,'results.json'),JSON.stringify({scope:'synthetic web/PWA only; no Android/device claim; production local CSS with local fallback fonts',deniedBaseline,results},null,2));
  console.log(`PASS ${results.length} screenshot scenarios: real image OCR, explicit preview/save, lifecycle fences, no persistence/exfil/autoalarm, public model-only cache measured`);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
