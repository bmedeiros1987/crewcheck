import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const app = fs.readFileSync('client/src/App.tsx', 'utf8');
const ast = ts.createSourceFile('App.tsx', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = ast.statements.filter(n => ts.isFunctionDeclaration(n) && ['Protected', 'enablePartnerDemoRoster'].includes(n.name?.text)).map(n => n.getText(ast)).join('\n');
const user = id => ({ id, email: id + '@example.invalid', name: id });
function fixture() {
  const data = new Map(), sessionData = new Map(), listeners = new Map(), requests = [], routes = [], states = [];
  const storage = values => ({ getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,String(v)), removeItem: k => values.delete(k) });
  const window = { localStorage: storage(data), sessionStorage: storage(sessionData), addEventListener: (n,fn) => { if (!listeners.has(n)) listeners.set(n,new Set()); listeners.get(n).add(fn); }, removeEventListener: (n,fn) => listeners.get(n)?.delete(fn), dispatchEvent: event => { for (const fn of [...listeners.get(event.type) || []]) fn(event); } };
  const context = { exports: {}, require, window, localStorage: window.localStorage, sessionStorage: window.sessionStorage, CustomEvent: class { constructor(type){this.type=type;} }, Event: class { constructor(type){this.type=type;} }, AbortController, setTimeout, clearTimeout,
    fetch: (url,options) => new Promise((resolve,reject) => requests.push({url, options, reject, respond: (status,payload) => resolve({ok:status>=200&&status<300,status,json:async()=>payload})})) };
  vm.runInNewContext(compile(fs.readFileSync('client/src/lib/authClient.ts','utf8')),context);
  const auth=context.exports;
  const hostContext={...context,exports:{}};
  vm.runInNewContext(compile(fs.readFileSync('client/src/lib/watchHostAdmission.ts','utf8')),hostContext);
  const host=hostContext.exports;
  const select = (id,token=id,emit=true) => { data.set('crewcheck_auth_token',token); data.set('crewcheck_auth_user',JSON.stringify(user(id))); if(emit) window.dispatchEvent(new context.CustomEvent('crewcheck:auth-changed')); };
  let effect,cleanup;
  const protectedContext={...context,...auth,...host, useEffect: fn=>{effect=fn;},useState: value=>[value,next=>states.push(next)],useLocation:()=>['/app',next=>routes.push(next)],CrewCheckOpeningSplash:()=>null,TermsGate:()=>null};
  vm.runInNewContext(compile(functions+'\nglobalThis.mount = () => { Protected({children:null}); };'),protectedContext);
  return {auth,select,data,sessionData,requests,routes,states,window,mount(){protectedContext.mount();cleanup=effect();},unmount(){cleanup();}};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
let checks=0;
const selected=process.env.STARTUP_LIFECYCLE_CASE;
const run=name=>!selected||selected===name;
// Actual getMe: token/owner changes and ABA events cannot publish stale identity.
if(run('identity')) for(const aba of [false,true]){
 const f=fixture();f.select('A');const pending=f.auth.getMe();f.select('B');if(aba)f.select('A');
 f.requests[0].respond(200,{ok:true,user:user('stale-A')});await assert.rejects(pending,/Session changed/);
 assert.equal(JSON.parse(f.data.get('crewcheck_auth_user')).id,aba?'A':'B');checks++;
}
// Unmount: stale success, demo or 401 cannot mutate the account or redirect.
if(run('unmount')) for(const status of [401,200]){
 const f=fixture();f.select('A');f.mount();f.unmount();f.requests[0].respond(status,status===200?{ok:true,user:user('stale-A')}:{ok:false,code:'AUTH_REQUIRED'});await flush();
 assert.deepEqual(f.routes,[]);assert.equal(f.data.get('crewcheck_auth_token'),'A');assert.equal(JSON.parse(f.data.get('crewcheck_auth_user')).id,'A');assert.equal(f.requests.length,1);checks++;
}
// Mounted account switch restarts B; late A success/401 cannot release B or route login.
if(run('switch')) for(const status of [200,401]){
 const f=fixture();f.select('A');f.mount();f.select('B');assert.equal(f.requests.length,2);
 f.requests[0].respond(status,status===200?{ok:true,user:user('A')}:{ok:false,code:'AUTH_REQUIRED'});await flush();assert.deepEqual(f.routes,[]);assert(!f.states.includes(true));assert.equal(JSON.parse(f.data.get('crewcheck_auth_user')).id,'B');
 f.requests[1].respond(200,{ok:true,user:user('B')});await flush();f.requests[2].respond(200,{ok:true,partner:false});await flush();assert(f.states.includes(true));f.unmount();checks++;
}
// Late demo-profile A must not mark demo under B, even when A's fetch already completed.
if(run('demo')) for(const unmount of [false,true]){
 const f=fixture();f.select('A');f.mount();f.requests[0].respond(200,{ok:true,user:user('A')});await flush();assert.equal(f.requests[1].url,'/api/partner/demo-profile');
 if(unmount)f.unmount();f.select('B');f.requests[1].respond(200,{ok:true,partner:true,demoRosterEnabled:true,partnerName:'A partner'});await flush();
 for(const key of ['crewcheck_demo_mode_seen','crewcheck_partner_demo_account','crewcheck_partner_name','crewcheck_partner_demo_loaded:A','crewcheck_partner_demo_loaded:B'])assert.equal(f.data.get(key),undefined);assert.equal(f.sessionData.get('crewcheck_demo_active'),undefined);
 if(!unmount){f.requests[2].respond(503,{ok:false,code:'BACKEND_UNAVAILABLE'});await flush();f.unmount();}checks++;
}
// Current failures retain semantics: expired redirects/clears, transient retains, valid demo succeeds.
if(run('current')) for(const status of [401,503,200]){
 const f=fixture();f.select('A');f.mount();f.requests[0].respond(status,status===200?{ok:true,user:user('A')}:{ok:false,code:status===401?'AUTH_REQUIRED':'BACKEND_UNAVAILABLE'});await flush();
 if(status===401){assert.deepEqual(f.routes,['/login']);assert.equal(f.data.get('crewcheck_auth_token'),undefined);}
 else if(status===503){assert.deepEqual(f.routes,[]);assert(f.states.includes(true));assert.equal(f.data.get('crewcheck_auth_token'),'A');}
 else {f.requests[1].respond(200,{ok:true,partner:true,demoRosterEnabled:true});await flush();assert.equal(f.data.get('crewcheck_partner_demo_account'),'a');assert(f.states.includes(true));}
 f.unmount();checks++;
}
if(run('upgrade')) {
 const f=fixture();f.select('email-only');f.mount();f.requests[0].respond(200,{ok:true,user:user('verified-id')});await flush();
 assert.equal(f.requests.length,2);assert(!f.states.includes(true));
 f.requests[1].respond(200,{ok:true,user:user('verified-id')});await flush();f.requests[2].respond(200,{ok:true,partner:false});await flush();assert(f.states.includes(true));f.unmount();checks++;
}
// Concurrent preference reads use the real authFetch/jsonFetch expiry contract.
if(run('concurrent')) for(const mode of ['current401-late401','current401-late200','current401-late503','staleA401','aba401','transient503','offline']) {
 if(process.env.STARTUP_CONCURRENT_MODE && mode!==process.env.STARTUP_CONCURRENT_MODE)continue;
 const f=fixture();f.select('A');f.mount();
 const preference=f.auth.authFetch('/api/platform/notifications/preferences').catch(error=>error);
 if(mode==='staleA401'||mode==='aba401') { f.select('B'); if(mode==='aba401')f.select('A'); }
 if(mode==='offline') f.requests[1].reject(new Error('synthetic offline'));
 else f.requests[1].respond(mode==='transient503'?503:401,{ok:false,code:mode==='transient503'?'BACKEND_UNAVAILABLE':'AUTH_REQUIRED'});
 await preference;await flush();
 if(mode.startsWith('current401-')) {
  assert.equal(f.data.get('crewcheck_auth_token'),undefined);
  const status=Number(mode.split('late')[1]);
  f.requests[0].respond(status,status===200?{ok:true,user:user('stale-A')}:{ok:false,code:status===401?'AUTH_REQUIRED':'BACKEND_UNAVAILABLE'});await flush();
  assert.deepEqual(f.routes,['/login'],'concurrent confirmed expiry must terminate startup after late getMe '+status);
  assert.equal(JSON.parse(f.data.get('crewcheck_auth_user')).id,'A');assert(!f.states.includes(true));
 } else {
  assert.deepEqual(f.routes,[],'stale or transient response must not route login');
  const current=mode==='staleA401'?'B':'A';assert.equal(f.data.get('crewcheck_auth_token'),current);
  const latest=f.requests.length-1;
  if(mode==='staleA401'||mode==='aba401') {
   for(const request of f.requests.slice(0,latest))if(request.url==='/api/auth/me')request.respond(200,{ok:true,user:user('stale-A')});
  }
  f.requests[latest===1?0:latest].respond(503,{ok:false,code:'BACKEND_UNAVAILABLE'});await flush();
  assert(f.states.includes(true),'current transient access still releases startup');
 }
 f.unmount();checks++;
}
console.log('PASS startup lifecycle: '+checks+' real getMe/Protected/demo synthetic deferred-response cases');
