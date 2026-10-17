import assert from 'node:assert/strict';
import {createJournalProtocol} from './journal_protocol.mjs';
import {createMysqlJournal} from './mysql_journal.mjs';
import {database} from './mysql_journal_fixture.mjs';
import {snapshotDigest} from './reconcile_journal.mjs';
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const p={package:'com.crewcheck.app',owner:'mobile:123',producer:'mobile',sourceSha:'a'.repeat(40),controllerSha:'b'.repeat(40),runId:'123',modules:['app']};p.planSha256=snapshotDigest(p);
const binding={schema:2,generation:1,plan:p},db=database(),journal=createMysqlJournal(db,{approvePlan:async()=>true});
const protocol=createJournalProtocol({journal,binding,authorize:async()=>true});
const request={schema:2,id:'reserve',operation:'reserve',binding,revision:0,input:p};
assert.equal(JSON.parse(await protocol(canonical(request))).status,'ok');const saved=await journal.read(p.package);
for(const f of [canonical(request),JSON.stringify({...request,id:'notcanonical'}),canonical({...request,id:'foreign',binding:{...binding,generation:2}}),canonical({...request,id:'forge',operation:'acknowledged',revision:1,input:{}}),canonical({...request,id:'claim',operation:'reconcile',revision:1,input:{reconciliationSha256:'f'.repeat(64)}})]){
 assert.equal(JSON.parse(await protocol(f)).status,'blocked');assert.deepEqual(await journal.read(p.package),saved);
}
const empty=database(),refused=createJournalProtocol({journal:createMysqlJournal(empty),binding,authorize:async()=>false});
assert.equal(JSON.parse(await refused(canonical(request))).status,'blocked');assert.equal(empty.calls.length,0);
// Returned legacy row is never coerced to a plan; wrong generation/owner remains blocked.
const legacy=database(),old=createMysqlJournal(legacy);await old.reserve(p.package,'old',{sourceSha:p.sourceSha,controllerSha:p.controllerSha,artifactSha256:'c'.repeat(64),runId:p.runId,versionCode:42});
const blocked=createJournalProtocol({journal:old,binding,authorize:async()=>true});assert.equal(JSON.parse(await blocked(canonical({...request,id:'legacy',operation:'read',revision:1,input:{}}))).status,'blocked');
console.log('PASS schema-v2 protocol pins plan/generation/revision, canonical frames, replay and approval; rejects caller outcomes/legacy rows without writes');
