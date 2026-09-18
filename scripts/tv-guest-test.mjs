import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GUEST_FIELDS, evaluateGuestAccess, projectVisitorTv } from '../server/tv/guest/policy.mjs';
import { createVisitorTvReader, createVisitorTvHandler } from '../server/tv/guest/reader.mjs';
import { createVisitorViewModel } from '../server/tv/guest/view-model.mjs';
const NOW=Date.parse('2026-09-18T12:00:00Z'),MINUTE=60000,DAY=86400000,TOKEN='t'.repeat(43);
const stamp=delta=>new Date(NOW+delta).toISOString();
const clone=value=>structuredClone(value);
function fixture(fields=GUEST_FIELDS){
 const common={active:true,revoked:false,revision:1,issuedAt:stamp(-MINUTE),expiresAt:stamp(DAY-MINUTE)};
 const permissions=Object.fromEntries(fields.map(field=>[field,true]));
 return {
 device:{...common,deviceId:'display1',ownerId:'owner1',visitorId:'visitor1',grantId:'grant1',audience:'visitor',scopes:['tv:visitor:read'],platform:'lg-webos'},
 visitor:{...common,id:'visitor1',ownerId:'owner1',tvAllowed:true,tvFields:{...permissions}},
 grant:{...common,id:'grant1',ownerId:'owner1',visitorId:'visitor1',deviceId:'display1',channel:'tv',from:stamp(-DAY),until:stamp(2*DAY),fields:{...permissions}},
 };
}
function fact(value,source='owner-checkin',overrides={}){return {ownerId:'owner1',source,sharedWithVisitors:true,observedAt:stamp(-MINUTE),expiresAt:stamp(10*MINUTE),value,...overrides};}
const window={startAt:stamp(MINUTE),endAt:stamp(120*MINUTE)};
const FACTS={
 displayName:fact({name:'Pessoa de teste',email:'DO_NOT_SHARE_EMAIL'},'owner-profile'),
 status:fact({code:'resting',note:'DO_NOT_SHARE_CHAT'}),
 confirmedCity:fact({city:'Cidade confirmada',country:'BR',latitude:12,room:'DO_NOT_SHARE_ROOM'}),
 plannedCity:fact({city:'Destino previsto',...window},'canonical-roster'),
 nextFlight:fact({flight:'ZZ1234',origin:'AAA',destination:'BBB',...window,rawText:'DO_NOT_SHARE_PDF'},'canonical-roster'),
 returnEstimate:fact({at:stamp(360*MINUTE)},'canonical-return'),
 stayCity:fact({city:'Cidade do pernoite',...window},'canonical-stay'),
 hotel:fact({hotel:'Hotel de teste',...window,address:'DO_NOT_SHARE_ADDRESS'},'owner-stay'),
 room:fact({room:'123',...window},'owner-stay'),
 calendar:fact({activities:[{kind:'flight',...window,flight:'DO_NOT_SHARE_FLIGHT',journeyId:'DO_NOT_SHARE_ID',hotel:'DO_NOT_SHARE_HOTEL'},{kind:'off',startAt:stamp(130*MINUTE),endAt:stamp(140*MINUTE)}]},'canonical-roster'),
 preciseLocation:fact({latitude:12,longitude:34,accuracyMeters:50,trail:'DO_NOT_SHARE_HISTORY'},'device-location'),
 finance:fact({amount:'DO_NOT_SHARE_FINANCE'}),
};
const snapshot=(context=fixture(),facts=FACTS,now=NOW)=>projectVisitorTv(context,facts,now);
const card=(s,k)=>s.cards.find(c=>c.field===k);

