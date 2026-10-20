import assert from 'node:assert/strict';
import {loadClientModules} from './lib/ts-module-harness.mjs';
import {regulationProgramDay} from '../shared/regulationScenarioPrefill.mjs';

const modules=loadClientModules({files:['client/src/lib/canonicalRoster.ts','client/src/lib/canonicalDutyMeasurement.ts'],prefix:'synthetic-journey-label-'});
try {
  const canonical=modules.load('canonicalRoster'),measure=modules.load('canonicalDutyMeasurement');
  // Synthetic clocks/routes: only the reported APZ and flight identifiers mirror
  // the incident. This fixture is not an assertion about the actual itinerary.
  const day={date:'20/10/2032',year:2032,month:10,type:'VOO',base:'BSB',dutyReport:'04:10',dutyReportSource:'published',dutyDebrief:'11:25',dutyDebriefSource:'published',legs:[
    {flightNumber:'LA4527',origin:'BSB',destination:'GRU',departureTime:'05:00',arrivalTime:'06:00',presentationTime:'04:10',workType:'OP'},
    {flightNumber:'LA3036',origin:'GRU',destination:'BSB',departureTime:'07:00',arrivalTime:'08:00',workType:'PS'},
    {flightNumber:'LA3039',origin:'BSB',destination:'REC',departureTime:'09:30',arrivalTime:'10:55',workType:'OP'},
  ]};
  for(const zone of ['UTC','America/Sao_Paulo','Asia/Tokyo']) {
    process.env.TZ=zone;
    const events=canonical.buildCanonicalRosterEvents({days:[day],year:2032,month:10,base:'BSB'}).filter(e=>e.kind==='flight');
    const ui=events.map(c=>({id:c.id,kind:c.kind,canonical:c,day:c.publishedDay}));
    for(const event of events) {
      const result=measure.measureCanonicalDuty(events,event.id);
      assert.equal(result.minutes,435);
      assert.equal(result.program,'LA4527 (OP) → LA3036 (PS) → LA3039 (OP)');
      assert.equal(result.start,'2032-10-20T07:10:00.000Z');
      assert.equal(result.end,'2032-10-20T14:25:00.000Z');
      const source=regulationProgramDay(ui,ui.find(e=>e.id===event.id));
      assert.equal(source.dutyReport,'04:10');
      assert.deepEqual(source.legs.map(l=>[l.flightNumber,l.workType]),day.legs.map(l=>[l.flightNumber,l.workType]));
    }
    const later={...day,date:'21/10/2032',dutyReport:'04:10',legs:day.legs.map(l=>({...l,flightNumber:l.flightNumber+'X'}))};
    const both=canonical.buildCanonicalRosterEvents({days:[day,later],year:2032,month:10,base:'BSB'}).filter(e=>e.kind==='flight');
    assert.doesNotMatch(measure.measureCanonicalDuty(both,both[1].id).program,/X/,'another journey never leaks into the label');
  }
  console.log('PASS canonical whole-journey label and APZ/PS propagation (3 zones; synthetic only)');
} finally { modules.cleanup(); }
