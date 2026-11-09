import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileMyCrewCareLogistics,selectMyCrewCareHotel,selectMyCrewCarePickup,myCrewCareLocalInstant} from '../shared/myCrewCareLogistics.mjs';
const now=Date.parse('2026-10-15T00:00:00Z');
const context={accountId:'synthetic-account',rosterId:'synthetic-roster',rosterRevision:'revision-1',providerSubject:'synthetic-subject'};
const stay={...context,id:'synthetic-stay',rosterEventId:'synthetic-event',rosterEventKind:'stay',source:'persisted-platform-stay',localOnly:false,airport:'FOR',pairingId:'synthetic-pair',timeZone:'America/Fortaleza',startAt:'2026-10-15T00:00:00Z',endAt:'2026-10-15T12:00:00Z'};
const record={direction:'to_airport',date:'2026-10-15',time:'05:00',airport:'FOR',pairingId:'synthetic-pair',hotelName:'Hotel Sintético',pickupLocation:'Hall sintético',status:'published'};
function read({stays=[stay],records=[record],observedAt=new Date(now).toISOString(),...extra}={}) {
 return reconcileMyCrewCareLogistics({context,stays,snapshot:{observedAt,records,...extra},now});
}
test('an explicit operational import veto rejects normalized and confirmed-empty snapshots',()=>{
 const hotel={direction:'hotel_only',confirmation:'confirmed',airport:stay.airport,pairingId:stay.pairingId,hotelName:record.hotelName,reservationStartAt:stay.startAt,reservationEndAt:stay.endAt,status:'published'};
 for(const records of [[record],[hotel],[{...record,status:'cancelled'}],[]]){
  const result=read({records,emptyConfirmed:true,operationalImportAllowed:false});
  assert.equal(result.accepted,false);assert.equal(result.error,'invalid-snapshot');
  assert.deepEqual(result.facts,[]);assert.deepEqual(result.unmatched,[]);assert.deepEqual(result.conflicts,[]);
  assert.equal(selectMyCrewCareHotel(result.facts,stay.id,{now}),null);
  assert.equal(selectMyCrewCarePickup(result.facts,stay.id,{now}),null);
 }
});
test('true is not authority and cannot bypass existing snapshot, record or stay guards',()=>{
 for(const input of [
  {records:[]},{observedAt:'invalid'},{observedAt:new Date(now+30001).toISOString()},
  {records:[{...record,status:'planned'}]},{records:[{...record,status:'unknown'}]},
  {stays:[{...stay,accountId:'other-account'}]},{stays:[{...stay,localOnly:true}]},
  {records:[record,{...record,time:'05:10'}]},
 ]){
  const result=read({...input,operationalImportAllowed:true});
  assert.equal(result.accepted,false);assert.deepEqual(result.facts,[]);
 }
 // The field is an optional veto, not a required capability token.
 assert.deepEqual(read({operationalImportAllowed:true}),read());
 assert.equal(read({records:[],emptyConfirmed:true}).accepted,true);
});
test('existing reconciler preserves source, update instant, stay identity and explicit pickup zone',()=>{
 const result=read();assert.equal(result.accepted,true);
 const hotel=selectMyCrewCareHotel(result.facts,stay.id,{now});
 const pickup=selectMyCrewCarePickup(result.facts,stay.id,{now});
 for(const fact of [hotel,pickup]){assert.equal(fact.source,'mycrewcare');assert.equal(fact.observedAt,'2026-10-15T00:00:00.000Z');assert.equal(fact.accountId,context.accountId);assert.equal(fact.rosterRevision,context.rosterRevision);assert.equal(fact.dataState,'fresh');}
 assert.equal(pickup.timeZone,'America/Fortaleza');assert.equal(pickup.pickupAt,'2026-10-15T08:00:00.000Z');
 assert.equal(pickup.transitMinutes,null);assert.equal(hotel.hotelAddress,null);
 assert.equal('timeZone' in hotel,false); // consumer must not invent a hotel zone from this fact alone.
});
test('missing/invalid zone, wrong account/revision and unpersisted stay cannot supply logistics',()=>{
 for(const delta of [{timeZone:null},{timeZone:'Invalid/Zone'},{accountId:'other-account'},{rosterRevision:'other-revision'},{localOnly:true},{source:'inferred-hotel'}]){
  const result=read({stays:[{...stay,...delta}]});assert.equal(result.accepted,false);assert.deepEqual(result.facts,[]);
 }
});
test('a duplicate stay or conflicting pickup cannot become the selected hotel/hall',()=>{
 for(const input of [{stays:[stay,{...stay,id:'other-stay',rosterEventId:'other-event'}]},{records:[record,{...record,time:'05:10'}]}]){
  const result=read(input);assert.equal(result.accepted,false);assert.equal(result.error,'ambiguous-provider-data');assert.deepEqual(result.facts,[]);
 }
});
test('pickup requires matching pairing/date/stay bounds; no inference from airport alone',()=>{
 for(const delta of [{pairingId:'other-pair'},{date:'2026-10-16'},{time:'20:00'},{direction:'from_airport'},{status:'planned'},{status:'unknown'}]){
  const result=read({records:[{...record,...delta}]});assert.equal(result.accepted,false);assert.deepEqual(result.facts,[]);
 }
});
test('cancelled facts are unavailable to default selectors; changed stays explicitly changed',()=>{
 let result=read({records:[{...record,status:'cancelled'}]});assert.equal(result.accepted,true);
 assert.equal(selectMyCrewCareHotel(result.facts,stay.id,{now}),null);assert.equal(selectMyCrewCarePickup(result.facts,stay.id,{now}),null);
 result=read({records:[{...record,status:'changed'}]});assert.equal(selectMyCrewCarePickup(result.facts,stay.id,{now}).status,'changed');
});
test('fresh/cached/expired are distinct; empty requires explicit confirmation',()=>{
 const facts=read().facts;
 assert.equal(selectMyCrewCarePickup(facts,stay.id,{now:now+15*60000}).dataState,'fresh');
 assert.equal(selectMyCrewCarePickup(facts,stay.id,{now:now+15*60000+1}).dataState,'cached');
 assert.equal(selectMyCrewCarePickup(facts,stay.id,{now:now+7*86400000+1}),null);
 assert.equal(read({records:[]}).accepted,false);
 const empty=read({records:[],emptyConfirmed:true});assert.equal(empty.accepted,true);assert.deepEqual(empty.facts,[]);
 assert.equal(read({observedAt:new Date(now+30001).toISOString()}).accepted,false);
});
test('DST repeated and missing wall times are blocked, independent of device timezone',()=>{
 assert.equal(myCrewCareLocalInstant('2026-11-01','01:30','America/New_York'),null);
 assert.equal(myCrewCareLocalInstant('2026-03-08','02:30','America/New_York'),null);
 assert.equal(myCrewCareLocalInstant('2026-10-15','05:00','America/Fortaleza'),Date.parse('2026-10-15T08:00:00Z'));
});
