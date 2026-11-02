import test from 'node:test';
import assert from 'node:assert/strict';
import * as history from '../../server/concierge/operational-history.mjs';
import {fixture} from './operational-history.test.mjs';
const NOW=Date.parse('2099-10-06T06:00:00Z'),DAY=86400000;
const archived=(f,identity)=>history.readArchivedOperationalGateHistory(f.db,f.context,identity,{enabled:true,lockSource:true});
test('archive retains every admitted change, restart, exact duplicate without renewal and older sample refusal',async()=>{
 const f=fixture();f.now=NOW+10000;const ticket=await f.scope();
 for(const [gate,offset] of [['24',1000],['25',2000],['26',3000]])await f.write(gate,offset);
 assert.ok([...f.states.values()].some(row=>row.kind==='gate-archive-index'),'Historical observations must survive beyond current/previous pair');
 const result=await archived(f,ticket.identity);
 assert.deepEqual(result.observations.map(x=>x.gate),['24','25','26']);
 assert.equal(result.kind,'historical-gate-records');assert.equal(result.currentConfirmation,false);
 assert.equal(result.observations[0].provider,'custom');
 assert.equal(result.observations[0].sourceUpdatedAt,new Date(NOW+1000).toISOString());
 assert.equal(result.observations[0].receivedAt,new Date(NOW+1100).toISOString());
 const before=JSON.stringify([...f.states]);await f.write('26',3000);assert.equal(JSON.stringify([...f.states]),before);
 assert.equal((await f.write('23',500)).status,'older');assert.equal(JSON.stringify([...f.states]),before);
 const restarted=await import('../../server/concierge/operational-history.mjs?archive-restart');
 assert.deepEqual(await restarted.readArchivedOperationalGateHistory(f.db,f.context,ticket.identity,{enabled:true,lockSource:true}),result);
 result.observations[0].gate='99';assert.equal((await archived(f,ticket.identity)).observations[0].gate,'24');
});
test('revision does not erase archive; historical read has zero source/roster/network queries and never confirms current',async()=>{
 const f=fixture();f.now=NOW+10000;const ticket=await f.scope();await f.write('24',1000);
 f.revision=NOW-30000;assert.equal(await f.read(),null);
 f.queries.length=0;const result=await archived(f,ticket.identity);assert.equal(result.observations.length,1);
 assert.equal(result.currentConfirmation,false);assert.equal(f.queries.length,4);
 assert.ok(f.queries.every(sql=>sql.startsWith('SELECT p.public_id')||sql.startsWith('SELECT payload')));
 await assert.rejects(f.write('25',2000,ticket));await f.write('25',2000);
 assert.equal((await archived(f,ticket.identity)).observations.length,2);
});
test('same flight number across month retains separate exact occurrences without historical API',async()=>{
 const f=fixture();f.roster.days[0].date='31/10/2099';f.roster.days[0].dayNumber=31;f.now=NOW+25*DAY+10000;
 const october=await f.scope();await f.write('24',25*DAY+1000);
 f.roster.month=11;Object.assign(f.roster.days[0],{date:'01/11/2099',dayNumber:1,month:11});f.revision=NOW+25*DAY;f.now=NOW+26*DAY+10000;
 const november=await f.scope();await f.write('25',26*DAY+1000);
 assert.equal((await archived(f,october.identity)).observations[0].gate,'24');
 assert.equal((await archived(f,november.identity)).observations[0].gate,'25');
 assert.notEqual(october.identity.scheduledDepartureUtc,november.identity.scheduledDepartureUtc);
 assert.equal(await archived(f,{...october.identity,destination:'REC'}),null);
});
test('owner incarnation, account isolation, absence and deletion fail closed',async()=>{
 const f=fixture();f.now=NOW+10000;const ticket=await f.scope();assert.equal(await archived(f,ticket.identity),null);
 await f.write('24',1000);f.owner='CC-OTHER-OWNER';await assert.rejects(archived(f,ticket.identity));
 const other=fixture();other.now=NOW+10000;assert.equal(await archived(other,ticket.identity),null);
 f.owner=f.context.owner;f.states.clear();assert.equal(await archived(f,ticket.identity),null);
 assert.equal(await history.readArchivedOperationalGateHistory(null,null,null),null,'OFF before any access');
});
test('equal source instant keeps both conflicting observations as historical, never a current gate',async()=>{
 const f=fixture();f.now=NOW+10000;const ticket=await f.scope();await f.write('24',1000);
 assert.equal((await f.write('25',1000)).status,'conflict');assert.equal(await f.read(),null);
 const history=await archived(f,ticket.identity);assert.deepEqual(history.observations.map(x=>x.gate),['24','25']);
 assert.ok(history.observations.every(x=>x.conflicted));assert.equal(history.currentConfirmation,false);
});

test('legacy archive remains immutable and consultable by bounded SQL projections after new paged writes',async()=>{
 const {telegramOperationalAuthority:authority}=await import('../../server/concierge/telegram-briefing.mjs');
 const f=fixture();f.now=NOW+10000;const ticket=await f.scope();
 const identity=Object.fromEntries(['flight','origin','destination','departureDate','scheduledDepartureUtc'].map(k=>[k,ticket.identity[k]]));identity.scheduledDepartureUtc=new Date(identity.scheduledDepartureUtc).toISOString();
 const oldKey='operational-source-history:'+authority.hash(f.context.owner),archiveKey=authority.hash(identity);
 const observations=Array.from({length:1100},(_,n)=>({gate:String(10+n%900),provider:'custom',observedAt:new Date(NOW-2000+n).toISOString(),receivedAt:new Date(NOW-1000+n).toISOString(),rosterRevision:'a'.repeat(64)}));
 const old={version:1,email:f.context.email,owner:f.context.owner,field:'gate',archive:{[archiveKey]:{identity,observations}}};f.states.set(oldKey,structuredClone(old));
 const page=await history.readArchivedOperationalGateHistory(f.db,f.context,identity,{enabled:true,lockSource:true,cursor:5,legacy:true});
 assert.equal(page.legacy,true);assert.equal(page.observations.length,100);assert.equal(page.total,1100);assert.equal(page.nextCursor,6);
 assert.equal(page.observations[0].sourceUpdatedAt,observations[500].observedAt);assert.equal(page.observations[0].observedAt,null);assert.equal(page.observations[0].conflicted,null);
 await f.write('24',1000);assert.deepEqual(f.states.get(oldKey),old,'No rewrite, removal or truncation of prior history');
 assert.equal((await history.readArchivedOperationalGateHistory(f.db,f.context,identity,{enabled:true,lockSource:true,legacy:true})).total,1100);
});

test('pre-archive current/previous evidence remains consultable as explicitly partial historical data',async()=>{
 const {telegramOperationalAuthority:authority}=await import('../../server/concierge/telegram-briefing.mjs');
 const f=fixture();f.now=NOW+10000;const ticket=await f.scope();await f.write('24',1000);await f.write('25',2000);
 const old=structuredClone([...f.states.values()].find(row=>row.field==='gate'&&row.source));f.states.clear();f.states.set('operational-source-history:'+authority.hash(f.context.owner),old);
 const result=await history.readArchivedOperationalGateHistory(f.db,f.context,ticket.identity,{enabled:true,lockSource:true,legacy:true});
 assert.equal(result.coverage,'stored-current-previous-only');assert.equal(result.currentConfirmation,false);assert.deepEqual(result.observations.map(row=>row.gate),['24','25']);
 assert.ok(result.observations.every(row=>row.observedAt===null));assert.equal(f.states.size,1);
});
