// Inactive adapter for an EXISTING native mysql2 pool/table. No connection,
// environment access, DDL, endpoint, lease expiry, deletion or Play API client.
// Wiring requires independently verified existing access and all-writer adoption.
import assert from 'node:assert/strict';
import {validatePlannedRecord, plannedMutation} from './planned_lifecycle.mjs';

const PACKAGE='com.crewcheck.app';
const transitions={reserved:['edit_open'],edit_open:['pending','reconciliation_required'],pending:['acknowledged','reconciliation_required'],acknowledged:['reconciled','reconciliation_required'],reconciliation_required:['reconciled'],reconciled:[]};
const key=p=>{assert.equal(p,PACKAGE);return `play-release-journal:${p}`;};
const parse=value=>{const record=typeof value==='string'?JSON.parse(value):value;assert(record && typeof record==='object' && !Array.isArray(record));assert.equal(record.package,PACKAGE);if(record.schema===2){validatePlannedRecord(record);return record;}assert(Number.isSafeInteger(record.revision)&&record.revision>0);assert(Object.hasOwn(transitions,record.state));identity(record.owner,record.intent);return record;};
const same=(a,b)=>assert.deepEqual(a,b,'Durable acknowledgement uncertain');
const identity=(owner,intent)=>{
  assert(typeof owner==='string'&&/^[A-Za-z0-9:_-]{1,128}$/.test(owner));
  assert(intent && Object.getPrototypeOf(intent)===Object.prototype);
  assert(Object.keys(intent).every(k=>['sourceSha','controllerSha','runId','artifactSha256','versionCode','editId','track','expectedTrackSha256','otherTracksBeforeSha256','reconciliationSha256'].includes(k)),'Only release provenance allowed');
  for(const field of ['sourceSha','controllerSha'])assert(/^[0-9a-f]{40}$/.test(intent[field]));
  assert(/^[0-9a-f]{64}$/.test(intent.artifactSha256));
  assert(/^[1-9][0-9]*$/.test(String(intent.runId)));
  assert(Number.isSafeInteger(intent.versionCode)&&intent.versionCode>0&&intent.versionCode<2100000000);
  if(intent.editId!==undefined)assert(/^[A-Za-z0-9_-]{1,128}$/.test(intent.editId));
  if(intent.track!==undefined)assert(['qa','internal'].includes(intent.track));
  for(const field of ['expectedTrackSha256','otherTracksBeforeSha256','reconciliationSha256'])if(intent[field]!==undefined)assert(/^[0-9a-f]{64}$/.test(intent[field]));
};

