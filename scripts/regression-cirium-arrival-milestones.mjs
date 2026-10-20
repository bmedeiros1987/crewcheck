import assert from 'node:assert/strict';
import {normalizeCiriumFlightStatus as normalize} from '../server/cirium-flight-adapter.mjs';
import {ciriumRegulationArrivalEvidence as evidence,readRegulationOperationalArrival as read} from '../shared/regulationOperationalArrival.mjs';
const times={scheduledGateArrival:'2032-10-20T14:00:00Z',estimatedGateArrival:'2032-10-20T14:20:00Z',actualGateArrival:'2032-10-20T14:25:00Z',scheduledRunwayArrival:'2032-10-20T13:50:00Z',estimatedRunwayArrival:'2032-10-20T14:10:30Z',actualRunwayArrival:'2032-10-20T14:15:00Z'};
const codes=['SGA','EGA','AGA','SRA','ERA','ARA'];
const row={carrierFsCode:'QA',flightNumber:'1234',departureAirportFsCode:'BSB',arrivalAirportFsCode:'GRU',status:'S',operationalTimes:Object.fromEntries(Object.entries(times).map(([key,dateUtc])=>[key,{dateUtc}])),flightStatusUpdates:[{updatedAt:{dateUtc:'2032-10-20T14:30:00Z'},updatedDateFields:Object.values(times).map((newDateUtc,index)=>({field:codes[index],newDateUtc}))}]};
const occurrence={flight:'QA1234',departureDate:'2032-10-20',origin:'BSB',destination:'GRU',scheduledDepartureUtc:'2032-10-20T12:30:00Z'};
const authority={ownerScope:'synthetic-owner',revision:'r1',receivedAt:'2032-10-20T14:30:01Z'};
const candidate=raw=>({...normalize(raw),departureDate:occurrence.departureDate,scheduledDepartureUtc:occurrence.scheduledDepartureUtc});
const all=candidate(row);assert.equal(Object.keys(all.arrivalMilestones).length,6);
for(const [index,[name,at]]of Object.entries(times).entries()){
 const item=all.arrivalMilestones[name];assert.equal(item.at,new Date(at).toISOString());assert.equal(item.sourceField,codes[index]);assert.equal(item.observedAt,'2032-10-20T14:30:00.000Z');
}
assert.equal(all.arrivalMilestones.actualGateArrival.milestone,'gate_in');assert.equal(all.arrivalMilestones.actualRunwayArrival.milestone,'landing');
assert.equal(evidence(all,authority).field.kind,'actual');assert.equal(evidence(all,authority).field.at,'2032-10-20T14:15:00.000Z');
const estimate=structuredClone(row);delete estimate.operationalTimes.actualGateArrival;delete estimate.operationalTimes.actualRunwayArrival;
const freshEstimate=structuredClone(estimate);freshEstimate.flightStatusUpdates[0].updatedAt.dateUtc='2032-10-20T13:00:00Z';
const projected=read({evidence:evidence(candidate(freshEstimate),{...authority,receivedAt:'2032-10-20T13:00:01Z'}),expected:{...authority,lastActivity:'operating',occurrence},admitted:true,now:Date.parse('2032-10-20T13:01:00Z'),operation:'domestic',postFlightMinutes:30,additionalTasksMinutes:0,taxiInMinutes:10});
assert.equal(projected.dutyEndAt,'2032-10-20T14:50:30.000Z');assert.equal(projected.kind,'estimated');
for(const status of ['C','D','NO','R','U','','unknown'])assert.equal(evidence(candidate({...estimate,status}),authority),null,status);
for(const patch of [
 {flightStatusUpdates:[]},
 {flightStatusUpdates:[{updatedAt:{dateUtc:'2032-10-20T14:30:00Z'},updatedDateFields:[{field:'EGA',newDateUtc:times.estimatedRunwayArrival}]}]},
 {flightStatusUpdates:[{updatedAt:{dateLocal:'2032-10-20T11:30:00'},updatedDateFields:[{field:'ERA',newDateUtc:times.estimatedRunwayArrival}]}]},
 {flightStatusUpdates:[...row.flightStatusUpdates,{updatedAt:{dateUtc:'2032-10-20T14:31:00Z'},updatedDateFields:[{field:'ERA'}]}]},
 {flightStatusUpdates:[...row.flightStatusUpdates,{updatedAt:{dateUtc:'2032-10-20T14:31:00Z'},updatedDateFields:[{field:'ERA',newDateUtc:'2032-10-20T15:00:00Z'}]}]},
 {flightStatusUpdates:[...row.flightStatusUpdates,{updatedAt:{dateUtc:'2032-10-20T14:30:00Z'},updatedDateFields:[{field:'ERA',newDateUtc:'2032-10-20T15:00:00Z'}]}]},
])assert.equal(evidence(candidate({...estimate,...patch}),authority),null,JSON.stringify(patch));
const unsorted=structuredClone(estimate);unsorted.flightStatusUpdates.unshift({updatedAt:{dateUtc:'2032-10-20T14:29:00Z'},updatedDateFields:[{field:'ERA',newDateUtc:'2032-10-20T15:00:00Z'}]});unsorted.flightStatusUpdates.push({updatedAt:{dateUtc:'2032-10-20T14:35:00Z'},updatedTextFields:[{field:'STS',newText:'A'}]});assert.equal(evidence(candidate(unsorted),authority).field.source.observedAt,'2032-10-20T14:30:00.000Z','later unrelated update cannot refresh field');
const gateOnly=structuredClone(estimate);gateOnly.operationalTimes.actualGateArrival={dateUtc:times.actualGateArrival};assert.equal(evidence(candidate(gateOnly),authority),null,'actual gate arrival never becomes engine stop or refreshes old runway estimate');
console.log('PASS existing Cirium adapter: six separate arrival milestones; exact latest field delta including deletion/conflict; scheduled/gate never masquerades as landing; actual/estimated preserved; no request');
