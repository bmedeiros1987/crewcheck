import test from 'node:test';
import assert from 'node:assert/strict';
import {createMyCrewCarePersistentSession} from '../shared/myCrewCarePersistentSession.mjs';
import {editStayDraft,reconcileStayDraft} from '../shared/stay-edit-plan.mjs';
const now=Date.parse('2026-10-15T12:01:00Z');
const context={accountId:'synthetic-A',rosterId:'synthetic-roster',rosterRevision:'revision-1',providerSubject:'synthetic-subject'};
const stay={...context,id:'synthetic-stay',rosterEventId:'synthetic-event',rosterEventKind:'stay',source:'persisted-platform-stay',localOnly:false,airport:'FOR',pairingId:'synthetic-pair',timeZone:'America/Fortaleza',startAt:'2026-10-15T12:00:00Z',endAt:'2026-10-16T12:00:00Z'};
const record={direction:'hotel_only',confirmation:'confirmed',airport:'FOR',pairingId:'synthetic-pair',hotelName:'Hotel Sintético',reservationStartAt:stay.startAt,reservationEndAt:stay.endAt};
function setup(storage,partial=true){
 const data=storage??{raw:null,writes:0,read(){return this.raw;},write(_k,v){this.raw=v;this.writes++;},clear(){this.raw=null;}};
 let stamp='2026-10-15T12:00:00Z',status='cancelled';
 const adapter={read:async request=>({schemaVersion:3,requestId:request.requestId,context:request.context,authenticated:true,providerSubject:request.context.providerSubject,url:'https://api2.apicrewcare.com/LATAM/mytravel.aspx',observedAt:stamp,records:status==='empty'?[]:[{...(partial?record:{direction:'to_airport',date:'2026-10-16',time:'05:00',airport:'FOR',pairingId:'synthetic-pair',hotelName:'Hotel Sintético'}),status}],emptyConfirmed:status==='empty'})};
 const session=createMyCrewCarePersistentSession({adapter,storage:data,now:()=>now});session.setContext(context,[stay]);session.setAutomatic(true);
 return {session,data,next:(time,value)=>{stamp=time;status=value;}};
}
for(const partial of [false,true])for(const restored of [false,true])test(`cancelled12:00 cannot be replaced by published11:59, restored=${restored}, partial=${partial}`,async()=>{
 let current=setup(undefined,partial);assert.equal(await current.session.sync(),true);
 if(restored){current=setup(current.data,partial);assert.equal(await current.session.restore(),true);}
 const {session,data,next}=current;const saved=data.raw,writes=data.writes,changes=session.state().changes;
 next('2026-10-15T11:59:00Z','published');assert.equal(await session.sync(),false);
 assert.equal(session.hotel(stay.id),null);assert.equal(session.pickup(stay.id),null);
 assert.equal(session.state().lastSuccessfulSyncAt,'2026-10-15T12:00:00.000Z');assert.equal(session.state().lastError,'stale-snapshot');
 assert.equal(data.raw,saved);assert.equal(data.writes,writes);assert.deepEqual(session.state().changes,changes);
 // A later publication is not permanently forbidden by the previous cancellation.
 next('2026-10-15T12:00:30Z','published');assert.equal(await session.sync(),true);assert.ok(session.hotel(stay.id));
});
test('restore cannot roll a current snapshot back to older valid storage',async()=>{
 const {session,data,next}=setup();next('2026-10-15T11:59:00Z','published');assert.equal(await session.sync(),true);const old=data.raw;
 next('2026-10-15T12:00:00Z','cancelled');assert.equal(await session.sync(),true);
 data.raw=old;const writes=data.writes;assert.equal(await session.restore(),false);
 assert.equal(session.hotel(stay.id),null);assert.equal(session.state().lastSuccessfulSyncAt,'2026-10-15T12:00:00.000Z');assert.equal(session.state().lastError,'stale-snapshot');assert.equal(data.writes,writes);
});
test('watermark is bound to context, not another account/revision, and manual draft remains untouched',async()=>{
 const {session,next}=setup();assert.equal(await session.sync(),true);
 const incoming={...context,eventId:stay.rosterEventId,values:{pickupAt:'2026-10-16T08:00:00Z'},provenance:{pickupAt:'manual'}};
 const draft=editStayDraft(reconcileStayDraft(null,incoming,context),{pickupAt:'2026-10-16T07:45:00Z'});
 const frozen=JSON.stringify(draft);next('2026-10-15T11:59:00Z','published');assert.equal(await session.sync(),false);assert.equal(JSON.stringify(draft),frozen);
 const revision={...context,rosterRevision:'revision-2'};session.setContext(revision,[{...stay,...revision}]);assert.equal(await session.sync(),true);assert.equal(session.hotel(stay.id).rosterRevision,'revision-2');
 const other={...context,accountId:'synthetic-B',providerSubject:'synthetic-B-subject'};session.setContext(other,[{...stay,...other}]);assert.equal(session.hotel(stay.id),null);assert.equal(await session.sync(),true);assert.equal(session.hotel(stay.id).accountId,'synthetic-B');
});

test('confirmed empty snapshot also prevents an older publication from reappearing',async()=>{
 const {session,data,next}=setup();next('2026-10-15T12:00:00Z','empty');assert.equal(await session.sync(),true);const saved=data.raw;
 next('2026-10-15T11:59:00Z','published');assert.equal(await session.sync(),false);assert.equal(session.hotel(stay.id),null);assert.equal(data.raw,saved);
});
