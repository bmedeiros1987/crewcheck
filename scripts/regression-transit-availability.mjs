import assert from 'node:assert/strict';
import { evaluateTransitAvailability as evaluate, transitServiceSeconds } from '../shared/transitAvailability.mjs';
const clone = x => structuredClone(x);
const evidence = {source:{name:'Synthetic official operator',url:'https://operator.invalid/status'}, sourceUpdatedAt:'2026-10-08T08:00:00-03:00',sourceTimestampKind:'refresh',fetchedAt:'2026-10-08T08:00:00-03:00',maxAgeSeconds:300,timeZone:'America/Sao_Paulo',validFrom:'2026-10-08T00:00:00-03:00',validUntil:'2026-10-09T02:00:00-03:00',coverage:[{kind:'station',lineId:'synthetic-line',stationId:'synthetic-station'},{kind:'station',lineId:'synthetic-line',stationId:'synthetic-destination'}]};
const leg = {lineId:'synthetic-line',originStationId:'synthetic-station',destinationStationId:'synthetic-destination',intermediateStationIds:[],stationCoverageComplete:true,serviceDate:'2026-10-08',boardAt:'2026-10-08T08:00:00-03:00',alightAt:'2026-10-08T08:30:00-03:00'};
const schedule = {...clone(evidence), serviceDate:'2026-10-08',calendarConfirmed:true,serviceRuns:true,windows:[{opensAtSeconds:21600,closesAtSeconds:90000,lastBoardAtSeconds:88200}]};
const trip = {now:'2026-10-08T08:00:00-03:00',departureAt:leg.boardAt,timeZone:'America/Sao_Paulo',legs:[leg],schedules:[schedule],operations:[{...clone(evidence),state:'normal'}]};
assert.deepEqual([evaluate(trip).schedule,evaluate(trip).operational,evaluate(trip).recommendation],['available','normal','confirmed']);
assert.equal(evaluate().label,'Funcionamento não confirmado');
assert.equal(evaluate({...trip,operations:[],incidents:[]}).operational,'unknown','no incidents cannot imply normal');
assert.equal(evaluate({...trip,operations:[]}).recommendation,'unconfirmed');
assert.equal(evaluate({...trip,schedules:[]}).schedule,'unknown');
const future=clone(trip);future.departureAt='2026-10-08T10:00:00-03:00';future.legs[0].boardAt=future.departureAt;future.legs[0].alightAt='2026-10-08T10:30:00-03:00';assert.equal(evaluate(future).operational,'unknown','normal now cannot guarantee a future trip');
const futureBoard=clone(trip);futureBoard.legs[0].boardAt='2026-10-08T08:10:00-03:00';assert.equal(evaluate(futureBoard).operational,'unknown','walking started now cannot make later boarding operationally confirmed');
for(const state of ['disrupted','suspended']) {
 const x=clone(future);x.operations[0].state=state;assert.equal(evaluate(x).operational,state);assert.equal(evaluate(x).recommendation,state==='suspended'?'blocked':'alternative-required');
 x.operations[0].validUntil='2026-10-08T09:30:00-03:00';assert.equal(evaluate(x).operational,'unknown','past disruption cannot apply outside active period');
}
for(const mutate of [x=>x.coverage[0].lineId='other',x=>x.coverage[0].stationId='other',x=>x.timeZone='America/Manaus',x=>x.fetchedAt='2026-10-08T07:00:00-03:00',x=>x.sourceTimestampKind='unknown',x=>x.validUntil=x.validFrom,x=>x.sourceUpdatedAt='2026-10-08T09:00:00-03:00',x=>x.source.url='']) {
 const x=clone(trip); mutate(x.schedules[0]);mutate(x.operations[0]);assert.equal(evaluate(x).schedule,'unknown');assert.equal(evaluate(x).operational,'unknown');
}
const lastChange=clone(trip);lastChange.operations[0].sourceUpdatedAt='2026-09-01T00:00:00-03:00';lastChange.operations[0].sourceTimestampKind='last-change';assert.equal(evaluate(lastChange).operational,'normal','last-change timestamp is not refresh age');lastChange.operations[0].sourceTimestampKind='refresh';assert.equal(evaluate(lastChange).operational,'unknown');
for(const runs of [false,undefined]) {const x=clone(trip);x.schedules[0].serviceRuns=runs;assert.equal(evaluate(x).schedule,runs===false?'unavailable':'unknown');}
const calendar=clone(trip);calendar.schedules[0].calendarConfirmed=false;assert.equal(evaluate(calendar).schedule,'unknown','unverified holiday calendar cannot imply service');
const holiday=clone(trip);holiday.schedules[0].serviceRuns=false;assert.equal(evaluate(holiday).recommendation,'blocked','explicit holiday closure blocks');
const late=clone(trip);late.departureAt='2026-10-09T00:40:00-03:00';late.legs[0].boardAt=late.departureAt;late.legs[0].alightAt='2026-10-09T00:50:00-03:00';assert.equal(transitServiceSeconds(late.departureAt,'2026-10-08',trip.timeZone),88800);assert.equal(evaluate(late).schedule,'unavailable','last boarding is before station closing');late.legs[0].boardAt=late.departureAt='2026-10-09T00:30:00-03:00';assert.equal(evaluate(late).schedule,'available','24+ GTFS seconds retain service date');late.legs[0].alightAt='2026-10-09T01:00:00-03:00';assert.equal(evaluate(late).schedule,'unavailable','arrival exactly at closing is unsafe');
const transfer=clone(trip);transfer.legs.push({...leg,originStationId:'synthetic-transfer',destinationStationId:'synthetic-transfer-destination',boardAt:'2026-10-08T08:35:00-03:00',alightAt:'2026-10-08T09:00:00-03:00'});assert.equal(evaluate(transfer).schedule,'unknown','all connections require station coverage');transfer.schedules.push({...clone(schedule),coverage:[{kind:'station',lineId:'synthetic-line',stationId:'synthetic-transfer'},{kind:'station',lineId:'synthetic-line',stationId:'synthetic-transfer-destination'}],windows:[{opensAtSeconds:21600,closesAtSeconds:36000,lastBoardAtSeconds:30600}]});assert.equal(evaluate(transfer).schedule,'unavailable','missed last connection blocks whole route');
for(const zone of ['UTC','America/Sao_Paulo','Asia/Tokyo']) {process.env.TZ=zone;assert.equal(transitServiceSeconds('2026-10-09T03:30:00Z','2026-10-08','America/Sao_Paulo'),88200);assert.equal(evaluate(trip).schedule,'available');}
for (const x of [{...trip,legs:[null]},{...trip,schedules:[null],operations:[null]},{...trip,schedules:[{...schedule,coverage:[null]}]},{...trip,schedules:[{...schedule,windows:[null]}]}]) assert.doesNotThrow(()=>evaluate(x),'malformed evidence remains unknown without crashing');
assert.equal(transitServiceSeconds('2026-03-08T03:30:00-04:00','2026-03-08','America/New_York'),12600,'GTFS noon minus 12h on spring transition');
assert.equal(transitServiceSeconds('2026-11-01T01:30:00-04:00','2026-11-01','America/New_York'),1800,'first repeated hour is a different GTFS instant');
assert.equal(transitServiceSeconds('2026-11-01T01:30:00-05:00','2026-11-01','America/New_York'),5400,'second repeated hour is retained');
assert.equal(transitServiceSeconds(leg.boardAt,'2026-02-30',trip.timeZone),null);assert.equal(transitServiceSeconds('2026-10-08T08:00:00','2026-10-08',trip.timeZone),null);assert.equal(evaluate({...trip,timeZone:'bad-zone'}).recommendation,'unconfirmed');
console.log('PASS synthetic transit contract: schedule/calendar, operation freshness, scoped active alerts, future uncertainty, timezone, service-day >24h and last connections. No remote calls.');
