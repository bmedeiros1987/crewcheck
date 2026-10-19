import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import {webcrypto,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {guardStaticHtml,FLOATING_SHORTCUT_GUARD} from '../server/static-html-guard.mjs';
// Run exactly the preparation used before npm start; do not start scheduler,
// authenticate, read account data or connect any provider/database.
execFileSync(process.execPath,['scripts/v139/apply.mjs'],{stdio:'pipe'});
const source=fs.readFileSync('server.mjs','utf8');
assert(source.includes("import { guardStaticHtml } from './server/static-html-guard.mjs'"),'canonical prepared server must use shared guard');
const handlerSource=source.match(/function serveStatic\(req, res, url\) \{[\s\S]*?\n\}/)?.[0];
assert(handlerSource,'actual canonical static handler found');
const distDir=path.resolve('dist');
const handler=vm.runInNewContext(handlerSource+';serveStatic',{fs,path,distDir,Buffer,guardStaticHtml,sendJson:(res,status,payload)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(payload));}});
const server=http.createServer((req,res)=>handler(req,res,new URL(req.url,'http://localhost')));
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
let checks=0;const check=(value,label)=>{checks++;assert(value,label);};
try{
 const disk=fs.readFileSync(path.join(distDir,'index.html'),'utf8');
 check(disk.includes(FLOATING_SHORTCUT_GUARD),'build retains existing shortcut security/UI guard');
 check(guardStaticHtml(disk)===disk,'guard is byte-idempotent');
 for(const route of ['/','/index.html','/synthetic-spa-route','/synthetic-missing-resource']){
  const response=await fetch(origin+route);check(response.status===200,'canonical static/SPA response available');
  check(await response.text()===disk,'served bytes exactly equal sealed HTML: '+route);
 }
 const worker=await(await fetch(origin+'/sw.js')).text();
 const expected=worker.match(/const CREWCHECK_UPDATE_HTML_HASH='([^']+)'/)[1];
 check(createHash('sha256').update(disk).digest('hex')===expected,'served HTML digest equals worker stamp after startup preparation');
 const events={},stores=new Map();
 const caches={async open(name){if(!stores.has(name)){const entries=new Map();stores.set(name,{async put(url,response){entries.set(String(url),response.clone());},async match(url){return entries.get(String(url))?.clone();}});}return stores.get(name);}};
 const self={location:{origin},addEventListener(name,fn){events[name]=fn;}};
 vm.runInNewContext(worker,{self,caches,fetch:(url,options)=>fetch(new URL(url,origin),options),Response,Request,URL,crypto:webcrypto,Uint8Array,importScripts(){},console});
 let install;events.install({waitUntil(value){install=value;}});await install;
 let ready,info;events.message({data:{type:'CREWCHECK_UPDATE_INFO'},source:{type:'window',url:origin+'/'},ports:[{postMessage(value){ready=value.ready;}}],waitUntil(value){info=value;}});await info;
 check(ready===true,'actual worker installs and reports ready with actual canonical handler');
 const assetUrls=JSON.parse(worker.match(/const CREWCHECK_UPDATE_ASSETS=(\[.*?\]);/)[1]);check(assetUrls.some(url=>url.includes('pdf.worker')),'actual emitted PDF worker included');
 console.log(`PASS ${checks} canonical static/start-preparation parity and actual worker VM checks; real fs/static handler and local HTTP only, no scheduler/providers/permissions.`);
}finally{await new Promise(resolve=>server.close(resolve));}
