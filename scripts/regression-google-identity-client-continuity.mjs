import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const data=new Map(),listeners=new Map(),requests=[],timers=[],opened=[];const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
 const window={addEventListener:(n,fn)=>{if(!listeners.has(n))listeners.set(n,[]);listeners.get(n).push(fn);},dispatchEvent:e=>{for(const fn of listeners.get(e.type)||[])fn(e);},localStorage:storage,sessionStorage:storage,setTimeout:fn=>timers.push(fn),open:url=>{opened.push(url);return{};}};
 const context={exports:{},window,localStorage:storage,sessionStorage:storage,AbortController,Event:class{constructor(type){this.type=type;}},CustomEvent:class{constructor(type){this.type=type;}},fetch:(url,options)=>new Promise(resolve=>requests.push({url,options,respond:p=>resolve({ok:true,status:200,json:async()=>p})}))};
 vm.runInNewContext(compile(fs.readFileSync('client/src/lib/authClient.ts','utf8')),context);const auth=context.exports;
 assert.equal(typeof auth.persistExternalAuthSession,'function','Canonical preparation must export wrapper around existing persistSession');
 const c={...context,exports:{},require:()=>auth};vm.runInNewContext(compile(fs.readFileSync('client/src/lib/googleIdentityAuth.ts','utf8')),c);
 return{api:c.exports,data,requests,timers,opened,account(id='A',token='token-A'){data.set('crewcheck_auth_user',JSON.stringify({id,email:id+'@example.invalid'}));data.set('crewcheck_auth_token',token);window.dispatchEvent({type:'crewcheck:auth-changed'});}};
}
const start={ok:true,state:'synthetic-state',authUrl:'https://accounts.google.com/synthetic'};let cases=0;
{
 const f=fixture();const p=f.api.loginWithGoogle(),rejected=assert.rejects(p,/sessão mudou/);f.account('B','token-B');f.requests[0].respond(start);await rejected;assert.equal(f.opened.length,0);assert.equal(f.data.get('crewcheck_auth_token'),'token-B');cases++;
}
{
 const f=fixture();const p=f.api.loginWithGoogle(),rejected=assert.rejects(p,/sessão mudou/);f.requests[0].respond(start);await flush();f.timers.shift()();await flush();f.requests[1].respond({ok:true,state:'ready'});await flush();assert.match(f.requests[2].url,/complete/);
 f.account('B','token-B');f.requests[2].respond({ok:true,user:{id:'A',email:'A@example.invalid'},token:'late-token-A'});await rejected;assert.equal(f.data.get('crewcheck_auth_token'),'token-B');cases++;
}
{
 const f=fixture();const p=f.api.loginWithGoogle();f.requests[0].respond(start);await flush();f.timers.shift()();await flush();f.requests[1].respond({ok:true,state:'ready'});await flush();f.requests[2].respond({ok:true,user:{id:'A',email:'A@example.invalid'},token:'accepted-A'});await p;assert.equal(f.data.get('crewcheck_auth_token'),'accepted-A');cases++;
}
{
 const f=fixture();f.account();const p=f.api.linkGoogleIdentity(),rejected=assert.rejects(p,/sessão mudou/);f.requests[0].respond(start);await flush();f.timers.shift()();await flush();const unlink=f.api.unlinkGoogleIdentity();f.requests[1].respond({ok:true,state:'link_ready',emailHint:'a***@example.invalid'});await rejected;f.requests[2].respond({ok:true,linked:false});await unlink;cases++;
}
for(const method of ['getGoogleIdentityConnection','unlinkGoogleIdentity']){
 const f=fixture();f.account();const p=f.api[method](),rejected=assert.rejects(p,/sessão mudou/);f.account('B','token-B');f.requests[0].respond({ok:true,linked:true,emailHint:'a***@example.invalid'});await rejected;cases++;
}
console.log(`Google identity real client/auth continuity: ${cases} synthetic cases PASS; no external requests or cookie writes.`);