test('all fields default closed; legacy map, hotel and roster do not grant TV access',()=>{
 const c=fixture([]);c.visitor.permissions={map:true,roster:true,hotels:true};
 assert.equal(snapshot(c).cards.length,0);
 delete c.visitor.tvAllowed;assert.throws(()=>snapshot(c));
});
test('identity binding rejects each cross-owner/visitor/device/grant mismatch',()=>{
 for(const [r,key] of [['device','ownerId'],['device','visitorId'],['device','deviceId'],['device','grantId'],['visitor','ownerId'],['visitor','id'],['grant','ownerId'],['grant','visitorId'],['grant','deviceId'],['grant','id']]){
  const c=fixture();c[r][key]='other';assert.throws(()=>snapshot(c),r+':'+key);
 }
});
test('each record must be explicitly active and unrevoked with a valid revision',()=>{
 for(const r of ['device','visitor','grant'])for(const [key,value] of [['active',false],['active','true'],['revoked',true],['revoked',undefined],['revision',0],['revision','1']]){
  const c=fixture();c[r][key]=value;assert.throws(()=>snapshot(c),r+':'+key);
 }
});
test('expired/future/malformed leases denied; max device and grant duration enforced',()=>{
 for(const r of ['device','visitor','grant'])for(const [key,value] of [['expiresAt',stamp(0)],['expiresAt','bad'],['issuedAt',stamp(1)]]){
  const c=fixture();c[r][key]=value;assert.throws(()=>snapshot(c));
 }
 const c=fixture();c.device.expiresAt=stamp(DAY);assert.throws(()=>snapshot(c));
 const d=fixture();d.grant.expiresAt=stamp(31*DAY);assert.throws(()=>snapshot(d));
 assert.throws(()=>snapshot(fixture(),FACTS,NaN));
});
test('owner and general device tokens are not visitor tokens; only LG/Samsung transport',()=>{
 for(const [key,value] of [['audience','owner'],['scopes',['tv:read']],['scopes',['tv:visitor:read','admin']],['platform','unknown']]){
  const c=fixture();c.device[key]=value;assert.throws(()=>snapshot(c));
 }
 const c=fixture();c.device.platform='samsung-tizen';assert.equal(snapshot(c).audience,'visitor');
});
test('permissions use intersection, strict booleans and own properties',()=>{
 for(const field of GUEST_FIELDS){
  const c=fixture();c.grant.fields[field]=false;assert.equal(card(snapshot(c),field),undefined);
  const d=fixture();d.visitor.tvFields[field]='true';assert.equal(card(snapshot(d),field),undefined);
 }
 const c=fixture();c.grant.fields=Object.create(Object.fromEntries(GUEST_FIELDS.map(k=>[k,true])));assert.equal(snapshot(c).cards.length,0);
});
test('no extras leave server; raw profiles/parser/IDs/finance/history stripped',()=>{
 const output=snapshot();assert.equal(output.cards.length,11);const body=JSON.stringify(output);
 for(const forbidden of ['DO_NOT_SHARE','owner1','visitor1','grant1','token','latitudeZZ'])assert.equal(body.includes(forbidden),false);
 assert.equal(output.offlineAllowed,false);assert.ok(Date.parse(output.expiresAt)-NOW<=MINUTE);
});
test('permission for a city never exposes coordinates, room or hotel',()=>{
 const output=snapshot(fixture(['confirmedCity']));
 assert.deepEqual(output.cards.map(c=>c.field),['confirmedCity']);
 assert.deepEqual(output.cards[0].value,{city:'Cidade confirmada',country:'BR'});
});
test('planned destination cannot masquerade as current/confirmed position',()=>{
 const facts=clone(FACTS);facts.confirmedCity.source='canonical-roster';
 const output=snapshot(fixture(['plannedCity','confirmedCity']),facts);
 assert.equal(card(output,'confirmedCity'),undefined);assert.match(card(output,'plannedCity').evidence,/não é localização atual/);
});
test('precise location requires explicit own consent, sensor provenance and freshness',()=>{
 const c=fixture();delete c.grant.fields.preciseLocation;assert.equal(card(snapshot(c),'preciseLocation'),undefined);
 for(const patch of [{source:'canonical-roster'},{observedAt:stamp(-6*MINUTE)},{value:{latitude:91,longitude:20,accuracyMeters:2}},{value:{latitude:12,longitude:NaN,accuracyMeters:2}},{value:{latitude:12,longitude:20}}]){
  const f=clone(FACTS);Object.assign(f.preciseLocation,patch);assert.equal(card(snapshot(fixture(),f),'preciseLocation'),undefined);
 }
});
test('invalid/stale/unshared/cross-owner/future facts omitted per card',()=>{
 for(const patch of [{sharedWithVisitors:false},{sharedWithVisitors:'true'},{ownerId:'other'},{observedAt:stamp(1)},{expiresAt:stamp(0)},{observedAt:stamp(-31*MINUTE)},{source:'news'}]){
  const f=clone(FACTS);Object.assign(f.confirmedCity,patch);assert.equal(card(snapshot(fixture(),f),'confirmedCity'),undefined);
 }
});
test('room alone is not enough, no hidden source sent to client',()=>{
 assert.equal(snapshot(fixture(['room'])).cards.length,0);
 const out=snapshot(fixture(['room','hotel']));assert.equal(out.cards.length,2);
});
test('date scope cannot spill to future/past outside authorized period',()=>{
 const f=clone(FACTS);f.nextFlight.value.endAt=stamp(3*DAY);assert.equal(card(snapshot(fixture(),f),'nextFlight'),undefined);
 for(const patch of [{from:'bad'},{until:'bad'},{until:stamp(-2*DAY)},{until:stamp(32*DAY)}]){
  const c=fixture();Object.assign(c.grant,patch);assert.throws(()=>snapshot(c));
 }
});
test('calendar is a typed timeline with no flight or airport IDs; no empty means off inference',()=>{
 const output=snapshot(fixture(['calendar']));
 assert.deepEqual(card(output,'calendar').value.activities[0],{kind:'flight',...window});
 const f=clone(FACTS);f.calendar.value.activities=[];
 assert.deepEqual(card(snapshot(fixture(['calendar']),f),'calendar').value,{activities:[]});
});
test('calendar is bounded and unknown activity types dropped',()=>{
 const f=clone(FACTS);f.calendar.value.activities=Array.from({length:1000},()=>({kind:'duty',...window}));
 assert.equal(card(snapshot(fixture(['calendar']),f),'calendar').value.activities.length,62);
 f.calendar.value.activities.push({kind:'duty',...window});assert.equal(card(snapshot(fixture(['calendar']),f),'calendar'),undefined);
});
test('bounded plain-text fields; malformed text suppressed; input not mutated',()=>{
 const c=fixture(),f=clone(FACTS),before=JSON.stringify({c,f});snapshot(c,f);assert.equal(JSON.stringify({c,f}),before);
 f.confirmedCity.value.city='City\nLocation';assert.equal(card(snapshot(c,f),'confirmedCity'),undefined);
 f.confirmedCity.value.city='A'.repeat(300);assert.equal(card(snapshot(c,f),'confirmedCity'),undefined);
});
test('snapshot expires with the earliest current consent or fact',()=>{
 const c=fixture();c.grant.expiresAt=stamp(5000);assert.equal(snapshot(c).expiresAt,stamp(5000));
 const f=clone(FACTS);f.status.expiresAt=stamp(4000);assert.equal(snapshot(fixture(),f).expiresAt,stamp(4000));
});
test('reader loads only allowed categories and period, never TV-selected owner identity',async()=>{
 const context=fixture(['confirmedCity']);let requested;const reader=createVisitorTvReader({now:()=>NOW,
  authorizeDevice:async()=>context.device,loadContext:async()=>context,loadFacts:async request=>{requested=request;return FACTS;}});
 const output=await reader(TOKEN);assert.equal(output.cards.length,1);
 assert.deepEqual(requested,{ownerId:'owner1',fields:['confirmedCity'],from:NOW-DAY,until:NOW+2*DAY});
});
test('no allowed fields means no data provider call',async()=>{
 const c=fixture([]);const reader=createVisitorTvReader({now:()=>NOW,authorizeDevice:async()=>c.device,loadContext:async()=>c,loadFacts:async()=>{throw Error('not allowed to run');}});
 assert.equal((await reader(TOKEN)).cards.length,0);
});
test('reader rejects consent edits, revoke, expiry and rebind during a slow fetch',async()=>{
 for(const mutate of [c=>{c.grant.revoked=true;},c=>{c.grant.fields.preciseLocation=false;},c=>{c.visitor.revision++;},c=>{c.device.expiresAt=stamp(0);},c=>{c.device.grantId='newgrant';c.grant.id='newgrant';}]){
  let c=fixture();const reader=createVisitorTvReader({now:()=>NOW,authorizeDevice:async()=>clone(c.device),loadContext:async()=>clone(c),loadFacts:async()=>{mutate(c);return FACTS;}});
  await assert.rejects(reader(TOKEN));
 }
});
test('reader rejects discrepancy between authenticated device and context',async()=>{
 const c=fixture();const reader=createVisitorTvReader({now:()=>NOW,authorizeDevice:async()=>({...c.device,deviceId:'other'}),loadContext:async()=>c,loadFacts:async()=>FACTS});
 await assert.rejects(reader(TOKEN));
});
test('endpoint is default-off, readonly, separately authorized and no-store',async()=>{
 const req={path:'/api/tv/visitor/snapshot',method:'GET',token:TOKEN,ip:'test'};
 assert.equal((await createVisitorTvHandler({})(req)).status,404);
 let on=true;const h=createVisitorTvHandler({enabled:()=>on,rateLimit:async()=>true,read:async()=>snapshot()});
 assert.equal((await h({...req,path:'/else'})),null);assert.equal((await h({...req,method:'POST'})).status,405);
 assert.equal((await h({...req,token:''})).status,401);const r=await h(req);assert.equal(r.status,200);assert.match(r.headers['Cache-Control'],/no-store/);
 const off=createVisitorTvHandler({enabled:()=>on,rateLimit:async()=>true,read:async()=>{on=false;return snapshot();}});assert.equal((await off(req)).status,403);
});
test('server errors do not expose connection strings and do not restore stale data',async()=>{
 const h=createVisitorTvHandler({enabled:()=>true,rateLimit:async()=>true,read:async()=>{throw Error('mysql://secret:secret@example.test');}});
 const r=await h({path:'/api/tv/visitor/snapshot',method:'GET',token:TOKEN});assert.equal(r.status,503);assert.equal(JSON.stringify(r).includes('secret'),false);
});
test('TV visitor cache clears at lease, on errors and after hidden/resume; no owner fallback',()=>{
 const view=createVisitorViewModel();assert.equal(view.read(NOW),null);const e=view.requestEpoch();
 assert.equal(view.accept(snapshot(), 'display1',e,NOW),true);assert.ok(view.read(NOW+59999));assert.equal(view.read(NOW+60000),null);
 assert.equal(view.accept(snapshot(),'display1',e,NOW),true);view.clear();assert.equal(view.read(NOW),null);
 assert.equal(view.accept(snapshot(),'display1',e,NOW),false);
});
test('TV cache rejects cross-device, owner, future, long TTL and offline payloads',()=>{
 for(const patch of [{deviceId:'other'},{schema:'owner-snapshot'},{audience:'owner'},{generatedAt:stamp(1)},{expiresAt:stamp(61000)},{offlineAllowed:true},{cards:Array(12).fill({})}]){
  const v=createVisitorViewModel();assert.equal(v.accept({...snapshot(),...patch},'display1',v.requestEpoch(),NOW),false);assert.equal(v.read(NOW),null);
 }
});
test('impossible calendar dates and non-ISO lease formats are rejected',()=>{
 for(const bad of ['2026-02-30T12:00:00Z','2026-13-01T12:00:00Z','2026-09-18','September 18, 2026']){
  const c=fixture();c.grant.from=bad;assert.throws(()=>snapshot(c));
 }
});
test('future-only trip consent never exposes current location or status',()=>{
 const c=fixture(['confirmedCity','status','preciseLocation','plannedCity']);c.grant.from=stamp(DAY);
 const f=clone(FACTS);f.plannedCity.value.startAt=stamp(DAY+MINUTE);f.plannedCity.value.endAt=stamp(DAY+120*MINUTE);
 assert.deepEqual(snapshot(c,f).cards.map(v=>v.field),['plannedCity']);
});
