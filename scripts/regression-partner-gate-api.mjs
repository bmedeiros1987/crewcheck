import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readPartnerGate, partnerGatePayload, normalizePartnerFlight } from '../server/v1413/partnerGateApi.mjs';
const radar = JSON.parse(readFileSync(new URL('./fixtures/partner-gate/synthetic.json', import.meta.url)));
const request = { partnerId: 'synthetic-partner', flight: radar.flight, origin: radar.origin, destination: radar.destination, occurrenceKey: radar.occurrenceKey };
const now = new Date('2030-01-01T12:00:00Z');
const grant = { partnerId: request.partnerId, provider: 'fixture-gate', occurrenceKey: request.occurrenceKey, fields: ['departureGate'],
  sourceClass: 'licensed_provider', accessApproved: true, redistributionApproved: true,
  reviewId: 'SYNTHETIC-REVIEW', validUntil: '2030-01-01T13:00:00Z' };
const project = (row = radar, req = request, grants = [grant]) => partnerGatePayload(row, req, now, grants);
assert.equal(normalizePartnerFlight('LAN9999'), 'LA9999');
const good = project();
assert.equal(good.gate, radar.gate); assert.equal(good.ok, true);
assert.equal(good.terminal, null); assert.equal(good.flightStatus, null);
assert.equal(good.provenance.fields.departureGate.provider, 'fixture-gate');
function blocked(value) { assert.equal(value.gateStatus, 'unavailable'); assert.equal(value.ok, false); assert.equal(value.gate, null); assert.ok(!JSON.stringify(value).includes(radar.gate)); }
blocked(project(radar, request, []));
blocked(project({ ...radar, partnerShareable: true, sourceClass: 'crewcheck_verified' }, request, []));
for (const patch of [{partnerId:'other-partner'}, {accessApproved:false}, {redistributionApproved:false}, {reviewId:''}, {provider:'other'},
  {occurrenceKey:'other'}, {fields:['status']}, {sourceClass:'unknown'}, {validUntil:now.toISOString()}, {validUntil:'invalid'}]) {
  blocked(project(radar, request, [{ ...grant, ...patch }]));
}
for (const patch of [{flight:'LA9998'}, {origin:'VCP'}, {destination:'CGH'}, {occurrenceKey:'other'}, {occurrenceKey:''}]) blocked(project(radar, {...request,...patch}));
for (const patch of [{value:'other'}, {provider:'other'}, {occurrenceKey:'other'}, {observedAt:null},
  {observedAt:'2030-01-01T12:01:00Z'}, {observedAt:'2030-01-01T11:44:59Z'}]) {
  const row = structuredClone(radar); Object.assign(row.provenance.fields.departureGate, patch); blocked(project(row));
}
blocked(project({...radar,ok:false})); blocked(project({...radar,provenance:null}));
const terminalGrant = {...grant, provider:'fixture-terminal',fields:['departureTerminal']};
assert.equal(project(radar,request,[grant,terminalGrant]).terminal,radar.terminal);
assert.equal(project({...radar,secret:'MUST-NOT-LEAK',raw:{token:'MUST-NOT-LEAK'}}).secret,undefined);
assert.deepEqual(await readPartnerGate(request),{ok:false,code:'PARTNER_API_NOT_COMPOSED'});
let reads = 0;
const readRadar = async () => { reads++; return radar; };
assert.deepEqual(await readPartnerGate({...request,occurrenceKey:''},{readRadar}),{ok:false,code:'INVALID_OCCURRENCE'}); assert.equal(reads,0);
blocked(await readPartnerGate({...request,approvals:[grant]}, {partnerId:request.partnerId,readRadar,now:()=>now}));
assert.equal((await readPartnerGate(request,{partnerId:request.partnerId,readRadar,now:()=>now,resolveRights:async()=>[grant]})).gate,radar.gate);
assert.deepEqual(await readPartnerGate(request,{partnerId:request.partnerId,readRadar:async()=>{throw Error('secret');}}),{ok:false,code:'RADAR_UNAVAILABLE'});
console.log('PASS partner gate offline: field rights, identity, freshness, redaction, trusted resolver, inert default');
// Existing Radar builder -> new projection, rather than only hand-shaped envelopes.
const { buildRadarFieldProvenance } = await import('../server/radar-field-provenance.mjs');
const candidate = { carrier:'LA', flightNumber:'9999', origin:'GRU', destination:'BSB',
  scheduledDeparture:'2030-01-01T12:00:00Z', gate:radar.gate, provider:'fixture-gate', updatedAt:'2030-01-01T11:59:00Z' };
const built = buildRadarFieldProvenance([candidate]);
assert.equal(built.occurrenceKey,request.occurrenceKey);
assert.equal(project({...radar,provenance:built}).gate,radar.gate);
assert.deepEqual(await readPartnerGate({...request,partnerId:'spoofed'}, {readRadar,now:()=>now}),{ok:false,code:'PARTNER_API_NOT_COMPOSED'});
blocked(project(radar,{...request,partnerId:'other-partner'}));
console.log('PASS existing Radar builder -> partner projection; trusted partner identity required');

const beforeMissingIdentity = reads;
await readPartnerGate(request,{readRadar});
assert.equal(reads,beforeMissingIdentity);
blocked(await readPartnerGate({...request,partnerId:'other-partner'}, {
  partnerId:request.partnerId,readRadar,now:()=>now,
  resolveRights:async()=>[{...grant,partnerId:'other-partner'}]
}));
const statusGrant = {...grant,provider:'fixture-status',fields:['status']};
assert.equal(project(radar,request,[grant,statusGrant]).flightStatus,radar.status);
const boundary = structuredClone(radar);
boundary.provenance.fields.departureGate.observedAt='2030-01-01T11:45:00Z';
assert.equal(project(boundary).gate,radar.gate);
console.log('PASS review additions: denial metadata, spoofing, no unauthorized reads, status grant, freshness boundary');
