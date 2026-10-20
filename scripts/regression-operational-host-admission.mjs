import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url), ts=require('typescript');
const app=fs.readFileSync('client/src/App.tsx','utf8');
const parsed=ts.createSourceFile('App.tsx',app,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const protectedNode=parsed.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='Protected');
assert.ok(protectedNode);
const compile=(source,file)=>ts.transpileModule(source,{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
let checks=0;
const ok=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);checks++;};
async function scenario({demo=false,token='token',failure=false,stale=false,upgrade=false,unmount=false}={}) {
  const events=new Map(), nativeCalls=[], revoked=[], ready=[];
  const storage=new Map(demo?[['crewcheck_demo_mode_seen','1']]:[]);
  let current=true, resolve,reject,cleanup;
  const response=new Promise((a,b)=>{resolve=a;reject=b;});
  const session={token,owner:'synthetic-owner',isCurrent:()=>current};
  const window={localStorage:{getItem:k=>storage.get(k)||null},sessionStorage:{getItem:()=>null},
    CrewCheckNative:{admitWatchHost:()=>{nativeCalls.push('admit');return 'lease-'+nativeCalls.length;},revokeWatchHost:lease=>{revoked.push(lease);return true;}},
    addEventListener:(n,fn)=>{const set=events.get(n)||new Set();set.add(fn);events.set(n,set);},
    removeEventListener:(n,fn)=>events.get(n)?.delete(fn)};
  const dispatch=n=>{for(const fn of [...(events.get(n)||[])])fn({key:null});};
  const module={exports:{}};
  const ctx=vm.createContext({window,module,exports:module.exports,console,React:{createElement:()=>null},
    useLocation:()=>['/',()=>{}],useState:initial=>[initial,v=>ready.push(v)],
    useEffect:fn=>{cleanup=fn();},captureAuthSession:()=>session,isAuthenticated:()=>!!token,
    getMe:()=>response,enablePartnerDemoRoster:async()=>{},CrewCheckOpeningSplash:()=>null,TermsGate:()=>null});
  vm.runInContext(compile(fs.readFileSync('client/src/lib/watchHostAdmission.ts','utf8'),'host.ts'),ctx);
  const host=module.exports;
  ctx.admitVerifiedWatchHost=host.admitVerifiedWatchHost;
  ctx.module={exports:{}};ctx.exports=ctx.module.exports;
  vm.runInContext(compile('export '+protectedNode.getText(parsed),'Protected.tsx'),ctx);
  ctx.module.exports.Protected({children:null});
  if(stale||upgrade)current=false;
  if(unmount)cleanup();
  if(failure)reject(new Error('synthetic transient failure'));else resolve({id:upgrade?'upgraded-owner':'synthetic-owner'});
  for(let i=0;i<8;i++)await Promise.resolve();
  return {nativeCalls,revoked,ready,host,dispatch,setCurrent:v=>{current=v;}};
}
let s=await scenario();ok(s.nativeCalls.length,1,'verified success admits');
let old=s.host.captureWatchHost();ok(s.host.watchHostLease(old),'lease-1','captures granted lease');
s.dispatch('crewcheck:auth-will-change');ok(s.host.watchHostLease(old),'','old captured handle revoked');
s.host.admitVerifiedWatchHost({token:'new',owner:'synthetic-owner',isCurrent:()=>true},{id:'synthetic-owner'});
ok(s.host.watchHostLease(old),'','old callback cannot acquire replacement lease');
s=await scenario();
old=s.host.captureWatchHost();s.setCurrent(false);
ok(s.host.watchHostLease(old),'','silent continuity loss blocks publication');
ok(s.revoked,['lease-1'],'silent continuity loss revokes exact captured native lease');
ok(s.host.captureWatchHost(),null,'silent continuity loss removes host authority');
s.host.watchHostLease(old);ok(s.revoked.length,1,'repeated observation does not mint/requeue revoke');
s=await scenario({failure:true});ok(s.nativeCalls.length,0,'getMe failure never admits');ok(s.ready.includes(true),true,'counterexample: catch/finally still releases ready');
s=await scenario({demo:true,token:''});ok(s.nativeCalls.length,0,'demo ready never admits');ok(s.ready.includes(true),true,'demo remains available');
s=await scenario({stale:true});ok(s.nativeCalls.length,0,'stale success cannot admit');
s=await scenario({upgrade:true});ok(s.nativeCalls.length,0,'identity upgrade requires current new generation');
s=await scenario({unmount:true});ok(s.nativeCalls.length,0,'unmounted success cannot admit');
// Explicit trust-limit counterexample: arbitrary same-origin JavaScript can invoke
// the injected assertion API. This is NOT proof of a native-observed HTTP response.
const activity=fs.readFileSync('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java','utf8');
const apiLine=activity.split('\n').find(line=>line.includes('"window.CrewCheckNative={'));
assert.ok(apiLine);
const expression=apiLine.trim().replace(/\+\s*$/,'');
let directCalls=0;
const bridge=vm.createContext({window:{},operationalWatchDocument:'synthetic-document',
  org:{json:{JSONObject:{quote:JSON.stringify}}},AndroidCrewCheckNative:{admitWatchHost:doc=>{
    assert.equal(doc,'synthetic-document');directCalls++;return 'asserted-native-lease';}}});
const injected=vm.runInContext(expression,bridge);vm.runInContext(injected,bridge);
ok(bridge.window.CrewCheckNative.admitWatchHost(),'asserted-native-lease','known same-origin assertion boundary');
ok(directCalls,1,'direct call does not itself execute getMe');
console.log('KNOWN TRUST LIMIT reproduced: direct same-origin bridge assertion is not native/cryptographic getMe proof');
console.log(`operational host admission: ${checks} assertions PASS; actual Protected success/catch/finally + actual host module, synthetic auth/native boundaries`);
