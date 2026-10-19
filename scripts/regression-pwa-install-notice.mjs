import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {renderToString} from 'react-dom/server';
import React from 'react';
const require=createRequire(import.meta.url),browserRequire=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||import.meta.url);
const node=await build({entryPoints:['client/src/components/PwaInstallNotice.tsx'],bundle:true,platform:'node',format:'cjs',packages:'external',loader:{'.css':'empty'},write:false});
const module={exports:{}};vm.runInNewContext(node.outputFiles[0].text,{module,exports:module.exports,require});
assert.equal(renderToString(React.createElement(module.exports.default)),'','SSR needs no browser globals');
const result=await build({stdin:{contents:"import React,{useState}from'react';import{createRoot}from'react-dom/client';import Notice from'./client/src/components/PwaInstallNotice';function Fixture(){const[visible,setVisible]=useState(true);window.fixtureVisible=setVisible;return visible?<Notice/>:null;}createRoot(document.getElementById('root')).render(<Fixture/>);",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outfile:'fixture.js',jsx:'automatic'});
const js=result.outputFiles.find(f=>f.path.endsWith('.js')).text,css=result.outputFiles.find(f=>f.path.endsWith('.css')).text;
const server=http.createServer((req,res)=>{res.setHeader('content-type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?js:`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}body{margin:0}header{position:fixed;top:0;height:80px}footer{position:fixed;bottom:0;height:96px}</style><header>Header fixture</header><main id="root"></main><footer>Menu fixture</footer><script src="/fixture.js"></script>`);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const {chromium}=browserRequire('playwright');const browser=await chromium.launch({args:['--no-sandbox'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
const iphone='Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 Version/18.4 Mobile Safari/604.1';
let checks=1;const check=(value,label)=>{checks++;assert(value,label);};
async function pageFor(options={}){
 const context=await browser.newContext({viewport:{width:390,height:844}});await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const page=await context.newPage();await page.addInitScript(options=>{
  Object.defineProperty(navigator,'userAgent',{get:()=>options.ua||'Desktop fixture'});Object.defineProperty(navigator,'platform',{get:()=>options.platform||'MacIntel'});Object.defineProperty(navigator,'maxTouchPoints',{get:()=>options.touch||0});Object.defineProperty(navigator,'standalone',{get:()=>!!options.legacyStandalone});
  const original=window.matchMedia.bind(window);window.matchMedia=query=>query.includes('display-mode')?{matches:!!options.standalone,addEventListener(){},removeEventListener(){}}:original(query);
  if(options.native)window.Capacitor={isNativePlatform:()=>true};if(options.installed)localStorage.setItem('crewcheck_pwa_install_seen_v1','1');if(options.dismissed)localStorage.setItem('crewcheck_pwa_install_dismissed_v1','1');
  if(options.storageBlocked){Storage.prototype.getItem=()=>{throw Error('fixture storage blocked');};Storage.prototype.setItem=()=>{throw Error('fixture storage blocked');};}
  window.permissionCalls=0;window.Notification={permission:'default',requestPermission(){window.permissionCalls++;throw Error('No permission requests');}};
  window.promptCalls=0;window.fixtureOffer=(outcome='accepted')=>{const event=new Event('beforeinstallprompt',{cancelable:true});event.prompt=async()=>{window.promptCalls++;};event.userChoice=Promise.resolve({outcome});window.dispatchEvent(event);};
 },options);await page.goto(origin);await page.waitForFunction(()=>typeof window.fixtureVisible==='function');await page.waitForTimeout(30);return{context,page};
}
try{
 for(const options of [{ua:iphone},{ua:iphone.replace('Safari/604.1','CriOS/130.0 Mobile Safari/604.1')},{ua:'Mozilla/5.0 Macintosh Safari/605.1.15',platform:'MacIntel',touch:5}]){
  const{context,page}=await pageFor(options);const notice=page.getByRole('complementary',{name:'Instalar CrewCheck'});await notice.waitFor();check(await page.getByRole('button',{name:'Como instalar'}).isVisible(),'Apple manual installation option');
  await page.getByRole('button',{name:'Como instalar'}).click();check((await notice.innerText()).includes('Compartilhar'),'contextual Share guidance');check((await notice.innerText()).includes('Safari'),'other browser has Safari fallback');check((await notice.innerText()).includes('não autoriza notificações'),'installation is not permission');
  check(await page.getByRole('button',{name:'Como instalar'}).getAttribute('aria-expanded')==='true','accessible disclosure');check(await page.evaluate(id=>Boolean(document.getElementById(id)),await page.getByRole('button',{name:'Como instalar'}).getAttribute('aria-controls')),'disclosure target exists');
  for(const width of [320,390,820])for(const font of [14,28]){await page.setViewportSize({width,height:844});await notice.evaluate((node,font)=>node.style.fontSize=font+'px',font);const box=await notice.boundingBox();check(box.x>=0&&box.x+box.width<=width&&box.y>=80&&box.y+box.height<=748,'notice clears header/footer and viewport');check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');}
  await page.evaluate(()=>window.fixtureOffer());check(await page.evaluate(()=>window.permissionCalls===0&&window.promptCalls===0),'no fabricated Apple prompt or permission');if(process.env.PWA_INSTALL_SCREENSHOT&&options.ua===iphone){await page.setViewportSize({width:390,height:844});await notice.evaluate(node=>node.style.fontSize='14px');await page.screenshot({path:process.env.PWA_INSTALL_SCREENSHOT});}await page.getByRole('button',{name:'Agora não'}).click();check(await notice.count()===0,'dismiss hides');await page.evaluate(()=>window.fixtureVisible(false));await page.evaluate(()=>window.fixtureVisible(true));await page.waitForTimeout(30);check(await notice.count()===0,'dismiss persists across route/remount');await page.reload();await page.waitForTimeout(60);check(await notice.count()===0,'dismiss persists across reload');await context.close();
 }
 for(const options of [{ua:iphone,standalone:true},{ua:iphone,legacyStandalone:true},{ua:iphone,installed:true},{ua:iphone,dismissed:true},{ua:iphone,native:true},{ua:'Desktop Safari',platform:'MacIntel',touch:0},{ua:'Android Chrome'}]){const{context,page}=await pageFor(options);check(await page.getByRole('complementary',{name:'Instalar CrewCheck'}).count()===0,'no unsolicited offer for installed/native/desktop/Android');await context.close();}
 {
  const{context,page}=await pageFor({ua:'Android Chrome'});await page.evaluate(()=>window.fixtureOffer());await page.getByRole('button',{name:'Instalar CrewCheck',exact:true}).waitFor();check(await page.evaluate(()=>window.promptCalls===0),'real prompt only after user tap');await page.getByRole('button',{name:'Instalar CrewCheck',exact:true}).click();await page.getByRole('status').waitFor();check(await page.evaluate(()=>window.promptCalls===1),'one explicit browser prompt');check((await page.getByRole('status').innerText()).includes('ainda pode estar em andamento'),'accepted is not installed');await page.evaluate(()=>window.dispatchEvent(new Event('appinstalled')));await page.getByRole('complementary').waitFor({state:'hidden'});check(await page.getByRole('complementary').count()===0,'appinstalled hides offer');await context.close();
 }
 {const{context,page}=await pageFor({ua:iphone,storageBlocked:true});await page.getByRole('button',{name:'Agora não'}).click();await page.evaluate(()=>window.fixtureVisible(false));await page.evaluate(()=>window.fixtureVisible(true));await page.waitForTimeout(30);check(await page.getByRole('complementary').count()===0,'in-memory dismissal survives unavailable storage');await context.close();}
 console.log(`PASS ${checks} actual PWA install notice checks: iPhone/iPad desktop-UA, Safari/other browser, standalone/native/known installed, dismissal/remount/storage failure, real Android event only, SSR, accessible disclosure and responsive font2x; zero real installation or permission requests.`);
}finally{await browser.close();await new Promise(r=>server.close(r));}
