import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadClientModules } from './lib/ts-module-harness.mjs';
const modules=loadClientModules({files:['client/src/lib/canonicalDutyMeasurement.ts','client/src/lib/complianceEngine.ts','client/src/lib/canonicalRoster.ts'],expose:{complianceEngine:['getRegulatoryDutyBreakdown','getDutyHours']},prefix:'synthetic-canonical-duty-'});
try {
  const canonical=modules.load('canonicalRoster'),measurement=modules.load('canonicalDutyMeasurement'),engine=modules.load('complianceEngine');
  const leg=(number,origin,destination,departureTime,arrivalTime,duration,presentationTime)=>({flightNumber:number,origin,destination,departureTime,arrivalTime,duration,presentationTime,workType:'OP',aircraftType:'SYNTHETIC'});
  const day={date:'10/10/2032',year:2032,month:10,type:'VOO',pairingCode:'SYN',base:'BSB',dutyReport:'07:25',dutyDebrief:'14:05',legs:[leg('QA0001','BSB','GRU','08:20','10:35',2.25),leg('QA0002','GRU','BSB','11:20','13:35',2.25)],rawText:'SYNTHETIC ONLY'};
  const roster=days=>({year:2032,month:10,base:'BSB',rank:'CC',airline:'LA',crewName:'SYNTHETIC',days});
  const evidence=[];
  for(const timezone of ['America/Sao_Paulo','UTC','Asia/Tokyo']) {
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
    const standby={...day,type:'HSB',pairingCode:'HSB'};const h=canonical.buildCanonicalRosterEvents(roster([standby])).filter(x=>x.kind==='flight');const hm=measurement.measureCanonicalDuty(h,h[0].id);assert.equal(hm.state,'incomplete');assert.equal(hm.minutes,null);assert.equal(hm.limitConfirmed,false,'no activation or16h inferred from HSB+OP');
    const excessive={...day,dutyReport:'05:00',dutyDebrief:'21:30',legs:[leg('QA-LONG','BSB','GRU','05:55','21:00',15+5/60)]};const x=canonical.buildCanonicalRosterEvents(roster([excessive])).filter(e=>e.kind==='flight');assert.equal(measurement.measureCanonicalDuty(x,x[0].id).minutes,990);assert.ok(engine.getPublishedDutyLimitSummary(excessive,null).remainingHours<0,'excess is preserved, never clamped tozero');
    assert.equal(measurement.measureCanonicalDuty(events,'missing'),null);
    evidence.push({timezone,measurement:m,reserve:rm,standby:hm});
  }
  const first={...day,date:'04/10/2032',dutyReport:'22:15',dutyDebrief:'23:55',legs:[leg('QA-NIGHT1','BSB','GRU','23:10','23:55',.75)]};
  const second={...day,date:'05/10/2032',dutyReport:'00:45',dutyDebrief:'02:40',legs:[leg('QA-NIGHT2','GRU','BSB','00:45','02:10',85/60)]};
  const overnight=canonical.buildCanonicalRosterEvents(roster([first,second])).filter(e=>e.kind==='flight');assert.equal(overnight[0].journeyId,overnight[1].journeyId);const night=measurement.measureCanonicalDuty(overnight,overnight[1].id);assert.equal(night.state,'available');assert.equal(night.minutes,265);assert.equal(night.groundMinutes,50);const september={...first,date:'30/09/2032',month:9};const october={...second,date:'01/10/2032'};assert.equal(engine.getCanonicalWorkHoursTotal(roster([september,october])),2.7,'only actual October overlap belongs to October total');assert.equal(engine.getCanonicalWorkHoursTotal({...roster([september,october]),month:9}),1.8,'September portion not duplicated in October');assert.equal(engine.getCanonicalWorkHoursTotal(roster([first,second])),4.4,'monthly total consumes full cross-midnight journey once');
  const other={...overnight[0],id:'SYN-OTHER',journeyId:'SYN-INDEPENDENT',startDateTime:'2032-10-05T15:00:00Z',endDateTime:'2032-10-05T16:00:00Z'};assert.equal(measurement.measureCanonicalDuty([...overnight,other],overnight[1].id).minutes,265,'another journey on same date is not merged');
  fs.mkdirSync('artifacts/canonical-duty-measurement',{recursive:true});fs.writeFileSync('artifacts/canonical-duty-measurement/report.json',JSON.stringify({synthetic:true,evidence,overnight:night},null,2));
  console.log('PASS actual canonical engine/summary: full ground-inclusive span,3 timezones, missing boundaries, reserve, HSB uncertainty, excess, overnight, identity and dedup');
}finally{modules.cleanup();}
