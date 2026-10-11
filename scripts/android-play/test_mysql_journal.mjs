import assert from 'node:assert/strict';
import {createMysqlJournal,coordinatedCommit} from './mysql_journal.mjs';

// Transaction-serial fixture models PK exclusivity and commit-response loss.
// This is not a real InnoDB integration test or evidence of production access.
function database(){
  const rows=new Map();let tail=Promise.resolve(),loseNextCommit=false;
  const db={rows,calls:[],engine:'InnoDB',primary:['state_key'],payloadType:'json',lose(){loseNextCommit=true;},
    async query(sql,args){db.calls.push(sql);
      if(sql.includes('information_schema.tables'))return [[{engine:db.engine}]];
      if(sql.includes('information_schema.statistics'))return [db.primary.map(column_name=>({column_name}))];
      if(sql.includes('information_schema.columns'))return [[{data_type:db.payloadType}]];
      assert(sql.startsWith('SELECT payload'));return [[...(rows.has(args[0])?[{payload:rows.get(args[0])}]:[])]];},
    async getConnection(){let unlock;const previous=tail;tail=new Promise(resolve=>unlock=resolve);await previous;let snapshot,committed=false,unlocked=false;
      const finish=()=>{if(!unlocked){unlocked=true;unlock();}};
      return {async beginTransaction(){snapshot=structuredClone(rows);},async query(sql,args){db.calls.push(sql);
        if(sql.startsWith('SELECT payload'))return [[...(rows.has(args[0])?[{payload:rows.get(args[0])}]:[])]];
        if(sql.startsWith('INSERT INTO')){assert(!rows.has(args[0]));rows.set(args[0],args[1]);return [{affectedRows:1}];}
        if(sql.startsWith('UPDATE')){assert(rows.has(args[1]));rows.set(args[1],args[0]);return [{affectedRows:1}];}
        assert.fail('Unexpected SQL');},
        async commit(){committed=true;if(loseNextCommit){loseNextCommit=false;throw Error('synthetic secret DB diagnostic');}},
        async rollback(){assert(!committed);rows.clear();for(const [key,value] of snapshot)rows.set(key,value);},release:finish,destroy:finish};}
  };return db;
}
const packageName='com.crewcheck.app',owner='run:123:1';
const intent={sourceSha:'a'.repeat(40),controllerSha:'b'.repeat(40),artifactSha256:'c'.repeat(64),runId:'123',versionCode:144201};
const staged={...intent,editId:'edit1',track:'qa',expectedTrackSha256:'d'.repeat(64),otherTracksBeforeSha256:'e'.repeat(64)};
const db=database(),journal=createMysqlJournal(db);
const attempts=await Promise.allSettled([journal.reserve(packageName,owner,intent),journal.reserve(packageName,'run:124:1',intent)]);
assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);
assert.equal(attempts.filter(r=>r.status==='rejected').length,1);
let record=await journal.read(packageName);assert.equal(record.owner,owner);
await assert.rejects(journal.advance(packageName,'foreign',staged,record.revision,'edit_open'));
await assert.rejects(journal.advance(packageName,owner,staged,999,'edit_open'));
await assert.rejects(journal.advance(packageName,owner,{...staged,versionCode:144202},record.revision,'edit_open'));
record=await journal.advance(packageName,owner,staged,record.revision,'edit_open');
let externalCalls=0;db.lose();
await assert.rejects(coordinatedCommit(journal,record,async()=>externalCalls++),error=>!error.message.includes('synthetic secret'));
assert.equal(externalCalls,0);assert.equal((await journal.read(packageName)).state,'pending');
await assert.rejects(createMysqlJournal(db).reserve(packageName,'fresh-run',intent));

for(const response of ['acknowledged','lost','crash']){
  const remote=database(),j=createMysqlJournal(remote);
  const reserved=await j.reserve(packageName,owner,intent);
  const opened=await j.advance(packageName,owner,staged,reserved.revision,'edit_open');
  let calls=0;
  const commit=()=>coordinatedCommit(j,opened,async()=>{calls++;assert.equal((await j.read(packageName)).state,'pending');if(response==='lost')throw Error('lost Play response');if(response==='crash')remote.lose();});
  if(response==='crash'){
    await assert.rejects(commit());assert.equal(calls,1);
    assert.equal((await j.read(packageName)).state,'acknowledged');
    await assert.rejects(j.reserve(packageName,'new-run',intent));continue;
  }
  const result=await commit();
  assert.equal(calls,1);assert.equal(result.state,response==='lost'?'reconciliation_required':'acknowledged');
  assert.equal(result.retryAllowed,false);assert.equal(result.storeAvailability,'unknown');
  await assert.rejects(coordinatedCommit(j,opened,async()=>calls++));assert.equal(calls,1);
  await assert.rejects(j.reserve(packageName,'new-run',intent));
  if(response==='acknowledged'){
    await j.advance(packageName,owner,staged,result.revision,'reconciled');
    await assert.rejects(j.reserve(packageName,'new-run',intent));
  }
}
await assert.rejects(journal.reserve('com.crewcheck.watch.app',owner,intent));
await assert.rejects(journal.reserve(packageName,undefined,intent));
await assert.rejects(journal.reserve(packageName,owner,{...intent,password:'no'}));
assert(db.calls.every(sql=>!/CREATE|ALTER|DROP|DELETE|TRUNCATE|UPSERT|REPLACE/i.test(sql)));
const unreadable=createMysqlJournal({getConnection(){},async query(){throw Error('synthetic secret');}});
await assert.rejects(unreadable.read(packageName),error=>error.message==='Durable journal read unverified');
for(const override of [{engine:'MyISAM'},{primary:['state_key','other']},{payloadType:'text'}]){
  const wrong=Object.assign(database(),override);
  await assert.rejects(createMysqlJournal(wrong).reserve(packageName,owner,intent));
  assert(!wrong.calls.some(sql=>sql.startsWith('INSERT')));
}
console.log('PASS: existing-table PK reservation, owned revision CAS, immutable intent, lost ack recovery and no retry/auto-unlock; offline fixture only');
