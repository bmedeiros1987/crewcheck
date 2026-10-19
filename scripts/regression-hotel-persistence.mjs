import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHotelStayClient, hotelOnlyPatch, hotelRemoteBaseline } from '../client/src/lib/hotelStayClient.mjs';
import { readStayEditor, writeStayEditor, emptyStayEditor } from '../shared/stay-editor-store.mjs';
import { syntheticHotel } from './fixtures/hotel-database.mjs';
import { harness, association } from './fixtures/hotel-platform.mjs';
const rosterBody = { roster: { year:2030,month:1,days:[{ date:'2030-01-01',hotel:'Source A',airport:'AAA' }] }, compliance:{synthetic:1}, gym:[{synthetic:2}], sourceName:'synthetic-source' };
const patch = row => hotelOnlyPatch({ baseline:hotelRemoteBaseline(row),latest:row,hotelName:'Manual B',contextRef:association.contextRef,contextSignature:association.contextSignature });
function clientHarness() {
  let generation=0,owner='A';const data=new Map();
  return { data, storage:{getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)},
    capture:()=>{const g=generation,o=owner;return {token:'synthetic',owner:o,isCurrent:()=>g===generation&&o===owner};},
    switch(){owner='B';generation++;} };
}
function clientFor(server, state=clientHarness()) {
  return createHotelStayClient({...state, request:async(_url,options)=>{
    const res=await server.request(options?.method||'GET',options?JSON.parse(options.body):{});
    if(res.status!==200)throw Object.assign(new Error(res.body.message),{status:res.status});return res.body;
  }});
}
test('literal route GET is owner-scoped; schema absent preserves legacy reads and blocks writes',async()=>{
  const h=harness([syntheticHotel(),syntheticHotel({id:'foreign',owner_email:'owner-B'})],{ready:false});
  const get=await h.request();assert.equal(get.body.stays.length,1);assert.equal(get.body.stayContractVersion,0);
  assert.equal(get.body.stays[0].state,'legacy-unbound');assert.equal(get.body.stays[0].manualOverride,false);
  assert.equal((await h.request('PATCH',association)).status,503);
  assert.equal((await h.sync(rosterBody)).body.hotelReconciliation.status,'review-required');
  assert.equal(h.rows[0].hotel_name,'Source A');
});
test('incompatible version column preserves legacy GET but cannot advertise writable v2',async()=>{
  const h=harness([syntheticHotel({row_version:'not-a-version'})],{schemaPatch:{column_name:'row_version',data_type:'text',column_type:'text'}});
  const result=await h.request();assert.equal(result.status,200);assert.equal(result.body.stayContractVersion,0);
  assert.equal(result.body.stays[0].hotelName,'Source A');assert.equal(result.body.stays[0].rowVersion,null);
  assert.equal(result.body.stays[0].bindingId,null);assert.equal(result.body.stays[0].reviewRequired,true);
  assert.equal((await h.request('PATCH',association)).status,503);
});
test('v1/unversioned and extra room/grant/provider fields have no writable fallback',async()=>{
  const h=harness();for(const body of [{id:'stay-A',hotelName:'X'},{...association,contractVersion:1},{...association,room:'X'},{...association,shareSameHotel:false},{...association,transportProvider:'X'}])
    assert.equal((await h.request('PATCH',body)).status,400);
  assert.equal(h.log.some(q=>q.sql.startsWith('UPDATE crewcheck_platform_stays')),false);
});
test('literal routes + actual client: explicit association -> PATCH -> repeated roster sync -> GET',async()=>{
  const h=harness();const client=clientFor(h);await client.update(association);
  const row=(await client.list()).stays[0];const before=h.rows[0];
  assert.equal((await client.update(patch(row))).persisted,true);
  for(let i=0;i<2;i++)assert.equal((await h.sync(rosterBody)).body.hotelReconciliation.status,'review-required');
  const after=(await client.list()).stays[0];assert.equal(after.id,before.id);assert.equal(after.hotelName,'Manual B');
  for(const key of ['room_cipher','share_same_hotel','share_with_visitors','presentation_time','lead_minutes'])assert.equal(h.rows[0][key],before[key]);
  assert.equal(h.rows.length,1);assert.equal(h.log.some(q=>/DELETE FROM crewcheck_platform_stays|INSERT INTO crewcheck_platform_stays/.test(q.sql)),false);
  assert.deepEqual(JSON.parse(h.rosters[0].roster),rosterBody.roster);assert.deepEqual(JSON.parse(h.rosters[0].compliance),rosterBody.compliance);assert.deepEqual(JSON.parse(h.rosters[0].gym),rosterBody.gym);
});
test('explicit selected NULL-roster legacy record links in place; no automatic manual inference',async()=>{
  const h=harness([syntheticHotel({roster_key:null})]);const client=clientFor(h);
  assert.equal((await client.list()).stays[0].manualOverride,false);await client.update(association);
  await client.update(patch((await client.list()).stays[0]));await h.sync(rosterBody);
  assert.equal(h.rows.length,1);assert.equal(h.rows[0].id,'stay-A');assert.equal(h.rows[0].hotel_name,'Manual B');
});
test('foreign/missing ID and wrong binding cannot mutate',async()=>{
  const h=harness([syntheticHotel(),syntheticHotel({id:'foreign',owner_email:'owner-B'})]);
  assert.equal((await h.request('PATCH',{...association,id:'foreign'})).status,409);
  await h.request('PATCH',association);const row=(await h.request()).body.stays[0];
  assert.equal((await h.request('PATCH',{...patch(row),bindingId:'other'})).status,409);
  assert.equal(h.rows[0].hotel_name,'Source A');
});
test('same date/airport two records never pick a target without explicit association',async()=>{
  const h=harness([syntheticHotel(),syntheticHotel({id:'second'})]);const client=clientFor(h);
  assert.throws(()=>hotelOnlyPatch({baseline:undefined,latest:(h.rows[0]),hotelName:'X'}),/v2/);
  await client.update(association);await client.update(patch((await client.list()).stays.find(r=>r.id==='stay-A')));
  assert.equal(h.rows.find(r=>r.id==='second').hotel_name,'Source A');assert.equal(h.rows.length,2);
});
test('actual editor store retains stale baseline after B changes; reload replaces value and baseline together',async()=>{
  const h=harness();const client=clientFor(h);await client.update(association);const row=(await client.list()).stays[0];
  const state=clientHarness();writeStayEditor(state.storage,'A',{...emptyStayEditor('A'),stays:{'event-A':{eventId:'event-A',signature:association.contextSignature,draft:{hotelName:row.hotelName},remoteBase:hotelRemoteBaseline(row)}}});
  await client.update(patch(row));const latest=(await client.list()).stays[0];const draft=readStayEditor(state.storage,'A').stays['event-A'];
  assert.throws(()=>hotelOnlyPatch({baseline:draft.remoteBase,latest,hotelName:draft.draft.hotelName,contextRef:association.contextRef,contextSignature:association.contextSignature}),/origem deste rascunho/);
  const intentional=hotelOnlyPatch({baseline:hotelRemoteBaseline(latest),latest,hotelName:'Intentional C',contextRef:association.contextRef,contextSignature:association.contextSignature});
  assert.equal((await client.update(intentional)).persisted,true);
});
test('changed context signature requires review and is not reassociated by reload/confirmation',async()=>{
  const h=harness();const client=clientFor(h);await client.update(association);const row=(await client.list()).stays[0];
  const before=h.rows[0].row_version;
  assert.throws(()=>hotelOnlyPatch({baseline:hotelRemoteBaseline(row),latest:row,hotelName:'Local',contextRef:row.contextRef,contextSignature:'changed-program'}),/revisão do vínculo/);
  assert.equal((await h.request('PATCH',{...association,expectedVersion:row.rowVersion,contextSignature:'changed-program'})).status,409);
  assert.equal(h.rows[0].row_version,before);
});
test('ABA cannot revive old route version even when hotel contents return',async()=>{
  const h=harness();const client=clientFor(h);await client.update(association);const original=(await client.list()).stays[0];
  for(const hotelName of ['A','B','Source A']){const row=(await client.list()).stays[0];await client.update({...patch(row),hotelName});}
  assert.equal((await h.request('PATCH',patch(original))).status,409);
});
test('lost reply retry conflicts without duplicate or extra write; reread reveals saved state',async()=>{
  const h=harness();await h.request('PATCH',association);const row=(await h.request()).body.stays[0],p=patch(row);
  assert.equal((await h.request('PATCH',p)).status,200);assert.equal((await h.request('PATCH',p)).status,409);
  assert.equal(h.rows.length,1);assert.equal((await h.request()).body.stays[0].hotelName,'Manual B');
});
test('session fences A/logout/B for delayed GET and PATCH; no readback/cache crosses account',async()=>{
  for(const action of ['list','update']){const state=clientHarness();let resolve,calls=0;
    const client=createHotelStayClient({...state,request:()=>{calls++;return new Promise(r=>{resolve=r;});}});
    const result=action==='list'?client.list():client.update(association);state.switch();resolve({ok:true,stays:[],savedStayId:'stay-A',stayContractVersion:2,hotelWriteReady:true});
    await assert.rejects(result,/conta mudou/);assert.equal(state.data.size,0);assert.equal(calls,1);
  }
});
test('cache is owner scoped and never establishes schema readiness offline/auth failure',async()=>{
  const state=clientHarness();let status=0;const client=createHotelStayClient({...state,request:async()=>{if(status)throw Object.assign(new Error('Unavailable'),{status});return {ok:true,stays:[{id:'A'}],hotelWriteReady:true,stayContractVersion:2};}});
  await client.list();status=503;let offline=await client.list();assert.equal(offline.ok,false);assert.equal(offline.hotelWriteReady,undefined);assert.equal(offline.stays.length,1);
  status=401;assert.equal((await client.list()).stays.length,0);state.switch();status=503;assert.equal((await client.list()).stays.length,0);
});
test('readback cannot falsely confirm another hotel or another context',async()=>{
  for(const mismatch of ['hotel','context']){const state=clientHarness();let calls=0;
    const client=createHotelStayClient({...state,request:async()=>++calls===1?{ok:true,savedStayId:'X',stayContractVersion:2,hotelWriteReady:true}:{ok:true,stayContractVersion:2,hotelWriteReady:true,stays:[{id:'X',state:'bound',rowVersion:'2',hotelName:mismatch==='hotel'?'Other':'Wanted',contextRef:'other',contextSignature:'other'}]}});
    await assert.rejects(client.update({hotelName:'Wanted',contextRef:'event',contextSignature:'sig'}),/releitura/);
  }
});
test('constraint/deadlock error response is not success and leaves row unchanged',async()=>{
  for(const fail of ['ER_DUP_ENTRY','ER_LOCK_DEADLOCK']){const h=harness(undefined,{fail});assert.equal((await h.request('PATCH',association)).status,409);assert.equal(h.rows[0].row_version,'0');}
});
test('actual roster writer acquires owner before writing roster and never mutates unresolved hotels',async()=>{
  const h=harness();await h.sync(rosterBody);const queries=h.log.map(q=>q.sql.trim());
  assert.ok(queries.findIndex(q=>q.startsWith('SELECT email'))<queries.findIndex(q=>q.startsWith('UPDATE crewcheck_platform_rosters')));
  const base=readFileSync(new URL('../server/platform.mjs',import.meta.url),'utf8');
  const writer=base.slice(base.indexOf('async function saveRosterMysql('),base.indexOf('async function handleRosterSync'));
  assert.doesNotMatch(writer,/DELETE FROM crewcheck_platform_stays|INSERT INTO crewcheck_platform_stays/);
});
test('UI uses explicit selection/confirmation, v2 baselines and exact ID reload; CI runs raw and prepared',()=>{
  const editor=readFileSync(new URL('../client/src/components/v1391/PresentationStayManagerView.tsx',import.meta.url),'utf8');
  assert.match(editor,/Confirmar registro para esta programação e carregar hotel/);assert.match(editor,/remoteBase\.current = persisted\.remoteBase\?\.contractVersion === 2/);
  assert.match(editor,/hotelOnlyPatch\(\{ baseline, latest: existing/);assert.match(editor,/item\.id === baseline\?\.id/);
  const ci=readFileSync(new URL('../.github/workflows/stay-editor-contract.yml',import.meta.url),'utf8');
  assert.match(ci,/TZ="\$zone" node --test scripts\/regression-hotel-persistence\.mjs scripts\/regression-hotel-binding\.mjs/);
});
