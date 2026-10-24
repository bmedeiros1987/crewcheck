import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {fixture,sender,recipient,epoch,secrets} from './fixtures/infobip-production-sql.mjs';
import {configureSyntheticOperationalPilot,configureSyntheticPilotRenewal} from './fixtures/infobip-operational-pilot.mjs';
import {createOperationalPilotScope,operationalPilotApprovalDigest} from '../server/infobip-whatsapp-operational-pilot.mjs';
import {createInfobipPilotRenewalAdmission} from '../server/infobip-whatsapp-pilot-renewal.mjs';
import {createInfobipSendAdmission} from '../server/infobip-whatsapp-admission.mjs';
import {createInfobipSqlBudget} from '../server/infobip-whatsapp-sql-budget.mjs';
globalThis.fetch=()=>assert.fail('NO_EXTERNAL_CALL');
const H=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
async function seeded(){
 const {state,db}=fixture(),f=configureSyntheticOperationalPilot({state,db,stats:{},dependencies:{configuration:{sender},admission:{recipients:[recipient]}}});
 const a=f.dependencies.admission,original=createInfobipSendAdmission(a,{sender,now:()=>state.clock});
 const tx=createInfobipSqlBudget(db);for(let i=0;i<2;i++)assert.equal(await tx(c=>original.reserve(c,{sender,recipient})),true);
 const quotaKey='crewcheck-infobip-admission-v1:'+H([sender,a.id]),originalState=structuredClone(state.rows.get(quotaKey));
 for(const [i,text]of ['/menu','/proximo'].entries()){
  state.rows.set('crewcheck-infobip-pilot-v1:'+H([sender,a.id,recipient,text]),{v:1,kind:'infobip_operational_pilot_slot',used:true});
  state.rows.set('crewcheck-infobip-inbound-v1:'+H(['synthetic-prior',i]),{v:1,status:'delivered',ownerHash:createHmac('sha256',secrets.linkHashKey).update(state.owner).digest('hex'),report:{attemptAt:epoch+i*1000,deliveryStatusId:5,senderHash:createHmac('sha256',secrets.linkHashKey).update(sender).digest('hex'),recipientHash:createHmac('sha256',secrets.linkHashKey).update(recipient).digest('hex')}});
 }
 configureSyntheticPilotRenewal(f);
 const scope=createOperationalPilotScope(f.dependencies.configuration,a,{now:()=>state.clock});
 const quantity=()=>createInfobipPilotRenewalAdmission(f.dependencies.configuration,a,{linkHashKey:secrets.linkHashKey,now:()=>state.clock});
 const job={sender,recipient,text:'Que horas a van me busca no hotel?',receivedAt:state.clock,bindingStamp:JSON.stringify([state.owner])};
 return {...f,scope,quantity,job,quotaKey,originalState,tx,reserve:(override=job)=>tx(c=>scope.reserve(c,override,quantity().reserve))};
}
const f=await seeded();
assert.equal(f.scope.allows({...f.job,text:'menu'}),false,'renewal is pickup only');
assert.equal(f.scope.allows({...f.job,receivedAt:epoch}),false,'old-window inbound cannot replay into renewal');
const results=await Promise.all(Array.from({length:8},()=>f.reserve()));assert.equal(results.filter(Boolean).length,1);
const row=f.state.rows.get(f.quotaKey);assert.equal(row.used,3);assert.equal(row.limit,3);
assert.equal(row.digest,f.originalState.digest);assert.equal(row.validUntil,f.originalState.validUntil);
assert.equal(row.execution.revision,1);assert.equal(row.execution.previousRevision,0);assert.equal(row.execution.startingUsed,2);
assert.equal(row.execution.authorizationReference,'synthetic-explicit-human-renewal');
assert.equal(await f.reserve({...f.job,text:'q hrs a van me pega no hotel?'}),false);
assert.equal(f.state.rows.size,6,'no extra quota ID or second category slot');
for(const status of ['uncertain','dispatching','preparing','accepted_unconfirmed']){
 const x=await seeded();[...x.state.rows.values()].find(r=>r.status==='delivered').status=status;
 assert.equal(await x.reserve(),false);assert.equal(x.state.rows.get(x.quotaKey).used,2);assert.equal(x.state.rows.get(x.quotaKey).execution,undefined);
}
for(const mutate of [
 x=>x.state.rows.delete(x.quotaKey),x=>x.state.rows.get(x.quotaKey).digest='0'.repeat(64),
 x=>x.state.rows.get(x.quotaKey).used=3,x=>x.state.rows.get(x.quotaKey).execution={revision:1},
 x=>[...x.state.rows.values()].find(r=>r.status==='delivered').engineActive=true,
 x=>[...x.state.rows.values()].find(r=>r.status==='delivered').report.recipientHash='0'.repeat(64),
 x=>[...x.state.rows.values()].find(r=>r.status==='delivered').report.senderHash='0'.repeat(64),
 ]){const x=await seeded();mutate(x);assert.equal(await x.reserve(),false);}
const expired=await seeded();expired.state.clock=expired.dependencies.configuration.operationalPilotRenewal.validUntil;assert.equal(await expired.reserve(),false);
const foreign=await seeded();assert.equal(await foreign.reserve({...foreign.job,bindingStamp:JSON.stringify(['other-owner'])}),false);
for(const mutate of [
 x=>x.dependencies.configuration.operationalPilotRenewal.revision=2,
 x=>x.dependencies.configuration.operationalPilotRenewal.expectedRevision=1,
 x=>x.dependencies.configuration.operationalPilotRenewal.expectedUsed=0,
 x=>x.dependencies.configuration.operationalPilotRenewal.validUntil+=900001,
 x=>x.dependencies.configuration.operationalPilotRenewal.authorizationReference='',
 x=>x.dependencies.admission.ownerSha256='0'.repeat(64),x=>x.dependencies.admission.maxAttempts=4,
 ]){const x=await seeded();mutate(x);assert.throws(()=>x.quantity());}
const changed=await seeded();changed.dependencies.admission.recipients=['12025550104'];changed.dependencies.configuration.operationalPilotRenewal.expectedScopeDigest=operationalPilotApprovalDigest(changed.dependencies.configuration,changed.dependencies.admission);
assert.equal(await changed.quantity().reserve({query:()=>assert.fail('changed recipient cannot match job')},changed.job),false);
const cas=await seeded();cas.state.failRenewalCAS=true;await assert.rejects(cas.reserve(),/STATE_UNAVAILABLE/);assert.equal(cas.state.rows.get(cas.quotaKey).used,2);assert.equal(cas.state.rows.get(cas.quotaKey).execution,undefined);
console.log('PASS one revision/CAS pickup renewal, preserved original digest and 2/3->3/3, concurrent aliases, old-window replay, expiry, scope/owner/cap changes, unknown history and failed CAS; externalCalls=0');
