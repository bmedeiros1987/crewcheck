import assert from 'node:assert/strict';
import { evaluateTransitAvailability as evaluate } from '../shared/transitAvailability.mjs';
const clone=x=>structuredClone(x);
const base={source:{name:'Synthetic operator',url:'https://operator.invalid/status'},sourceUpdatedAt:'2026-10-08T08:00:00-03:00',sourceTimestampKind:'refresh',fetchedAt:'2026-10-08T08:00:00-03:00',maxAgeSeconds:300,timeZone:'America/Sao_Paulo',validFrom:'2026-10-08T00:00:00-03:00',validUntil:'2026-10-09T02:00:00-03:00',coverage:[{kind:'station',lineId:'L',stationId:'A'},{kind:'station',lineId:'L',stationId:'B'}]};
const trip={now:base.fetchedAt,departureAt:base.fetchedAt,timeZone:base.timeZone,legs:[{lineId:'L',stationId:'A',originStationId:'A',destinationStationId:'B',intermediateStationIds:[],stationCoverageComplete:true,serviceDate:'2026-10-08',boardAt:base.fetchedAt,alightAt:'2026-10-08T08:30:00-03:00'}],schedules:[{...clone(base),serviceDate:'2026-10-08',calendarConfirmed:true,serviceRuns:true,windows:[{opensAtSeconds:21600,closesAtSeconds:90000,lastBoardAtSeconds:88200}]}],operations:[{...clone(base),state:'normal'}]};
if(!process.argv.includes('--destination')) {
 for(const stationId of ['',null,0,false,undefined]) {const x=clone(trip);x.schedules[0].coverage=[{kind:'station',lineId:'L',stationId}];x.operations[0].coverage=clone(x.schedules[0].coverage);assert.equal(evaluate(x).recommendation,'unconfirmed','malformed station scope must never mean entire line: '+String(stationId));}
}
if(!process.argv.includes('--scope')) {
 const x=clone(trip);x.operations[0].coverage=[{kind:'station',lineId:'L',stationId:'A'}];x.operations.push({...clone(base),state:'suspended',coverage:[{kind:'station',lineId:'L',stationId:'B'}]});assert.equal(evaluate(x).recommendation,'blocked','destination suspension blocks A → B despite normal A');
}
console.log('PASS independent-review negative controls: malformed scope and suspended destination.');
assert.equal(evaluate(trip).recommendation,'confirmed','positive complete station coverage remains usable');
for(const value of ['',null,0,false,undefined,' L ']) {const x=clone(trip);x.schedules[0].coverage[0].lineId=value;assert.notEqual(evaluate(x).schedule,'available');}
const explicitLine=clone(trip);for(const e of [...explicitLine.schedules,...explicitLine.operations])e.coverage=[{kind:'line',lineId:'L'}];assert.equal(evaluate(explicitLine).recommendation,'confirmed','only explicit valid line-wide coverage covers all stations');
for(const stationId of ['',null,0,false,undefined]){const x=clone(explicitLine);x.operations[0].coverage[0].stationId=stationId;assert.equal(evaluate(x).operational,'unknown','line-wide scope must not contain a malformed station field');}
const originOnly=clone(trip);originOnly.operations[0].coverage=[{kind:'station',lineId:'L',stationId:'A'}];assert.equal(evaluate(originOnly).operational,'unknown');
const via=clone(explicitLine);via.legs[0].intermediateStationIds=['M'];via.operations.push({...clone(base),state:'disrupted',coverage:[{kind:'station',lineId:'L',stationId:'M'}]});assert.equal(evaluate(via).recommendation,'alternative-required','intermediate station alert applies');
const incomplete=clone(explicitLine);incomplete.legs[0].stationCoverageComplete=false;assert.equal(evaluate(incomplete).recommendation,'unconfirmed');
for(const key of ['originStationId','destinationStationId','intermediateStationIds']){const x=clone(trip);delete x.legs[0][key];assert.equal(evaluate(x).recommendation,'unconfirmed');}
const badSource=clone(trip);badSource.operations[0].source.url='https://secret:synthetic@operator.invalid/status';assert.equal(evaluate(badSource).operational,'unknown');assert.equal(evaluate(badSource).evidence.some(e=>e.source.url.includes('synthetic@')),false,'invalid provenance is not forwarded to a renderer');
