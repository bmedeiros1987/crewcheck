import assert from 'node:assert/strict';
import {createMysqlJournal} from './mysql_journal.mjs';
import {database} from './mysql_journal_fixture.mjs';
import {snapshotDigest} from './reconcile_journal.mjs';
const pkg='com.crewcheck.app',key=`play-release-journal:${pkg}`;
const binding=r=>({owner:r.owner,generation:r.generation,revision:r.revision});
const plan=(run='123',producer='mobile')=>{const p={package:pkg,owner:`run:${run}`,producer,sourceSha:'a'.repeat(40),controllerSha:'b'.repeat(40),runId:run,modules:{joint:['app','wear'],mobile:['app'],wear:['wear']}[producer]};return {...p,planSha256:snapshotDigest(p)};};
const allocation=(p,floor=144155)=>({inventorySha256:'d'.repeat(64),floor,versionCodes:Object.fromEntries(p.modules.map((m,i)=>[m,floor+i+1]))});
const artifacts=r=>r.plan.modules.map(module=>({module,package:pkg,versionCode:r.allocation.versionCodes[module],sourceSha:r.plan.sourceSha,controllerSha:r.plan.controllerSha,manifestSha256:'e'.repeat(64),uploadCertificateSha256:'f'.repeat(64),artifactSha256:'c'.repeat(64)}));
const staged={track:'internal',expectedTrackSha256:'d'.repeat(64),otherTracksBeforeSha256:'e'.repeat(64)};
const proof={reconciliationSha256:'f'.repeat(64)};
// Explicit fictional capabilities only. No network, credentials or live authority.
const capabilities={approvePlan:async()=>true,verifyInventory:async()=>true,verifyArtifacts:async()=>true,verifyStage:async()=>true,verifyReconciliation:async()=>true,approveRollover:async()=>true,commitOnce:async()=>{}};
globalThis.fetch=()=>{throw Error('Network forbidden');};
async function allocated(j,p=plan()){
 let r=await j.plan('reserve',null,p);assert(!('artifacts' in r));assert(!('allocation' in r));
 r=await j.plan('startAllocation',binding(r),{});
 r=await j.plan('saveEdit',binding(r),{editId:'original-edit'});
 return j.plan('allocate',binding(r),allocation(p));
}
async function finished(j,r){r=await j.plan('finalize',binding(r),artifacts(r));await j.commitPlan(binding(r),staged);r=await j.read(pkg);return j.plan('reconcile',binding(r),proof);}
const db=database(),j=createMysqlJournal(db,capabilities);
let r=await allocated(j);r=await finished(j,r);assert.equal(r.state,'reconciled');
const old=structuredClone(r);
r=await j.plan('rollover',binding(r),plan('124'));
assert.equal(r.generation,2);assert.equal(r.revision,old.revision+1);assert.equal(r.history.length,1);assert.equal(r.history[0].reconciliationSha256,old.reconciliationSha256);
assert(!('editId' in r));assert(!('allocation' in r));assert(!('artifacts' in r));
await assert.rejects(j.plan('startAllocation',binding(old),{}));
r=await j.plan('startAllocation',binding(r),{});r=await j.plan('saveEdit',binding(r),{editId:'second-edit'});r=await j.plan('allocate',binding(r),allocation(r.plan,144157));r=await finished(j,r);
assert.equal(r.generation,2);assert.equal(r.allocation.versionCodes.app,144158);assert.equal(r.allocation.versionCodes.wear,undefined);assert.equal(r.history.length,1);assert.equal(r.history[0].planSha256,old.plan.planSha256);
// Previous generation high-water mark cannot be lowered, even by an accepting fixture verifier.
{
 const remote=database(),q=createMysqlJournal(remote,capabilities);
 let x=await finished(q,await allocated(q));x=await q.plan('rollover',binding(x),plan('456'));
 x=await q.plan('startAllocation',binding(x),{});x=await q.plan('saveEdit',binding(x),{editId:'next-edit'});
 await assert.rejects(q.plan('allocate',binding(x),allocation(x.plan,144155)));
 assert.equal((await q.read(pkg)).state,'edit_known');
}
// Exact plan schema/digest prevents hidden credentials, foreign package and fabricated modules.
for(const invalid of [{...plan(),planSha256:'0'.repeat(64)},{...plan(),password:'forbidden'},{...plan(),package:'com.crewcheck.watch.app'},{...plan(),modules:['wear']}]){
 const remote=database();await assert.rejects(createMysqlJournal(remote,capabilities).plan('reserve',null,invalid));assert.equal(remote.rows.size,0);
}
// Same PK across all producers; loser cannot open any edit.
for(const kind of ['reserve','rollover']){
 const remote=database(),q=createMysqlJournal(remote,capabilities);
 let previous=null;if(kind==='rollover')previous=await finished(q,await allocated(q));
 const results=await Promise.allSettled(['mobile','wear','joint'].map((producer,i)=>q.plan(kind,previous?binding(previous):null,plan(String(200+i),producer))));
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 assert.equal((await q.read(pkg)).generation,kind==='reserve'?1:2);
}
// Lost SQL response at every durable boundary, including terminal rollover.
for(const operation of ['reserve','startAllocation','saveEdit','allocate','finalize','pending','acknowledged','reconcile','rollover']){
 const remote=database();let calls=0;
 const q=createMysqlJournal(remote,{...capabilities,commitOnce:async()=>{calls++;if(operation==='acknowledged')remote.lose();}});
 let x=null,p=plan();
 if(operation!=='reserve')x=await q.plan('reserve',null,p);
 if(!['reserve','startAllocation'].includes(operation))x=await q.plan('startAllocation',binding(x),{});
 if(!['reserve','startAllocation','saveEdit'].includes(operation))x=await q.plan('saveEdit',binding(x),{editId:'one-edit'});
 if(!['reserve','startAllocation','saveEdit','allocate'].includes(operation))x=await q.plan('allocate',binding(x),allocation(p));
 if(['pending','acknowledged','reconcile','rollover'].includes(operation))x=await q.plan('finalize',binding(x),artifacts(x));
 if(['reconcile','rollover'].includes(operation)){await q.commitPlan(binding(x),staged);x=await q.read(pkg);}
 if(operation==='rollover')x=await q.plan('reconcile',binding(x),proof);
 if(operation!=='acknowledged')remote.lose();
 const action=()=>({reserve:()=>q.plan('reserve',null,p),startAllocation:()=>q.plan(operation,binding(x),{}),saveEdit:()=>q.plan(operation,binding(x),{editId:'one-edit'}),allocate:()=>q.plan(operation,binding(x),allocation(p)),finalize:()=>q.plan(operation,binding(x),artifacts(x)),pending:()=>q.commitPlan(binding(x),staged),acknowledged:()=>q.commitPlan(binding(x),staged),reconcile:()=>q.plan(operation,binding(x),proof),rollover:()=>q.plan(operation,binding(x),plan('124'))}[operation]());
 await assert.rejects(action);
 if(operation==='pending')assert.equal(calls,0);if(operation==='acknowledged')assert.equal(calls,1);
 const saved=await createMysqlJournal(remote).read(pkg);assert(saved);
 await assert.rejects(q.plan('reserve',null,plan('999')));
 if(x)await assert.rejects(action); // stale revision never repeats external work
}
// Unknown create-edit outcome and restart keep allocation_started locked.
{
 const remote=database(),q=createMysqlJournal(remote,capabilities);let x=await q.plan('reserve',null,plan());x=await q.plan('startAllocation',binding(x),{});
 const restarted=createMysqlJournal(remote,capabilities);assert.equal((await restarted.read(pkg)).state,'allocation_started');
 await assert.rejects(restarted.plan('reserve',null,plan('456')));await assert.rejects(restarted.plan('rollover',binding(x),plan('456')));
 await assert.rejects(restarted.plan('startAllocation',binding(x),{}));
}
// Missing/unverified authority never authorizes transition, regardless of input.
for(const cap of ['approvePlan','verifyInventory','verifyArtifacts','verifyStage','verifyReconciliation','approveRollover']){
 const remote=database();const q=createMysqlJournal(remote,capabilities);let x;
 if(cap==='approvePlan')x=null;
 else{x=await allocated(q);if(['verifyStage','verifyReconciliation','approveRollover'].includes(cap))x=await q.plan('finalize',binding(x),artifacts(x));if(['verifyReconciliation','approveRollover'].includes(cap)){await q.commitPlan(binding(x),staged);x=await q.read(pkg);}if(cap==='approveRollover')x=await q.plan('reconcile',binding(x),proof);}
 // Inventory proof needs edit_known, not an already allocated record.
 if(cap==='verifyInventory'){const saved=JSON.parse(remote.rows.get(key));delete saved.allocation;saved.state='edit_known';remote.rows.set(key,JSON.stringify(saved));x=saved;}
 for(const value of [undefined,async()=>false]){
  const c={...capabilities,[cap]:value},blocked=createMysqlJournal(remote,c);
  const op={approvePlan:'reserve',verifyInventory:'allocate',verifyArtifacts:'finalize',verifyStage:'pending',verifyReconciliation:'reconcile',approveRollover:'rollover'}[cap];
  const input=cap==='verifyArtifacts'?artifacts(x):{approvePlan:plan(),verifyInventory:allocation(plan()),verifyStage:staged,verifyReconciliation:proof,approveRollover:plan('124')}[cap];
  await assert.rejects(blocked.plan(op,x?binding(x):null,input));
 }
}
{
 const remote=database(),q=createMysqlJournal(remote,capabilities);let x=await allocated(q,plan('123','joint'));
 for(const corrupt of [artifacts(x).slice(0,1),artifacts(x).map(a=>({...a,sourceSha:'0'.repeat(40)})),artifacts(x).map(a=>({...a,versionCode:1}))])await assert.rejects(q.plan('finalize',binding(x),corrupt));
 await assert.rejects(q.plan('allocate',binding(x),allocation(plan())));
 await assert.rejects(q.plan('acknowledged',binding(x),{}));
 x=await q.plan('finalize',binding(x),artifacts(x));
 await assert.rejects(q.commitPlan(binding(x),staged));
 const mobileRemote=database();const mobile=createMysqlJournal(mobileRemote,capabilities);x=await allocated(mobile);x=await mobile.plan('finalize',binding(x),artifacts(x));
 const uncertain=createMysqlJournal(mobileRemote,{...capabilities,commitOnce:async()=>{throw Error('unknown');}});
 await uncertain.commitPlan(binding(x),staged);x=await mobile.read(pkg);assert.equal(x.state,'reconciliation_required');
 await assert.rejects(mobile.commitPlan(binding(x),staged));await assert.rejects(mobile.plan('rollover',binding(x),plan('124')));
}
// Only mobile/internal has a reviewed single-target policy. Reject other producers before pending/commit.
for(const producer of ['mobile','wear','joint']){
 for(const track of ['internal','wear:internal','qa','production']){
  const remote=database();let commits=0;
  const q=createMysqlJournal(remote,{...capabilities,commitOnce:async()=>{commits++;}});
  let x=await allocated(q,plan('123',producer));x=await q.plan('finalize',binding(x),artifacts(x));
  if(producer==='mobile'&&track==='internal'){await q.commitPlan(binding(x),{...staged,track});assert.equal(commits,1);}
  else{await assert.rejects(q.commitPlan(binding(x),{...staged,track}));assert.equal(commits,0);assert.equal((await q.read(pkg)).state,'finalized');}
 }
}
// Old schema cannot be overwritten/migrated; old APIs cannot mutate schema-v2.
{
 const remote=database(),q=createMysqlJournal(remote,capabilities);
 const intent={sourceSha:'a'.repeat(40),controllerSha:'b'.repeat(40),artifactSha256:'c'.repeat(64),runId:'123',versionCode:144201};
 const old=await q.reserve(pkg,'old',intent);await assert.rejects(q.plan('reserve',null,plan()));await assert.rejects(q.plan('startAllocation',{owner:'old',generation:1,revision:old.revision},{}));
 const v2=database(),next=createMysqlJournal(v2,capabilities);const x=await next.plan('reserve',null,plan());await assert.rejects(next.advance(pkg,x.owner,intent,x.revision,'edit_open'));
}
assert(db.calls.every(sql=>!/CREATE|ALTER|DROP|DELETE|TRUNCATE|UPSERT|REPLACE/i.test(sql)));
console.log('PASS: same-row planned allocation/finalization, two mobile generations, immutable history, shared-package races, all-boundary SQL loss, unknown edit/commit, legacy fail-closed; fictional capabilities only');
