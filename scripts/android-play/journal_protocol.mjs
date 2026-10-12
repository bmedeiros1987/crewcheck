// Inactive serialized executor/journal contract. No listener, CLI or credentials.
import assert from 'node:assert/strict';
import {coordinatedCommit} from './mysql_journal.mjs';
import {reconcileAcknowledged,verifyCompleteReleaseObservation} from './reconcile_journal.mjs';
const fields=['sourceSha','controllerSha','runId','artifactSha256','versionCode'];
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}':JSON.stringify(value);
const exactKeys=(value,keys)=>{assert(value&&Object.getPrototypeOf(value)===Object.prototype);assert.deepEqual(Object.keys(value).sort(),keys.sort());};
export function createJournalProtocol({journal,binding,authorize,lifecycle}){
  // Trusted capability/binding comes from the embedding executor, never JSON or
  // environment. No real executor supplies it in this repository.
  assert(journal&&typeof journal.read==='function'&&typeof journal.reserve==='function'&&typeof journal.advance==='function');
  assert.equal(typeof authorize,'function');
  exactKeys(binding,['package','owner','producer',...fields]);
  assert.equal(binding.package,'com.crewcheck.app');
  assert(['mobile','wear','allocator'].includes(binding.producer));
  assert(/^[A-Za-z0-9:_-]{1,128}$/.test(binding.owner));
  for(const f of ['sourceSha','controllerSha'])assert(/^[0-9a-f]{40}$/.test(binding[f]));
  assert(/^[1-9][0-9]*$/.test(binding.runId));assert(/^[0-9a-f]{64}$/.test(binding.artifactSha256));
  assert(Number.isSafeInteger(binding.versionCode)&&binding.versionCode>0&&binding.versionCode<2100000000);
  const pinned=structuredClone(binding),seen=new Set();
  // Optional trusted executor callbacks, absent in all live configurations.
  // Request JSON cannot supply readers, commit outcomes or a capability flag.
  const capabilities=lifecycle?Object.freeze({commitOnce:lifecycle.commitOnce,readStagedState:lifecycle.readStagedState,readCompleteState:lifecycle.readCompleteState}):null;
  return async serialized=>{
    let id=null;
    try{
      assert(typeof serialized==='string'&&Buffer.byteLength(serialized)<=16384);
      const request=JSON.parse(serialized);
      exactKeys(request,['schema','id','operation','binding','revision','state','intent']);
      assert.equal(canonical(request),serialized,'Canonical frame required; duplicates rejected');
      assert.equal(request.schema,1);assert(/^[A-Za-z0-9_-]{1,128}$/.test(request.id));id=request.id;
      assert(!seen.has(id),'Request replay blocked');seen.add(id);
      assert.deepEqual(request.binding,pinned,'Foreign executor binding');
      assert(['read','reserve','advance','commit','reconcile'].includes(request.operation));
      const helperOperation=['commit','reconcile'].includes(request.operation);
      if(helperOperation){
        assert(capabilities&&pinned.producer==='mobile','Mobile lifecycle only; Wear writer adoption requires its reviewed track policy');
        if(request.operation==='commit')assert(typeof capabilities.commitOnce==='function'&&typeof capabilities.readStagedState==='function');
        else assert.equal(typeof capabilities.readCompleteState,'function');
      }
      assert(Number.isSafeInteger(request.revision)&&request.revision>=0);
      const allowed=[...fields,'editId','track','expectedTrackSha256','otherTracksBeforeSha256','reconciliationSha256'];
      assert(request.intent&&Object.getPrototypeOf(request.intent)===Object.prototype);
      assert(Object.keys(request.intent).every(k=>allowed.includes(k)));
      for(const f of fields)assert.equal(request.intent[f],pinned[f]);
      if(request.intent.editId!==undefined)assert(/^[A-Za-z0-9_-]{1,128}$/.test(request.intent.editId));
      if(request.intent.track!==undefined)assert(['qa','internal'].includes(request.intent.track));
      for(const f of ['expectedTrackSha256','otherTracksBeforeSha256','reconciliationSha256'])if(request.intent[f]!==undefined)assert(/^[0-9a-f]{64}$/.test(request.intent[f]));
      if(request.operation==='advance')assert(['edit_open','pending','reconciliation_required'].includes(request.state)&&request.revision>0);
      else assert.equal(request.state,null);
      if(request.operation==='reserve')assert.equal(request.revision,0);
      if(helperOperation){
        assert(request.revision>0);
        for(const f of ['editId','track','expectedTrackSha256','otherTracksBeforeSha256'])assert(request.intent[f]);
        assert(!Object.hasOwn(request.intent,'reconciliationSha256'));
      }
      // This trusted callback must verify review/live allocation/artifact identity
      // and authoritative transition evidence. Serialized flags cannot authorize.
      assert.equal(await authorize(structuredClone(request)),true,'Executor capability refused');
      let record,helperResult,observation=null;
      if(request.operation==='reserve')record=await journal.reserve(pinned.package,pinned.owner,request.intent);
      else{
        const current=await journal.read(pinned.package);
        if(current){assert.equal(current.owner,pinned.owner);assert.equal(current.revision,request.revision);for(const f of fields)assert.equal(current.intent[f],pinned[f]);}
        else assert(request.operation==='read'&&request.revision===0);
        if(helperOperation){
          assert(current);
          exactKeys(current,['package','owner','revision','state','intent']);
          for(const [field,value] of Object.entries(current.intent))assert.equal(request.intent[field],value,'Bound lifecycle intent changed');
          if(request.operation==='commit'){
            assert.equal(current.state,'edit_open');
            const staged={...current,intent:structuredClone(request.intent)};
            helperResult=await coordinatedCommit(journal,staged,async()=>{
              const pending={...staged,revision:staged.revision+1,state:'pending'};
              // Pending SQL acknowledgement precedes reader and store callback.
              verifyCompleteReleaseObservation(pending,await capabilities.readStagedState(structuredClone(pending)));
              await capabilities.commitOnce(structuredClone(pending));
            });
          }else{
            assert.equal(current.state,'acknowledged');
            helperResult=await reconcileAcknowledged(journal,current,async expected=>{
              observation=await capabilities.readCompleteState(expected);return observation;
            });
          }
          record=Object.fromEntries(['package','owner','revision','state','intent'].map(f=>[f,helperResult[f]]));
          assert.deepEqual(await journal.read(pinned.package),record,'Helper durable readback uncertain');
        }else record=request.operation==='read'?current:await journal.advance(pinned.package,pinned.owner,request.intent,request.revision,request.state);
      }
      const response={schema:1,id,status:'ok',record,retryAllowed:false,storeAvailability:'unknown'};
      if(helperOperation)Object.assign(response,{helperResult,observation});
      return canonical(response);
    }catch{return canonical({schema:1,id,status:'blocked',record:null,retryAllowed:false,storeAvailability:'unknown'});}
  };
}
