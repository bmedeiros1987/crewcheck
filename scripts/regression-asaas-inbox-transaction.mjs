import assert from 'node:assert/strict';
import {receiveAsaasEvent} from '../server/asaas-webhook-inbox.mjs';
import {createAsaasMemory} from './fixtures/asaas-inbox-memory.mjs';
globalThis.fetch=()=>{throw Error('External network forbidden');};
const event={id:'evt_synthetic_tx',event:'PAYMENT_CONFIRMED',dateCreated:'2026-10-09 14:54:00',payment:{id:'pay_synthetic',subscription:'sub_unknown',status:'CONFIRMED',confirmedDate:'2026-10-09'}};
for(const mode of ['success','action-failure','deadlock','commit-lost','commit-and-rollback-lost','rollback-lost','discard-missing','discard-failed']){
 const fixture=createAsaasMemory();let connections=0,releases=0,discards=0,insertions=0;
 const db={connect:async()=>{connections++;const c=await fixture.db.connect();let discarded=false;return {query:async(sql,p)=>{
  if(sql.startsWith('INSERT INTO crewcheck_asaas_webhook_inbox')){insertions++;if(mode==='deadlock'&&connections===1)throw Object.assign(Error('SYNTHETIC_DEADLOCK'),{code:'ER_LOCK_DEADLOCK'});if(['action-failure','rollback-lost','discard-missing','discard-failed'].includes(mode))throw Error('SYNTHETIC_ACTION');}
  if(sql==='COMMIT'&&mode.startsWith('commit-')){await c.query(sql,p);throw Object.assign(Error('SYNTHETIC_ACK_LOST'),{code:'ECONNRESET'});}
  if(sql==='ROLLBACK'&&['commit-and-rollback-lost','rollback-lost','discard-missing','discard-failed'].includes(mode))throw Error('SYNTHETIC_ROLLBACK');
  return c.query(sql,p);
 },release(){assert.equal(discarded,false);releases++;c.release();},...(mode==='discard-missing'?{}:{discard(){discards++;discarded=true;c.release();if(mode==='discard-failed')throw Error('SYNTHETIC_DISCARD');}})};}};
 if(['success','deadlock'].includes(mode)){
  const response=await receiveAsaasEvent(db,event);assert.equal(response.body.disposition,'quarantined');assert.equal(response.body.reconciled,false);assert.equal(connections,mode==='deadlock'?2:1);assert.equal(releases,connections);assert.equal(discards,0);
 }else{
  await assert.rejects(receiveAsaasEvent(db,event),e=>mode==='action-failure'?e.message==='SYNTHETIC_ACTION':e.status===503&&/^PROFILE_TX_/.test(e.code));
  assert.equal(connections,1);assert.equal(releases,mode==='action-failure'?1:0);assert.equal(discards,['action-failure','discard-missing'].includes(mode)?0:1);
 }
 const state=await fixture.state();assert.deepEqual(state.profiles,{});assert.deepEqual(state.subscriptions,[]);
 if(mode.startsWith('commit-'))assert.equal(Object.keys(state.receipts).length,1,'committed quarantine survives lost acknowledgement');
 assert.equal(insertions,mode==='deadlock'?2:1);
}
console.log('PASS Asaas inbox transaction:8 synthetic failure/success modes; no uncertain release/retry or access grant');
