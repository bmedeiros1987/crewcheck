import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'vite';
import {repairRosterListSession} from './roster-startup/list-session.mjs';
const source=fs.readFileSync('client/src/lib/databaseClient.ts','utf8');
assert.equal(repairRosterListSession(source),source,'actual list must carry canonical read fences');
assert.equal(repairRosterListSession(repairRosterListSession(source)),source,'repair is idempotent');
// Real databaseClient/authClient. Only browser storage and HTTP transport are synthetic.
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'crewcheck-list-session-'));
const values=new Map();
globalThis.localStorage={getItem:k=>values.has(k)?values.get(k):null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
globalThis.sessionStorage=globalThis.localStorage;
globalThis.window=Object.assign(new EventTarget(),{location:{origin:'https://synthetic.invalid'}});
function login(id){localStorage.setItem('crewcheck_auth_user',JSON.stringify({id,email:id+'@example.invalid',role:'user'}));localStorage.setItem('crewcheck_auth_token','synthetic-'+id);window.dispatchEvent(new Event('crewcheck:auth-changed'));}
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
async function bounded(p){let timer;try{return await Promise.race([p,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Synthetic deadline')),3000))]);}finally{clearTimeout(timer);}}
const item={id:'synthetic-A-roster',crewId:'SYNTHETIC-A',year:2026,month:10,createdAt:'2026-10-26T12:00:00Z',isActive:true};
const response=(kind,active=false)=>new Response(JSON.stringify(kind==='error'?{ok:false}:active?{ok:true,roster:kind==='success'?item:null}:{ok:true,rosters:kind==='success'?[item]:[]}),{status:kind==='error'?503:200});
const report=[];
try{
 await build({configFile:false,logLevel:'silent',resolve:{alias:{'@shared':path.resolve('shared')}},build:{lib:{entry:path.resolve('client/src/lib/databaseClient.ts'),formats:['es'],fileName:()=> 'subject.mjs'},outDir:temp,emptyOutDir:true,minify:false}});
 const database=await import(pathToFileURL(temp+'/subject.mjs'));
 for(const strict of [false,true])for(const changed of [false,true])for(const phase of ['list','active'])for(const kind of ['success','empty','error']){
  if(strict&&phase==='active')continue;
  values.clear();login('A');const started=deferred(),pending=deferred(),calls=[];
  globalThis.fetch=async(url,init)=>{
   assert(['/api/rosters?limit=72&manager=1','/api/rosters/active'].includes(String(url)),'external transport forbidden');
   calls.push({path:String(url).split('?')[0],owner:init.headers.authorization==='Bearer synthetic-A'?'A':'B'});
   if((phase==='list'&&calls.length===1)||(phase==='active'&&calls.length===2)){started.resolve();return pending.promise;}
   return response('empty');
  };
  const work=database.listSavedRosters(72,strict,{preserveRevisions:true}).then(rows=>({rows:rows.map(r=>r.id)}),error=>({code:error.code||'ERROR'}));
  await bounded(started.promise);if(changed)login('B');pending.resolve(response(kind,phase==='active'));
  const result=await bounded(work);
  const expected=phase==='active'?2:changed||strict||kind!=='empty'?1:2;
  const passed=calls.length===expected&&calls.every(c=>c.owner==='A')&&(changed?result.code==='STALE_SESSION':kind==='error'&&strict?result.code==='ERROR':JSON.stringify(result.rows)===JSON.stringify(kind==='success'?[item.id]:[]));
  report.push({strict,changed,phase,kind,calls,result,passed});
 }
}finally{fs.rmSync(temp,{recursive:true,force:true});const output=process.env.ROSTER_LIST_EVIDENCE||'artifacts/roster-list-session.json';fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');}
assert.deepEqual(report.filter(r=>!r.passed),[],'list must reject every stale response/fallback without follow-up under B; same-A compatibility retained');
console.log('PASS real roster list/auth transport: '+report.length+' session/strict/fallback cases');
