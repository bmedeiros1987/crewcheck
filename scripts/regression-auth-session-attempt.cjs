const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const ts=require('typescript');
const source=fs.readFileSync(process.argv[2] || 'client/src/lib/authClient.ts','utf8'),compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
assert.equal((compiled.diagnostics||[]).length,0);const report=[];
const A={id:'synthetic-A',email:'a@example.invalid',name:'A'},B={id:'synthetic-B',email:'b@example.invalid',name:'B'};
function fixture(){const values=new Map([['crewcheck_auth_token','synthetic-old-A'],['crewcheck_auth_user',JSON.stringify(A)],['manual-gate-fixture','14']]),pending=[],events=[];const target=new EventTarget();class Custom extends Event{constructor(t,o={}){super(t);this.detail=o.detail;}};const window={location:{origin:'https://crewcheck.online'},addEventListener:(...a)=>target.addEventListener(...a),dispatchEvent:e=>{events.push(e.type);return target.dispatchEvent(e);}};const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};const exports={},ctx={exports,module:{exports},window,localStorage:storage,sessionStorage:{removeItem(){}},CustomEvent:Custom,Event,URL,AbortController,setTimeout,clearTimeout,performance,Date,fetch:(url,init)=>new Promise((resolve,reject)=>pending.push({url,init,resolve,reject}))};vm.createContext(ctx);vm.runInContext(compiled.outputText,ctx);return{api:ctx.module.exports,pending,values,events,event(type,key){const e=new Event(type);if(key!==undefined)Object.defineProperty(e,'key',{value:key});window.dispatchEvent(e);},reply(i,user=A,{status=200,ok=true,jsonGate=null}={}){pending[i].resolve({ok,status,json:()=>jsonGate||Promise.resolve(ok?{ok:true,token:'synthetic-'+user.id,user}:{ok:false,code:'invalid_credentials',message:'Synthetic rejection'})});}};}
const track=p=>p.then(value=>({ok:true,value}),error=>({ok:false,error}));
function stale(r){assert.equal(r.ok,false);assert.equal(r.error.code,'STALE_SESSION');}
async function test(name,fn){try{await fn();report.push({name,status:'pass'});}catch(e){report.push({name,status:'fail',error:e.message});}}
(async()=>{
await test('ordinary login succeeds and expired bearer is not sent',async()=>{const f=fixture(),p=track(f.api.login(A.email,'synthetic'));assert.equal(f.pending[0].init.headers.authorization,undefined);f.reply(0);assert.equal((await p).ok,true);assert.equal(f.api.getStoredUser().id,A.id);assert.equal(f.values.get('manual-gate-fixture'),'14');assert.equal(f.pending.length,1);});
await test('logout during fetch rejects delayed success and stays logged out',async()=>{const f=fixture(),p=track(f.api.login(A.email,'synthetic'));await f.api.logout();f.reply(0);stale(await p);assert.equal(f.api.getToken(),null);assert.equal(f.api.getStoredUser(),null);f.reply(1);await new Promise(r=>setImmediate(r));});
await test('logout during response JSON await rejects delayed success',async()=>{const f=fixture();let resolve;const body=new Promise(r=>resolve=r),p=track(f.api.login(A.email,'synthetic'));f.reply(0,A,{jsonGate:body});await Promise.resolve();f.api.clearSession();resolve({ok:true,token:'synthetic-A',user:A});stale(await p);assert.equal(f.api.getToken(),null);});
await test('newer B succeeds then late A cannot overwrite it',async()=>{const f=fixture(),pa=track(f.api.login(A.email,'synthetic')),pb=track(f.api.login(B.email,'synthetic'));f.reply(1,B);assert((await pb).ok);f.reply(0,A);stale(await pa);assert.equal(f.api.getStoredUser().id,B.id);});
await test('older A finishes first but newer B attempt owns admission',async()=>{const f=fixture(),pa=track(f.api.login(A.email,'synthetic')),pb=track(f.api.login(B.email,'synthetic'));f.reply(0,A);stale(await pa);assert.equal(f.api.getToken(),null);f.reply(1,B);assert((await pb).ok);assert.equal(f.api.getStoredUser().id,B.id);});
await test('newer failed attempt does not revive older success',async()=>{const f=fixture(),pa=track(f.api.login(A.email,'synthetic')),pb=track(f.api.login(B.email,'synthetic'));f.reply(1,B,{status:401,ok:false});const r=await pb;assert(!r.ok);assert.notEqual(r.error.code,'STALE_SESSION');f.reply(0,A);stale(await pa);assert.equal(f.api.getToken(),null);});
await test('same account second attempt supersedes first',async()=>{const f=fixture(),p1=track(f.api.login(A.email,'synthetic')),p2=track(f.api.login(A.email,'synthetic'));f.reply(0,A);stale(await p1);f.reply(1,A);assert((await p2).ok);});
for(const kind of ['clear','expiry','auth-change','storage-token','storage-user','storage-null'])await test('invalidates on '+kind,async()=>{const f=fixture(),p=track(f.api.login(A.email,'synthetic'));if(kind==='clear')f.api.clearSession();if(kind==='expiry')f.api.expireSession();if(kind==='auth-change')f.event('crewcheck:auth-changed');if(kind==='storage-token')f.event('storage','crewcheck_auth_token');if(kind==='storage-user')f.event('storage','crewcheck_auth_user');if(kind==='storage-null')f.event('storage',null);f.reply(0);stale(await p);assert.equal(f.api.getToken(),null);});
await test('unrelated storage event does not cancel ordinary login',async()=>{const f=fixture(),p=track(f.api.login(A.email,'synthetic'));f.event('storage','unrelated-theme');f.reply(0);assert((await p).ok);});
await test('ordinary credential rejection retains established error contract',async()=>{const f=fixture(),p=track(f.api.login(A.email,'synthetic'));f.reply(0,A,{status:401,ok:false});const r=await p;assert(!r.ok);assert.equal(r.error.reason,'invalid_credentials');assert.notEqual(r.error.code,'STALE_SESSION');assert.equal(f.api.getToken(),null);});
await test('candidate session upgrade while login pending is not overwritten',async()=>{const f=fixture(),p=track(f.api.login(A.email,'synthetic'));f.values.set('crewcheck_auth_token','synthetic-B');f.values.set('crewcheck_auth_user',JSON.stringify(B));f.event('crewcheck:auth-changed');f.reply(0);stale(await p);assert.equal(f.api.getStoredUser().id,B.id);assert.equal(f.values.get('manual-gate-fixture'),'14');});

const start=(f,kind,user=A)=>kind==='login'?f.api.login(user.email,'synthetic'):kind==='register'?f.api.register({email:user.email,password:'synthetic',confirmPassword:'synthetic',name:user.name}):f.api.verifyEmail(user.email,'123456');
for(const kind of ['register','verifyEmail'])await test('ordinary '+kind+' succeeds',async()=>{const f=fixture(),p=track(start(f,kind));f.reply(0);assert((await p).ok);assert.equal(f.api.getStoredUser().id,A.id);});
for(const older of ['login','register','verifyEmail'])for(const newer of ['login','register','verifyEmail'])for(const latestFails of [false,true])await test('cross endpoint '+older+' superseded by '+newer+(latestFails?' failure':' success'),async()=>{
 const f=fixture(),pa=track(start(f,older,A)),pb=track(start(f,newer,B));
 // Older arrives FIRST: neither generation nor token necessarily changed for register/verify.
 f.reply(0,A);stale(await pa);
 f.reply(1,B,latestFails?{status:401,ok:false}:{});const r=await pb;
 if(latestFails){assert(!r.ok);assert.notEqual(r.error.code,'STALE_SESSION');assert.notEqual(f.api.getToken(),'synthetic-'+A.id);}
 else {assert(r.ok);assert.equal(f.api.getStoredUser().id,B.id);}
});
for(const kind of ['login','register','verifyEmail'])for(const transition of ['logout','expire','token-before-storage-event','owner-before-storage-event'])await test(kind+' transition '+transition,async()=>{
 const f=fixture(),p=track(start(f,kind));
 if(transition==='logout')f.api.clearSession();if(transition==='expire')f.api.expireSession();
 if(transition==='token-before-storage-event')f.values.set('crewcheck_auth_token','synthetic-B');
 if(transition==='owner-before-storage-event')f.values.set('crewcheck_auth_user',JSON.stringify(B));
 f.reply(0);stale(await p);
});
for(const kind of ['register','verifyEmail'])await test(kind+' logout while JSON pending',async()=>{const f=fixture();let resolve;const body=new Promise(r=>resolve=r),p=track(start(f,kind));f.reply(0,A,{jsonGate:body});await Promise.resolve();f.api.clearSession();resolve({ok:true,token:'synthetic-A',user:A});stale(await p);assert.equal(f.api.getToken(),null);});
await test('register without token preserves verification response after invalidation',async()=>{const f=fixture(),p=track(start(f,'register'));f.api.clearSession();f.reply(0,A,{jsonGate:Promise.resolve({ok:true,verificationRequired:true,emailSent:true})});const r=await p;assert(r.ok);assert.equal(r.value.verificationRequired,true);assert.equal(f.api.getToken(),null);});
await test('newer registration without token still supersedes older login',async()=>{const f=fixture(),pa=track(start(f,'login')),pb=track(start(f,'register',B));f.reply(1,B,{jsonGate:Promise.resolve({ok:true,verificationRequired:true})});assert((await pb).ok);f.reply(0);stale(await pa);assert.equal(f.api.getToken(),null);});
await test('stale registration without token does not cancel latest verifyEmail',async()=>{const f=fixture(),pa=track(start(f,'register')),pb=track(start(f,'verifyEmail',B));f.reply(0,A,{jsonGate:Promise.resolve({ok:true,verificationRequired:true})});assert((await pa).ok);f.reply(1,B);assert((await pb).ok);assert.equal(f.api.getStoredUser().id,B.id);});

for (const older of ['login', 'register', 'verifyEmail'])
  for (const newer of ['login', 'register', 'verifyEmail'])
    for (const latestFails of [false, true])
      await test(`reversed ${older} -> ${newer} failure=${latestFails}`, async () => {
        const f = fixture();
        const pa = track(start(f, older, A));
        const pb = track(start(f, newer, B));
        f.reply(1, B, latestFails ? { status: 401, ok: false } : {});
        const rb = await pb;
        assert.equal(rb.ok, !latestFails);
        f.reply(0, A);
        stale(await pa);
        if (!latestFails) assert.equal(f.api.getStoredUser().id, B.id);
      });
console.log(JSON.stringify({source:path.basename(process.argv[2] || 'client/src/lib/authClient.ts'),tests:report.length,passed:report.filter(x=>x.status==='pass').length,failed:report.filter(x=>x.status==='fail').length,results:report,limits:['whole real authClient module transpiled, storage/fetch/events synthetic','not browser Set-Cookie, native, real server or physical Watch','manual sentinel preservation is no replacement for native manual/TTL tests']},null,2));process.exitCode=report.some(x=>x.status==='fail')?1:0;
})();
