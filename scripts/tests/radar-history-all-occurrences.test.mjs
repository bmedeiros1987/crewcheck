import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './operational-history.test.mjs';
import * as history from '../../server/concierge/operational-history.mjs';
import {buildCanonicalRosterEvents} from '../../server/concierge/generated/canonicalRoster.mjs';
import {originFlightDate} from '../../shared/gate-query-day.mjs';
import {beginRadarOperationalHistory,handleRadarGateHistory} from '../../server/concierge/radar-history-capture.mjs';
import {telegramOperationalAuthority as authority} from '../../server/concierge/telegram-briefing.mjs';
const NOW=Date.parse('2099-10-06T06:00:00Z');
function setup(){const f=fixture();f.now=NOW+10000;f.roster.crewId='QA001';f.roster.days[0].legs.push({id:'synthetic-second',flightNumber:'LA4321',origin:'BSB',destination:'GRU',departureTime:'09:30',arrivalTime:'11:30',workType:'OP'});return f;}
const identities=f=>buildCanonicalRosterEvents(f.roster).filter(e=>e.kind==='flight').map(e=>({flight:e.flightNumber,origin:e.origin,destination:e.destination,departureDate:originFlightDate(e.startDateTime,e.origin),scheduledDepartureUtc:e.startDateTime}));
const ticket=(f,i)=>history.readRadarGateArchiveScope(f.db,f.context,{enabled:true,lockSource:true,now:NOW+10000,identity:i});
const reported=(i,provider='cirium-flex',gate='18')=>({ok:true,...i,provider,gate,sourceReceivedAt:NOW,gateUpdate:null,provenance:{fields:{departureGate:{provider,value:gate,observedAt:null,receivedAt:new Date(NOW).toISOString(),coverageState:'provided_no_source_freshness'}}}});
test('all canonical flights, not just next duty first leg; received-only Flex/FlightAware history never gains observation',async()=>{
 const f=setup(),all=identities(f);assert.equal(all.length,2);
 for(const [n,i]of all.entries()){
  const expectedScope=await ticket(f,i);const payload=reported(i,n?'flightaware':'cirium-flex',n?'19':'18');
  const input={expectedScope,field:'gate',observation:payload};
  assert.equal((await history.recordRadarGateArchive(f.db,f.context,input,{enabled:true,clock:()=>NOW+10000})).stored,true);
  const saved=await history.readArchivedOperationalGateHistory(f.db,f.context,i,{enabled:true,lockSource:true});
  assert.equal(saved.observations[0].provider,payload.provider);assert.equal(saved.observations[0].observedAt,null);assert.equal(saved.observations[0].sourceUpdatedAt,null);
  assert.equal(saved.observations[0].receivedAt,new Date(NOW).toISOString());assert.equal(saved.currentConfirmation,false);
 }
});
test('actual capture commits existing reported result without extra provider and revalidates account/revision',async()=>{
 const f=setup(),i=identities(f)[1];let owner=f.context.owner,identifies=0;
 const identify=async()=>{identifies++;return {db:f.db,email:f.context.email,profile:{public_id:owner},payload:{iss:'crewcheck',aud:'crewcheck-web',sub:owner,email:f.context.email,exp:(NOW+86400000)/1000}};};
 const options={enabled:true,identify,clock:()=>NOW+10000,loadRuntime:async()=>({history:{...history,OPERATIONAL_HISTORY_ENABLED:true},authority})};
 const capture=await beginRadarOperationalHistory({headers:{authorization:"Bearer synthetic-A"}},i,options);assert.ok(capture);
 assert.equal((await capture.commit(reported(i,'flightaware'))).stored,true);assert.equal(identifies,2);
 assert.equal((await capture.commit(reported(i))).stored,false);
 const late=await beginRadarOperationalHistory({headers:{authorization:"Bearer synthetic-A"}},i,options);owner='CC-REPLACED-OWNER';assert.equal((await late.commit(reported(i))).status,'context_changed');
});
test('historical authenticated route only SELECTs and exposes paged history; OFF before identity and no provider call',async()=>{
 const f=setup(),i=identities(f)[1],expectedScope=await ticket(f,i);
 await history.recordRadarGateArchive(f.db,f.context,{expectedScope,field:'gate',observation:reported(i)},{enabled:true,clock:()=>NOW+10000});
 let status,body,owner=f.context.owner;
 const res=()=>({writableEnded:false,writeHead(s){status=s;},end(s){body=JSON.parse(s);this.writableEnded=true;}});
 const url=new URL('https://synthetic.invalid/api/radar-history');for(const [k,v]of Object.entries(i))url.searchParams.set(k,v);
 const identify=async()=>({db:f.db,email:f.context.email,profile:{public_id:owner},payload:{iss:'crewcheck',aud:'crewcheck-web',sub:owner,email:f.context.email,exp:(NOW+86400000)/1000}});
 const options={enabled:true,identify,clock:()=>NOW+10000,loadRuntime:async()=>({history:{...history,OPERATIONAL_HISTORY_ENABLED:true},authority})};
 f.queries.length=0;await handleRadarGateHistory({method:'GET'},res(),url,options);assert.equal(status,200);assert.equal(body.history.currentConfirmation,false);assert.ok(f.queries.every(q=>q.startsWith('SELECT')));
 await handleRadarGateHistory({method:'GET'},res(),url,{identify:()=>assert.fail('OFF identity')});assert.equal(status,503);assert.equal(body.code,'GATE_HISTORY_DISABLED');
});

