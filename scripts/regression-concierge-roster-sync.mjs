import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {restrictConciergeSnapshotWrite} from '../server/concierge-read-only-scope.mjs';

const ts=createRequire(import.meta.url)('typescript');
const server=fs.readFileSync('server.mjs','utf8'),home=fs.readFileSync('client/src/pages/Home.tsx','utf8');
const tree=ts.createSourceFile('server.mjs',server,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const declarations=new Map(tree.statements.filter(ts.isFunctionDeclaration).map(n=>[n.name.text,n.getText(tree)]));
const names=['conciergeSafeKey','conciergeSnapshotForProfile','conciergeMinimizeRoster','conciergeRosterDiagnostics','conciergeSaveSnapshot','conciergeSaveSnapshotAsync','handleTelegramRosterSync'];
const code=names.map(n=>{assert(declarations.has(n),n);return declarations.get(n);}).join('\n');
const roster=revision=>({year:2099,month:10,base:'AAA',publicationRevision:revision,days:[{date:'04/10/2099',type:'RES',legs:[],rawText:''}]});
const copy=x=>structuredClone(x);
let checks=0;
function fixture(outcome,localWrite=true){
 let local={snapshots:{}},durable={roster:roster('A')},calls=0;
 const context={Date,console,restrictConciergeSnapshotWrite,DEFAULT_CONCIERGE_NAME:'Synthetic',
  telegramRostersRead:()=>copy(local),telegramRostersWrite:data=>{if(localWrite==='throw')throw Error('SYNTHETIC_LOCAL_FAILURE');if(localWrite){local=copy(data);return true;}return false;},
  conciergeDbPut:async(key,value)=>{calls++;assert.equal(key,'snapshot:synthetic@example.test');if(outcome==='throw')throw Error('PRIVATE_PAYLOAD_MUST_NOT_ESCAPE');if(outcome===true||outcome==='uncertain')durable=copy(value);if(outcome==='uncertain')throw Error('SYNTHETIC_ACK_LOST');return outcome;},
  conciergeLoadSnapshot:async()=>null,telegramLinkedRecordForEmail:async()=>null,
  telegramRequestUser:()=>({email:'synthetic@example.test',name:'Synthetic',authenticated:true}),telegramAppRequestAllowed:()=>true,conciergeAccessMatches:()=>true,
  readJsonBody:async req=>req.body,sendJson:(_res,status,body)=>({status,body})};
 vm.createContext(context);vm.runInContext(code,context);
 return {context,local:()=>copy(local),durable:()=>copy(durable),calls:()=>calls,
  sync:()=>context.handleTelegramRosterSync({method:'POST',body:{roster:roster('B'),source:'Synthetic'}},null,new URL('https://synthetic.invalid/api/telegram/roster-sync'))};
}
{
 const f=fixture(true),result=await f.sync();assert.equal(result.status,200);assert.equal(result.body.ok,true);
 assert.equal(result.body.persistence,'confirmed');assert.equal(result.body.cache,'updated');assert.equal(f.calls(),1);
 assert.equal(f.durable().roster.publicationRevision,'B');checks++;
}
for(const outcome of [false,undefined,null,'true',{},'throw','uncertain']){
 const f=fixture(outcome),result=await f.sync();assert.equal(result.status,503);assert.equal(result.body.ok,false);
 assert.equal(result.body.persistence,'unconfirmed');assert.equal(result.body.cache,'updated');assert.equal(f.calls(),1);
 assert.equal(f.local().snapshots['synthetic@example.test'].roster.publicationRevision,'B');
 assert(!JSON.stringify(result).includes('PRIVATE_PAYLOAD'));assert(!JSON.stringify(result).includes('synthetic@example.test'));
 if(outcome!=='uncertain')assert.equal(f.durable().roster.publicationRevision,'A');
 if(outcome==='uncertain')assert.equal(f.durable().roster.publicationRevision,'B','lost ACK may follow a committed write');
 checks++;
}
for(const localWrite of [false,'throw']){
const f=fixture(true,localWrite),result=await f.sync();assert.equal(result.status,503);assert.equal(result.body.cache,'unconfirmed');
assert.equal(result.body.persistence,localWrite===false?'confirmed':'unconfirmed');assert.equal(f.calls(),localWrite===false?1:0);checks++;
}

// The shared writer keeps its existing contract for unrelated consumers.
{
 const f=fixture(false);const saved=await f.context.conciergeSaveSnapshotAsync({email:'synthetic@example.test'},roster('A'),{});
 assert.equal(saved.roster.publicationRevision,'A');assert.equal(f.calls(),1);checks++;
}

const ht=ts.createSourceFile('Home.tsx',home,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const producer=ht.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='syncRosterWithTelegramConcierge');assert(producer);
const serial=ht.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ht)==='conciergeRosterSyncSerial'));
const clientCode=ts.transpileModule((serial?.getText(ht)||'')+'\n'+producer.getText(ht),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function client(){
 let generation=0,publication='A',calls=0;const pending=[],listeners=new Set();
 const context={Error,JSON,sessionStorage:{getItem:()=>publication},window:{addEventListener:(_n,fn)=>listeners.add(fn),removeEventListener:(_n,fn)=>listeners.delete(fn)},captureAuthSession:()=>{const captured=generation;return{isCurrent:()=>captured===generation};},telegramConciergeIdentity:()=>({email:'synthetic@example.test'}),
  fetch:async(url,options)=>{calls++;assert.equal(url,'/api/telegram/roster-sync');assert.equal(options.method,'POST');return new Promise(resolve=>pending.push(resolve));}};
 vm.createContext(context);vm.runInContext(clientCode,context);
 return{run:()=>context.syncRosterWithTelegramConcierge(roster('A'),'Synthetic',()=>publication==='A'),changeAccount:()=>generation++,changePublication:()=>publication='B',
  respond:(payload,ok=true,index=0)=>pending[index]({ok,json:async()=>payload}),invalidate:()=>listeners.forEach(fn=>fn()),listeners:()=>listeners.size,calls:()=>calls};
}
{
 const c=client(),pending=c.run();c.respond({ok:true,persistence:'confirmed'});assert.equal((await pending).persistence,'confirmed');assert.equal(c.calls(),1);checks++;
}
for(const payload of [{ok:true},{ok:true,persistence:'unconfirmed'},{ok:true,persistence:true},{ok:false},null]){
 const c=client(),pending=c.run();c.respond(payload);await assert.rejects(pending,/Concierge/);assert.equal(c.calls(),1);checks++;
}
for(const change of ['changeAccount','changePublication'])for(const ok of [true,false]){
 const c=client(),pending=c.run();c[change]();c.respond({ok,persistence:ok?'confirmed':'unconfirmed'},ok);assert.equal(await pending,null,'obsolete result must not become success or user-facing error');checks++;
}
{
 const c=client(),first=c.run(),second=c.run();c.respond({ok:true,persistence:'confirmed'},true,1);assert.equal((await second).persistence,'confirmed');
 c.respond({ok:true,persistence:'confirmed'},true,0);assert.equal(await first,null);assert.equal(c.calls(),2);assert.equal(c.listeners(),0);checks++;
}
{const c=client(),pending=c.run();c.invalidate();c.respond({ok:true,persistence:'confirmed'});assert.equal(await pending,null);assert.equal(c.listeners(),0);checks++;}
assert.match(home,/if \(conciergeImportCurrent\(\)\) toast\.error/);
assert.doesNotMatch(home,/syncRosterWithTelegramConcierge\(roster, file\.name\)\.catch\(\(\) => undefined\)/);
console.log(`PASS ${checks} Concierge roster-sync receipt/client synthetic checks; no network or messages`);
