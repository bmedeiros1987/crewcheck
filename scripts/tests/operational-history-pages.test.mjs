import test from 'node:test';
import assert from 'node:assert/strict';
import {appendGateArchivePage as append,readGateArchivePage as read,GATE_ARCHIVE_PAGE_SIZE} from '../../server/concierge/operational-history-pages.mjs';
const context={email:'owner-a@example.invalid',owner:'CC-SYNTHETIC-OWNER-A'};
const identity={flight:'LA4774',origin:'BSB',destination:'AJU',departureDate:'2032-10-31',scheduledDepartureUtc:'2032-10-31T15:00:00.000Z'};
const scope={ownerId:context.owner,identity,rosterRevision:'a'.repeat(64)},time=Date.parse('2032-10-31T12:00:00Z');
const observation=(i,over={})=>({gate:String(10+i%900),provider:'custom',observedAt:null,sourceUpdatedAt:new Date(time+i*1000).toISOString(),receivedAt:new Date(time+i*1000+100).toISOString(),...over});
function fixture(){const rows=new Map();let reads=0,writes=0,failAt=Infinity;
 const io={readState:async(_,key)=>{reads++;return rows.has(key)?structuredClone(rows.get(key)):null;},writeState:async(_,key,value)=>{if(++writes===failAt)throw Error('synthetic storage failure');rows.set(key,structuredClone(value));}};
 return {rows,io,counts:()=>({reads,writes}),reset:()=>{reads=0;writes=0;},fail:n=>{failAt=n;},
 async atomic(run){const before=structuredClone(rows);try{return await run();}catch(e){rows.clear();for(const [k,v]of before)rows.set(k,v);throw e;}}};}
globalThis.fetch=()=>assert.fail('No historical/provider network');
test('1100 records use fixed pages and indexed operations; bounded read and append without dropping older pages',async()=>{
 const f=fixture();let maxRow=0;
 for(let i=0;i<1100;i++){f.reset();assert.equal((await append(null,context,scope,observation(i),f.io)).stored,true);const c=f.counts();assert.ok(c.reads<=5);assert.ok(c.writes<=5);}
 for(const value of f.rows.values())maxRow=Math.max(maxRow,Buffer.byteLength(JSON.stringify(value)));
 assert.ok(maxRow<50000,`largest row ${maxRow}`);let cursor=0,total=0;
 do{f.reset();const page=await read(null,context,identity,{cursor,readState:f.io.readState});assert.ok(f.counts().reads<=102);assert.equal(page.order,'recorded-sequence');assert.equal(page.currentConfirmation,false);assert.equal(page.observations.length,GATE_ARCHIVE_PAGE_SIZE);total+=page.observations.length;cursor=page.nextCursor;}while(cursor!==null);
 assert.equal(total,1100);assert.equal((await read(null,context,identity,{readState:f.io.readState})).observations[0].sequence,1);
});
test('conflict index crosses pages; source update is not physical observation; late source keeps explicit recorded order',async()=>{
 const f=fixture();for(let i=0;i<101;i++)await append(null,context,scope,observation(i),f.io);
 await append(null,context,{...scope,rosterRevision:'b'.repeat(64)},observation(0,{gate:'99',receivedAt:new Date(time+200000).toISOString()}),f.io);
 const first=await read(null,context,identity,{readState:f.io.readState}),last=await read(null,context,identity,{cursor:1,readState:f.io.readState});
 assert.equal(first.observations[0].conflicted,true);assert.equal(last.observations[1].conflicted,true);
 assert.equal(last.observations[1].observedAt,null);assert.equal(last.observations[1].sourceUpdatedAt,observation(0).sourceUpdatedAt);
 assert.equal(last.observations[1].outOfOrder,true);assert.equal(last.observations[1].sequence,102);
});
test('reported null observation/update clocks, dedup without receipt renewal and return to previous gate',async()=>{
 const f=fixture(),a=observation(0,{provider:'flightaware',sourceUpdatedAt:null});
 await append(null,context,scope,a,f.io);const before=JSON.stringify([...f.rows]);
 assert.equal((await append(null,context,scope,{...a,receivedAt:new Date(time+2000).toISOString()},f.io)).stored,false);assert.equal(JSON.stringify([...f.rows]),before);
 await append(null,context,scope,{...a,gate:'18',receivedAt:new Date(time+3000).toISOString()},f.io);
 await append(null,context,scope,{...a,receivedAt:new Date(time+4000).toISOString()},f.io);
 const page=await read(null,context,identity,{readState:f.io.readState});assert.deepEqual(page.observations.map(x=>x.gate),['10','18','10']);
 assert.ok(page.observations.every(x=>x.observedAt===null&&x.sourceUpdatedAt===null));
});
test('exact occurrence/user separation, transaction failure rollback and no silent page truncation',async()=>{
 const f=fixture();await append(null,context,scope,observation(0),f.io);
 assert.equal(await read(null,{email:'owner-b@example.invalid',owner:'CC-SYNTHETIC-OWNER-B'},identity,{readState:f.io.readState}),null);
 assert.equal(await read(null,context,{...identity,scheduledDepartureUtc:'2032-11-01T15:00:00Z',departureDate:'2032-11-01'},{readState:f.io.readState}),null);
 const before=JSON.stringify([...f.rows]);f.reset();f.fail(3);
 await assert.rejects(f.atomic(()=>append(null,context,scope,observation(1),f.io)));assert.equal(JSON.stringify([...f.rows]),before);
 await assert.rejects(read(null,context,identity,{cursor:99,readState:f.io.readState}));
 await assert.rejects(append(null,context,scope,{...observation(2),observedAt:observation(2).sourceUpdatedAt},f.io));
});
