import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const code = ts.transpileModule(fs.readFileSync('client/src/lib/rosterDisplayDate.ts', 'utf8'), {compilerOptions:{module:ts.ModuleKind.ES2022}}).outputText;
const {rosterDisplayIso: iso, rosterInstantIso, rosterLabelDate, rosterStrictInstant, rosterDisplayCompare} = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
// Literal oracle; no helper/device timezone computes the expected date.
const cases = [
 [{canonical:{date:'31/10/2026',startDateTime:'2026-11-01T02:50:00Z'}},'2026-10-31'],
 [{canonical:{date:'01/11/2026',startDateTime:'2026-11-01T00:10:00+09:00'},day:{date:'31/10/2026'}},'2026-11-01'],
 [{canonical:{publishedDay:{date:'31-OUT-2026'},startDateTime:'2026-11-01T02:50:00Z'}},'2026-10-31'],
 [{day:{date:'01.10.2026'},canonical:{startDateTime:'2026-10-01T00:10:00+14:00'}},'2026-10-01'],
 [{canonical:{startDateTime:'2026-11-01T02:59:00Z'}},null],
 [{canonical:{startDateTime:'2026-11-01T03:00:00Z'},operationalTimeZone:'Etc/GMT+3'},'2026-11-01'],
 [{canonical:{startDateTime:'2026-10-01T00:10:00+14:00'},operationalTimeZone:'Pacific/Kiritimati'},'2026-10-01'],
 [{canonical:{startDateTime:'2026-11-01T00:10:00+09:00'}},null],
 [{canonical:{startDateTime:'2026-10-31T23:50:00'}},null],
 [{canonical:{startDateTime:'2026-10-31T23:50:00'},operationalTimeZone:'Etc/GMT+3'},null],
 [{date:'2026-10-31'},'2026-10-31'],
 [{date:'2026-02-31'},null],
 [{date:'2026-02-31',operationalTimeZone:'Etc/GMT+3'},null],
 [{date:'2026-02-29'},null],
 [{date:'2028-02-29'},'2028-02-29'],
 [{date:'2026-02-31T00:10:00Z',operationalTimeZone:'Etc/GMT+3'},null],
 [{canonical:{date:'31/02/2026',startDateTime:'2026-03-01T03:00:00Z'},operationalTimeZone:'Etc/GMT+3'},null],
 [{canonical:{startDateTime:'2026-11-01T25:00:00Z'},operationalTimeZone:'Etc/GMT+3'},null],
 [{canonical:{startDateTime:'2026-11-01T03:00:00Z'},operationalTimeZone:'Invalid/Zone'},null],
 [{date:new Date('2026-11-01T00:10:00Z')},null],
 [{date:new Date(NaN)},null],
 [{},null],
];
for (const [event, expected] of cases) {
 assert.equal(iso(event), expected, JSON.stringify(event));
 const label=rosterLabelDate(event);
 assert.equal(label===null,expected===null);
 if(label)assert(Number.isFinite(label.getTime()));
}
assert.equal(rosterInstantIso(new Date('2026-11-01T02:59:00Z'), 'Etc/GMT+3'), '2026-10-31');
assert.equal(rosterInstantIso('2026-11-01T02:59:00Z', ''), null);
assert.equal(rosterStrictInstant('2026-11-01T00:10:00'),null);
assert.equal(rosterStrictInstant('2026-02-31T00:10:00Z'),null);
const host = fs.readFileSync('client/src/components/v1391/RosterLaunchView.tsx','utf8');
assert(host.includes('carePresentation?.label || meta.label'), 'prepared Care Context remains mandatory');
assert(host.includes('Programações com data não confirmada'), 'unknown events stay accessible');
assert(!host.includes('Date.now()'), 'event dates must not be filled with today');
console.log('PASS strict date/provenance oracle: '+cases.length+' cases, TZ='+process.env.TZ);

