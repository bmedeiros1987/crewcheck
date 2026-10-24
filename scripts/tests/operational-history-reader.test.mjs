import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createOperationalHistoryReader,readTelegramOperationalHistory} from '../../server/concierge/operational-history-reader.mjs';
test('shipping OFF before DB/options; callers cannot enable the reader',async()=>{
 const no=new Proxy({},{get(){assert.fail('OFF touched dependency');}});
 assert.equal(await readTelegramOperationalHistory(no,no,no),null);
 assert.equal(await readTelegramOperationalHistory(no,no,{enabled:true,lockSource:true,now:Date.now()}),null);
 assert.equal(await createOperationalHistoryReader({read:()=>assert.fail('OFF read')})(no,no,no),null);
});
test('one configured reader forwards only current-read inputs to existing history',async()=>{
 const c={},context={},now=1234;let calls=0;
 const reader=createOperationalHistoryReader({enabled:true,read:async(db,who,options)=>{calls++;assert.equal(db,c);assert.equal(who,context);assert.deepEqual(options,{enabled:true,now,lockSource:true});return {scope:'synthetic'};}});
 assert.deepEqual(await reader(c,context,{now,lockSource:true,enabled:false,read:()=>assert.fail('untrusted reader')}),{scope:'synthetic'});assert.equal(calls,1);
});
test('shipping planner and dispatcher share adapter without new timer/queue or transport',()=>{
 const runtime=fs.readFileSync('server/telegram-fast-ack.mjs','utf8');
 assert.match(runtime,/runTelegramOperationalChangeCycle\(db, \{ readSource: readTelegramOperationalHistory \}\)/);
 assert.match(runtime,/dispatchClaimedJob\(db, job, \{ deliver: deliverJob, findLink: linkedTelegramRecord, readOperationalChangeSource: readTelegramOperationalHistory \}\)/);
 const adapter=fs.readFileSync('server/concierge/operational-history-reader.mjs','utf8');assert.doesNotMatch(adapter,/fetch\(|setInterval\(|setTimeout\(|INSERT |UPDATE |CREATE TABLE/);
});