test('October occurrence remains admissible with November active; changed revision and foreign owner refuse writes',async()=>{
 const f=setup(),i=identities(f)[1];const october=structuredClone(f.roster),november=structuredClone(f.roster);november.month=11;november.days=[{...november.days[0],date:'06/11/2099',month:11}];
 f.publications.push({id:'october',owner_email:f.context.email,roster_key:'2099-10',roster:october,active:false,updated_at:new Date(NOW-60000).toISOString()},{id:'november',owner_email:f.context.email,roster_key:'2099-11',roster:november,active:true,updated_at:new Date(NOW-60000).toISOString()});
 const expectedScope=await ticket(f,i);assert.ok(expectedScope);
 f.publications[0].updated_at=new Date(NOW-30000).toISOString();
 await assert.rejects(history.recordRadarGateArchive(f.db,f.context,{expectedScope,field:'gate',observation:reported(i)},{enabled:true,clock:()=>NOW+10000}));assert.equal(f.states.size,0);
 f.publications[0].owner_email='other@example.invalid';await assert.rejects(ticket(f,i));assert.equal(f.states.size,0);
});
test('post-await session invalidation rolls back page/index writes, not just the returned result',async()=>{
 const f=setup(),i=identities(f)[1],expectedScope=await ticket(f,i);let checks=0;
 await assert.rejects(history.recordRadarGateArchive(f.db,f.context,{expectedScope,field:'gate',observation:reported(i)},{enabled:true,clock:()=>NOW+10000,revalidate:async()=>++checks<2}));
 assert.equal(checks,2);assert.equal(f.states.size,0);
});

test('real capture detects credential replacement during DB await without taking another pooled connection',async()=>{
 const f=setup(),i=identities(f)[1],req={headers:{authorization:'Bearer synthetic-A'}};let identifies=0;
 const identify=async()=>{identifies++;return {db:f.db,email:f.context.email,profile:{public_id:f.context.owner},payload:{iss:'crewcheck',aud:'crewcheck-web',sub:f.context.owner,email:f.context.email,exp:(NOW+86400000)/1000}};};
 const options={enabled:true,identify,clock:()=>NOW+10000,loadRuntime:async()=>({history:{...history,OPERATIONAL_HISTORY_ENABLED:true},authority})};
 const capture=await beginRadarOperationalHistory(req,i,options);const original=f.db.getConnection;
 f.db.getConnection=async()=>{const c=await original();const query=c.query;c.query=async(...args)=>{const value=await query(...args);if(args[0].startsWith('SELECT id,owner_email'))req.headers.authorization='Bearer synthetic-B';return value;};return c;};
 assert.equal((await capture.commit(reported(i))).status,'unavailable');assert.equal(f.states.size,0);assert.equal(identifies,2);
});

test('archive normalizes only existing accepted gate formats, without broadening notification admission',async()=>{
 const f=setup(),i=identities(f)[0],expectedScope=await ticket(f,i);
 const value=reported(i,'cirium-flex','b-12');
 await history.recordRadarGateArchive(f.db,f.context,{expectedScope,field:'gate',observation:value},{enabled:true,clock:()=>NOW+10000});
 const custom={ok:true,provider:'custom',...i,gate:'GATE B-12',sourceReceivedAt:NOW,departureGateUpdate:{schema:'crewcheck.departure-gate-update.v1',...i,gate:'GATE B-12',updatedAt:new Date(NOW-1000).toISOString()}};
 await history.recordRadarGateArchive(f.db,f.context,{expectedScope,field:'gate',observation:custom},{enabled:true,clock:()=>NOW+10000});
 const page=await history.readArchivedOperationalGateHistory(f.db,f.context,i,{enabled:true,lockSource:true});
 assert.deepEqual(page.observations.map(row=>row.gate),['B-12','B-12']);assert.ok(page.observations.every(row=>row.observedAt===null));
 assert.equal(page.observations[0].sourceUpdatedAt,null);assert.equal(page.observations[1].sourceUpdatedAt,new Date(NOW-1000).toISOString());
 assert.equal(await f.read(),null,'The narrower operational notification contract remains unpopulated');
});
