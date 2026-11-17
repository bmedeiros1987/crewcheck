import assert from 'node:assert/strict';
import ts from 'typescript';import vm from 'node:vm';import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {loadClientModules} from './lib/ts-module-harness.mjs';
const modules=loadClientModules({files:['client/src/lib/financialCalculationDigest.ts','client/src/lib/financialCalculationCache.ts']});
try{
 const {financialCalculationDigest:digest}=modules.load('financialCalculationDigest');
 for(const text of ['', 'abc','São Paulo → Lima 🛫','x'.repeat(100000),...Array.from({length:64},(_,i)=>randomBytes(i*13).toString('hex'))])assert.equal(digest(text),createHash('sha256').update(text).digest('hex'));
 const {createFinancialCalculationCache,financialInputSignature:signature,eraseFinancialCalculationCache}=modules.load('financialCalculationCache');
 const data=new Map(),store={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 let ctx={owner:'synthetic-a',session:'private-session-A',period:'2032-02',scope:'forecast',version:'synthetic-build-1',signature:signature({roster:'synthetic',rate:1})},count=0;
 const current=()=>({...ctx}),calculate=()=>{count++;return {amount:0,pending:NaN,date:new Date('2032-02-01T00:00:00Z'),absent:undefined,partial:true,currencyOrder:{USD:1,BRL:0},rows:[{currency:'BRL',amount:123}]};};
 const cache=createFinancialCalculationCache();
 let result=cache.read(current,calculate,store);assert.equal(result.state,'calculated');assert.equal(count,1);assert.equal(cache.read(current,calculate,store).state,'memory');assert.equal(count,1);
 result.value.rows[0].amount=999;assert.equal(cache.read(current,calculate,store).value.rows[0].amount,123,'consumers cannot mutate the reusable snapshot');
 const reopened=createFinancialCalculationCache().read(current,calculate,store);assert.equal(reopened.state,'saved');assert.deepEqual(Object.keys(reopened.value.currencyOrder),['USD','BRL'],'result property order is retained independently of canonical input identity');assert.equal(count,1);assert(Number.isNaN(reopened.value.pending));assert.equal(reopened.value.amount,0);assert.equal(reopened.value.date.toISOString(),'2032-02-01T00:00:00.000Z');assert(Object.hasOwn(reopened.value,'absent'));
 assert(![...data.values()].join('').includes('private-session'),'tokens are never persisted');
 for(const field of ['owner','period','scope','version','signature']){const before=count,old=ctx[field];ctx[field]=field==='period'?'2032-03':old+'-changed';cache.read(current,calculate,store);assert.equal(count,before+1,field+' invalidates');ctx[field]=old;}
 ctx={...ctx,signature:signature({roster:'changed synthetic',rate:2})};const changed=cache.read(current,calculate,store);assert.equal(changed.state,'calculated');
 // Old-tab writes cannot be read as the result for the new source, even after restart.
 const oldCtx={...ctx,signature:'old-source'};createFinancialCalculationCache().read(()=>oldCtx,calculate,store);const before=count;assert.equal(createFinancialCalculationCache().read(current,calculate,store).state,'calculated');assert.equal(count,before+1);
 for(const raw of ['broken JSON',JSON.stringify({schema:1}),...Array.from(data.values()).map(x=>x.replace('123','124'))]){const slot=[...data.keys()].find(k=>k.endsWith(':forecast')&&k.includes('synthetic-a:2032-02'));data.set(slot,raw);const c=createFinancialCalculationCache(),n=count;assert.equal(c.read(current,calculate,store).state,'calculated');assert.equal(count,n+1);}
 const blocked={getItem(){throw Error('blocked')},setItem(){throw Error('quota')},removeItem(){}};assert.equal(createFinancialCalculationCache().read(current,calculate,blocked).state,'not_saved');
 const n=count;createFinancialCalculationCache().read(()=>null,calculate,store);assert.equal(count,n+1,'missing identity never reads cache');
 ctx={...ctx,signature:'race-source'};const concurrent=createFinancialCalculationCache();assert.throws(()=>concurrent.read(current,()=>{ctx={...ctx,session:'account-changed',owner:'synthetic-b'};return calculate();},store),/CONTEXT_CHANGED/);
 const afterWrite=createFinancialCalculationCache(),oldOwner=ctx.owner;ctx={...ctx,signature:'write-race'};
 assert.throws(()=>afterWrite.read(current,calculate,{...store,setItem(k,v){store.setItem(k,v);ctx={...ctx,owner:'different-after-write'};}}),/CONTEXT_CHANGED/);ctx={...ctx,owner:oldOwner};
 const tooLarge={...store,length:1,key:()=> 'crewcheck_financial_calculation_cache_v1:other',getItem:()=> 'x'.repeat(510000)};ctx={...ctx,signature:'budget'};assert.equal(createFinancialCalculationCache().read(current,calculate,tooLarge).state,'not_saved','cache budget never displaces other application data');
 const sessionCache=createFinancialCalculationCache();sessionCache.read(current,calculate,store);ctx={...ctx,session:'new-login'};assert.notEqual(sessionCache.read(current,calculate,store).state,'memory','session change drops memory');
 const invalid=createFinancialCalculationCache();assert.equal(invalid.read(current,calculate,store,()=>false).state,'calculated','invalid persisted result shape is not used');
 assert.equal(signature({b:1,a:2}),signature({a:2,b:1}));assert.notEqual(signature({a:NaN}),signature({a:null}));assert.notEqual(signature({a:0}),signature({a:NaN}));
 const beforeInvalid=JSON.stringify([...data]);for(const period of ['1900-02','2201-02','2032-00','2032-13']){assert.equal(createFinancialCalculationCache().read(()=>({...ctx,period}),calculate,store).state,'not_saved');assert.equal(JSON.stringify([...data]),beforeInvalid,'invalid competence never populates cache');}
 const info=process.env.FINANCIAL_CACHE_ERASURE_BASELINE_TREE?execFileSync('git',['show',process.env.FINANCIAL_CACHE_ERASURE_BASELINE_TREE+':client/src/pages/InfoPage.tsx'],{encoding:'utf8'}):fs.readFileSync('client/src/pages/InfoPage.tsx','utf8'),ast=ts.createSourceFile('InfoPage.tsx',info,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let handler;const visit=node=>{if(ts.isArrowFunction(node)&&node.getText(ast).includes("fetch('/api/platform/account/delete'"))handler=node;ts.forEachChild(node,visit);};visit(ast);assert(handler,'real account-deletion handler');
 const scenarios=process.env.FINANCIAL_CACHE_ERASURE_BASELINE_TREE?['switch']:['cancel','failure','unauthorized','unconfirmed','success','blocked-erasure','switch','switch-unauthorized','switch-before-request','switch-during-alert','switch-during-confirm'];
 for(const scenario of scenarios){
  const own='crewcheck_financial_calculation_cache_v1:synthetic-a:2032-02:forecast',other='crewcheck_financial_calculation_cache_v1:synthetic-b:2032-02:forecast';
  const items=new Map([[own,'private-a'],[other,'private-b'],['crewcheck_auth_user',JSON.stringify({id:'synthetic-a'})],['crewcheck_auth_token','private-token'],['other-application-key','preserve']]);
  let generation=0,requests=0,confirmations=0;
  const storage={get length(){return items.size;},key:i=>[...items.keys()][i],getItem:k=>items.get(k)??null,setItem:(k,v)=>items.set(k,v),removeItem:k=>{if(scenario==='blocked-erasure'&&k===own)throw Error('blocked');items.delete(k);}};
  const user=()=>JSON.parse(items.get('crewcheck_auth_user')||'null');
  const switchAccount=()=>{generation++;items.set('crewcheck_auth_user',JSON.stringify({id:'synthetic-b'}));items.set('crewcheck_auth_token','token-b');};
  const captureAuthSession=()=>{const g=generation,owner=user()?.id,token=items.get('crewcheck_auth_token');return{token,isCurrent:()=>g===generation&&owner===user()?.id&&token===items.get('crewcheck_auth_token')};};
  const alerts=[],window={localStorage:storage,confirm:()=>{confirmations++;if(scenario==='switch-before-request'||scenario==='switch-during-confirm'&&confirmations===2)switchAccount();return scenario!=='cancel';},prompt:()=> 'EXCLUIR',location:{href:''},open:()=>{throw Error('not authorized');}};
  const c=vm.createContext({window,getStoredUser:user,captureAuthSession,alert:x=>{alerts.push(x);if(scenario==='switch-during-alert')switchAccount();},eraseFinancialCalculationCache,fetch:async(url,options)=>{
   requests++;assert.equal(options.headers.authorization,'Bearer private-token','request remains bound to initiating account');
   if(scenario==='switch'||scenario==='switch-unauthorized')switchAccount();
   return{status:scenario.includes('unauthorized')?401:scenario==='failure'?503:200,ok:!['failure','unauthorized','switch-unauthorized'].includes(scenario),json:async()=>({ok:true,deleted:scenario!=='unconfirmed',...(scenario==='switch-during-confirm'?{manageGooglePlayUrl:'https://play.google.com/store/account/subscriptions'}:{})})};
  }});
  vm.runInContext(ts.transpileModule('globalThis.subject='+handler.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,c);await c.subject();
  assert.equal(items.get(other),'private-b','another account cache must survive');assert.equal(items.get('other-application-key'),'preserve');
  if(['success','switch','switch-during-alert','switch-during-confirm'].includes(scenario))assert(!items.has(own),'only initiating account is erased after confirmed success');else assert.equal(items.get(own),'private-a');
  if(scenario==='success'){assert(!items.has('crewcheck_auth_token'));assert.equal(window.location.href,'/login');}
  if(scenario.startsWith('switch')){assert.equal(items.get('crewcheck_auth_token'),'token-b','new session survives');assert.equal(user().id,'synthetic-b');assert.equal(window.location.href,'','new session is not redirected');}
  if(['cancel','switch-before-request'].includes(scenario))assert.equal(requests,0);
  if(scenario==='blocked-erasure')assert(alerts.some(x=>x.includes('Limpe os dados deste navegador')),'local erasure failure is explicit');
 }
 console.log('PASS financial cache: SHA-256 differential vectors; restart/read reuse, account/period/scope/build/input invalidation, unknown/zero/date, mutation isolation, stale-tab writes, corruption, blocked/quota storage and session races; synthetic only');
}finally{modules.cleanup();}