export function createMysqlJournal(db, capabilities={}){
  capabilities=Object.freeze({...capabilities});
  assert(db && typeof db.getConnection==='function');
  let schemaVerified=false;
  async function verifyExistingSchema(){
    try{
      const [tables]=await db.query("SELECT ENGINE AS engine FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='crewcheck_telegram_state'");
      const [primary]=await db.query("SELECT COLUMN_NAME AS column_name FROM information_schema.statistics WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='crewcheck_telegram_state' AND INDEX_NAME='PRIMARY' ORDER BY SEQ_IN_INDEX");
      const [payload]=await db.query("SELECT DATA_TYPE AS data_type FROM information_schema.columns WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='crewcheck_telegram_state' AND COLUMN_NAME='payload'");
      assert.equal(tables.length,1);assert.equal(tables[0].engine.toUpperCase(),'INNODB');
      assert.deepEqual(primary.map(row=>row.column_name),['state_key']);
      assert.equal(payload.length,1);assert.equal(payload[0].data_type,'json');
      schemaVerified=true;
    }catch{schemaVerified=false;throw new Error('Existing atomic journal schema unverified; no write allowed');}
  }
  async function read(packageName){try{const [rows]=await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?',[key(packageName)]);assert(rows.length<=1);return rows.length?parse(rows[0].payload):null;}catch{throw new Error('Durable journal read unverified');}}
  async function write(packageName,owner,intent,expectedRevision,nextState){
    identity(owner,intent);intent=structuredClone(intent);const stateKey=key(packageName);
    if(['pending','acknowledged','reconciled'].includes(nextState))for(const field of ['editId','track','expectedTrackSha256','otherTracksBeforeSha256'])assert(intent[field],'Staged provenance required');
    if(nextState==='reconciled')assert(intent.reconciliationSha256,'Durable reconciliation proof required');
    else assert(intent.reconciliationSha256===undefined,'Reconciliation proof only belongs to final state');
    if(!schemaVerified)await verifyExistingSchema();
    const connection=await db.getConnection();let commitAttempted=false,discard=false;
    let next;
    try{
      await connection.beginTransaction();
      const [rows]=await connection.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE',[stateKey]);
      if(expectedRevision===null){
        assert.equal(rows.length,0,'Package already reserved; reconcile before any new edit');
        next={package:packageName,owner,revision:1,state:'reserved',intent};
        // Unique state_key makes competing first reservations atomic. No UPSERT.
        const [result]=await connection.query('INSERT INTO crewcheck_telegram_state(state_key,payload,updated_at) VALUES(?,?,CURRENT_TIMESTAMP(3))',[stateKey,JSON.stringify(next)]);
        assert.equal(result.affectedRows,1);
      }else{
        assert.equal(rows.length,1);const current=parse(rows[0].payload);
        assert.equal(current.schema,undefined,'Planned release requires its reviewed lifecycle');
        assert.equal(current.owner,owner,'Reservation belongs to another runner');
        assert.equal(current.revision,expectedRevision,'Stale receipt revision');
        assert(current.revision<Number.MAX_SAFE_INTEGER,'Receipt revision exhausted');
        assert(transitions[current.state].includes(nextState),'Unsafe receipt transition');
        for(const field of ['sourceSha','controllerSha','runId','artifactSha256','versionCode'])assert.equal(current.intent[field],intent[field],'Release identity is immutable');
        if(current.intent.editId!==undefined)assert.equal(current.intent.editId,intent.editId,'Edit identity is immutable');
        for(const field of ['track','expectedTrackSha256','otherTracksBeforeSha256'])if(current.intent[field]!==undefined)assert.equal(current.intent[field],intent[field],'Staged state identity is immutable');
        next={...current,revision:current.revision+1,state:nextState,intent};
        const [result]=await connection.query('UPDATE crewcheck_telegram_state SET payload=?,updated_at=CURRENT_TIMESTAMP(3) WHERE state_key=?',[JSON.stringify(next),stateKey]);
        assert.equal(result.affectedRows,1);
      }
      commitAttempted=true;await connection.commit();
    }catch(error){
      if(commitAttempted){discard=true;connection.destroy?.();}
      else{try{await connection.rollback();}catch{discard=true;connection.destroy?.();}}
      // Do not expose DB diagnostics or retry a write whose acknowledgement was lost.
      throw new Error('Durable journal write not acknowledged; reconcile before retry');
    }finally{if(!discard)connection.release();}
    same(await read(packageName),next);return structuredClone(next);
  }
  // Same existing row, schema check and transaction contract. No runtime wiring.
  async function mutatePlan(operation, expected, input){
    const packageName=PACKAGE;
    const current=await read(packageName);
    const next=await plannedMutation(operation,current,expected,structuredClone(input),capabilities);
    if(!schemaVerified)await verifyExistingSchema();
    const connection=await db.getConnection();let commitAttempted=false,discard=false;
    try{
      await connection.beginTransaction();
      const [rows]=await connection.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE',[key(packageName)]);
      assert.equal(rows.length,current===null?0:1);
      if(current!==null)same(parse(rows[0].payload),current);
      // Optional service-side admission shares this exact SQL transaction.
      // Unconfigured callers retain existing behavior; no token/approval comes from intent.
      if(capabilities.authorizeTransition)assert.equal(await capabilities.authorizeTransition(connection,{operation,current:structuredClone(current),next:structuredClone(next)}),true,'Independent transition admission refused');
      if(current===null){
        const [result]=await connection.query('INSERT INTO crewcheck_telegram_state(state_key,payload,updated_at) VALUES(?,?,CURRENT_TIMESTAMP(3))',[key(packageName),JSON.stringify(next)]);
        assert.equal(result.affectedRows,1);
      }else{
        const [result]=await connection.query('UPDATE crewcheck_telegram_state SET payload=?,updated_at=CURRENT_TIMESTAMP(3) WHERE state_key=?',[JSON.stringify(next),key(packageName)]);
        assert.equal(result.affectedRows,1);
      }
      commitAttempted=true;await connection.commit();
    }catch{
      if(commitAttempted){discard=true;connection.destroy?.();}
      else{try{await connection.rollback();}catch{discard=true;connection.destroy?.();}}
      throw Error('Durable planned journal write unacknowledged; no retry or external action');
    }finally{if(!discard)connection.release();}
    same(await read(packageName),next);return structuredClone(next);
  }
  async function plan(operation,expected,input){
    assert(!['acknowledged','reconciliation_required'].includes(operation),'Caller cannot acknowledge commit');
    return mutatePlan(operation,expected,input);
  }
  async function commitPlan(expected,staged){
    assert.equal(typeof capabilities.commitOnce,'function','Trusted commit capability missing');
    const pending=await plan('pending',expected,staged);
    let outcome='reconciliation_required';
    try{await capabilities.commitOnce(structuredClone(pending));outcome='acknowledged';}catch{}
    const binding={owner:pending.owner,generation:pending.generation,revision:pending.revision};
    const saved=await mutatePlan(outcome,binding,{});
    return {...saved,retryAllowed:false,storeAvailability:'unknown'};
  }
  return {read,verifyExistingSchema,plan,commitPlan,reserve:(packageName,owner,intent)=>write(packageName,owner,intent,null,'reserved'),advance:(packageName,owner,intent,revision,state)=>write(packageName,owner,intent,revision,state)};
}

export async function coordinatedCommit(journal,record,commitOnce){
  assert.equal(record.state,'edit_open');
  for(const field of ['editId','track','expectedTrackSha256','otherTracksBeforeSha256'])assert(record.intent[field],'Staged track/edit provenance required');
  // A lost/failed durable write returns before the external commit callback.
  const pending=await journal.advance(record.package,record.owner,record.intent,record.revision,'pending');
  let acknowledged=false;
  try{await commitOnce();acknowledged=true;}catch{}
  const saved=await journal.advance(record.package,record.owner,record.intent,pending.revision,acknowledged?'acknowledged':'reconciliation_required');
  // An acknowledgement still requires independent post-commit track verification.
  return {...saved,storeAvailability:'unknown',retryAllowed:false};
}
