import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readOperationalHistoryScope as scope,recordOperationalGateObservation as record,readOperationalGateHistory as read} from '../../server/concierge/operational-history.mjs';
import {inspectOperationalChange} from '../../server/concierge/operational-change-source.mjs';
const NOW=Date.parse('2099-10-06T06:00:00Z'),email='history@example.invalid',owner='CC-SYNTHETIC-HISTORY';
globalThis.fetch=()=>assert.fail('No external network');
export {fixture} from '../fixtures/operational-history-fixture.mjs';
import {fixture} from '../fixtures/operational-history-fixture.mjs';

test('OFF before DB; explicit transaction current-read required; no shipping caller or status enrollment',async()=>{
 const no=new Proxy({},{get(){throw Error('OFF touched DB');}});assert.equal(await scope(no,null),null);assert.equal(await read(no,null),null);assert.equal((await record(no,null,null)).status,'disabled');
 const f=fixture();await assert.rejects(scope(f.db,f.context,{enabled:true,now:NOW}));await assert.rejects(record(f.db,f.context,{field:'status'},{enabled:true}));
 const source=readFileSync(new URL('../../server/concierge/operational-history.mjs',import.meta.url),'utf8');assert.doesNotMatch(source,/fetch\(|setInterval\(|CREATE TABLE|ALTER TABLE|DELETE FROM|DROP TABLE/);
});
test('actual canonical reader, durable baseline/change and fresh module restart read; bounded projection',async()=>{
 const f=fixture();f.now=NOW+3000;assert.equal((await f.write('24',1000)).status,'baseline');assert.equal((await f.write('25',2000)).status,'advanced');
 const value=await f.read();assert.equal(inspectOperationalChange(value.source,value.scope,'gate',NOW+3000).status,'change');
 const again=await import('../../server/concierge/operational-history.mjs?restart');assert.deepEqual(await again.readOperationalGateHistory(f.db,f.context,{enabled:true,now:NOW+3000,lockSource:true}),value);
 assert.doesNotMatch(JSON.stringify([...f.states]),/MUST_NOT_PERSIST/);assert.equal([...f.states.values()].filter(row=>row.field==='gate'&&row.source).length,1);
});
test('receipt/source sequence, replay and equal-time conflict fail closed until new baseline',async()=>{
 const f=fixture();f.now=NOW+10000;await f.write('24',1000);await f.write('25',2000);const before=JSON.stringify([...f.states]);
 assert.equal((await f.write('25',2000)).status,'duplicate');assert.equal(JSON.stringify([...f.states]),before);assert.equal((await f.write('23',500)).status,'older');
 assert.equal((await f.write('26',2000)).status,'conflict');assert.equal(await f.read(),null);assert.equal((await f.write('25',2000)).status,'conflict');
 assert.equal((await f.write('27',3000)).status,'baseline');assert.equal((await f.read()).source.previousObservation,null);
});
test('revised canonical source cancels reader and rejects a late request ticket; new revision starts baseline',async()=>{
 const f=fixture();f.now=NOW+10000;const ticket=await f.scope();await f.write('24',1000,ticket);f.revision=NOW-30000;
 assert.equal(await f.read(),null);await assert.rejects(f.write('25',2000,ticket));assert.equal((await f.write('25',2000)).status,'baseline');
 f.owner='CC-OTHER-OWNER';await assert.rejects(f.read());
});
test('stale data and malformed previous record do not become fresh',async()=>{
 const f=fixture();f.now=NOW+3000;await f.write('24',1000);f.now=NOW+1803001;assert.equal(await f.read(),null);await assert.rejects(f.write('25',2000));
 const fresh=fixture();fresh.now=NOW+3000;await fresh.write('24',1000);[...fresh.states.values()].find(row=>row.field==='gate'&&row.source).source.observation=null;await assert.rejects(fresh.write('25',2000));
});
test('account erasure includes history namespace',async()=>{const {notificationStateDeletionStatements}=await import('../../server/v139/notificationStateDeletion.mjs');assert.match(notificationStateDeletionStatements(email).map(x=>x[0]).join(' '),/operational-source-history/);});

test('admitted departure gate and source route aliases remain valid after durable projection',async()=>{
 const f=fixture();f.now=NOW+3000;
 const aliases=o=>{o.departure={gate:o.gate,iata:o.origin};o.arrival={iata:o.destination};o.sourceOrigin=o.origin;o.sourceDestination=o.destination;delete o.gate;delete o.origin;delete o.destination;return o;};
 assert.equal((await f.write('24',1000,undefined,aliases)).status,'baseline');
 assert.equal((await f.read()).source.observation.gate,'24');
 assert.equal((await f.write('25',2000,undefined,aliases)).status,'advanced');
 const h=await f.read();assert.equal(inspectOperationalChange(h.source,h.scope,'gate',NOW+3000).status,'change');
});
