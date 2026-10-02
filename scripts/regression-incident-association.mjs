import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { hasConfirmedRouteClosure, incidentHeading, incidentDetail, prioritizeIncidents } from '../shared/routeIncidentAssociation.mjs';
const source = fs.readFileSync('server.mjs', 'utf8');
const code = source.slice(source.indexOf('function formatMeters('), source.indexOf('async function googleRoutePreview('));
const near = (id, coordinates, extra = {}) => ({ geometry: { type: Array.isArray(coordinates[0]) ? 'LineString' : 'Point', coordinates }, properties: { id, iconCategory: 8, timeValidity: 'present', events: [], ...extra } });
const fixtures = [
 near('same-way', [[0,0],[0.01,0]]),
 near('opposite-way', [[0.01,0],[0,0]]),
 near('parallel', [[0,0.001],[0.01,0.001]]),
 near('crossing', [[0.005,-0.005],[0.005,0.005]]),
 near('direction-absent', [0.005,0]),
 near('imprecise-position', [0.005,0.02]),
 near('old-result', [0.005,0], { endTime: '2000-01-01T00:00:00Z' }),
];
let route = { legs: [{ points: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0.01 }] }], summary: { lengthInMeters: 1112, travelTimeInSeconds: 600, noTrafficTravelTimeInSeconds: 550, trafficDelayInSeconds: 50 } };
const context = vm.createContext({ URL, Date, hasConfirmedRouteClosure, incidentHeading, prioritizeIncidents, routeLocationCache: new Map(), setTimeout, clearTimeout, AbortController, fetch: () => { throw Error('Network forbidden'); } });
vm.runInContext(code + '\nthis.preview=tomtomRoutePreview;this.sections=tomtomTrafficEvents;', context);
context.mockFetch = async endpoint => ({ ok: true, payload: endpoint.pathname.includes('incidentDetails') ? { incidents: fixtures } : { routes: [route] } });
vm.runInContext('fetchRouteJson=mockFetch;', context);
const result = await context.preview('0,0', '0,0.01', 'fixture');
assert.equal(result.incidents.length, 6);
for (const incident of result.incidents) {
 assert.equal(incident.association, 'near_route'); assert.equal(incident.source, 'tomtom_incident_details');
 assert.equal(incident.severity, 'critical'); assert.equal(incident.roadClosure, true);
 assert.match(incidentDetail(incident), /impacto no trajeto não confirmado/);
 assert.match(incidentDetail(incident), /gravidade crítica/);
 assert.match(incidentDetail(incident), /TomTom.*consultado.*BRT/);
}
assert.equal(result.hasRoadClosure, false); assert.match(result.message, /não confirmado/);
assert.equal(result.durationSeconds, 600); assert.equal(result.trafficDelaySeconds, 50);
route.sections = [{ sectionType: 'TRAFFIC', simpleCategory: 'ROAD_CLOSURE', eventId: 'same-way', startPointIndex: 0, endPointIndex: 1, magnitudeOfDelay: 4, delayInSeconds: 50 }];
const withSection = await context.preview('0,0', '0,0.01', 'fixture');
assert.equal(withSection.hasRoadClosure, true);
assert.equal(withSection.incidents.find(i=>i.id==='same-way').association, 'on_route');
assert.match(withSection.message, /Bloqueio detectado/);
// Confirmed closure must survive a full nearby result set and the 3-row UI cap.
for (let i=0;i<20;i++) fixtures.push(near(`near-${i}`, [0.005,0]));
route.sections = Array.from({length:15},(_,i)=>({sectionType:'TRAFFIC',simpleCategory:i===14?'ROAD_CLOSURE':'TRAFFIC',eventId:`section-${i}`,startPointIndex:0,endPointIndex:1,magnitudeOfDelay:i===14?4:1}));
const capped=await context.preview('0,0','0,0.01','fixture');
assert.equal(capped.incidents.length,12);assert.equal(capped.hasRoadClosure,true);
assert.equal(capped.incidents[0].id,'section-14');
assert.equal(prioritizeIncidents(capped.incidents).slice(0,3)[0].id,'section-14');
// Changing the actual route discards old nearby matches; there is no association cache.
route = { ...route, sections: [], legs: [{ points: [{ latitude: 1, longitude: 1 }, { latitude: 1, longitude: 1.01 }] }] };
const changed = await context.preview('1,1','1,1.01','fixture');
assert.equal(changed.incidents.length, 0); assert.equal(changed.hasRoadClosure, false);
// Legacy payloads without provenance cannot assert a route closure but remain visible.
assert.equal(hasConfirmedRouteClosure([{roadClosure:true}]), false);
assert.match(incidentDetail({title:'Ocorrência antiga',roadClosure:true}), /impacto no trajeto não confirmado/);
const telegram = fs.readFileSync('server/telegram-fast-ack.mjs','utf8');
const messageCode = telegram.slice(telegram.indexOf('function commuteAlertMessage('),telegram.indexOf('async function runCommuteMonitorCycle('));
const tc = vm.createContext({ incidentDetail, incidentHeading, prioritizeIncidents, clockLabel: () => '12:00' });
vm.runInContext(messageCode+'\nthis.message=commuteAlertMessage;',tc);
const text=tc.message({presentation_at:'2030-01-01T15:00:00Z',margin_minutes:25,origin:'Fixture A',destination:'Fixture B'},result,{samples:0},'incident');
assert.match(text,/impacto no trajeto não confirmado/); assert.doesNotMatch(text,/BLOQUEIO NA ROTA/);
assert.ok(telegram.includes('const closure = hasConfirmedRouteClosure(incidents);'));
const home=fs.readFileSync('client/src/pages/Home.tsx','utf8');
assert.ok(home.includes('{incidentDetail(incident)}'));assert.ok(home.includes('const body = incidentDetail(critical || incidents[0]);'));
assert.ok(home.includes('hasConfirmedRouteClosure(route.incidents)'));
console.log('PASS: real route producer, six uncertain geometries, route-section confirmation, expired result, changed route, legacy payload, unchanged durations, web and Telegram presentation');
