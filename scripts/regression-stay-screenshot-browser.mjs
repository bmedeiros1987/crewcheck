/** Synthetic pixels only. Runs in CI's isolated Chromium; never accesses a real account or screenshot. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

// The shipped HTML has a pre-existing Google Fonts stylesheet unrelated to OCR.
// Exclude that one document-only font link BEFORE loading this synthetic fixture;
// retain every byte of the local production CSS. No network exception is allowed.
// Layout screenshots consequently use the production stack's local fallback font.
const legacyDocumentFont='https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap';
function fixtureStylesheets(html){
  const origin='https://fixture.invalid',local=[],hrefs=[],deniedBaseline=[];
  for(const tag of html.match(/<link\b[^>]*>/gi)||[]){
    const attribute=name=>new RegExp(`\\b${name}=["']([^"']+)["']`,'i').exec(tag)?.[1];
    if(attribute('rel')?.toLowerCase()!=='stylesheet')continue;
    const href=attribute('href');assert(href,'Stylesheet has no explicit href');const url=new URL(href,origin);
    if(url.origin!==origin){
      assert.equal(href,legacyDocumentFont,'Unexpected remote stylesheet: no remote dependency may be hidden by this fixture');
      deniedBaseline.push({url:href,resourceType:'stylesheet',disposition:'excluded-before-browser',reason:'Existing document-only external font; synthetic layout uses local fallback'});continue;
    }
    assert(url.pathname.startsWith('/assets/')&&url.pathname.endsWith('.css')&&!url.search&&!url.hash,'Production CSS must use a same-origin build asset without query or fragment');local.push(tag);hrefs.push(url.pathname);
  }
  assert(local.length,'Real local production CSS is required');return{links:local.join(''),hrefs,deniedBaseline};
}
// These four existing, non-user URLs are a frozen ceiling, not an expanding CSS
// exception. A fifth/mutated query requires explicit review even if CSS declares it.
const baselineCssQueries=new Set([
  '/assets/brand/crewcheck-wallpaper-v1264.jpg?v=12.5.65',
  '/assets/brand/crewcheck-wallpaper-v1264.jpg?v=12.5.65-hard-reset',
  '/assets/brand/crewcheck-wallpaper-v1267.png?v=12.5.68',
  '/icons/crewcheck-icon-v3.png?brand=936-3656d39df50e',
]);
const fixtureApplicationPaths=new Set(['/','/fixture.js','/api/platform/hotels/stays','/api/platform/home-address','/fault/ocr-silent.js','/fault/ocr-error.js']);
const pwaShellCeiling=new Set(['/','/index.html','/manifest.json','/icons/crewcheck-icon-v2.png','/icons/crewcheck-icon-v2.png?brand=936-3656d39df50e','/icons/crewcheck-icon-v3.png?v=14340&brand=936-3656d39df50e','/icons/crewcheck-icon-v3.png?brand=936-3656d39df50e','/icons/crewcheck-icon-v3.png?v=14411&brand=936-3656d39df50e']);
function servedPwaContract(source){
  const value=name=>new RegExp(`const ${name}\\s*=\\s*['"]([^'"]+)['"]`).exec(source)?.[1];
  assert.equal(value('CREWCHECK_UPDATE_BUILD_ID'),'__CREWCHECK_UPDATE_BUILD_ID__','PWA fixture tests raw SW fetch/cache, not prepared-build activation integrity');
  assert(/const CREWCHECK_UPDATE_ASSETS\s*=\s*\[\s*\]/.test(source),'PWA fixture must not silently import prepared build assets');
  const shell=JSON.parse(/const APP_SHELL\s*=\s*(\[[^;]*\])/.exec(source)?.[1].replace(/'/g,'"')||'null');assert(Array.isArray(shell));for(const asset of shell)assert(pwaShellCeiling.has(asset),'PWA shell asset outside the reviewed raw/prepared ceiling');
  const names=[value('CACHE_NAME'),value('RUNTIME_CACHE')];assert(['crewcheck-v14.3-offline-shell','crewcheck-v14.4.11-shell-brand936-3656d39df50e'].includes(names[0]));assert(['crewcheck-v14.3-offline-runtime','crewcheck-v14.4.11-runtime-brand936-3656d39df50e'].includes(names[1]));
  return{shell,cacheNames:names};
}
// Static paths are extracted before browsing from the exact CSS served, never
// learned from observed traffic. CSS cannot grant any API, OCR or upload path.
function declaredCssAssets(sources){
  const origin='https://fixture.invalid',allowed=new Set();
  for(const source of sources){
    const css=source.text.replace(/\/\*[\s\S]*?\*\//g,'');
    for(const match of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))\s*\)/gi)){
      const value=match[1]??match[2]??match[3];if(!value||value.startsWith('data:')||value.startsWith('#'))continue;
      const url=new URL(value,new URL(source.path,origin));
      if(url.origin===origin&&!url.hash&&/^\/(?:assets|icons|fonts)\//.test(url.pathname)&&/\.(?:png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf)$/i.test(url.pathname))allowed.add(url.pathname+url.search);
    }
  }
  return allowed;
}
function fixtureRequestPolicy(cssSources,cssPaths,manifest){
  const cssAssets=declaredCssAssets(cssSources),cssQueries=new Set([...cssAssets].filter(asset=>asset.includes('?')));
  for(const asset of cssQueries)assert(baselineCssQueries.has(asset),'Versioned CSS URL outside the four reviewed baseline URLs');
  return{applicationPaths:new Set(fixtureApplicationPaths),installAssets:new Set(),previewUrls:new Set(),cssAssets,cssQueries,stylesheets:new Set(cssPaths),ocrPaths:new Set([manifest.boundary.name,...manifest.assets.map(asset=>asset.name)].map(name=>'/ocr/v7/'+name))};
}
function assertFixtureRequest(request,origin,policy){
  const url=new URL(request.url);assert.equal(url.origin,origin,'No remote CDN/telemetry/upload request');assert(!url.username&&!url.password,'No URL credentials');
  assert.equal(request.method,'GET','No API or scheduler writes');assert.equal(request.bodyBytes,0,'No image/text/request body is uploaded');assert.equal(url.hash,'','No input encoded in URL fragment');
  if(url.protocol==='blob:'){assert.equal(url.search,'');assert(policy.previewUrls.has(url.href)&&request.resourceType==='image','Only the exact local preview URL observed in the review DOM may be decoded');return;}
  if(url.pathname.startsWith('/ocr/')){assert.equal(url.search,'','OCR assets always have empty query, regardless of CSS');assert(policy.ocrPaths.has(url.pathname),'Only exact pinned OCR manifest paths are allowed');return;}
  if(policy.installAssets.has(url.pathname+url.search)&&request.resourceType==='fetch')return;
  if(url.search){assert(policy.cssQueries.has(url.pathname+url.search)&&['image','font'].includes(request.resourceType),'Only the four reviewed static image/font queries actually declared in production CSS are permitted');return;}
  assert(policy.applicationPaths.has(url.pathname)||(policy.stylesheets.has(url.pathname)&&request.resourceType==='stylesheet')||(policy.cssAssets.has(url.pathname)&&['image','font'].includes(request.resourceType)),'Unexpected request path: no dynamic/raw values in same-origin URLs');
}
function auditFixtureRequest(request,origin,policy){
  const url=new URL(request.url),knownPath=policy.applicationPaths.has(url.pathname)||policy.stylesheets.has(url.pathname)||policy.ocrPaths.has(url.pathname)||policy.cssAssets.has(url.pathname+url.search)||policy.installAssets.has(url.pathname+url.search);
  let allowed=true;try{assertFixtureRequest(request,origin,policy);}catch{allowed=false;}
  return{allowed,protocol:url.protocol,origin:url.origin===origin?'same-origin':'[unexpected origin redacted]',path:url.protocol==='blob:'?(policy.previewUrls.has(url.href)?'[local-preview]':'[unexpected object URL redacted]'):knownPath?url.pathname:'[unexpected path redacted]',query:policy.cssQueries.has(url.pathname+url.search)||policy.installAssets.has(url.pathname+url.search)?url.search:url.search?'[unexpected query redacted]':'',method:request.method,bodyBytes:request.bodyBytes,resourceType:request.resourceType};
}
function assertOnlyModelStorageMayChange(state,modelCacheName,publicBaseline=null){
  assert.deepEqual(state.idb,publicBaseline?.idb||[],'OCR never opens or changes IndexedDB; PWA legacy empty database must remain empty');
  assert.deepEqual(state.cacheNames.filter(name=>name!==modelCacheName),publicBaseline?.cacheNames||[],'No generic cache may be added by OCR');
  assert.deepEqual(state.cacheEntries.filter(entry=>entry.name!==modelCacheName),publicBaseline?.cacheEntries||[],'Every pre-existing public cache entry must retain exact URL, size and SHA256; OCR never enters generic caches');
}
function verifyFixturePolicy(){
  const local='<link rel="stylesheet" crossorigin href="/assets/index-synthetic.css">';
  const result=fixtureStylesheets(`<link href="${legacyDocumentFont}" rel="stylesheet">${local}`);
  assert.equal(result.links,local,'Local production CSS link is byte-preserved');assert.equal(result.deniedBaseline.length,1);assert.equal(result.deniedBaseline[0].disposition,'excluded-before-browser');
  for(const href of ['https://fonts.googleapis.com/css2?family=Injected','https://cdn.example/ocr.css','/assets/index.css?raw=payload','/api/style.css'])assert.throws(()=>fixtureStylesheets(`${local}<link rel="stylesheet" href="${href}">`));
  const sources=[{path:'/assets/main.css',text:`.a{background:url('/icons/crewcheck-icon-v3.png?brand=936-3656d39df50e')} .b{src:url(/fonts/font.woff2)} /* url('/icons/not-rendered.png?raw=hidden') */ .c{background:url('https://remote.invalid/x.png?raw=payload')} .d{background:url('/ocr/v7/eng.traineddata.gz?raw=payload')}`}];
  const manifest={boundary:{name:'worker-synthetic.js'},assets:[{name:'eng.traineddata.gz'}]},policy=fixtureRequestPolicy(sources,['/assets/main.css'],manifest);
  assert.deepEqual([...policy.cssAssets],['/icons/crewcheck-icon-v3.png?brand=936-3656d39df50e','/fonts/font.woff2']);
  assert.throws(()=>fixtureRequestPolicy([...sources,{path:'/assets/extra.css',text:'.new{background:url(/icons/fifth.png?v=5)}'}],[],manifest),'CSS cannot silently expand the frozen query policy');
  const request={url:'https://fixture.invalid/icons/crewcheck-icon-v3.png?brand=936-3656d39df50e',method:'GET',bodyBytes:0,resourceType:'image'};
  assertFixtureRequest(request,'https://fixture.invalid',policy);
  for(const patch of [{url:request.url+'&raw=x'},{url:'https://fixture.invalid/icons/crewcheck-icon-v3.png?brand=secret'},{url:'https://fixture.invalid/api/platform/DO_NOT_STORE_RAW_7X3'},{url:'https://fixture.invalid/icons/DO_NOT_STORE_RAW_7X3.png'},{resourceType:'fetch'},{url:'https://fixture.invalid/ocr/v7/eng.traineddata.gz?brand=fixed'},{url:'https://fixture.invalid/ocr/v7/unpinned.js'},{url:'https://remote.invalid/icons/crewcheck-icon-v3.png?brand=936-3656d39df50e'},{method:'POST'},{bodyBytes:1},{url:'https://fixture.invalid/ocr/v7/eng.traineddata.gz#secret'}])assert.throws(()=>assertFixtureRequest({...request,...patch},'https://fixture.invalid',policy));
  const denied=auditFixtureRequest({...request,url:'https://fixture.invalid/api/DO_NOT_STORE_RAW_7X3?raw=secret'},'https://fixture.invalid',policy);assert.equal(denied.allowed,false);assert(!JSON.stringify(denied).includes('DO_NOT_STORE_RAW_7X3'));assert(!JSON.stringify(denied).includes('secret'),'Unknown URL content is not copied to diagnostics');
  const sw="const CREWCHECK_UPDATE_BUILD_ID='__CREWCHECK_UPDATE_BUILD_ID__';const CREWCHECK_UPDATE_ASSETS=[];const CACHE_NAME='crewcheck-v14.3-offline-shell';const RUNTIME_CACHE='crewcheck-v14.3-offline-runtime';const APP_SHELL=['/','/index.html','/manifest.json','/icons/crewcheck-icon-v2.png'];";
  assert.equal(servedPwaContract(sw).shell.length,4);assert.throws(()=>servedPwaContract(sw.replace('/icons/crewcheck-icon-v2.png','/icons/crewcheck-icon-v2.png?raw=x')));assert.throws(()=>servedPwaContract(sw.replace('crewcheck-v14.3-offline-shell','arbitrary-cache')));
  const installUrl='/icons/crewcheck-icon-v2.png?brand=936-3656d39df50e',installRequest={...request,url:'https://fixture.invalid'+installUrl,resourceType:'fetch'},pwaPolicy={...policy,installAssets:new Set([installUrl])};assert.throws(()=>assertFixtureRequest(installRequest,'https://fixture.invalid',policy));assertFixtureRequest(installRequest,'https://fixture.invalid',pwaPolicy);assert.throws(()=>assertFixtureRequest({...installRequest,url:installRequest.url+'&raw=x'},'https://fixture.invalid',pwaPolicy));
  const swCssRequest={...request,resourceType:'fetch'},swCssPolicy={...policy,installAssets:new Set(policy.cssAssets)};assert.throws(()=>assertFixtureRequest(swCssRequest,'https://fixture.invalid',policy));assertFixtureRequest(swCssRequest,'https://fixture.invalid',swCssPolicy);assert.throws(()=>assertFixtureRequest({...swCssRequest,url:swCssRequest.url+'&raw=x'},'https://fixture.invalid',swCssPolicy));
  const previewRequest={...request,url:'blob:https://fixture.invalid/synthetic-preview-id'},previewPolicy={...policy,previewUrls:new Set([previewRequest.url])};assert.throws(()=>assertFixtureRequest(previewRequest,'https://fixture.invalid',policy));assertFixtureRequest(previewRequest,'https://fixture.invalid',previewPolicy);for(const patch of [{url:'blob:https://fixture.invalid/other-id'},{url:'blob:https://remote.invalid/synthetic-preview-id'},{resourceType:'fetch'},{method:'POST'},{bodyBytes:1},{url:previewRequest.url+'?raw=x'},{url:previewRequest.url+'#raw'}])assert.throws(()=>assertFixtureRequest({...previewRequest,...patch},'https://fixture.invalid',previewPolicy));assert(!JSON.stringify(auditFixtureRequest(previewRequest,'https://fixture.invalid',previewPolicy)).includes('synthetic-preview-id'),'Object URL identifiers stay in RAM, never diagnostics');
  for(const pathname of ['/api/platform/hotels/stays','/ocr/v7/eng.traineddata.gz'])assertFixtureRequest({...request,url:'https://fixture.invalid'+pathname,resourceType:'fetch'},'https://fixture.invalid',policy);
  const baseline={idb:[],cacheNames:['public-shell'],cacheEntries:[{name:'public-shell',url:'https://fixture.invalid/',bytes:10,sha256:'public'}]},withModels={...baseline,cacheNames:[...baseline.cacheNames,'models'],cacheEntries:[...baseline.cacheEntries,{name:'models',url:'https://fixture.invalid/ocr/v7/eng.traineddata.gz'}]};assertOnlyModelStorageMayChange(withModels,'models',baseline);assert.throws(()=>assertOnlyModelStorageMayChange(withModels,'models'));
  for(const patch of [{idb:[{name:'new-database'}]},{cacheNames:[...withModels.cacheNames,'unexpected-runtime']},{cacheEntries:[{...baseline.cacheEntries[0],sha256:'changed'}]},{cacheEntries:[...withModels.cacheEntries,{name:'public-shell',url:'https://fixture.invalid/ocr/v7/worker-synthetic.js'}]}])assert.throws(()=>assertOnlyModelStorageMayChange({...withModels,...patch},'models',baseline));
}
verifyFixturePolicy();
if(process.argv.includes('--fixture-policy-only')){console.log('PASS fixture font isolation: exact existing document font denied before browser; local CSS preserved; unexpected remote/query/body dependencies rejected; OCR query exceptions remain impossible');process.exit(0);}

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
const {links:prodCss,hrefs:prodCssPaths,deniedBaseline}=fixtureStylesheets(fs.readFileSync('dist/index.html','utf8'));
const requestPolicy=fixtureRequestPolicy([{path:'/',text:css},...prodCssPaths.map(href=>({path:href,text:fs.readFileSync(path.resolve('dist','.'+href),'utf8')}))],prodCssPaths,JSON.parse(fs.readFileSync('docs/stay-screenshot/ocr-assets-manifest.json','utf8')));
const pwaContract=servedPwaContract(fs.readFileSync(path.join(publicRoot,'sw.js'),'utf8'));
const{cssQueries}=requestPolicy;
fs.writeFileSync(path.join(artifacts,'baseline-font-policy.json'),JSON.stringify({scope:'fixture document only; production assets unchanged',deniedBaseline},null,2));
console.log(`Fixture document policy: ${deniedBaseline.length} existing external font stylesheet excluded before browser; no remote requests permitted`);
const requests=[],requestTraceRam=[];
const networkAuditSnapshot=()=>requestTraceRam.map(({request,origin,policy,pwa})=>({...auditFixtureRequest(request,origin,policy),pwa}));
const csp="default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; style-src-elem 'self' 'unsafe-inline'; font-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'";
const fixtureHtml='<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+prodCss+'<style>body{margin:8px}'+css+'</style><div id="root"></div><script src="/fixture.js"></script></html>';
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');const incoming={method:req.method,path:url.pathname,sentBodyBytes:0};requests.push(incoming);
  res.setHeader('Content-Security-Policy',csp);
  if(req.method!=='GET'){res.writeHead(405).end();return;}
  if(url.pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,stays:[],address:null}));return;}
  if(url.pathname==='/'||url.pathname==='/index.html'){res.setHeader('Content-Type','text/html');res.end(fixtureHtml);return;}
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
const results=[],pagePolicies=new WeakMap();let browser;
const labels={open:'Importar print',file:'Print de hotel ou transporte',apply:'Usar campos',cancel:'Cancelar importação',hotel:'Hotel no print',apzTime:'APZ no print',apzDate:'Data da APZ no print',apzZone:'Fuso IANA da APZ no print',transport:'Empresa de transporte no print'};
const linesPT=['Hotel: Hotel Sintetico Aurora','APZ no hotel: 22/10/2032 04:40 America/Sao_Paulo','Transportadora: Transporte Sintetico Sol','Local de pickup: Hall principal','Pickup: 22/10/2032 05:10 America/Sao_Paulo','Quarto: ROOM-NEVER-IMPORT-638','DO_NOT_STORE_RAW_7X3'];
const linesEN=['Hotel: Synthetic Harbor Hotel','Hotel report: 22/10/2032 04:40 America/Sao_Paulo','Transport provider: Synthetic Shuttle','Pickup location: Main lobby','Pickup: 22/10/2032 05:10 America/Sao_Paulo','Room: ROOM-NEVER-IMPORT-638','DO_NOT_STORE_RAW_7X3'];
async function makeImage(page,{mime='image/png',lines=linesPT,dark=false,blur=false,width=1800,height=800}={}){
  const data=await page.evaluate(({mime,lines,dark,blur,width,height})=>{const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.fillStyle=dark?'#101820':'#fff';ctx.fillRect(0,0,width,height);ctx.fillStyle=dark?'#fff':'#111';ctx.font='34px Arial';ctx.textBaseline='top';if(blur)ctx.filter='blur(5px)';lines.forEach((line,index)=>ctx.fillText(line,42,42+index*86));return canvas.toDataURL(mime,.96).split(',')[1];},{mime,lines,dark,blur,width,height});
  return{name:'synthetic-private-filename.'+({ 'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[mime]||'bin'),mimeType:mime,buffer:Buffer.from(data,'base64')};
}
async function startImport(page,image){if(!await page.getByLabel(labels.file,{exact:true}).count())await page.getByRole('button',{name:labels.open,exact:true}).click();const input=page.getByLabel(labels.file,{exact:true});if(image.mimeType===''){await input.evaluate((element,{bytes,name})=>{const transfer=new DataTransfer();transfer.items.add(new File([Uint8Array.from(bytes)],name,{type:''}));element.files=transfer.files;element.dispatchEvent(new Event('change',{bubbles:true}));},{bytes:[...image.buffer],name:image.name});}else await input.setInputFiles(image);}
const review=page=>page.locator('.cc-stay-screenshot');
async function waitReview(page){
  await page.getByRole('button',{name:labels.apply,exact:true}).waitFor({timeout:120000});
  const src=await review(page).getByRole('img',{name:'Print selecionado para revisão local'}).getAttribute('src'),url=new URL(src);
  assert.equal(url.protocol,'blob:');assert.equal(url.origin,new URL(page.url()).origin);assert.equal(url.search,'');assert.equal(url.hash,'');pagePolicies.get(page).previewUrls.add(url.href);
}
async function saved(page){return page.evaluate(()=>JSON.parse(localStorage.getItem('crewcheck_stay_editor_v2:A')||'null'));}
async function browserStorageSnapshot(page){
  return page.evaluate(async()=>{
    const cacheNames=await caches.keys(),cacheEntries=[];
    for(const name of cacheNames){const cache=await caches.open(name);for(const request of await cache.keys()){const response=await cache.match(request),bytes=await response.arrayBuffer();const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(byte=>byte.toString(16).padStart(2,'0')).join('');cacheEntries.push({name,url:request.url,method:request.method,bytes:bytes.byteLength,sha256:digest,...(new URL(request.url).pathname==='/__crewcheck_update_ready__'?{ready:JSON.parse(new TextDecoder().decode(bytes))}:{})});}}
    const idb=[];
    for(const item of await indexedDB.databases()){
      if(item.name!=='crewcheck-notification-installation-v1'){idb.push(item);continue;}
      const database=await new Promise((resolve,reject)=>{const open=indexedDB.open(item.name);open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);open.onupgradeneeded=()=>{open.transaction.abort();reject(new Error('Snapshot may not create a database'));};}),stores=[];
      for(const name of [...database.objectStoreNames]){const records=await new Promise((resolve,reject)=>{const tx=database.transaction(name,'readonly'),store=tx.objectStore(name),keys=store.getAllKeys(),values=store.getAll();tx.oncomplete=()=>resolve({keys:keys.result,values:values.result});tx.onerror=()=>reject(tx.error);});stores.push({name,...records});}
      database.close();idb.push({...item,stores});
    }
    return{origin:location.origin,local:Object.fromEntries(Object.entries(localStorage)),session:Object.fromEntries(Object.entries(sessionStorage)),idb:idb.sort((a,b)=>a.name.localeCompare(b.name)),cacheNames:cacheNames.sort(),cacheEntries:cacheEntries.sort((a,b)=>(a.name+a.url).localeCompare(b.name+b.url))};
  });
}
async function assertRawAbsent(page,publicBaseline=null){
  const state=await browserStorageSnapshot(page);
  const encoded=JSON.stringify({local:state.local,session:state.session});for(const forbidden of ['DO_NOT_STORE_RAW_7X3','ROOM-NEVER-IMPORT-638','synthetic-private-filename','data:image','blob:http','<image','traineddata'])assert(!encoded.includes(forbidden),'No raw image, OCR text/evidence, filename or model database in local/session storage');
  const record=state.local['crewcheck_stay_editor_v2:A'];if(record){const check=value=>{if(!value||typeof value!=='object')return;for(const[key,child]of Object.entries(value)){assert(!/^(?:image|ocr|raw|text|evidence|filename|blob|dataurl)$/i.test(key),'No source payload keys in persisted record');check(child);}};check(JSON.parse(record));}
  const manifest=JSON.parse(fs.readFileSync('docs/stay-screenshot/ocr-assets-manifest.json','utf8'));
  assertOnlyModelStorageMayChange(state,manifest.modelCacheName,publicBaseline);
  for(const cached of state.cacheEntries.filter(entry=>entry.name===manifest.modelCacheName)){const url=new URL(cached.url),filename=url.pathname.split('/').pop(),asset=manifest.assets.find(item=>item.name===filename);assert.equal(url.origin,state.origin,'Cached models remain same-origin');assert(['/ocr/v7/eng.traineddata.gz','/ocr/v7/por.traineddata.gz'].includes(url.pathname));assert.equal(url.search,'');assert.equal(cached.method,'GET');assert(asset);assert.equal(cached.bytes,asset.bytes);assert.equal(cached.sha256,asset.sha256,'Cached bytes must be pinned public language models, never source pixels/text');}
}

function assertPublicPwaBaseline(state){
  assert.deepEqual(state.idb,[{name:'crewcheck-notification-installation-v1',version:1,stores:[{name:'state',keys:[],values:[]}]}],'Real legacy push worker opens only an empty database; no subscription, binding or messages');
  assert(state.cacheNames.includes(pwaContract.cacheNames[0]),'Real worker install must populate its shell cache');for(const name of state.cacheNames)assert(pwaContract.cacheNames.includes(name),'No arbitrary baseline cache exemption');
  for(const cached of state.cacheEntries){
    const url=new URL(cached.url);assert.equal(url.origin,state.origin);assert.equal(cached.method,'GET');assert(!url.pathname.startsWith('/ocr/'),'OCR must be lazy, not in install shell');
    if(url.pathname==='/__crewcheck_update_ready__'){assert.equal(cached.ready.buildId,'__CREWCHECK_UPDATE_BUILD_ID__');assert.deepEqual([...cached.ready.urls].sort(),[...new Set([...pwaContract.shell,...prodCssPaths,'/fixture.js'])].sort());continue;}
    assert(pwaContract.shell.includes(url.pathname+url.search)||prodCssPaths.includes(url.pathname)||requestPolicy.cssAssets.has(url.pathname+url.search)||url.pathname==='/fixture.js','Baseline holds only exact declared public assets');
    const bytes=url.pathname==='/'||url.pathname==='/index.html'?Buffer.from(fixtureHtml):url.pathname==='/fixture.js'?Buffer.from(js):fs.readFileSync(path.resolve(url.pathname.startsWith('/assets/')?'dist':publicRoot,'.'+url.pathname));
    assert.equal(cached.bytes,bytes.length);assert.equal(cached.sha256,createHash('sha256').update(bytes).digest('hex'),'Baseline cached bytes must equal the public fixture asset, not private state');
  }
}

async function captureVisible(page,target,name,{align='center'}={}){
  await target.evaluate((element,align)=>element.scrollIntoView({block:align,inline:'nearest',behavior:'instant'}),align);
  assert(await target.evaluate(element=>{const content=element.closest('.cc-stay-editor-content'),clip=content?.getBoundingClientRect(),rect=element.getBoundingClientRect();if(!clip)return false;const x=rect.left+rect.width/2,y=rect.top+rect.height/2;const hit=document.elementFromPoint(x,y);return x>=clip.left&&x<=clip.right&&y>=clip.top&&y<=clip.bottom&&(hit===element||element.contains(hit));}),'Artifact target must be visible within the actual scroll owner, not covered by header');
  await page.screenshot({path:path.join(artifacts,name+'.png'),fullPage:false});
}
async function assertReleased(page){await page.waitForFunction(()=>window.ocrAudit.active===0&&window.ocrAudit.urlsActive===0,{},{timeout:5000});const audit=await page.evaluate(()=>window.ocrAudit);assert.equal(audit.created,audit.terminated,'Every worker handle is terminated including failed initialization');assert.equal(audit.urlsCreated,audit.urlsRevoked,'Every preview object URL revoked');}
async function newPage(origin,{timezoneId='UTC',width=390,seed=true,pwa=false}={}){
  // Chromium may classify the SW's forwarding of a CSS image/font as fetch.
  // This changes only request classification, never the exact permitted URLs.
  const policy={...requestPolicy,previewUrls:new Set(),...(pwa?{applicationPaths:new Set([...requestPolicy.applicationPaths,'/sw.js','/crewcheck-push-offline.js',...pwaContract.shell.filter(asset=>!asset.includes('?'))]),installAssets:new Set([...pwaContract.shell,...prodCssPaths,'/fixture.js',...requestPolicy.cssAssets])}:{})};
  const context=await browser.newContext({timezoneId,viewport:{width,height:844},serviceWorkers:pwa?'allow':'block'}),observed=[],errors=[];
  context.on('request',request=>{const item={url:request.url(),method:request.method(),bodyBytes:request.postDataBuffer()?.byteLength||0,resourceType:request.resourceType()};observed.push(item);requestTraceRam.push({request:item,origin,policy,pwa});});
  await context.addInitScript(({seed})=>{
    if(!localStorage.getItem('crewcheck_auth_user')){localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'A',base:'CWB'}));localStorage.setItem('crewcheck_auth_token','synthetic-A');}
    if(seed&&!localStorage.getItem('crewcheck_stay_editor_v2:A'))localStorage.setItem('crewcheck_stay_editor_v2:A',JSON.stringify({version:2,accountId:'A',defaultLeadMinutes:90,defaultWithoutBreakfastMinutes:60,timeZonePreference:'local',stays:{'synthetic-stay':{eventId:'synthetic-stay',signature:'synthetic-stay|2032-10-21T03:00:00Z|2032-10-22T02:59:00Z|CWB|CWB',draft:{hotelName:'Hotel manual preservado',airport:'CWB',stayDate:'2032-10-21',room:'407-MANUAL',presentationTime:'04:20',leadMinutes:'45',shareSameHotel:false},timeZone:'America/Sao_Paulo',apzDate:'2032-10-22',apzSource:'manual',apzConfirmed:true,choice:{mode:'relative',leadMinutes:45},breakfastPlan:'with',alarmState:'cancelled'}}}));
    window.ocrAudit={created:0,terminated:0,active:0,urlsCreated:0,urlsRevoked:0,urlsActive:0,storageWrites:0,violations:[]};
    const NativeWorker=window.Worker;window.Worker=class extends NativeWorker{constructor(url,options){super(window.ocrFault==='silent'?'/fault/ocr-silent.js':window.ocrFault==='error'?'/fault/ocr-error.js':url,options);this._ocrTracked=String(url).includes('/ocr/v7/');if(this._ocrTracked){window.ocrAudit.created++;window.ocrAudit.active++;}}terminate(){if(this._ocrTracked){window.ocrAudit.terminated++;window.ocrAudit.active--;this._ocrTracked=false;}return super.terminate();}};
    const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL),urls=new Set();URL.createObjectURL=value=>{const url=create(value);urls.add(url);window.ocrAudit.urlsCreated++;window.ocrAudit.urlsActive=urls.size;return url;};URL.revokeObjectURL=url=>{if(urls.delete(url))window.ocrAudit.urlsRevoked++;window.ocrAudit.urlsActive=urls.size;return revoke(url);};
    const set=Storage.prototype.setItem;Storage.prototype.setItem=function(...args){window.ocrAudit.storageWrites++;return set.apply(this,args);};
    window.addEventListener('securitypolicyviolation',event=>window.ocrAudit.violations.push({directive:event.effectiveDirective,blocked:event.blockedURI}));
  },{seed});
  const page=await context.newPage();pagePolicies.set(page,policy);page.on('pageerror',error=>errors.push(error.message));await page.clock.install({time:new Date('2032-10-21T19:00:00Z')});await page.goto(origin);await page.getByRole('textbox',{name:'Hotel',exact:true}).waitFor();await page.waitForFunction(()=>localStorage.getItem('crewcheck_platform_stays_cache_v1')!==null);
  const verify=async(publicBaseline=null)=>{fs.writeFileSync(path.join(artifacts,'network-audit.json'),JSON.stringify({scope:'synthetic requests only; no headers or bodies',declaredStaticCssQueries:[...cssQueries],requests:networkAuditSnapshot()},null,2));for(const request of observed)assertFixtureRequest(request,origin,policy);assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.ocrAudit.violations),[],'No attempted CSP-blocked exfil');await assertRawAbsent(page,publicBaseline);};
  return{context,page,verify,observed,errors};
}
try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
  // Full end-to-end pixels → bundled worker → parser → editable preview → canonical local editor.
  for(const [mime,timezoneId,dark,width] of [['image/png','UTC',false,390],['image/jpeg','Asia/Tokyo',true,1280],['image/webp','America/Sao_Paulo',false,390]]){
    const{context,page,verify}=await newPage(origin,{timezoneId,width});const before=await saved(page);const initialWrites=await page.evaluate(()=>window.ocrAudit.storageWrites);
    await page.getByRole('button',{name:labels.open,exact:true}).click();const disclosure=review(page).locator('details'),summary=disclosure.locator('summary');assert.equal(await summary.textContent(),'Como funciona');assert.equal(await disclosure.evaluate(element=>element.open),false,'Optional explanation starts collapsed');
    assert(await review(page).getByText('Leitura no aparelho, sem upload. Revise antes de usar.',{exact:true}).isVisible());assert(await review(page).getByText('Print não verificado pelo MyCrewCare. Escolha os campos; salve no editor.',{exact:true}).isVisible(),'Origin, selection and explicit Save remain outside the collapsed explanation');assert.equal(await disclosure.locator('p').first().isVisible(),false);
    await summary.focus();await summary.press('Enter');assert.equal(await disclosure.evaluate(element=>element.open),true,'Keyboard Enter opens the explanation');assert(await disclosure.locator('p').first().isVisible());await summary.press('Space');assert.equal(await disclosure.evaluate(element=>element.open),false,'Keyboard Space closes the explanation');assert.equal(await page.evaluate(()=>window.ocrAudit.created),0,'Opening or toggling help never starts OCR');assert.equal(await page.evaluate(()=>window.ocrAudit.storageWrites),initialWrites,'Disclosure does not write storage');assert.deepEqual(await saved(page),before,'Disclosure never changes the operational stay');
    const image=await makeImage(page,{mime,dark,lines:mime==='image/webp'?linesEN:linesPT});const started=Date.now();await startImport(page,image);await waitReview(page);
    assert.equal(await page.getByRole('textbox',{name:'Hotel',exact:true}).inputValue(),'Hotel manual preservado','OCR cannot overwrite the editor without selecting/confirming fields');
    assert.deepEqual(await saved(page),before,'OCR preview does not save');assert.equal(await page.evaluate(()=>window.ocrAudit.storageWrites),initialWrites,'OCR writes no local/session storage');
    const candidate=page.getByLabel(labels.hotel,{exact:true});assert.match(await candidate.inputValue(),mime==='image/webp'?/Synthetic Harbor Hotel/i:/Hotel Sintetico Aurora/i,'Actual image pixels must produce the expected hotel');
    assert.equal(await page.getByLabel(labels.apzTime,{exact:true}).inputValue(),'04:40');assert.equal(await page.getByLabel(labels.apzDate,{exact:true}).inputValue(),'2032-10-22');assert.equal(await page.getByLabel(labels.apzZone,{exact:true}).inputValue(),'America/Sao_Paulo');
    assert.equal(await review(page).getByRole('checkbox',{name:'Usar hotel',exact:true}).isChecked(),false,'Import selection is explicit, not prechecked');
    await candidate.fill('Hotel confirmado pelo usuario');await review(page).getByRole('checkbox',{name:'Usar hotel',exact:true}).check();await review(page).getByRole('checkbox',{name:'Usar APZ no hotel',exact:true}).check();await review(page).getByRole('checkbox',{name:'Usar transporte',exact:true}).check();
    await page.evaluate(({dark})=>{window.fixtureTheme(dark?'dark':'light');document.documentElement.style.fontSize=dark?'24px':'16px';},{dark});
    const explanationColors=await review(page).evaluate(element=>({section:getComputedStyle(element).color,consent:getComputedStyle(element.querySelector(':scope > p')).color}));assert.equal(explanationColors.consent,explanationColors.section,'Screenshot purpose/consent text inherits readable section text in each theme');
    for(const checkbox of await review(page).getByRole('checkbox').all()){const box=await checkbox.boundingBox();assert(box&&box.width>0&&box.height>0&&box.width<=24&&box.height<=24,'Screenshot selection checkbox stays compact, not stretched by legacy form CSS');}
    for(const fieldset of await review(page).locator('fieldset').all())assert(await fieldset.evaluate(element=>{const style=getComputedStyle(element);return ['borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth'].every(property=>parseFloat(style[property])===0);}), 'Screenshot field groups do not add nested visual borders');
    assert(await review(page).getByText('APZ no hall, não pickup, check-in ou voo. Não confirmada: confirme no editor. Data/fuso vazios substituem os anteriores.',{exact:true}).isVisible(),'Critical APZ warning stays visible without opening help');
    const writesBeforeKeyboard=await page.evaluate(()=>window.ocrAudit.storageWrites); // Theme preference changes above are baseline, not import effects.
    const hotelChoice=review(page).getByRole('checkbox',{name:'Usar hotel',exact:true}),selectionBefore=await hotelChoice.isChecked();await candidate.focus();await page.keyboard.press('Shift+Tab');assert(await hotelChoice.evaluate(element=>{const style=getComputedStyle(element);return document.activeElement===element&&element.matches(':focus-visible')&&style.outlineStyle!=='none'&&parseFloat(style.outlineWidth)>=2&&style.outlineColor!== 'rgba(0, 0, 0, 0)';}),'Keyboard navigation retains a visible focus outline on the import checkbox');await page.keyboard.press('Space');assert.equal(await hotelChoice.isChecked(),!selectionBefore);await page.keyboard.press('Space');assert.equal(await hotelChoice.isChecked(),selectionBefore,'Keyboard toggling restores the original explicit selection');assert.deepEqual(await saved(page),before);assert.equal(await page.evaluate(()=>window.ocrAudit.storageWrites),writesBeforeKeyboard,'Checkbox keyboard interaction never writes storage');
    const shotPrefix=`preview-${mime.split('/')[1]}-${width}`;
    await captureVisible(page,review(page).getByRole('heading',{level:3}),shotPrefix+'-top',{align:'start'});
    await captureVisible(page,review(page).getByRole('img',{name:'Print selecionado para revisão local'}),shotPrefix+'-image');
    await captureVisible(page,page.getByLabel(labels.apzTime,{exact:true}),shotPrefix+'-fields');assert(await review(page).evaluate(element=>element.scrollWidth<=element.clientWidth+1),'Review wraps at actual production CSS and enlarged font');
    await captureVisible(page,page.getByRole('button',{name:labels.apply,exact:true}),shotPrefix+'-actions');
    await page.getByRole('button',{name:labels.apply,exact:true}).click();await assertReleased(page);
    await captureVisible(page,page.getByRole('textbox',{name:'Hotel',exact:true}),shotPrefix+'-editor');
    await captureVisible(page,page.getByRole('checkbox',{name:'Confirmo esta data, horário e fuso como APZ no hotel',exact:true}),shotPrefix+'-confirmation');
    assert.equal(await page.getByRole('textbox',{name:'Hotel',exact:true}).inputValue(),'Hotel confirmado pelo usuario');assert.equal(await page.getByLabel('Número do quarto',{exact:true}).inputValue(),'407-MANUAL','MCC screenshot never overwrites manual room');
    assert.equal(await page.getByRole('checkbox',{name:'Confirmo esta data, horário e fuso como APZ no hotel',exact:true}).isChecked(),false,'Import cannot confirm APZ provenance');assert.deepEqual(await saved(page),before,'Applying chosen fields is draft-only');
    await page.getByRole('button',{name:'Salvar alterações do pernoite',exact:true}).click();let record=(await saved(page)).stays['synthetic-stay'];assert.equal(record.apzConfirmed,false);assert.equal(record.draft.hotelName,'Hotel confirmado pelo usuario');assert.equal(record.draft.room,'407-MANUAL');assert.equal(record.alarmState,'cancelled');assert.deepEqual(record.choice,before.stays['synthetic-stay'].choice);assert.equal(record.draft.shareSameHotel,false);assert.match(record.transport.transportProvider,mime==='image/webp'?/Synthetic Shuttle/i:/Transporte Sintetico Sol/i);assert.equal(record.transport.pickupTime,'05:10');assert.equal(record.transport.pickupDate,'2032-10-22');assert.match(JSON.stringify(record),/screenshot/,'Input origin is separate from authenticated MCC');
    await page.getByRole('checkbox',{name:'Confirmo esta data, horário e fuso como APZ no hotel',exact:true}).check();await page.getByRole('button',{name:'Salvar alterações do pernoite',exact:true}).click();record=(await saved(page)).stays['synthetic-stay'];assert.equal(record.apzSource,'manual');assert.equal(record.apzConfirmed,true);assert.equal(record.apzDate,'2032-10-22');assert.equal(record.timeZone,'America/Sao_Paulo');
    const timing=await page.evaluate(()=>performance.getEntriesByType('resource').filter(entry=>entry.name.includes('/ocr/v7/')).map(entry=>({file:new URL(entry.name).pathname.split('/').pop(),transferSize:entry.transferSize,encodedBodySize:entry.encodedBodySize,decodedBodySize:entry.decodedBodySize,durationMs:Math.round(entry.duration)})));results.push({case:'real-pixels-confirm-save',mime,timezoneId,dark,width,compactDisclosureKeyboard:true,checkboxKeyboardFocus:true,elapsedMs:Date.now()-started,resources:timing});
    await assertRawAbsent(page);await page.reload();await page.getByRole('textbox',{name:'Hotel',exact:true}).waitFor();assert.equal(await page.getByRole('textbox',{name:'Hotel',exact:true}).inputValue(),'Hotel confirmado pelo usuario');assert.equal(await page.getByLabel('Número do quarto',{exact:true}).inputValue(),'407-MANUAL');const savedBeforeRemoval=await saved(page);if(mime==='image/jpeg')await page.getByRole('textbox',{name:'Hotel',exact:true}).fill('Hotel editado depois do print');await page.getByRole('button',{name:'Remover campos importados do print',exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'Hotel',exact:true}).inputValue(),mime==='image/jpeg'?'Hotel editado depois do print':'Hotel manual preservado','Removing imported fields restores prior manual values but preserves later edits');assert.deepEqual(await saved(page),savedBeforeRemoval,'Removal requires explicit Save');await page.getByRole('button',{name:'Salvar alterações do pernoite',exact:true}).click();assert.equal((await saved(page)).stays['synthetic-stay'].screenshotImport,undefined);await verify();await context.close();
  }
  console.log('PASS real PNG/JPEG/WebP screenshot pipeline, edit/selection/explicit save, manual APZ, preserved room/alarm/sharing and 3 device zones');
  // Real PWA controller and fetch/cache path. This serves the actual public SW
  // with raw update placeholders; build-integrity/update activation is NOT tested.
  {
    const{context,page,verify}=await newPage(origin,{pwa:true});
    await page.evaluate(()=>{window.pwaRegistrationStatus='pending';navigator.serviceWorker.register('/sw.js',{scope:'/'}).then(()=>navigator.serviceWorker.ready).then(()=>{window.pwaRegistrationStatus='ready';},()=>{window.pwaRegistrationStatus='failed';});});
    await page.waitForFunction(()=>window.pwaRegistrationStatus==='failed'||(window.pwaRegistrationStatus==='ready'&&Boolean(navigator.serviceWorker.controller)),{},{timeout:20_000});assert.equal(await page.evaluate(()=>window.pwaRegistrationStatus),'ready','Real PWA registration must succeed; no fallback to an uncontrolled page');
    await page.reload();await page.getByRole('textbox',{name:'Hotel',exact:true}).waitFor();await page.waitForLoadState('networkidle');
    await page.waitForFunction(async()=>Boolean(navigator.serviceWorker.controller)&&(await indexedDB.databases()).some(database=>database.name==='crewcheck-notification-installation-v1'));
    assert.equal(await page.evaluate(()=>new URL(navigator.serviceWorker.controller.scriptURL).pathname),'/sw.js');
    const baseline=await browserStorageSnapshot(page);assertPublicPwaBaseline(baseline);await verify(baseline);
    const before=await saved(page),writes=await page.evaluate(()=>window.ocrAudit.storageWrites);await startImport(page,await makeImage(page));await waitReview(page);
    assert.match(await page.getByLabel(labels.hotel,{exact:true}).inputValue(),/Hotel Sintetico Aurora/i,'Controlled PWA performs real pixels-to-fields OCR');assert.equal(await page.getByLabel(labels.apzTime,{exact:true}).inputValue(),'04:40');assert.equal(await page.evaluate(()=>window.ocrAudit.storageWrites),writes,'PWA OCR has no local/session write');
    await review(page).getByRole('checkbox',{name:'Usar hotel',exact:true}).check();await review(page).getByRole('checkbox',{name:'Usar APZ no hotel',exact:true}).check();await captureVisible(page,page.getByRole('button',{name:labels.apply,exact:true}),'pwa-real-ocr-review-actions');await page.getByRole('button',{name:labels.apply,exact:true}).click();await assertReleased(page);
    assert.match(await page.getByRole('textbox',{name:'Hotel',exact:true}).inputValue(),/Hotel Sintetico Aurora/i);assert.deepEqual(await saved(page),before,'PWA apply is draft-only');assert.equal(await page.getByRole('checkbox',{name:'Confirmo esta data, horário e fuso como APZ no hotel',exact:true}).isChecked(),false);await verify(baseline);
    const after=await browserStorageSnapshot(page),manifest=JSON.parse(fs.readFileSync('docs/stay-screenshot/ocr-assets-manifest.json','utf8'));assert.equal(after.cacheEntries.filter(entry=>entry.name===manifest.modelCacheName).length,2,'PWA caches only two pinned public models, never worker/core or private pixels');
    results.push({case:'real-pwa-controller-ocr-cache-isolation',status:'passed-real-pixels',scope:'actual public raw-placeholder SW fetch/cache only; not update build-integrity or activation',baselineCaches:baseline.cacheNames,baselineEntries:baseline.cacheEntries.map(({name,url,bytes,sha256})=>({name,path:new URL(url).pathname,bytes,sha256})),genericCachesUnchanged:true,legacyPushDatabaseEmptyAndUnchanged:true});await context.close();
  }
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
}finally{fs.writeFileSync(path.join(artifacts,'network-audit.json'),JSON.stringify({scope:'synthetic requests only; no headers or bodies',declaredStaticCssQueries:[...cssQueries],requests:networkAuditSnapshot()},null,2));await browser?.close();await new Promise(resolve=>server.close(resolve));}
