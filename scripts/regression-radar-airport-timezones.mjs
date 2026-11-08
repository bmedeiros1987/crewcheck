// Offline: actual canonical engine, day policy and Home caller; synthetic transport only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { build } from 'esbuild';
import { airportTimeZone, reviewedAirportTimeZones } from '../shared/airport-timezones.mjs';
import { baseTimeZone } from '../shared/timezone-choice.mjs';
import * as policy from '../shared/gate-query-day.mjs';

const root = new URL('../', import.meta.url);
const compiled = await build({ entryPoints:[new URL('client/src/lib/canonicalRoster.ts',root).pathname], bundle:true, write:false, platform:'node', format:'esm' });
const { buildCanonicalRosterEvents } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const source = fs.readFileSync(new URL('client/src/pages/Home.tsx',root),'utf8');
const ast = ts.createSourceFile('Home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const caller = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'fetchRadarSnapshot');
assert(caller, 'Test the real caller, before or after canonical preparation');
let now = Date.parse('2032-10-14T12:00:00Z'), requests = [];
const FakeDate = class extends Date { static now() { return now; } };
const ctx = vm.createContext({ ...policy, Date:FakeDate, URLSearchParams, Map,
  gateQueryDay:(identity,t)=>policy.gateQueryDay(identity,t??now),
  getStoredUser:()=>({id:'synthetic'}), manualGateAccountKey:()=> 'id:synthetic',
  getToken:()=> 'offline-fixture', manualGateIdentity:e=>e.id, telegramConciergeIdentity:()=>({}),
  radarQuerySerial:new Map(), beginOperationalRadarRead:()=>null, RADAR_GATE_STALE_MS:30*60*1000,
  readRadarSnapshot:()=>null, radarFailurePayload:e=>({ok:false,message:e.message}),
  authFetch:async url=>{ requests.push(url); const q=new URL(url,'https://fixture.invalid').searchParams;
    return {ok:true,gate:'12',flight:q.get('flight'),origin:q.get('origin'),destination:q.get('destination'),scheduledDepartureUtc:q.get('scheduledDepartureUtc'),sourceReceivedAt:now}; },
  saveRadarSnapshot:(_event,payload)=>payload,
});
vm.runInContext(ts.transpileModule(caller.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx);
const zones = {FLN:'America/Sao_Paulo',NAT:'America/Fortaleza',VIX:'America/Sao_Paulo',JFK:'America/New_York',LIS:'Europe/Lisbon'};
const identity = (origin, departureDate='2032-10-14', scheduledDepartureUtc='2032-10-14T15:00:00Z') => ({flight:'LA100',origin,destination:'REC',departureDate,scheduledDepartureUtc});
const oldDeviceZone = process.env.TZ;
try {
  for (const device of ['UTC','America/Sao_Paulo','Pacific/Auckland','Pacific/Honolulu']) {
    process.env.TZ=device;
    for (const [origin,zone] of Object.entries(zones)) {
      assert.equal(airportTimeZone(origin),zone);
      assert.equal(airportTimeZone(` ${origin.toLowerCase()} `),zone);
      assert.equal(baseTimeZone(origin),'','Operational coverage must not expand personal base preference');
      assert(Object.isFrozen(reviewedAirportTimeZones[origin]));
    }
    for (const origin of [...Object.keys(zones),'GRU','CPV','RBR','MAO','REC','ZZZ']) {
      const roster={month:10,year:2032,base:'GRU',days:[{date:'14/10/2032',type:'VOO',legs:[{flightNumber:'LA100',origin,destination:'REC',departureTime:'12:00',arrivalTime:'15:00'}]}]};
      const events=buildCanonicalRosterEvents(roster), canonical=events.find(e=>e.kind==='flight');
      assert(canonical); assert.equal(canonical.startDateTime,'2032-10-14T15:00:00.000Z');
      const id=identity(origin,policy.originFlightDate(canonical.startDateTime,origin),canonical.startDateTime);
      const known=origin!=='ZZZ';
      assert.equal(Boolean(policy.findPublishedGateOccurrence(roster,id,events)),known);
      assert.equal(policy.findPublishedGateOccurrence(roster,{...id,scheduledDepartureUtc:'2032-10-14T16:00:00Z'},events),null);
      const event={...canonical,canonical,date:new Date(canonical.startDateTime),originTimeZone:'Invented/Zone',timeZone:'Pacific/Auckland'};
      now=Date.parse('2032-10-14T12:00:00Z');
      const before=requests.length, result=await ctx.fetchRadarSnapshot(event,true);
      assert.equal(requests.length-before,known?1:0,origin+' must query only with a verified zone');
      if(!known) { assert.equal(result.querySuppressed,true); continue; }
      assert.equal(result.ok,true);
      assert.equal(policy.radarResultDecision({...result,sourceReceivedAt:now},id,now).allowed,true);
      now=Date.parse('2032-10-13T12:00:00Z');
      const count=requests.length, future=await ctx.fetchRadarSnapshot(event,true);
      assert.equal(requests.length,count); assert.equal(future.queryReason,'outside-published-flight-day');
    }
    // UTC boundaries are explicit independent expectations, including 23/25-hour DST days.
    const windows=[
      ...['FLN','NAT','VIX','GRU','CPV'].map(o=>[o,'2032-10-14','2032-10-14T03:00:00Z','2032-10-15T03:00:00Z']),
      ['RBR','2032-10-14','2032-10-14T05:00:00Z','2032-10-15T05:00:00Z'],
      ['JFK','2032-03-14','2032-03-14T05:00:00Z','2032-03-15T04:00:00Z'],
      ['JFK','2032-11-07','2032-11-07T04:00:00Z','2032-11-08T05:00:00Z'],
      ['LIS','2032-03-28','2032-03-28T00:00:00Z','2032-03-28T23:00:00Z'],
      ['LIS','2032-10-31','2032-10-30T23:00:00Z','2032-11-01T00:00:00Z'],
    ];
    for (const [origin,date,start,end] of windows) {
      const id=identity(origin,date,date+'T12:00:00Z'), a=Date.parse(start), b=Date.parse(end);
      assert.equal(policy.gateQueryDay(id,a-1).reason,'outside-published-flight-day');
      assert.equal(policy.gateQueryDay(id,a).allowed,true);
      assert.equal(policy.gateQueryDay(id,b-1).allowed,true);
      assert.equal(policy.gateQueryDay(id,b).reason,'outside-published-flight-day');
      assert.equal(policy.originFlightDate(a,origin),date);
    }
    for (const code of ['ZZZ','XYZ','SBFL','J F K','America/New_York','',null]) {
      assert.equal(airportTimeZone(code),'');
      assert.equal(policy.gateQueryDay({...identity(code),originTimeZone:'America/Sao_Paulo'},Date.parse('2032-10-14T12:00:00Z')).allowed,false);
    }
    for (const date of ['2032-02-30','2031-02-29','2032-13-01','garbage','']) assert.equal(policy.gateQueryDay(identity('JFK',date),Date.now()).allowed,false);
    for (const stamp of ['2032-02-30T12:00:00Z','invalid','2032-10-14T12:00:00',undefined]) assert.equal(policy.gateQueryDay(identity('LIS','2032-10-14',stamp===undefined?null:stamp),Date.now()).allowed,false);
    assert.equal(policy.gateQueryDay({...identity('JFK'),scheduledDepartureUtc:undefined},Date.now()).reason,'published-instant-unverified');
    assert.equal(policy.gateQueryDay(identity('LIS'),NaN).allowed,false);
    assert.equal(policy.gateQueryDay(identity('JFK','2032-10-14','2032-10-14T01:00:00Z'),Date.parse('2032-10-14T12:00:00Z')).reason,'published-instant-date-mismatch');
    assert.equal(policy.radarResultDecision({ok:true,flight:'LA100',origin:'ZZZ',destination:'REC',scheduledDepartureUtc:'2032-10-14T15:00:00Z',sourceReceivedAt:Date.now()},identity('ZZZ'),Date.now()).allowed,false);
  }
} finally { if(oldDeviceZone===undefined) delete process.env.TZ; else process.env.TZ=oldDeviceZone; }
console.log('PASS reviewed airport zones, actual canonical/caller/source admission, exact occurrence, origin-only day, midnight/DST, four device zones, invalid inputs; synthetic transport only');
