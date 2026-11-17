/* Actual helper bundled with esbuild; authentication, storage and Web Locks are synthetic. */
const assert=require('node:assert/strict');
const path=require('node:path');
const vm=require('node:vm');
const fs=require('node:fs');
const {build}=require('esbuild');
const root=process.cwd();
const cases=[];
const thirteenth=(patch={})=>({year:'2026',start:'',end:'',avos:'',amount:'',basis:'full_year_equivalent',source:'',tax:'',loan:'',advance:'',...patch});
const vacation=(patch={})=>({acquisitionStart:'2025-11-01',acquisitionEnd:'2026-10-31',split:false,starts:['',''],basis:'monthly_average',amounts:['',''],source:'',retentions:['',''],consigned:['',''],advances:['',''],...patch});
const prefix='crewcheck:financial-forecast:draft:v1:';
const slot=(owner,kind,plan)=>prefix+encodeURIComponent(owner)+':'+kind+':'+encodeURIComponent(plan);
class StorageFixture {
 constructor(){this.data=new Map();this.calls=[];}
 get length(){this.onLength?.();return this.data.size;}
 key(index){this.onKey?.(index);return [...this.data.keys()][index]??null;}
 getItem(key){this.calls.push(['get',key]);this.onGet?.(key);if(this.readFail)throw Error('synthetic read failure');return this.data.get(key)??null;}
 setItem(key,value){this.calls.push(['set',key]);this.onSet?.(key,value);if(this.quota)throw Error('synthetic quota');this.data.set(key,value);this.afterSet?.(key,value);}
 removeItem(key){this.calls.push(['remove',key]);this.onRemove?.(key);if(this.removeFail)throw Error('synthetic remove failure');this.data.delete(key);this.afterRemove?.(key);}
}
function locksFixture(){
 const tails=new Map();
 return {names:[],before:null,after:null,request(name,options,callback){
  assert.equal(options.mode,'exclusive');this.names.push(name);
  const result=(tails.get(name)||Promise.resolve()).then(async()=>{await this.before?.();return callback({name});});
  tails.set(name,result.then(()=>undefined,()=>undefined));
  return result.then(value=>{this.after?.();return value;});
 }};
}
function fixture(bundle){
 const state={owner:'Account-A',token:'synthetic-token-A',role:'user',generation:1};
 const storage=new StorageFixture(),locks=locksFixture(),trace={fetch:0,events:0};let uuidCounter=0;
 const crypto={randomUUID:()=>`00000000-0000-4000-8000-${String(++uuidCounter).padStart(12,'0')}`};
 const owner=()=>state.token&&state.owner&&!['guest','visitor'].includes(state.role)?state.owner:null;
 const session=()=>owner()?owner()+':'+state.token:null;
 const capture=()=>{const original={owner:state.owner,token:state.token,generation:state.generation};return {token:original.token,owner:String(original.owner||'').trim().toLowerCase(),isCurrent:()=>original.owner===state.owner&&original.token===state.token&&original.generation===state.generation};};
 const context=()=>({guard:capture(),session:session()});
 const switchTo=(value,token='synthetic-token-'+value)=>{state.generation++;state.owner=value;state.token=token;};
 const nativeJSON=JSON;
 const json={parse:(...args)=>nativeJSON.parse(...args),stringify:(...args)=>nativeJSON.stringify(...args)};
 const module={exports:{}};
 const sandbox={module,exports:module.exports,console,TextEncoder,TextDecoder,Date,JSON:json,crypto,navigator:{locks},localStorage:storage,__forecastSyntheticAuth:{owner,session,capture},fetch:()=>{trace.fetch++;throw Error('network forbidden');},window:{dispatchEvent:()=>{trace.events++;}},dispatchEvent:()=>{trace.events++;}};
 vm.runInNewContext(bundle,sandbox,{filename:'financialForecastDrafts.actual.cjs'});
 return {api:module.exports,state,storage,locks,trace,sandbox,json,context,switchTo};
}
async function test(name,run){await run();cases.push(name);}
function equalData(actual,expected){assert.deepEqual(JSON.parse(JSON.stringify(actual)),expected);}
async function main(){
 const result=await build({entryPoints:[path.join(root,'client/src/lib/financialForecastDrafts.ts')],bundle:true,write:false,platform:'node',format:'cjs',logLevel:'silent',plugins:[{name:'synthetic-auth-only',setup(builder){
  builder.onResolve({filter:/^\.\/(authClient|financialStatementLearning)$/},args=>({path:args.path,namespace:'synthetic-auth'}));
  builder.onLoad({filter:/.*/,namespace:'synthetic-auth'},()=>({contents:'const a=globalThis.__forecastSyntheticAuth;export const captureAuthSession=a.capture;export const financialRateOwner=a.owner;export const financialRateSession=a.session;',loader:'js'}));
 }}]});
 const bundle=result.outputFiles[0].text;
 await test('plan identity is independent of full draft validity; no invented defaults',async()=>{
  const f=fixture(bundle),{api}=f;
  assert.equal(api.FORECAST_DRAFT_PREFIX,prefix);
  assert.equal(api.deriveForecastPlan('thirteenth',thirteenth()),'2026');
  assert.equal(api.deriveForecastPlan('vacation',vacation()),'2025-11-01..2026-10-31');
  for(const values of [thirteenth({year:''}),thirteenth({year:'20'}),thirteenth({year:'0000'}),thirteenth({year:'20260'}),thirteenth({year:'year'})])assert.equal(api.deriveForecastPlan('thirteenth',values),null);
  for(const values of [vacation({acquisitionStart:''}),vacation({acquisitionEnd:'2024-01-01'}),vacation({acquisitionStart:'2025-02-30'})])assert.equal(api.deriveForecastPlan('vacation',values),null);
  for(const values of [thirteenth({start:'2026-02-30'}),thirteenth({reviewed:true}),thirteenth({avos:'123'}),thirteenth({amount:'1'.repeat(33)}),thirteenth({source:'x'.repeat(257)}),thirteenth({source:'hidden\nline'}),thirteenth({basis:'monthly_average'}),{...thirteenth(),token:'forbidden'}]){
   assert.equal(api.deriveForecastPlan('thirteenth',values),'2026');
   assert.equal((await api.saveForecastDraft('thirteenth',values,null,f.context())).status,'invalid');
  }
  for(const values of [vacation({starts:['']}),vacation({starts:['','', '']}),vacation({split:'false'}),vacation({basis:'annual_proportional_amount'}),vacation({earningsComplete:true})]){
   assert.equal(api.deriveForecastPlan('vacation',values),'2025-11-01..2026-10-31');
   assert.equal((await api.saveForecastDraft('vacation',values,null,f.context())).status,'invalid');
  }
  assert.equal(f.storage.calls.length,0);assert.equal(f.storage.data.size,0);
 });
 await test('both kinds save/read exact input strings and explicit zeros only',async()=>{
  const f=fixture(bundle),context=f.context();
  const values=thirteenth({avos:'0',amount:'0,00',tax:'0',loan:'0.00',advance:'0',source:'Synthetic reference'});
  const saved=await f.api.saveForecastDraft('thirteenth',values,null,context);
  assert.equal(saved.status,'saved');assert.match(saved.record.revision,/^[a-f0-9-]{36}$/);equalData(saved.record.values,values);
  assert.equal(saved.record.ownerId,'Account-A');assert.equal(saved.record.rule,'reviewed-aeronaut-thirteenth:v2');
  const raw=f.storage.data.get(slot('Account-A','thirteenth','2026'));
  for(const value of ['synthetic-token','reviewed','complete','applicable','grossMinor','netMinor'])assert.equal(raw.includes('"'+value+'"'),false);
  assert.equal(raw.includes('synthetic-token'),false);
  const read=f.api.readForecastDraft('thirteenth','2026',context);assert.equal(read.status,'found');equalData(read.record.values,values);
  const holiday=vacation({split:true,starts:['2026-11-01','2027-01-01'],amounts:['0',''],retentions:['0,00',''],consigned:['','0'],advances:['0','0']});
  const other=await f.api.saveForecastDraft('vacation',holiday,null,context);assert.equal(other.status,'saved');equalData(other.record.values,holiday);
  assert.equal(other.record.rule,'aeronaut-vacation-reviewed-base:v2');assert.equal(f.storage.data.size,2);
  assert.equal(f.trace.fetch,0);assert.equal(f.trace.events,0);
 });
 await test('owner/kind namespaces; latest never reads other accounts or legacy',async()=>{
  const f=fixture(bundle),contextA=f.context();
  await f.api.saveForecastDraft('thirteenth',thirteenth(),null,contextA);
  f.storage.data.set('crewcheck_financial_month_settings_v1:Account-A:2026-11','legacy monthly');
  f.storage.data.set('crewcheck_thirteenth_legacy','unowned legacy');
  f.switchTo('Account-B');const contextB=f.context();
  assert.equal(f.api.readLatestForecastDraft('thirteenth',contextB).status,'missing');
  await f.api.saveForecastDraft('thirteenth',thirteenth({amount:'42'}),null,contextB);
  f.switchTo('Account-A');const fresh=f.context();f.storage.calls=[];
  const read=f.api.readLatestForecastDraft('thirteenth',fresh);assert.equal(read.status,'found');assert.equal(read.record.values.amount,'');
  assert.ok(f.storage.calls.every(call=>call[0]!=='get'||call[1].startsWith(prefix+'Account-A:thirteenth:')));
  assert.equal(f.storage.data.get('crewcheck_thirteenth_legacy'),'unowned legacy');assert.equal(f.storage.data.get('crewcheck_financial_month_settings_v1:Account-A:2026-11'),'legacy monthly');
  assert.equal(f.api.readForecastDraft('thirteenth','2026',contextA).status,'stale');
 });
 await test('two tabs serialize create/update/remove CAS for same plan',async()=>{
  const f=fixture(bundle),context=f.context();
  const created=await Promise.all([f.api.saveForecastDraft('thirteenth',thirteenth({amount:'1'}),null,context),f.api.saveForecastDraft('thirteenth',thirteenth({amount:'2'}),null,context)]);
  equalData(created.map(x=>x.status).sort(),['conflict','saved']);
  const first=created.find(x=>x.status==='saved').record.revision;
  const updated=await Promise.all([f.api.saveForecastDraft('thirteenth',thirteenth({amount:'3'}),first,context),f.api.saveForecastDraft('thirteenth',thirteenth({amount:'4'}),first,context)]);
  equalData(updated.map(x=>x.status).sort(),['conflict','saved']);
  const second=updated.find(x=>x.status==='saved').record.revision;
  assert.notEqual(first,second);assert.equal(f.api.readForecastDraft('thirteenth','2026',context).record.revision,second);
  assert.equal((await f.api.removeForecastDraft('thirteenth','2026',first,context)).status,'conflict');
  assert.equal((await f.api.removeForecastDraft('thirteenth','2026',second,context)).status,'removed');
  assert.equal(f.api.readForecastDraft('thirteenth','2026',context).status,'missing');
  assert.equal(f.storage.data.has(slot('Account-A','thirteenth','2026')),false);
  const recreated=await f.api.saveForecastDraft('thirteenth',thirteenth({amount:'5'}),null,context);
  assert.equal(recreated.status,'saved');assert.notEqual(recreated.record.revision,first);assert.notEqual(recreated.record.revision,second);
  assert.equal((await f.api.saveForecastDraft('thirteenth',thirteenth({amount:'stale'}),second,context)).status,'conflict');
  assert.equal((await f.api.removeForecastDraft('thirteenth','2026',second,context)).status,'conflict');
  assert.equal(f.api.readForecastDraft('thirteenth','2026',context).record.values.amount,'5');
  assert.ok(f.locks.names.every(name=>name===slot('Account-A','thirteenth','2026')));
 });
 await test('save captures caller input before queued lock and does not overwrite another plan',async()=>{
  const f=fixture(bundle),values=thirteenth(),context=f.context();let release;
  f.locks.before=()=>new Promise(resolve=>{release=resolve;});
  const pending=f.api.saveForecastDraft('thirteenth',values,null,context);
  values.amount='999';await Promise.resolve();await Promise.resolve();f.locks.before=null;release();
  assert.equal((await pending).record.values.amount,'');
  assert.equal((await f.api.saveForecastDraft('thirteenth',thirteenth({year:'2027'}),null,context)).status,'saved');
  assert.equal(f.api.readForecastDraft('thirteenth','2026',context).status,'found');assert.equal(f.storage.data.size,2);
 });
 await test('array accessors cannot substitute an unvalidated second value or toJSON object',async()=>{
  const f=fixture(bundle),amounts=['',''];let reads=0,serialized=false;
  Object.defineProperty(amounts,'0',{enumerable:true,get(){reads++;return reads===1?'0':{toJSON(){serialized=true;return 'not a validated string';}};}});
  const result=await f.api.saveForecastDraft('vacation',vacation({amounts}),null,f.context());
  assert.equal(result.status,'saved');assert.equal(reads,1);assert.equal(serialized,false);equalData(result.record.values.amounts,['0','']);
  const malformed=['',''];Object.defineProperty(malformed,'extra',{value:'forbidden'});
  assert.equal(f.api.deriveForecastPlan('vacation',vacation({amounts:malformed})),'2025-11-01..2026-10-31');
  assert.equal((await f.api.saveForecastDraft('vacation',vacation({amounts:malformed}),null,f.context())).status,'invalid');
 });
 await test('latest requires unambiguous own-plan chronology and rejects malformed scoped names',async()=>{
  const f=fixture(bundle),context=f.context();
  await f.api.saveForecastDraft('thirteenth',thirteenth(),null,context);
  await f.api.saveForecastDraft('thirteenth',thirteenth({year:'2027'}),null,context);
  const first=slot('Account-A','thirteenth','2026'),second=slot('Account-A','thirteenth','2027');
  const setDate=(key,date)=>{const record=JSON.parse(f.storage.data.get(key));record.savedAt=date;f.storage.data.set(key,JSON.stringify(record));};
  setDate(first,'2026-11-17T00:00:00.000Z');setDate(second,'2026-11-17T00:00:01.000Z');
  f.storage.data.set(slot('Account-A','vacation','2025-11-01..2026-10-31'),'corrupt other kind');
  f.storage.data.set(slot('Account-B','thirteenth','2028'),'corrupt other account');
  assert.equal(f.api.readLatestForecastDraft('thirteenth',context).record.planId,'2027');
  setDate(first,'2026-11-17T00:00:01.000Z');assert.equal(f.api.readLatestForecastDraft('thirteenth',context).status,'invalid');
  f.storage.data.delete(first);f.storage.data.set(prefix+'Account-A:thirteenth:bad%','unreadable key');
  assert.equal(f.api.readLatestForecastDraft('thirteenth',context).status,'invalid');
 });
 await test('corrupt/schema/owner/rule/value mismatches fail closed and cannot overwrite or remove',async()=>{
  for(const mutate of [()=>'{bad',r=>({...r,schema:2}),r=>({...r,ownerId:'Account-B'}),r=>({...r,rule:'obsolete-rule'}),r=>({...r,kind:'vacation'}),r=>({...r,planId:'2027'}),r=>({...r,revision:0}),r=>({...r,savedAt:'yesterday'}),r=>({...r,values:{...r.values,reviewed:true}})]){
   const f=fixture(bundle),context=f.context();await f.api.saveForecastDraft('thirteenth',thirteenth(),null,context);
   const name=slot('Account-A','thirteenth','2026'),initial=JSON.parse(f.storage.data.get(name)),changed=mutate(initial),raw=typeof changed==='string'?changed:JSON.stringify(changed);f.storage.data.set(name,raw);
   assert.equal(f.api.readForecastDraft('thirteenth','2026',context).status,'invalid');
   assert.equal(f.api.readLatestForecastDraft('thirteenth',context).status,'invalid');
   assert.equal((await f.api.saveForecastDraft('thirteenth',thirteenth(),null,context)).status,'invalid');
   assert.equal((await f.api.removeForecastDraft('thirteenth','2026',initial.revision,context)).status,'invalid');assert.equal(f.storage.data.get(name),raw);
  }
 });
 await test('anonymous, stale generation and rapid A-B-A cannot read or mutate',async()=>{
  const f=fixture(bundle),context=f.context();f.switchTo('Account-B');f.switchTo('Account-A','synthetic-token-A');
  assert.equal(f.api.readForecastDraft('thirteenth','2026',context).status,'stale');
  assert.equal((await f.api.saveForecastDraft('thirteenth',thirteenth(),null,context)).status,'stale');
  f.state.token=null;assert.equal(f.api.readLatestForecastDraft('thirteenth',f.context()).status,'stale');
  f.state.token='synthetic';f.state.role='guest';assert.equal((await f.api.saveForecastDraft('thirteenth',thirteenth(),null,f.context())).status,'stale');assert.equal(f.storage.calls.length,0);
 });
 await test('auth switch through input/storage getters or JSON parse/stringify is fenced',async()=>{
  for(const point of ['input','storage','parse','serialize']){
   const f=fixture(bundle),context=f.context();
   if(point==='input'){const values=thirteenth();Object.defineProperty(values,'amount',{enumerable:true,get(){f.switchTo('Account-B');return '12';}});assert.equal((await f.api.saveForecastDraft('thirteenth',values,null,context)).status,'stale');}
   else if(point==='storage'){Object.defineProperty(f.sandbox,'localStorage',{get(){f.switchTo('Account-B');return f.storage;}});assert.equal(f.api.readForecastDraft('thirteenth','2026',context).status,'stale');}
   else if(point==='serialize'){f.json.stringify=(...args)=>{const value=JSON.stringify(...args);f.switchTo('Account-B');return value;};assert.equal((await f.api.saveForecastDraft('thirteenth',thirteenth(),null,context)).status,'stale');}
   else {await f.api.saveForecastDraft('thirteenth',thirteenth(),null,context);f.json.parse=(...args)=>{const value=JSON.parse(...args);f.switchTo('Account-B');return value;};assert.equal(f.api.readForecastDraft('thirteenth','2026',context).status,'stale');}
   assert.ok(f.storage.calls.every(call=>call[0]!=='set'||call[1]===slot('Account-A','thirteenth','2026')));
   assert.equal(f.storage.data.has(slot('Account-B','thirteenth','2026')),false);
  }
 });
 await test('latest storage enumeration/getters and same-slot read cannot change accounts',async()=>{
  for(const point of ['length','key','get']){
   const f=fixture(bundle),context=f.context();await f.api.saveForecastDraft('thirteenth',thirteenth(),null,context);
   const change=()=>{f.switchTo('Account-B');};
   if(point==='length')f.storage.onLength=change;
   if(point==='key')f.storage.onKey=change;
   if(point==='get')f.storage.onGet=change;
   assert.equal(f.api.readLatestForecastDraft('thirteenth',context).status,'stale');
   assert.ok(f.storage.calls.every(call=>call[0]!=='get'||call[1].startsWith(prefix+'Account-A:thirteenth:')));
  }
  const f=fixture(bundle),context=f.context();f.storage.onGet=()=>f.switchTo('Account-B');
  assert.equal((await f.api.saveForecastDraft('thirteenth',thirteenth(),null,context)).status,'stale');assert.equal(f.storage.data.size,0);
 });
 await test('queued operations and await completion cannot cross auth generations',async()=>{
  const f=fixture(bundle),context=f.context();let release;f.locks.before=()=>new Promise(resolve=>{release=resolve;});
  const pending=f.api.saveForecastDraft('thirteenth',thirteenth(),null,context);await Promise.resolve();await Promise.resolve();f.switchTo('Account-B');release();
  assert.equal((await pending).status,'stale');assert.equal(f.storage.data.size,0);
  const g=fixture(bundle),same=g.context();g.locks.after=()=>g.switchTo('Account-B');
  assert.equal((await g.api.saveForecastDraft('thirteenth',thirteenth(),null,same)).status,'stale');assert.equal(g.storage.data.has(slot('Account-B','thirteenth','2026')),false);
 });
 await test('storage failures, quota, missing Web Locks and uncertain writes are not success',async()=>{
  for(const point of ['read','quota','locks','crypto','uncertain','lock-reject']){
   const f=fixture(bundle),context=f.context();
   if(point==='read')f.storage.readFail=true;
   if(point==='quota')f.storage.quota=true;
   if(point==='locks')f.sandbox.navigator={};
   if(point==='crypto')f.sandbox.crypto={};
   if(point==='uncertain')f.storage.afterSet=()=>{throw Error('synthetic acknowledgement lost');};
   if(point==='lock-reject')f.locks.request=()=>Promise.reject(Error('synthetic rejected lock'));
   assert.equal((await f.api.saveForecastDraft('thirteenth',thirteenth(),null,context)).status,'unavailable');
   if(point!=='uncertain')assert.equal(f.storage.data.size,0);
  }
 });
 await test('remove keeps other plans/accounts and is fenced while waiting or after completion',async()=>{
  const f=fixture(bundle),context=f.context();
  const first=await f.api.saveForecastDraft('thirteenth',thirteenth(),null,context);
  await f.api.saveForecastDraft('thirteenth',thirteenth({year:'2027'}),null,context);
  f.switchTo('Account-B');const other=await f.api.saveForecastDraft('thirteenth',thirteenth(),null,f.context());
  f.switchTo('Account-A','synthetic-token-A');const fresh=f.context();
  for(const unavailable of ['locks','crypto']){
   const original=unavailable==='locks'?f.sandbox.navigator:f.sandbox.crypto;
   f.sandbox[unavailable==='locks'?'navigator':'crypto']={};
   assert.equal((await f.api.removeForecastDraft('thirteenth','2026',first.record.revision,fresh)).status,'unavailable');
   f.sandbox[unavailable==='locks'?'navigator':'crypto']=original;
  }
  let release;f.locks.before=()=>new Promise(resolve=>{release=resolve;});
  const pending=f.api.removeForecastDraft('thirteenth','2026',first.record.revision,fresh);await Promise.resolve();await Promise.resolve();f.switchTo('Account-B');release();
  assert.equal((await pending).status,'stale');assert.equal(f.storage.data.size,3);
  f.locks.before=null;f.switchTo('Account-A','synthetic-token-A');const finalContext=f.context();f.locks.after=()=>f.switchTo('Account-B');
  assert.equal((await f.api.removeForecastDraft('thirteenth','2026',first.record.revision,finalContext)).status,'stale');
  assert.equal(f.storage.data.has(slot('Account-A','thirteenth','2026')),false);
  assert.equal(f.storage.data.has(slot('Account-A','thirteenth','2027')),true);
  assert.equal(JSON.parse(f.storage.data.get(slot('Account-B','thirteenth','2026'))).revision,other.record.revision);
  assert.equal(f.storage.data.size,2);
 });
 await test('input errors, invalid UUIDs and lost durable acknowledgement never authorize a write retry',async()=>{
  const f=fixture(bundle),context=f.context();
  assert.equal((await f.api.saveForecastDraft('thirteenth',thirteenth(),0,context)).status,'invalid');
  assert.equal((await f.api.saveForecastDraft('thirteenth',thirteenth(),'not-a-version',context)).status,'invalid');
  assert.equal((await f.api.saveForecastDraft('thirteenth',thirteenth({complete:true}),null,context)).status,'invalid');
  assert.equal((await f.api.removeForecastDraft('thirteenth','2026',null,context)).status,'invalid');
  f.sandbox.crypto.randomUUID=()=>'';
  assert.equal((await f.api.saveForecastDraft('thirteenth',thirteenth(),null,context)).status,'unavailable');assert.equal(f.storage.data.size,0);
  const g=fixture(bundle),current=g.context();g.storage.afterSet=()=>{g.storage.readFail=true;};
  assert.equal((await g.api.saveForecastDraft('thirteenth',thirteenth(),null,current)).status,'unavailable');assert.equal(g.storage.data.size,1);
  g.storage.readFail=false;g.storage.afterSet=null;
  assert.equal((await g.api.saveForecastDraft('thirteenth',thirteenth({amount:'999'}),null,current)).status,'conflict');
  assert.equal(g.api.readForecastDraft('thirteenth','2026',current).record.values.amount,'');
  assert.equal(g.trace.fetch,0);assert.equal(g.trace.events,0);
 });
 const source=fs.readFileSync(path.join(root,'client/src/lib/financialForecastDrafts.ts'),'utf8');
 assert.doesNotMatch(source,/\bfetch\s*\(|dispatchEvent\s*\(|crewcheck:financial-config-changed|crewcheck_financial_month_settings/);
 console.log(JSON.stringify({scope:'Synthetic auth/storage/Web Locks; actual helper bundled with existing esbuild',passed:cases.length,cases,realData:false,network:false,payrollWrites:false,financialEvents:false},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
