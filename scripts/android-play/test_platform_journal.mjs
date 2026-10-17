import assert from 'node:assert/strict';
import {mysqlAdapter} from '../../server/mysql-platform-adapter.mjs';
import {createPlatformJournal} from './platform_journal.mjs';
globalThis.fetch=()=>{throw Error('No external network');};
const packageName='com.crewcheck.app',intent={sourceSha:'a'.repeat(40),controllerSha:'b'.repeat(40),artifactSha256:'c'.repeat(64),runId:'123',versionCode:144201};
function nativeFixture(){
 const rows=new Map(),calls=[];let lose=false,releases=0,discards=0;
 const query=async(sql,args=[])=>{
  calls.push({sql,args});
  assert.equal((sql.match(/\?/g)||[]).length,args.length);
  if(sql.includes('information_schema.tables'))return [[{engine:'InnoDB'}]];
  if(sql.includes('information_schema.statistics'))return [[{column_name:'state_key'}]];
  if(sql.includes('information_schema.columns'))return [[{data_type:'json'}]];
  if(sql.startsWith('SELECT payload'))return [[...(rows.has(args[0])?[{payload:rows.get(args[0])}]:[])]];
  if(sql.startsWith('INSERT')){assert(!rows.has(args[0]));rows.set(args[0],args[1]);return [{affectedRows:1}];}
  if(sql.startsWith('UPDATE')){assert(rows.has(args[1]));rows.set(args[1],args[0]);return [{affectedRows:1}];}
  if(sql==='COMMIT'&&lose){lose=false;throw Error('synthetic secret commit response');}
  assert(['BEGIN','COMMIT','ROLLBACK'].includes(sql));return [{affectedRows:0}];
 };
 return {query,rows,calls,lose(){lose=true;},get releases(){return releases;},get discards(){return discards;},async getConnection(){let before;return {
  async query(sql,args){if(sql==='BEGIN')before=structuredClone(rows);if(sql==='ROLLBACK'){rows.clear();for(const [k,v] of before)rows.set(k,v);}return query(sql,args);},release(){releases++;},destroy(){discards++;}
 };}};
}
const native=nativeFixture(),platform=mysqlAdapter(native),journal=createPlatformJournal(platform);
assert.equal(native.calls.length,0,'Construction must not query/connect');
const reserved=await journal.reserve(packageName,'run:123',intent);
assert.deepEqual(await journal.read(packageName),reserved);
const staged={...intent,editId:'edit1',track:'qa',expectedTrackSha256:'d'.repeat(64),otherTracksBeforeSha256:'e'.repeat(64)};
await assert.rejects(journal.advance(packageName,'other',staged,1,'edit_open'));
assert.equal((await journal.read(packageName)).revision,1);
const opened=await journal.advance(packageName,reserved.owner,staged,1,'edit_open');
assert.equal(opened.revision,2);assert.equal(native.discards,0);
native.lose();
await assert.rejects(journal.advance(packageName,opened.owner,staged,2,'pending'),e=>!e.message.includes('secret'));
assert.equal(native.discards,1);assert.equal((await journal.read(packageName)).state,'pending');
await assert.rejects(createPlatformJournal(mysqlAdapter(native)).reserve(packageName,'new',intent));
assert(native.calls.every(x=>!/CREATE|ALTER|DROP|DELETE|UPSERT|REPLACE/.test(x.sql)));
assert(native.calls.find(x=>x.sql.startsWith('INSERT')).args[0]==='play-release-journal:com.crewcheck.app');
// Adapter row normalization remains the existing application contract.
const normalized=await mysqlAdapter({async query(){return [[{payload:'{"ok":true}',active:1}]];}}).query('SELECT payload');
assert.deepEqual(normalized.rows,[{payload:{ok:true},active:true}]);
for(const fixture of [{query:async()=>[[]]}, {query:async()=>[[]],getConnection:async()=>({query:async()=>[[]],release(){}})}]){
 const db=mysqlAdapter(fixture),j=createPlatformJournal(db);
 // Inject schema answers only to reach transaction capability guard.
 db.query=platform.query.bind(platform);
 await assert.rejects(j.reserve(packageName,'blocked',intent));
}
assert.throws(()=>createPlatformJournal({dialect:'postgres',query(){},connect(){}}));
const invalid=createPlatformJournal({dialect:'mysql',query:platform.query.bind(platform),async connect(){return {release(){},discard(){},query:async()=>({rows:[],rowCount:NaN})};}});
await assert.rejects(invalid.reserve(packageName,'bad-result',intent));
console.log('PASS: actual platform adapter binds/results connect to journal; owned transaction rollback, uncertain connection disposal and fallback rejection; injected fixture only');
