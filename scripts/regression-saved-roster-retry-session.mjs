import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {build} from 'vite';
import ts from 'typescript';

// Bundle the REAL databaseClient, authClient, captureAuthSession and their
// dependencies. Only storage/window and fetch are synthetic; openSavedRoster and
// its nested retry loop are never replaced by a stub or copied implementation.
class MemoryStorage {
  values=new Map();
  getItem(key){return this.values.has(key)?this.values.get(key):null;}
  setItem(key,value){this.values.set(key,String(value));}
  removeItem(key){this.values.delete(key);}
  clear(){this.values.clear();}
}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'crewcheck-real-roster-retry-'));
const source=fs.readFileSync('client/src/lib/databaseClient.ts','utf8');
const ast=ts.createSourceFile('databaseClient.ts',source,99,true);
const declaration=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='openSavedRoster');
assert.ok(declaration);
const report={head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),functionSha256:crypto.createHash('sha256').update(declaration.getText(ast)).digest('hex'),cases:[]};
const output=process.env.SAVED_ROSTER_RETRY_EVIDENCE||'artifacts/home-crossmonth-continuity/roster-retries.json';
globalThis.localStorage=new MemoryStorage();globalThis.sessionStorage=new MemoryStorage();
globalThis.window=Object.assign(new EventTarget(),{location:{origin:'https://synthetic.invalid'}});
globalThis.fetch=async()=>{throw Error('No external transport allowed');};
function account(owner){localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:`synthetic-${owner}`,email:`${owner}@example.invalid`,role:'user'}));localStorage.setItem('crewcheck_auth_token',`synthetic-only-${owner}`);window.dispatchEvent(new Event('crewcheck:auth-changed'));}
const roster={crewId:'900001',crewName:'SYNTHETIC',month:10,year:2026,days:[{date:'30/10/2026',type:'DO',legs:[]}]};
const payload={ok:true,data:{roster,compliance:{score:100,alerts:[]},gym:[]}};
const response=(kind)=>kind==='503'?new Response(JSON.stringify({ok:false,code:'SYNTHETIC_UNAVAILABLE'}),{status:503}):new Response(JSON.stringify(kind==='empty'?{ok:true,data:{}}:payload),{status:200});
const failures=[];
async function bounded(work,label){let timer;try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Synthetic retry test timed out: '+label)),5000);})]);}finally{clearTimeout(timer);}}
try {
 await build({configFile:false,logLevel:'silent',resolve:{alias:{'@shared':path.resolve('shared')}},build:{lib:{entry:path.resolve('client/src/lib/databaseClient.ts'),formats:['es'],fileName:()=> 'database.mjs'},outDir:temp,emptyOutDir:true,minify:false}});
 const database=await import(pathToFileURL(path.join(temp,'database.mjs')).href);
 for(const changed of [true,false])for(const first of ['503','empty','success']){
  localStorage.clear();sessionStorage.clear();account('A');
  let release,started;const pending=new Promise(resolve=>{release=resolve;}),began=new Promise(resolve=>{started=resolve;}),requests=[];
  globalThis.fetch=async(url,init)=>{
   const target=new URL(url,'https://synthetic.invalid');
   assert.equal(target.origin,'https://synthetic.invalid');
   assert.ok(['/api/rosters/synthetic-remote','/api/rosters/open'].includes(target.pathname),'unexpected API request');
   const owner=init?.headers?.authorization==='Bearer synthetic-only-A'?'A':init?.headers?.authorization==='Bearer synthetic-only-B'?'B':'none';
   requests.push({path:target.pathname,account:owner});
   if(requests.length===1){started();return pending;}
   // Valid B cannot read A's synthetic roster; no visual leak is simulated.
   return owner==='A'?response('success'):new Response(JSON.stringify({ok:false,code:'SYNTHETIC_NOT_FOUND'}),{status:404});
  };
  const work=database.openSavedRoster('synthetic-remote',{year:2026,month:10,crewId:'900001'}).then(data=>({accepted:true,crewId:data.roster.crewId}),error=>({accepted:false,code:error?.code||null}));
  await bounded(began,'first request');if(changed)account('B');release(response(first));const result=await bounded(work,'request completion');
  const expectedRequests=changed||first==='success'?1:2;
  const passed=requests.length===expectedRequests&&requests.every(r=>r.account==='A')&&(changed?result.code==='STALE_SESSION':result.accepted&&result.crewId==='900001');
  const record={name:`${changed?'A-to-B':'same-A'}-${first}`,requests,result,passed};report.cases.push(record);if(!passed)failures.push(record.name);
 }
 for(const [field,value,code] of [['crewId','900002','ROSTER_IDENTITY_MISMATCH'],['month',11,'ROSTER_PERIOD_MISMATCH']]){
  localStorage.clear();sessionStorage.clear();account('A');const requests=[];
  globalThis.fetch=async(url)=>{const target=new URL(url,'https://synthetic.invalid');assert.equal(target.origin,'https://synthetic.invalid');requests.push({path:target.pathname,account:'A'});return new Response(JSON.stringify({...payload,data:{...payload.data,roster:{...roster,[field]:value}}}),{status:200});};
  const result=await database.openSavedRoster('synthetic-remote',{year:2026,month:10,crewId:'900001'}).then(()=>({accepted:true}),error=>({accepted:false,code:error?.code||null}));
  const record={name:`same-A-reject-${field}`,requests,result,passed:requests.length===1&&result.code===code};report.cases.push(record);if(!record.passed)failures.push(record.name);
 }
}finally{fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');fs.rmSync(temp,{recursive:true,force:true});}
assert.deepEqual(failures,[],'real openSavedRoster must stop stale retries/results and preserve same-session compatibility retry');
console.log('PASS real bundled openSavedRoster/authClient: delayed503/empty/success after A→B; same-A503/empty retry and direct success; no external API');
