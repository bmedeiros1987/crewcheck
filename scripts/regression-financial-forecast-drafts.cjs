/* Actual helper bundled with esbuild; authentication, storage and Web Locks are synthetic. */
const assert=require('node:assert/strict');
const path=require('node:path');
const vm=require('node:vm');
const fs=require('node:fs');
const ts=require('typescript');
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
  const result=(tails.get(name)||Promise.resolve()).then(async()=>{await this.before?.(name);return callback({name});});
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
function deletionHandlers(){
 const routes=[
  ['settings','client/src/pages/Home.tsx',node=>ts.isFunctionDeclaration(node)&&node.name?.text==='deleteAccount'],
  ['public page','client/src/pages/InfoPage.tsx',(node,ast)=>ts.isArrowFunction(node)&&ts.isJsxExpression(node.parent)&&node.getText(ast).includes("fetch('/api/platform/account/delete'")],
 ];
 return routes.map(([route,file,match])=>{
  const source=fs.readFileSync(file,'utf8');
  const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const found=[];
  function visit(node){
   if(match(node,ast))found.push(node.getText(ast));
   ts.forEachChild(node,visit);
  }
  visit(ast);
  assert.equal(found.length,1,file);
  const script=route==='settings'?found[0]+'\ndeleteAccount()':'('+found[0]+')()';
  return [route,ts.transpileModule(script,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText];
 });
}
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
  assert.ok(f.locks.names.every(name=>name===prefix+'Account-A:'));
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
 await test('confirmed erasure waits for in-flight writes of its owner and never blocks another owner',async()=>{
  const f=fixture(bundle);
  const ownerA=f.context();
  const initial=await f.api.saveForecastDraft('thirteenth',thirteenth(),null,ownerA);
  assert.equal(initial.status,'saved');
  let release;
  const hold=new Promise(resolve=>{release=resolve;});
  f.locks.before=name=>name===prefix+'Account-A:'?hold:undefined;
  const pending=f.api.saveForecastDraft('vacation',vacation(),null,ownerA);
  f.switchTo('Account-B');
  const erase=f.api.eraseDeletedOwnerForecastDrafts('Account-A');
  assert.equal((await f.api.saveForecastDraft('thirteenth',thirteenth({amount:'42'}),null,f.context())).status,'saved');
  assert.ok(f.storage.data.has(slot('Account-A','thirteenth','2026')));
  release();
  assert.equal((await pending).status,'stale');
  assert.equal(await erase,true);
  assert.deepEqual([...f.storage.data.keys()],[slot('Account-B','thirteenth','2026')]);
  assert.equal(await f.api.eraseDeletedOwnerForecastDrafts('Account-A'),true);
 });
 await test('erasure handles unavailable storage and never infers an owner',async()=>{
  const f=fixture(bundle),name=slot('Account-A','vacation','2025-11-01..2026-10-31');
  f.storage.data.set(name,'malformed synthetic draft');
  assert.equal(await f.api.eraseDeletedOwnerForecastDrafts(null),false);
  f.storage.removeFail=true;
  assert.equal(await f.api.eraseDeletedOwnerForecastDrafts('Account-A'),false);
  assert.ok(f.storage.data.has(name));
  f.storage.removeFail=false;f.sandbox.navigator={};
  assert.equal(await f.api.eraseDeletedOwnerForecastDrafts('Account-A'),true);
  assert.equal(f.storage.data.has(name),false);
 });
 await test('confirmed deletion stops same-document writes even when auth storage keeps the old session',async()=>{
  const f=fixture(bundle),owner='Account-A',context=f.context();
  assert.equal((await f.api.saveForecastDraft('thirteenth',thirteenth(),null,context)).status,'saved');
  assert.equal((await f.api.saveForecastDraft('vacation',vacation(),null,context)).status,'saved');
  let release;
  const hold=new Promise(resolve=>{release=resolve;});
  f.locks.before=()=>hold;
  const queued=f.api.saveForecastDraft('thirteenth',thirteenth({year:'2027'}),null,context);
  f.storage.onRemove=name=>{if(name===slot(owner,'thirteenth','2026'))throw Error('synthetic partially unavailable storage');};
  const erased=f.api.eraseDeletedOwnerForecastDrafts(owner);
  release();
  assert.equal((await queued).status,'stale');
  assert.equal(await erased,false);
  assert.equal(f.storage.data.size,1,'continue erasing other plans of the same owner');
  assert.equal(f.api.readLatestForecastDraft('thirteenth',context).status,'stale');
  f.storage.onRemove=null;
  assert.equal((await f.api.saveForecastDraft('thirteenth',thirteenth({year:'2027'}),null,f.context())).status,'stale');
  assert.equal(await f.api.eraseDeletedOwnerForecastDrafts(owner),true);
  f.switchTo('Account-B');
  assert.equal((await f.api.saveForecastDraft('thirteenth',thirteenth(),null,f.context())).status,'saved');
 });
 for(const [route,handler] of deletionHandlers()){
  await test(route+' erases only the acknowledged owner across response and session changes',async()=>{
   const scenarios=['success','network','unconfirmed','switch-before','late-success','late-failure','late-return','blocked-cleanup','switch-during-prompt','switch-during-erasure','blocked-auth-read','blocked-auth-after-response','blocked-auth-remove'];
   if(route==='settings')scenarios.push('switch-during-legacy-cleanup','blocked-legacy-cleanup');
   for(const scenario of scenarios){
    const f=fixture(bundle),ownerA='Account-A',ownerB='Account-A:other';
    const tokenKey='crewcheck_auth_token',userKey='crewcheck_auth_user';
    const store=new Proxy(f.storage,{
     ownKeys:()=>[...f.storage.data.keys()],
     getOwnPropertyDescriptor:(_,name)=>f.storage.data.has(name)?{enumerable:true,configurable:true}:undefined,
    });
    const login=owner=>{f.switchTo(owner);store.setItem(tokenKey,'fixture-'+owner);store.setItem(userKey,JSON.stringify({id:owner}));};
    for(const owner of [ownerA,ownerB]){
     login(owner);
     const ctx=f.context();
     assert.equal((await f.api.saveForecastDraft('thirteenth',thirteenth(),null,ctx)).status,'saved');
     assert.equal((await f.api.saveForecastDraft('vacation',vacation(),null,ctx)).status,'saved');
    }
    login(ownerA);
    let logoutObserved;
    const logout=new Promise(resolve=>{logoutObserved=resolve;});
    f.storage.afterRemove=name=>{if(name===tokenKey){f.switchTo('', '');logoutObserved();}};
    const originalDrafts=[...f.storage.data].filter(([name])=>name.startsWith(prefix));
    const currentUser=()=>JSON.parse(store.getItem(userKey)||'null');
    const getToken=()=>store.getItem(tokenKey);
    const captureAuthSession=()=>{
     const owner=currentUser()?.id,token=store.getItem(tokenKey),generation=f.state.generation;
     return {token,isCurrent:()=>generation===f.state.generation&&currentUser()?.id===owner&&store.getItem(tokenKey)===token};
    };
    const messages=[];
    const location={href:'',assign(url){this.href=url;}};
    let requests=0,confirmations=0,resume;
    const request=()=>{
     requests++;assert.equal(currentUser()?.id,ownerA);
     if(scenario==='network')return Promise.reject(Error('synthetic network failure'));
     if(scenario.startsWith('late-'))return new Promise(resolve=>{resume=resolve;});
     if(scenario==='blocked-auth-after-response')f.storage.onGet=name=>{if(name===tokenKey)throw Error('synthetic authentication storage failure');};
     return Promise.resolve({ok:true,deleted:scenario!=='unconfirmed',...(scenario==='switch-during-prompt'?{manageGooglePlayUrl:'https://example.invalid/manage'}:{})});
    };
    const confirm=()=>{
     confirmations++;
     if(scenario==='switch-before'||scenario==='switch-during-prompt'&&confirmations===2)login(ownerB);
     return true;
    };
    const prompt=()=>'EXCLUIR';
    if(scenario==='blocked-cleanup')f.storage.onRemove=name=>{if(name.startsWith(prefix+ownerA+':'))throw Error('synthetic cleanup failure');};
    if(scenario==='switch-during-erasure')f.locks.before=()=>login(ownerB);
    if(scenario==='blocked-auth-read')f.storage.onGet=name=>{if(name===tokenKey)throw Error('synthetic authentication storage failure');};
    if(scenario==='blocked-auth-remove')f.storage.onRemove=name=>{if(name===tokenKey)throw Error('synthetic authentication storage failure');};
    if(scenario==='switch-during-legacy-cleanup'){
     store.setItem('crewcheck_synthetic_legacy','synthetic');
     f.storage.onRemove=name=>{if(name==='crewcheck_synthetic_legacy')login(ownerB);};
    }
    if(scenario==='blocked-legacy-cleanup'){
     store.setItem('crewcheck_synthetic_legacy','synthetic');
     f.storage.onRemove=name=>{if(name==='crewcheck_synthetic_legacy')throw Error('synthetic legacy cleanup failure');};
    }
    const execution=vm.runInNewContext(handler,{
     captureAuthSession,financialRateOwner:()=>currentUser()?.id,getStoredUser:currentUser,getToken,
     eraseDeletedOwnerForecastDrafts:f.api.eraseDeletedOwnerForecastDrafts,FORECAST_DRAFT_PREFIX:prefix,
     eraseFinancialCalculationCache:()=>true,
     window:{localStorage:store,location,confirm,prompt,open:()=>assert.fail('no external links')},localStorage:store,confirm,prompt,
     alert:text=>messages.push(text),toast:{error:text=>messages.push(text)},
     deleteCrewCheckAccount:request,
     fetch:async(url,options)=>{
      assert.equal(url,'/api/platform/account/delete');
      assert.equal(options.headers.authorization,'Bearer fixture-'+ownerA);
      const payload=await request();
      return {status:payload.ok?200:503,ok:payload.ok,json:async()=>payload};
     },
    });
    if(scenario.startsWith('late-')){
     assert.equal(typeof resume,'function');
     login(ownerB);
     const confirmed=scenario!=='late-failure';
     if(scenario==='late-return'){
      login(ownerA);
      let release;
      const hold=new Promise(resolve=>{release=resolve;});
      f.locks.before=()=>hold;
      const pending=f.api.saveForecastDraft('thirteenth',thirteenth({year:'2027'}),null,f.context());
      resume({ok:true,deleted:true});
      let timer;
      const expired=new Promise(resolve=>{timer=setTimeout(()=>resolve(false),1000);});
      const closed=await Promise.race([logout.then(()=>true),expired]);
      clearTimeout(timer);
      release();
      assert.equal(closed,true,'also close a new session of the deleted owner before waiting for the lock');
      assert.equal((await pending).status,'stale');
      assert.equal(store.getItem(slot(ownerA,'thirteenth','2027')),null);
     }else resume({ok:confirmed,deleted:confirmed,manageGooglePlayUrl:'https://example.invalid/manage'});
    }
    await execution;
    if(scenario.startsWith('blocked-auth-'))f.storage.onGet=null;
    const deletesOwn=['success','late-success','late-return','switch-during-prompt','switch-during-erasure','switch-during-legacy-cleanup','blocked-legacy-cleanup','blocked-auth-after-response','blocked-auth-remove'].includes(scenario);
    for(const [name,value] of originalDrafts)assert.equal(store.getItem(name),deletesOwn&&name.startsWith(prefix+ownerA+':')?null:value,scenario);
    assert.equal(requests,['switch-before','blocked-auth-read'].includes(scenario)?0:1);
    if(['switch-before','late-success','late-failure','switch-during-prompt','switch-during-erasure','switch-during-legacy-cleanup'].includes(scenario)){
     assert.equal(store.getItem(tokenKey),'fixture-'+ownerB);
     assert.equal(location.href,'');
     assert.deepEqual(messages,[]);
    }
    if(['network','unconfirmed','blocked-auth-read'].includes(scenario)){
     assert.equal(store.getItem(tokenKey),'fixture-'+ownerA);
     assert.equal(location.href,'');
     assert.equal(messages.length,1);
    }
    if(['success','blocked-cleanup','late-return','blocked-legacy-cleanup'].includes(scenario)){
     assert.equal(store.getItem(tokenKey),null);
     assert.equal(location.href,'/login');
    }
    if(['blocked-auth-after-response','blocked-auth-remove'].includes(scenario)){
     assert.equal(store.getItem(tokenKey),'fixture-'+ownerA);
     assert.equal(location.href,'');assert.deepEqual(messages,[]);
     assert.equal(f.api.readLatestForecastDraft('thirteenth',f.context()).status,'stale');
     assert.equal((await f.api.saveForecastDraft('thirteenth',thirteenth({year:'2027'}),null,f.context())).status,'stale');
     login(ownerB);
     assert.equal(f.api.readForecastDraft('thirteenth','2026',f.context()).status,'found');
    }
    if(scenario==='blocked-cleanup')assert(messages.some(text=>/limpeza.*pendente/.test(text)));
   }
  });
 }
 const source=fs.readFileSync(path.join(root,'client/src/lib/financialForecastDrafts.ts'),'utf8');
 assert.doesNotMatch(source,/\bfetch\s*\(|dispatchEvent\s*\(|crewcheck:financial-config-changed|crewcheck_financial_month_settings/);
 console.log(JSON.stringify({scope:'Synthetic auth/storage/Web Locks; actual helper bundled with existing esbuild',passed:cases.length,cases,realData:false,network:false,payrollWrites:false,financialEvents:false},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
