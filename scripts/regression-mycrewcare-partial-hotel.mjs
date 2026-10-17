import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileMyCrewCareLogistics,selectMyCrewCareHotel,selectMyCrewCarePickup} from '../shared/myCrewCareLogistics.mjs';
import {createMyCrewCarePersistentSession} from '../shared/myCrewCarePersistentSession.mjs';
import {reconcileStayDraft,editStayDraft,calculateStayWakeup,planStayAlarm,stayLocalInstant,inspectStayPickup} from '../shared/stay-edit-plan.mjs';
const now=Date.parse('2026-10-14T12:00:00Z');
const context={accountId:'synthetic-A',rosterId:'synthetic-roster',rosterRevision:'revision-1',providerSubject:'synthetic-subject'};
const stay={...context,id:'synthetic-stay',rosterEventId:'synthetic-event',rosterEventKind:'stay',source:'persisted-platform-stay',localOnly:false,airport:'FOR',pairingId:'synthetic-pair',timeZone:'America/Fortaleza',startAt:'2026-10-15T00:00:00Z',endAt:'2026-10-16T12:00:00Z'};
const hotel={direction:'hotel_only',confirmation:'confirmed',airport:'FOR',pairingId:'synthetic-pair',hotelName:'Hotel Sintético',reservationStartAt:stay.startAt,reservationEndAt:stay.endAt,status:'published'};
const reconcile=(record=hotel,stays=[stay])=>reconcileMyCrewCareLogistics({context,stays,snapshot:{observedAt:new Date(now).toISOString(),records:[record]},now});
const envelope=(request,records=[hotel])=>({schemaVersion:3,requestId:request.requestId,context:request.context,authenticated:true,providerSubject:request.context.providerSubject,url:'https://api2.apicrewcare.com/LATAM/mytravel.aspx',observedAt:new Date(now).toISOString(),records});
const memory=()=>{const data=new Map();return {read:k=>data.get(k)??null,write:(k,v)=>data.set(k,v),clear:k=>data.delete(k)};};
test('confirmed hotel-only input produces one partial hotel fact and no pickup',()=>{
 const result=reconcile();assert.equal(result.accepted,true);assert.equal(result.facts.length,1);
 assert.equal(selectMyCrewCareHotel(result.facts,stay.id,{now}).hotelName,'Hotel Sintético');
 assert.equal(selectMyCrewCarePickup(result.facts,stay.id,{now}),null);
 const fact=result.facts[0];for(const key of ['pickupAt','pickupLocation','transitMinutes','timeZone'])assert.equal(key in fact,false);
 assert.equal(fact.status,'published'); // confirmed input never relabels the shared publication status.
});
test('partial hotel rejects unconfirmed, incomplete, disjoint, ambiguous or mixed transport input',()=>{
 for(const delta of [{confirmation:undefined},{confirmation:'planned'},{reservationStartAt:null},{reservationEndAt:null},{reservationStartAt:'2026-10-15T01:00:00Z'},{reservationEndAt:'2026-10-16T11:00:00Z'},{date:'2026-10-15'},{time:'05:00'},{pickupLocation:'Hall inventado'},{transitMinutes:0},{transportProvider:'Inventado'},{status:undefined}]){
  const result=reconcile({...hotel,...delta});assert.equal(result.accepted,false,JSON.stringify(delta));assert.deepEqual(result.facts,[]);
 }
 const result=reconcile(hotel,[stay,{...stay,id:'second-stay',rosterEventId:'second-event'}]);assert.equal(result.accepted,false);assert.equal(result.error,'ambiguous-provider-data');
});
test('existing session restores partial hotel cache without inventing hall or scheduling',async()=>{
 const storage=memory();const adapter={read:async request=>envelope(request)};
 const session=createMyCrewCarePersistentSession({adapter,storage,now:()=>now});session.setContext(context,[stay]);session.setAutomatic(true);
 assert.equal(await session.sync(),true);assert.ok(session.hotel(stay.id));assert.equal(session.pickup(stay.id),null);
 const restored=createMyCrewCarePersistentSession({adapter,storage,now:()=>now+60000});restored.setContext(context,[stay]);restored.setAutomatic(true);
 assert.equal(await restored.restore(),true);assert.ok(restored.hotel(stay.id));assert.equal(restored.pickup(stay.id),null);
 assert.equal(inspectStayPickup({fact:restored.pickup(stay.id)}).reason,'missing');
 assert.equal(planStayAlarm({scope:context,stay}).reason,'integration-disabled');
});
test('manual consumer draft survives provider refresh and requires review after revision change',()=>{
 const incoming={...context,eventId:stay.rosterEventId,values:{hotelName:'Hotel Sintético',pickupAt:'2026-10-16T03:30:00Z',alarmChoice:'suggested'},provenance:{hotelName:'mycrewcare',pickupAt:'mycrewcare'}};
 const initial=reconcileStayDraft(null,incoming,context);
 const manual=editStayDraft(initial,{pickupAt:'2026-10-16T03:10:00Z',alarmChoice:'manual-absolute'});
 const refreshed=reconcileStayDraft(manual,{...incoming,values:{...incoming.values,pickupAt:'2026-10-16T04:00:00Z'}},context);
 assert.equal(refreshed.values.pickupAt,manual.values.pickupAt);assert.equal(refreshed.provenance.pickupAt,'manual');assert.equal(refreshed.values.alarmChoice,'manual-absolute');
 const next={...context,rosterRevision:'revision-2'};const revised=reconcileStayDraft(refreshed,{...incoming,...next},next);
 assert.equal(revised.needsReview,true);assert.equal(revised.values.pickupAt,manual.values.pickupAt);
 const other={...context,accountId:'synthetic-B'};
 const switched=reconcileStayDraft(manual,{...incoming,...other},other);assert.equal(switched.touched.pickupAt,false);assert.equal(switched.values.pickupAt,incoming.values.pickupAt);
 assert.equal(reconcileStayDraft(manual,incoming,other),null);
});
test('existing wake calculator preserves explicit absolute edit and local date across midnight',()=>{
 const editStay={...stay,eventId:stay.rosterEventId};
 const hotelApz={...context,stayId:stay.id,rosterEventId:stay.rosterEventId,source:'manual',confirmed:true,timeZone:stay.timeZone,hotelReportAt:'2026-10-16T03:30:00Z'};
 for(const [minutes,date,time] of [[90,'2026-10-15','23:00'],[60,'2026-10-15','23:30']]){
  const result=calculateStayWakeup({scope:context,stay:editStay,hotelApz,now,defaultLeadMinutes:minutes});
  assert.equal(result.action,'calculated');assert.equal(result.schedulingState,'not-programmed');
  assert.equal(Date.parse(result.scheduledAt),stayLocalInstant(date,time,stay.timeZone));
 }
 const choice={mode:'absolute',alarmAt:'2026-10-16T02:45:00Z',timeZone:stay.timeZone};
 const one=calculateStayWakeup({scope:context,stay:editStay,hotelApz,now,choice,defaultLeadMinutes:90});
 const two=calculateStayWakeup({scope:context,stay:editStay,hotelApz:{...hotelApz,hotelReportAt:'2026-10-16T04:00:00Z'},now,choice,defaultLeadMinutes:60});
 assert.equal(one.scheduledAt,two.scheduledAt);assert.equal(Date.parse(two.scheduledAt),Date.parse(choice.alarmAt));
});
test('late provider read cannot publish partial hotel after account switch',async()=>{
 let finish;const adapter={read:request=>new Promise(resolve=>{finish=()=>resolve(envelope(request));})};
 const session=createMyCrewCarePersistentSession({adapter,storage:memory(),now:()=>now});session.setContext(context,[stay]);session.setAutomatic(true);
 const reading=session.sync();await Promise.resolve();
 const other={...context,accountId:'synthetic-B',providerSubject:'synthetic-subject-B'};
 session.setContext(other,[{...stay,...other}]);finish();assert.equal(await reading,false);
 assert.equal(session.hotel(stay.id),null);assert.equal(session.pickup(stay.id),null);
});
test('a new partial hotel snapshot removes the previous pickup instead of retaining a stale hall',async()=>{
 let partial=false;const storage=memory();
 const transport={direction:'to_airport',date:'2026-10-16',time:'05:00',airport:'FOR',pairingId:'synthetic-pair',hotelName:hotel.hotelName,status:'published',reservationStartAt:stay.startAt,reservationEndAt:stay.endAt};
 const adapter={read:async request=>envelope(request,partial?[hotel]:[transport])};
 const session=createMyCrewCarePersistentSession({adapter,storage,now:()=>now});session.setContext(context,[stay]);session.setAutomatic(true);
 assert.equal(await session.sync(),true);assert.ok(session.pickup(stay.id));
 partial=true;assert.equal(await session.sync(),true);assert.ok(session.hotel(stay.id));assert.equal(session.pickup(stay.id),null);
 assert.equal(JSON.parse(storage.read(context.accountId)).facts.length,1);
});
test('cancelled partial hotel stays unavailable and confirmed input cannot bypass scope or time',()=>{
 const result=reconcile({...hotel,status:'cancelled'});assert.equal(result.accepted,true);assert.equal(selectMyCrewCareHotel(result.facts,stay.id,{now}),null);
 for(const delta of [{airport:'REC'},{pairingId:'other-pair'},{reservationStartAt:'2026-10-17T00:00:00Z',reservationEndAt:'2026-10-18T00:00:00Z'}]){
  assert.equal(reconcile({...hotel,...delta}).accepted,false);
 }
 assert.equal(reconcile(hotel,[{...stay,accountId:'synthetic-B'}]).accepted,false);
});
