import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = path.resolve(process.env.SOUND_EVIDENCE_DIR || 'artifacts/notification-sound');
fs.mkdirSync(out, { recursive: true });
const entry = `import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import Setting from '${path.resolve('client/src/components/pulse/NotificationSoundSetting.tsx')}';
import {publishCrewCheckNotice,clearCrewCheckPulse} from '${path.resolve('client/src/components/pulse/pulseRuntime.ts')}';
import {getCrewCheckNotificationSound} from '${path.resolve('client/src/components/pulse/pulseSound.ts')}';
window.__notice=()=>publishCrewCheckNotice({id:'fixture-'+Date.now(),title:'Aviso sintético',systemNotification:'never'});window.__sound=getCrewCheckNotificationSound;window.__clear=clearCrewCheckPulse;
function App(){const[open,setOpen]=useState(true);return <main className="cz-app" data-view="settings"><section className="cz-settings"><h1>Notificações e concierge</h1>{open&&<Setting/>}<button onClick={()=>setOpen(!open)}>{open?'Sair das configurações':'Voltar às configurações'}</button></section></main>};createRoot(document.getElementById('root')).render(<App/>);`;
await build({stdin:{contents:entry,resolveDir:path.resolve('.'),loader:'tsx'},bundle:true,jsx:'automatic',format:'iife',outfile:path.join(out,'app.js'),define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'});
// Focused component QA with the repository's base CSS, rather than a second UI implementation.
fs.writeFileSync(path.join(out,'base.css'),fs.readFileSync('client/src/index.css','utf8').replace(/@import\s+[^;]+;/g,''));
const server = http.createServer((req,res)=>{
  const url = new URL(req.url,'http://localhost');
  if(url.pathname==='/') {res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/base.css"><link rel="stylesheet" href="/app.css"><style>body{margin:0}.cz-app{max-width:980px;margin:auto;padding:20px}.cz-settings{min-width:0}.cc-notification-sound select{max-width:100%}</style><div id="root"></div><script src="/app.js"></script>');return;}
  const p = url.pathname.startsWith('/assets/') ? path.join('client/public',url.pathname) : path.join(out,url.pathname);
  if(!fs.existsSync(p)||!fs.statSync(p).isFile()){res.statusCode=404;res.end();return;}
  res.setHeader('content-type',p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':p.endsWith('.mp3')?'audio/mpeg':'application/octet-stream');res.end(fs.readFileSync(p));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
const page=await browser.newPage({viewport:{width:390,height:844}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{
  window.__audio=[];window.__permissionCalls=0;
  const Original=window.Audio;
  window.Audio=function(src){const a=new Original(src);window.__audio.push(a);return a;};
  if(window.Notification) Notification.requestPermission=()=>{window.__permissionCalls++;return Promise.resolve('denied');};
});
try {
  await page.goto(base);
  const select=page.getByLabel('Som de notificação',{exact:true});
  await select.waitFor();assert.equal(await select.inputValue(),'off');assert.equal(await page.evaluate(()=>window.__audio.length),0);
  assert(await page.getByRole('button',{name:'Ouvir prévia',exact:true}).isDisabled());
  await select.selectOption('a320-interphone');assert.equal(await page.evaluate(()=>window.__audio.length),0);
  await page.getByRole('button',{name:'Ouvir prévia',exact:true}).click();
  await page.getByRole('button',{name:'Parar prévia',exact:true}).waitFor();
  await page.waitForFunction(()=>window.__audio.at(-1)?.currentTime>0);
  const meta=await page.evaluate(()=>{const a=window.__audio.at(-1);return{duration:a.duration,volume:a.volume,readyState:a.readyState,src:a.src};});
  assert(meta.duration>4&&meta.duration<5);assert.equal(meta.volume,.35);assert(meta.readyState>=2);
  await page.getByRole('button',{name:'Parar prévia',exact:true}).click();assert(await page.evaluate(()=>window.__audio.at(-1).paused));
  await page.getByRole('button',{name:'Ouvir prévia',exact:true}).click();await select.selectOption('off');assert(await page.evaluate(()=>window.__audio.at(-1).paused));
  await select.selectOption('a320-interphone');await page.getByRole('button',{name:'Ouvir prévia',exact:true}).click();
  await page.getByRole('button',{name:'Sair das configurações',exact:true}).click();assert(await page.evaluate(()=>window.__audio.at(-1).paused));
  await page.getByRole('button',{name:'Voltar às configurações',exact:true}).click();assert.equal(await select.inputValue(),'a320-interphone');
  await page.getByRole('button',{name:'Ouvir prévia',exact:true}).click();await page.evaluate(()=>dispatchEvent(new PopStateEvent('popstate')));assert(await page.evaluate(()=>window.__audio.at(-1).paused));
  await page.getByRole('button',{name:'Ouvir prévia',exact:true}).click();await page.evaluate(()=>dispatchEvent(new Event('crewcheck:set-view')));assert(await page.evaluate(()=>window.__audio.at(-1).paused));
  await page.reload();await select.waitFor();assert.equal(await select.inputValue(),'a320-interphone');assert.equal(await page.evaluate(()=>window.__audio.length),0,'reload must not autoplay');
  await page.evaluate(()=>{window.__notice();});await page.waitForFunction(()=>window.__audio.length===1);
  const afterNotice=await page.evaluate(()=>window.__audio.length);await page.evaluate(()=>window.__notice());assert.equal(await page.evaluate(()=>window.__audio.length),afterNotice);
  await page.evaluate(()=>window.__clear());assert(await page.evaluate(()=>window.__audio.at(-1).paused));
  await page.getByRole('button',{name:'Ouvir prévia',exact:true}).click();
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));});assert(await page.evaluate(()=>window.__audio.at(-1).paused));
  await page.evaluate(()=>Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'}));
  // Failure is contained and retryable, with no permission prompts.
  await page.evaluate(()=>{window.__originalPlay=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=()=>Promise.reject(new DOMException('blocked','NotAllowedError'));});
  await page.getByRole('button',{name:'Ouvir prévia',exact:true}).click();await page.getByRole('status').filter({hasText:'Não foi possível tocar o som'}).waitFor();
  await page.evaluate(()=>HTMLMediaElement.prototype.play=window.__originalPlay);
  await page.getByRole('button',{name:'Ouvir prévia',exact:true}).click();await page.getByRole('button',{name:'Parar prévia',exact:true}).click();
  for(const theme of ['dark','light']) for(const width of [390,768,1280]) {
    await page.setViewportSize({width,height:900});await page.evaluate(theme=>{document.documentElement.dataset.crewTheme=theme;document.documentElement.style.colorScheme=theme;document.documentElement.classList.toggle('dark',theme==='dark');},theme);
    await page.screenshot({path:path.join(out,`settings-${theme}-${width}.png`),fullPage:true});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');
    const button=await page.getByRole('button',{name:'Ouvir prévia',exact:true}).boundingBox();assert(button.height>=44,'touch target');
  }
  assert.equal(await page.evaluate(()=>window.__permissionCalls),0);
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({ok:true,metadata:meta,cases:['silent default','no play on select','real MP3 decode/play','stop','mute','unmount','back event','app navigation','reload preference/no autoplay','Pulse integration and burst','hidden cleanup','blocked playback and retry','6 responsive/theme screenshots','no permissions or page errors'],scope:'Actual settings component and actual Pulse runtime in synthetic local harness; not live delivery'},null,2));
  console.log('PASS browser notification sound: actual MP3, UI flows, interruptions, failure handling, and six responsive/theme screenshots');
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
