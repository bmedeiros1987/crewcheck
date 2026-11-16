import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {startFixtureServer} from './android-qa/fixture-server.mjs';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'crewcheck-qa-fixture-'));
await fs.writeFile(path.join(dir,'index.html'),'<!doctype html><title>synthetic QA</title>');
await fs.writeFile(path.join(dir,'worker.js'),'self.addEventListener("fetch",()=>{});');
await fs.symlink('/etc/passwd',path.join(dir,'escape.json'));
const server=await startFixtureServer({root:dir,port:0});const origin=`http://127.0.0.1:${server.address().port}`;
try{
 assert.equal((await fetch(origin+'/worker.js')).status,200);
 const home=await fetch(origin+'/app');assert.equal(home.status,200);
 const csp=home.headers.get('content-security-policy');assert.match(csp,/worker-src 'none'/);assert.match(csp,/connect-src http:\/\/127\.0\.0\.1:\d+ blob:;/);assert(!csp.includes('ws:'));
 assert.equal((await fetch(origin+'/api/payments')).status,503);
 assert.equal((await fetch(origin+'/api/payments',{method:'POST'})).status,405);
 assert.equal((await fetch(origin+'/escape.json')).status,403);
 assert.equal((await fetch(origin+'/redirect?url=https://crewcheck.online',{redirect:'manual'})).status,404);
 assert.equal(await new Promise((resolve,reject)=>{http.get(origin+'/',{headers:{Host:'crewcheck.online'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject);}),403);
 if(process.env.MENU_PLAYWRIGHT_PACKAGE){
  const {createRequire}=await import('node:module');const require=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE);const {chromium}=require('playwright');
  const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  try{const page=await browser.newPage({acceptDownloads:true});await page.goto(origin+'/app');
   const result=await page.evaluate(async(origin)=>{
    const violations=[];document.addEventListener('securitypolicyviolation',event=>violations.push(event.effectiveDirective));
    const ws=await new Promise(resolve=>{const socket=new WebSocket(origin.replace('http:','ws:')+'/socket');socket.onerror=()=>resolve('blocked');socket.onopen=()=>{socket.close();resolve('opened');};setTimeout(()=>resolve('timeout'),1000);});
    let worker;try{await navigator.serviceWorker.register('/worker.js');worker='registered';}catch{worker='blocked';}
    await new Promise(resolve=>setTimeout(resolve,100));return {ws,worker,violations};
   },origin);assert.equal(result.ws,'blocked');assert.equal(result.worker,'blocked');assert(result.violations.includes('connect-src'));assert(result.violations.includes('worker-src')); 
   const downloadPromise=page.waitForEvent('download');await page.evaluate(()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({synthetic:true,months:['2026-10','2026-11']})],{type:'application/json'}));a.download='synthetic-checkpoint.json';a.click();});
   const download=await downloadPromise;const content=JSON.parse(await fs.readFile(await download.path(),'utf8'));assert.deepEqual(content,{synthetic:true,months:['2026-10','2026-11']});
   console.log('PASS Chromium fixture CSP blocks WebSocket and Service Worker; synthetic Blob downloaded/reopened. Not Android WebView/file chooser validation');
  }finally{await browser.close();}
 }
 console.log('PASS loopback fixture HTTP: synthetic503, no forwarding/redirect, write/host/symlink refusal; no production calls');
}finally{await new Promise(resolve=>server.close(resolve));await fs.rm(dir,{recursive:true,force:true});}