const ordering = [
 {id:'a-last', date:'2027-01-01'},
 {id:'a-late', date:'2026-10-31'},
 {id:'z-unknown', date:'2026-02-31'},
 {id:'a-unknown', canonical:{startDateTime:'2026-10-01T10:00:00Z'}},
 {id:'z-civil', date:'2026-10-01'},
 {id:'z-late-instant', canonical:{date:'01/10/2026',startDateTime:'2026-10-01T19:00:00Z'}},
 {id:'a-civil', day:{date:'01/10/2026'}},
 {id:'z-early-instant', canonical:{date:'01/10/2026',startDateTime:'2026-10-01T12:00:00Z'}},
 {id:'a-dec', canonical:{publishedDay:{date:'31-DEZ-2026'}}},
 {id:'z-sep', day:{date:'30/09/2026'}},
 {id:'z-oct-end-instant',canonical:{date:'31/10/2026',startDateTime:'2026-11-01T02:59:00Z'}},
];
const original = JSON.stringify(ordering);
assert.deepEqual([...ordering].sort(rosterDisplayCompare).map(e=>e.id), ['z-early-instant','z-late-instant','z-oct-end-instant','z-sep','z-civil','a-civil','a-late','a-dec','a-last','z-unknown','a-unknown']);
assert.equal(JSON.stringify(ordering), original);
assert.equal(rosterDisplayCompare(ordering[2], ordering[3]), 0, 'unknown source order remains stable');
console.log('PASS mixed civil/instant/unconfirmed chronology, source unchanged');

// Real, unchanged canonical producer: two journeys published on 01/10, with
// the generated rest carrying 02/10. Civil regrouping must not move TEST2.
const {loadClientModules, TYPE_ONLY_PDF_PARSER_STUB} = await import('./lib/ts-module-harness.mjs');
const harness = loadClientModules({stubs:TYPE_ONLY_PDF_PARSER_STUB, files:['client/src/lib/canonicalRoster.ts','client/src/lib/rosterDisplayDate.ts']});
try {
 const roster = {crewName:'Tripulante sintético',crewId:'SYN',base:'GRU',rank:'CCM',month:10,year:2026,rawText:'',days:[{date:'01/10/2026',dayOfWeek:'QUI',dayNumber:1,month:10,year:2026,type:'VOO',pairingCode:'TEST',dutyReport:'19:10',dutyDebrief:null,isNextDay:true,hotel:null,base:'GRU',legs:[{flightNumber:'TEST1',origin:'GRU',destination:'GIG',departureTime:'20:00',arrivalTime:'21:30',workType:'OP'},{flightNumber:'TEST2',origin:'GIG',destination:'GRU',departureTime:'23:40',arrivalTime:'01:00',presentationTime:'22:50',isNextDay:true,workType:'OP'}]}]};
 const originalRoster = JSON.stringify(roster);
 const canonical = harness.load('canonicalRoster').buildCanonicalRosterEvents(roster);
 assert.deepEqual(canonical.map(e=>[e.flightNumber||e.kind,e.date,e.startDateTime]),[['TEST1','01/10/2026','2026-10-01T23:00:00.000Z'],['journey-rest','02/10/2026','2026-10-02T00:30:00.000Z'],['TEST2','01/10/2026','2026-10-02T02:40:00.000Z']]);
 assert.equal(canonical[1].journeyId,canonical[2].journeyId);
 assert.notEqual(canonical[0].journeyId,canonical[2].journeyId);
 assert.equal(canonical[2].presentation,'22:50');
 const events = canonical.map(e=>({id:e.id,date:new Date(e.startDateTime),canonical:e,day:e.publishedDay}));
 const before = JSON.stringify(events);
 assert.deepEqual([...events].sort(rosterDisplayCompare).map(e=>e.id),events.map(e=>e.id));
 assert.deepEqual([...events].reverse().sort(rosterDisplayCompare).map(e=>e.id),events.map(e=>e.id));
 assert.equal(JSON.stringify(events),before);
 assert.equal(JSON.stringify(roster),originalRoster);
 assert(host.includes('timedEvents.reduce((runs, event)'), 'Cards/List must use consecutive runs, not merged civil groups');
 console.log('PASS unchanged canonical producer: TEST1 → journey-rest → TEST2, source/journey/APZ intact');
} finally { harness.cleanup(); }

// A single tuple order: no pair-specific choice between civil and instant keys.
for(const a of ordering)for(const b of ordering){
 assert.equal(Math.sign(rosterDisplayCompare(a,b))+Math.sign(rosterDisplayCompare(b,a)),0);
 for(const c of ordering)if(rosterDisplayCompare(a,b)<=0 && rosterDisplayCompare(b,c)<=0)assert(rosterDisplayCompare(a,c)<=0);
}
const tied=[{id:'z',canonical:{date:'01/10/2026',startDateTime:'2026-10-01T23:00:00Z'}},{id:'a',canonical:{date:'01/10/2026',startDateTime:'2026-10-01T23:00:00Z'}}];
assert.deepEqual([...tied].sort(rosterDisplayCompare).map(e=>e.id),['z','a'],'equal instants retain canonical source order');
console.log('PASS comparator symmetry/transitivity and stable canonical ties');
