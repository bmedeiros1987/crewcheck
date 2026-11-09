import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const flush = () => new Promise(resolve => setImmediate(resolve));
const marker = 'crewcheck_google_calendar_server_bridge_v1';
function fixture() {
  const data = new Map(), listeners = new Map(), requests = [], timers = [], navigated = [];
  const storage = { getItem: key => data.get(key) ?? null, setItem: (k,v) => data.set(k,String(v)), removeItem: k => data.delete(k) };
  const popup = { closed:false, close(){this.closed=true;}, document:{}, location:{replace:url=>navigated.push(url)} };
  const window = { localStorage:storage, sessionStorage:storage,
    addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn);},
    dispatchEvent(event){for(const fn of listeners.get(event.type)||[]) fn(event);},
    open:()=>popup, setTimeout:fn=>timers.push(fn), clearTimeout(){} };
  const context={exports:{},window,localStorage:storage,sessionStorage:storage,navigator:{userAgent:'Synthetic browser'},AbortController,
    Event:class{constructor(type){this.type=type;}},CustomEvent:class{constructor(type){this.type=type;}},
    fetch:(url,options)=>new Promise(resolve=>requests.push({url,options,respond:(payload,status=200)=>resolve({ok:status<400,status,text:async()=>JSON.stringify(payload)})}))};
  vm.runInNewContext(compile(fs.readFileSync('client/src/lib/authClient.ts','utf8')),context);
  const auth=context.exports;
  const bridgeContext={...context,exports:{},require:()=>auth};
  vm.runInNewContext(compile(fs.readFileSync('client/src/lib/googleCalendarOAuthBridge.ts','utf8')),bridgeContext);
  return {api:bridgeContext.exports,data,requests,timers,popup,navigated,
    account(owner='A',token='token-A'){data.set('crewcheck_auth_user',JSON.stringify({id:owner,email:`${owner}@example.invalid`}));if(token)data.set('crewcheck_auth_token',token);else data.delete('crewcheck_auth_token');window.dispatchEvent({type:'crewcheck:auth-changed'});},
    storageChange(key){window.dispatchEvent({type:'storage',key});}};
}
let cases=0;
{
  const f=fixture();f.account();const p=f.api.connectGoogleCalendarViaServer();const rejected=assert.rejects(p,e=>e.code==='GOOGLE_SESSION_CHANGED');
  f.account('B','token-B');f.requests[0].respond({ok:true,authUrl:'https://accounts.google.com/synthetic',state:'state-A'});await rejected;
  assert.equal(f.navigated.length,0);assert.equal(f.popup.closed,true);assert.equal(f.data.has(marker),false);cases++;
}
for(const changed of ['other-owner','same-owner-new-token','logout']) {
  const f=fixture();f.account();const p=f.api.connectGoogleCalendarViaServer();const rejected=assert.rejects(p,e=>e.code==='GOOGLE_SESSION_CHANGED');
  f.requests[0].respond({ok:true,authUrl:'https://accounts.google.com/synthetic',state:'state-A'});await flush();f.timers.shift()();await flush();
  assert.equal(f.requests.length,2);assert.equal(f.requests[1].options.headers.authorization,'Bearer token-A');
  f.account(changed==='other-owner'?'B':'A',changed==='logout'?'':'token-B');f.requests[1].respond({ok:true,connected:true,state:'connected'});await rejected;
  assert.equal(f.data.has(marker),false);assert.equal(f.popup.closed,true);cases++;
}
{
  const f=fixture();f.account();const p=f.api.serverGoogleCalendarFetch('/calendars/primary/events');const rejected=assert.rejects(p,e=>e.code==='GOOGLE_SESSION_CHANGED');
  f.account('B','token-B');f.requests[0].respond({ok:true,data:{items:[{summary:'Synthetic account A only'}]}});await rejected;cases++;
}
{
  const f=fixture();f.account();const p=f.api.connectGoogleCalendarViaServer();
  f.requests[0].respond({ok:true,authUrl:'https://accounts.google.com/synthetic',state:'state-A'});await flush();f.timers.shift()();await flush();
  f.requests[1].respond({ok:true,connected:true,state:'connected'});await p;assert.equal(f.data.get(marker),'connected');
  f.account('B','token-B');assert.equal(f.data.has(marker),false);cases++;
}
{
  const f=fixture();f.account();f.data.set(marker,'connected');f.storageChange('crewcheck_auth_token');assert.equal(f.data.has(marker),false);cases++;
}
{
  const f=fixture();await assert.rejects(f.api.serverGoogleCalendarFetch('/calendars/primary/events'),e=>e.code==='GOOGLE_SESSION_CHANGED');assert.equal(f.requests.length,0);cases++;
}
{
  const f=fixture();f.account();const p=f.api.shouldUseServerGoogleCalendarBridge();f.account('B','token-B');f.requests[0].respond({ok:true,connected:true});
  assert.equal(await p,false);assert.equal(f.data.has(marker),false);cases++;
}
{
  const f=fixture();f.account();const p=f.api.connectGoogleCalendarViaServer();const rejected=assert.rejects(p,e=>e.code==='GOOGLE_SESSION_CHANGED');
  f.requests[0].respond({ok:true,authUrl:'https://accounts.google.com/synthetic',state:'state-A'});await flush();f.timers.shift()();await flush();
  f.api.disconnectGoogleCalendarServerBridge();f.requests[1].respond({ok:true,connected:true,state:'connected'});await rejected;
  assert.equal(f.data.has(marker),false);assert.equal(f.popup.closed,true);cases++;
}
console.log(`Google Calendar real client session fence: ${cases} synthetic cases PASS; no external requests.`);
