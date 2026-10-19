import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadClientModules } from './lib/ts-module-harness.mjs';
const modules=loadClientModules({files:['client/src/lib/canonicalDutyMeasurement.ts','client/src/lib/complianceEngine.ts','client/src/lib/canonicalRoster.ts'],expose:{complianceEngine:['getRegulatoryDutyBreakdown','getDutyHours']},prefix:'synthetic-canonical-duty-'});
try {
  const canonical=modules.load('canonicalRoster'),measurement=modules.load('canonicalDutyMeasurement'),engine=modules.load('complianceEngine');
  const leg=(number,origin,destination,departureTime,arrivalTime,duration,presentationTime)=>({flightNumber:number,origin,destination,departureTime,arrivalTime,duration,presentationTime,workType:'OP',aircraftType:'SYNTHETIC'});
  const day={date:'10/10/2032',year:2032,month:10,type:'VOO',pairingCode:'SYN',base:'BSB',dutyReport:'07:25',dutyDebrief:'14:05',dutyReportSource:'published',dutyDebriefSource:'published',legs:[leg('QA0001','BSB','GRU','08:20','10:35',2.25),leg('QA0002','GRU','BSB','11:20','13:35',2.25)],rawText:'SYNTHETIC ONLY'};
  const roster=days=>({year:2032,month:10,base:'BSB',rank:'CC',airline:'LA',crewName:'SYNTHETIC',days});
  const evidence=[];
  for(const timezone of ['America/Sao_Paulo','UTC','Asia/Tokyo','Pacific/Honolulu']) {
    process.env.TZ=timezone;
    const events=canonical.buildCanonicalRosterEvents(roster([day])).filter(e=>e.kind==='flight');
    const m=measurement.measureCanonicalDuty(events,events[1].id);
    assert.equal(m.state,'available');assert.equal(m.minutes,400);assert.equal(m.groundMinutes,45);assert.equal(measurement.canonicalDutyDurationLabel(m.minutes),'6h40');assert.equal(m.limitConfirmed,false);
    assert.equal(engine.getCanonicalWorkHoursTotal(roster([day])),6.7);
    assert.equal(engine.getRegulatoryDutyBreakdown(day).dutyHours,6.7,'legacy engine no longer removes45min ground');
    assert.equal(engine.getPublishedDutyLimitSummary(day,null).usedHours,6.7);
    const duplicate=measurement.measureCanonicalDuty([...events,{...events[0],id:'SYN-DUPLICATE'}],events[1].id);assert.equal(duplicate.minutes,400);
    for(const field of ['dutyReport','dutyDebrief']) {
      const incomplete={...day,[field]:null};const e=canonical.buildCanonicalRosterEvents(roster([incomplete])).filter(x=>x.kind==='flight');const p=measurement.measureCanonicalDuty(e,e[0].id);assert.equal(p.state,'incomplete');assert.equal(p.minutes,null);assert.equal(engine.getCanonicalWorkHoursTotal(roster([incomplete])),null);assert.equal(engine.getPublishedDutyLimitSummary(incomplete,null),null);
    }
    const reserve={...day,type:'ASB',pairingCode:'ASB',dutyReport:'04:10'};const r=canonical.buildCanonicalRosterEvents(roster([reserve])).filter(x=>x.kind==='flight');const rm=measurement.measureCanonicalDuty(r,r[0].id);assert.equal(rm.state,'available');assert.equal(rm.minutes,595,'reserve attached to same published flight block starts at04:10, once');
    const blocks={...day,type:'ASB',pairingCode:'ASB',dutyReport:'03:00',dutyDebrief:'17:30',legs:[leg('QA-ASB-FIRST','BSB','GRU','08:00','09:00',1),leg('QA-ASB-SECOND','GRU','BSB','16:00','17:00',1,'15:00')]};
    const originalBlocks=JSON.stringify(blocks);const split=canonical.buildCanonicalRosterEvents(roster([blocks])).filter(e=>e.kind==='flight');
    assert.equal(split.length,2);assert.notEqual(split[0].journeyId,split[1].journeyId);assert.equal(split[1].legIndex,1);
    const own=measurement.measureCanonicalDuty(split,split[1].id),ownEndpoints=measurement.publishedDutyEndpoints(split,split[1].id);
    assert.equal(own.state,'available');assert.equal(own.start,'2032-10-10T18:00:00.000Z');assert.equal(own.minutes,150,'second block must not add first-block reserve hours');
    assert.equal(ownEndpoints.start,Date.parse(own.start));assert.equal(measurement.publishedDutyEndpoints(split,split[0].id).start,Date.parse('2032-10-10T06:00:00Z'),'first reserve03:00 retained');
    assert.equal(engine.getCanonicalWorkHoursTotal(roster([blocks])),null,'incomplete first block still prevents a partial total');assert.equal(JSON.stringify(blocks),originalBlocks);
    const unknownBlock={...blocks,legs:[blocks.legs[0],{...blocks.legs[1],origin:'CNF',presentationTime:undefined}]};
    const incompleteSplit=canonical.buildCanonicalRosterEvents(roster([unknownBlock])).filter(e=>e.kind==='flight');const unknownSecond=incompleteSplit.find(e=>e.flightNumber==='QA-ASB-SECOND'),unknownFirst=incompleteSplit.find(e=>e.flightNumber==='QA-ASB-FIRST');assert.notEqual(unknownFirst.journeyId,unknownSecond.journeyId);
    assert.equal(measurement.measureCanonicalDuty(incompleteSplit,unknownSecond.id).minutes,null);assert.equal(measurement.publishedDutyEndpoints(incompleteSplit,unknownSecond.id).start,null,'unknown second APZ cannot inherit03:00');
    const estimatedEnd={...blocks,dutyDebriefSource:'estimated'};const pendingEnd=canonical.buildCanonicalRosterEvents(roster([estimatedEnd])).filter(e=>e.kind==='flight');
    assert.equal(measurement.measureCanonicalDuty(pendingEnd,pendingEnd[1].id).minutes,null);assert.equal(measurement.publishedDutyEndpoints(pendingEnd,pendingEnd[1].id).start,Date.parse('2032-10-10T18:00:00Z'));assert.equal(measurement.publishedDutyEndpoints(pendingEnd,pendingEnd[1].id).end,null);
    for(const source of ['estimated','unknown',undefined]) {
      const uncertain={...reserve,dutyReport:'03:00',dutyReportSource:source,legs:reserve.legs.map((l,i)=>({...l,...(i===0?{presentationTime:'07:00'}:{})}))};
      const uncertainEvents=canonical.buildCanonicalRosterEvents(roster([uncertain])).filter(e=>e.kind==='flight'),start=uncertainEvents.find(e=>e.flightNumber==='QA0001');
      assert.equal(measurement.measureCanonicalDuty(uncertainEvents,start.id).state,'incomplete','literal leg APZ does not publish the unknown full reserve duration');assert.equal(measurement.measureCanonicalDuty(uncertainEvents,start.id).minutes,null);assert.equal(engine.getCanonicalWorkHoursTotal(roster([uncertain])),null);assert.equal(measurement.publishedDutyEndpoints(uncertainEvents,start.id).start,Date.parse('2032-10-10T10:00:00Z'));
    }
    for(const rows of [[blocks,{...blocks,legs:[blocks.legs[1]]}],[{...blocks,legs:[blocks.legs[1]]},blocks]]) {
      const replicas=canonical.buildCanonicalRosterEvents(roster(rows)).filter(e=>e.kind==='flight');
      for(const e of replicas.filter(e=>e.flightNumber==='QA-ASB-SECOND')) {
        assert.equal(measurement.measureCanonicalDuty(replicas,e.id).start,'2032-10-10T18:00:00.000Z');assert.equal(measurement.publishedDutyEndpoints(replicas,e.id).start,Date.parse('2032-10-10T18:00:00Z'));
      }
    }
    for(const explicit of [true,false]) {
      const filtered={...blocks,dutyDebrief:'19:30',legs:[blocks.legs[0],{...blocks.legs[1],origin:'CNF',destination:'SSA',presentationTime:explicit?'15:00':undefined},leg('QA-CONTINUATION','SSA','CNF','18:00','19:00',1)]};
      const filteredEvents=canonical.buildCanonicalRosterEvents(roster([filtered])).filter(e=>e.kind==='flight'),selected=filteredEvents.find(e=>e.flightNumber==='QA-ASB-SECOND');assert.equal(selected.legIndex,0,'physical filtering reindexes the selected flight');assert(!filteredEvents.some(e=>e.flightNumber==='QA-ASB-FIRST'));
      const measured=measurement.measureCanonicalDuty(filteredEvents,selected.id);assert.equal(measured.minutes,explicit?270:null);assert.equal(measurement.publishedDutyEndpoints(filteredEvents,selected.id).start,explicit?Date.parse('2032-10-10T18:00:00Z'):null);assert.equal(engine.getCanonicalWorkHoursTotal(roster([filtered])),explicit?4.5:null,'shared total cannot claim16.5h from an unrelated reserve');
    }
    const clockOwn=leg('QA-CLOCK','GRU','BSB','08:00','09:00',1,'07:00');
    const clockFull={...blocks,dutyReport:'00:00',dutyDebrief:'09:30',legs:[leg('QA-EARLY','CNF','GRU','04:00','05:00',1),clockOwn]},clockPartial={...clockFull,legs:[{...clockOwn,departureTime:'8:00',arrivalTime:'9:00'}]};
    for(const rows of [[clockFull,clockPartial],[clockPartial,clockFull]]) {
      const equivalent=canonical.buildCanonicalRosterEvents(roster(rows)).filter(e=>e.kind==='flight');
      for(const selected of equivalent.filter(e=>e.flightNumber==='QA-CLOCK')){assert.equal(measurement.measureCanonicalDuty(equivalent,selected.id).minutes,150);assert.equal(measurement.publishedDutyEndpoints(equivalent,selected.id).start,Date.parse('2032-10-10T10:00:00Z'));}
      assert.equal(engine.getCanonicalWorkHoursTotal(roster(rows)),null);
    }
    const clockEvidence=(raw)=>({dutyReport:raw.dutyReport,dutyDebrief:raw.dutyDebrief,dutyReportSource:raw.dutyReportSource,dutyDebriefSource:raw.dutyDebriefSource,legs:raw.legs.map(({departureTime,arrivalTime,presentationTime})=>({departureTime,arrivalTime,presentationTime}))});
    for(const kind of ['estimated','earlier-block','missing-clock','cycle','depth','node-budget']) {
      const raw={...blocks,dutyDebrief:'17:30',legs:[blocks.legs[1]]},original=clockEvidence(raw);
      let nested=kind==='estimated'?{...original,dutyReportSource:'estimated'}:kind==='earlier-block'?{...original,legs:clockEvidence(blocks).legs}:kind==='missing-clock'?{...original,legs:[{...original.legs[0],arrivalTime:''}]}:{...original};
      if(kind==='cycle')nested.records=[nested];
      if(kind==='depth')for(let i=0;i<66;i++)nested={...original,records:[nested]};
      if(kind==='node-budget')nested={...original,records:Array.from({length:4441},()=>({...original}))};
      raw.publishedClockEvidence={...original,records:[{...original,records:[nested]}]};
      const nestedEvents=canonical.buildCanonicalRosterEvents(roster([raw])).filter(e=>e.kind==='flight'),selected=nestedEvents.find(e=>e.flightNumber==='QA-ASB-SECOND');
      const measured=measurement.measureCanonicalDuty(nestedEvents,selected.id),endpoint=measurement.publishedDutyEndpoints(nestedEvents,selected.id),known=['estimated','earlier-block'].includes(kind);
      assert.equal(measured.minutes,kind==='earlier-block'?150:null,kind);assert.equal(endpoint.start,known?Date.parse('2032-10-10T18:00:00Z'):null,kind);
      assert.equal(measurement.publishedFlightClockBounds(nestedEvents)===null,!known,kind);assert.equal(engine.getCanonicalWorkHoursTotal(roster([raw])),kind==='earlier-block'?2.5:null,kind);
    }
    const standby={...day,type:'HSB',pairingCode:'HSB'};const h=canonical.buildCanonicalRosterEvents(roster([standby])).filter(x=>x.kind==='flight');const hm=measurement.measureCanonicalDuty(h,h[0].id);assert.equal(hm.state,'incomplete');assert.equal(hm.minutes,null);assert.equal(hm.limitConfirmed,false,'no activation or16h inferred from HSB+OP');
    const excessive={...day,dutyReport:'05:00',dutyDebrief:'21:30',legs:[leg('QA-LONG','BSB','GRU','05:55','21:00',15+5/60)]};const x=canonical.buildCanonicalRosterEvents(roster([excessive])).filter(e=>e.kind==='flight');assert.equal(measurement.measureCanonicalDuty(x,x[0].id).minutes,990);assert.ok(engine.getPublishedDutyLimitSummary(excessive,null).remainingHours<0,'excess is preserved, never clamped tozero');
    assert.equal(measurement.measureCanonicalDuty(events,'missing'),null);
    evidence.push({timezone,measurement:m,reserve:rm,standby:hm});
  }
  const first={...day,date:'04/10/2032',dutyReport:'22:15',dutyDebrief:'23:55',legs:[leg('QA-NIGHT1','BSB','GRU','23:10','23:55',.75)]};
  const second={...day,date:'05/10/2032',dutyReport:'00:45',dutyDebrief:'02:40',legs:[leg('QA-NIGHT2','GRU','BSB','00:45','02:10',85/60)]};
  const overnight=canonical.buildCanonicalRosterEvents(roster([first,second])).filter(e=>e.kind==='flight');assert.equal(overnight[0].journeyId,overnight[1].journeyId);const night=measurement.measureCanonicalDuty(overnight,overnight[1].id);assert.equal(night.state,'available');assert.equal(night.minutes,265);assert.equal(night.groundMinutes,50);const september={...first,date:'30/09/2032',month:9};const october={...second,date:'01/10/2032'};assert.equal(engine.getCanonicalWorkHoursTotal(roster([september,october])),2.7,'only actual October overlap belongs to October total');assert.equal(engine.getCanonicalWorkHoursTotal({...roster([september,october]),month:9}),1.8,'September portion not duplicated in October');assert.equal(engine.getCanonicalWorkHoursTotal(roster([first,second])),4.4,'monthly total consumes full cross-midnight journey once');

  const badArrival={...day,legs:[{...day.legs[0],arrivalTime:''}]};const be=canonical.buildCanonicalRosterEvents(roster([badArrival])).filter(e=>e.kind==='flight');assert.equal(measurement.measureCanonicalDuty(be,be[0].id).minutes,null,'canonical fallback arrival does not establish published duration');
  const unknown={...day,dutyDebriefSource:undefined};const ue=canonical.buildCanonicalRosterEvents(roster([unknown])).filter(e=>e.kind==='flight');assert.equal(measurement.measureCanonicalDuty(ue,ue[0].id).minutes,null,'legacy clock without publication origin is pending');
  const estimated={...day,dutyDebriefSource:'estimated'};const ee=canonical.buildCanonicalRosterEvents(roster([estimated])).filter(e=>e.kind==='flight');assert.equal(measurement.measureCanonicalDuty(ee,ee[0].id).debriefSource,'estimated');assert.equal(measurement.measureCanonicalDuty(ee,ee[0].id).minutes,null);
  const startEdge={...day,date:'31/10/2032',month:10,dutyReport:'23:20',dutyDebrief:'02:30',legs:[leg('QA-EDGE','BSB','GRU','00:15','02:00',1.75)]};assert.equal(engine.getCanonicalWorkHoursTotal(roster([startEdge])),.7,'October includes40min presentation before November flight');
  const endEdge={...day,date:'30/09/2032',month:9,dutyReport:'21:00',dutyDebrief:'00:15',legs:[leg('QA-EDGE2','BSB','GRU','21:55','23:45',110/60)]};assert.equal(engine.getCanonicalWorkHoursTotal(roster([endEdge])),.3,'October includes15min release after September flight');
  const hsbNight=canonical.buildCanonicalRosterEvents(roster([{...first,type:'HSB',pairingCode:'HSB'},second])).filter(e=>e.kind==='flight');assert.equal(hsbNight[0].journeyId,hsbNight[1].journeyId);for(const e of hsbNight){const m=measurement.measureCanonicalDuty(hsbNight,e.id);assert.equal(m.minutes,null);assert.match(m.reasons.join(' '),/sobreaviso/);}
  const availability={...day,type:'ASB',pairingCode:'ASB',legs:[],dutyReport:'15:00',dutyDebrief:'21:00'};assert.equal(engine.getCanonicalWorkHoursTotal(roster([day,availability])),null,'separate reserve makes integral work total pending, not a partial legal margin');
  const other={...overnight[0],id:'SYN-OTHER',journeyId:'SYN-INDEPENDENT',startDateTime:'2032-10-05T15:00:00Z',endDateTime:'2032-10-05T16:00:00Z'};assert.equal(measurement.measureCanonicalDuty([...overnight,other],overnight[1].id).minutes,265,'another journey on same date is not merged');
  fs.mkdirSync('artifacts/canonical-duty-measurement',{recursive:true});fs.writeFileSync('artifacts/canonical-duty-measurement/report.json',JSON.stringify({synthetic:true,evidence,overnight:night},null,2));
  console.log('PASS actual canonical engine/summary: full ground-inclusive span,4 timezones, missing boundaries, reserve, HSB uncertainty, excess, overnight, identity and dedup');
}finally{modules.cleanup();}
