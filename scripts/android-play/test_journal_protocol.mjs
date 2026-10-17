import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createJournalProtocol} from './journal_protocol.mjs';
globalThis.fetch=()=>{throw Error('No external network');};
const binding={package:'com.crewcheck.app',owner:'run:123:1',producer:'mobile',sourceSha:'a'.repeat(40),controllerSha:'b'.repeat(40),runId:'123',artifactSha256:'c'.repeat(64),versionCode:144201};
const intent=Object.fromEntries(['sourceSha','controllerSha','runId','artifactSha256','versionCode'].map(k=>[k,binding[k]]));
const canonical=v=>v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
function fixture(){let current=null,writes=0,reads=0;return {get writes(){return writes;},get reads(){return reads;},async read(){reads++;return structuredClone(current);},async reserve(packageName,owner,intent){assert.equal(current,null);writes++;current={package:packageName,owner,revision:1,state:'reserved',intent};return structuredClone(current);},async advance(packageName,owner,intent,revision,state){assert.equal(current.package,packageName);assert.equal(current.owner,owner);assert.equal(current.revision,revision);assert.equal(current.state,'reserved');assert.equal(state,'edit_open');writes++;current={...current,intent,revision:revision+1,state};return structuredClone(current);}};}
const request=(id='one',change={})=>({schema:1,id,operation:'reserve',binding,revision:0,state:null,intent,...change});
if(process.argv.includes('--transport-fixture')){
 const j=fixture(),protocol=createJournalProtocol({journal:j,binding,authorize:async()=>true});
 const frames=JSON.parse(fs.readFileSync(0,'utf8'));const responses=[];for(const frame of frames)responses.push(await protocol(frame));
 process.stdout.write(JSON.stringify(responses));
}else{
 for(const mutate of [r=>({...r,binding:{...binding,owner:'foreign'}}),r=>({...r,binding:{...binding,producer:'wear'}}),r=>({...r,intent:{...intent,versionCode:144202}}),r=>({...r,environmentAuthorization:true}),r=>({...r,operation:'commit'}),r=>({...r,revision:1}),r=>({...r,state:'pending'}),r=>({...r,operation:'advance',revision:1,state:'acknowledged'}),r=>({...r,operation:'advance',revision:1,state:'reconciled'})]){
  const j=fixture(),p=createJournalProtocol({journal:j,binding,authorize:async()=>true});assert.equal(JSON.parse(await p(canonical(mutate(request())))).status,'blocked');assert.equal(j.reads+j.writes,0);
 }
 const j=fixture(),p=createJournalProtocol({journal:j,binding,authorize:async()=>true});
 assert.equal(JSON.parse(await p('{"schema":1,"schema":1}')).status,'blocked');
 const result=JSON.parse(await p(canonical(request())));assert.equal(result.status,'ok');assert.equal(result.record.revision,1);
 assert.equal(JSON.parse(await p(canonical(request()))).status,'blocked');assert.equal(j.writes,1);
 assert.equal(JSON.parse(await p(canonical(request('stale',{operation:'advance',revision:2,state:'edit_open'})))).status,'blocked');assert.equal(j.writes,1);
 assert.equal(JSON.parse(await p(canonical(request('open',{operation:'advance',revision:1,state:'edit_open'})))).record.state,'edit_open');
 const refused=fixture(),deny=createJournalProtocol({journal:refused,binding,authorize:async()=>false});assert.equal(JSON.parse(await deny(canonical(request()))).status,'blocked');assert.equal(refused.writes+refused.reads,0);
 const lost=fixture();lost.reserve=async()=>{throw Error('private database response');};const uncertain=createJournalProtocol({journal:lost,binding,authorize:async()=>true});assert(!await uncertain(canonical(request())).then(s=>s.includes('private')));
 assert.throws(()=>createJournalProtocol({journal:j,binding}));
 console.log('PASS: canonical scoped frames, trusted injected capability, immutable binding, stale/replay/unknown operations and uncertain writes fail closed; no listener or Play');
}
