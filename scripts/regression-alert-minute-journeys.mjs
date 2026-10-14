import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const root = path.resolve(process.env.ALERT_SOURCE_ROOT || process.cwd());
const { loadClientModules } = await import(pathToFileURL(path.join(root, 'scripts/lib/ts-module-harness.mjs')));
const prepared = fs.readFileSync(path.join(root,'client/src/lib/complianceEngine.ts'),'utf8').includes('function summarizeRegulatoryNightEvents(');
const modules = loadClientModules({ expose: { complianceEngine: prepared ? ['summarizeRegulatoryNightEvents'] : [] }, files: ['client/src/lib/complianceEngine.ts', 'client/src/lib/canonicalRoster.ts', 'client/src/lib/canonicalDutyMeasurement.ts'], prefix: 'synthetic-alert-minutes-' });
const selected = process.argv.find(x => x.startsWith('--case='))?.slice(7);
try {
  const engine = modules.load('complianceEngine'), canonical = modules.load('canonicalRoster'), measurement = modules.load('canonicalDutyMeasurement');
  const roster = days => ({ year: 2032, month: 10, base: 'GRU', rank: 'CC', airline: 'LA', crewName: 'SYNTHETIC ONLY', days });
  const day = (date, report, release, departure, arrival, origin = 'GRU', destination = 'REC', flight = 'LA9900') => ({ date, year: 2032, month: 10, type: 'VOO', pairingCode: 'SYN', base: 'GRU', dutyReport: report, dutyDebrief: release, dutyReportSource: report ? 'published' : undefined, dutyDebriefSource: release ? 'published' : undefined, legs: [{ flightNumber: flight, origin, destination, departureTime: departure, arrivalTime: arrival, presentationTime: report || undefined, workType: 'OP' }] });
  const clock = minutes => `${String(Math.floor(((minutes % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((minutes % 60) + 60) % 60).padStart(2, '0')}`;
  const marginDay = (date, start, elapsed) => {
    const [h, m] = start.split(':').map(Number), at = h * 60 + m;
    const item = day(date, start, clock(at + elapsed), '', '');
    const flightMinutes = elapsed - 70 - 80, lengths = [Math.floor(flightMinutes / 3), Math.floor(flightMinutes / 3)]; lengths.push(flightMinutes - lengths[0] - lengths[1]);
    let cursor = at + 40;
    item.legs = lengths.map((length, i) => { const departureTime = clock(cursor), arrivalTime = clock(cursor + length); cursor += length + 40;
      return { flightNumber: `LA991${i}`, origin: ['GRU','BSB','REC'][i], destination: ['BSB','REC','GRU'][i], departureTime, arrivalTime, duration: length / 60, presentationTime: i === 0 ? start : undefined, workType: 'OP' }; });
    return item;
  };
  for (const timezone of (process.env.ALERT_TEST_TIMEZONE ? [process.env.ALERT_TEST_TIMEZONE] : ['UTC','America/Sao_Paulo','Pacific/Auckland'])) {
    process.env.TZ = timezone;
    if (!selected || selected === 'margin') {
      for (const [date, start, elapsed, limit] of [['22/10/2032','04:50',500,9],['27/10/2032','13:35',680,12],['29/10/2032','02:20',500,9]]) {
        const item = marginDay(date, start, elapsed), summary = engine.getPublishedDutyLimitSummary(item, null);
        assert.equal(summary.maxDutyHours, limit, 'unchanged table selection in this synthetic scenario; not proof of actual profile');
        console.log(JSON.stringify({timezone,case:'margin-observed',date,legacyRemainingMinutes:summary.remainingHours*60,exactRemainingMinutes:summary.remainingMinutes}));
        assert.equal(summary.usedMinutes, elapsed); assert.equal(summary.remainingMinutes, 40); assert.equal(summary.remainingHours * 60, 40);
        const result = engine.analyzeCompliance(roster([item]));
        const alert = result.alerts.find(a => a.title === 'Jornada próxima do limite RBAC 117 — Tabela B.1');
        assert.ok(alert, 'actual published-limit alert'); assert.match(alert.description, /0h40/); assert.doesNotMatch(alert.description, /0h42/);
        console.log(JSON.stringify({ timezone, case: 'margin', date, elapsed, limitMinutes: limit * 60, margin: summary.remainingMinutes, description: alert.description }));
      }
      for (const [elapsed, remaining] of [[479,61],[480,60],[539,1],[540,0],[541,-1]]) {
        const item = marginDay('22/10/2032','04:50',elapsed), summary = engine.getPublishedDutyLimitSummary(item, null);
        assert.equal(summary.remainingMinutes, remaining); const alerts = engine.analyzeCompliance(roster([item])).alerts;
        assert.equal(alerts.some(a => a.title === 'Jornada próxima do limite RBAC 117 — Tabela B.1'), remaining >= 0 && remaining <= 60);
        assert.equal(alerts.some(a => a.title === 'Jornada acima do limite RBAC 117 — Tabela B.1'), remaining < 0);
      }
      const missing = marginDay('22/10/2032','04:50',500); missing.dutyDebrief = null;
      assert.equal(engine.getPublishedDutyLimitSummary(missing,null),null);
    }
    if (!selected || selected === 'journey') {
      const first = day('04/10/2032','22:10','01:05','22:50','00:35');
      const daytime = day('05/10/2032','06:05','14:25','06:45','13:55');
      const third = day('06/10/2032','02:10','10:30','02:50','10:00');
      const fourth = day('07/10/2032','02:10','10:30','02:50','10:00');
      const interrupted = engine.analyzeCompliance(roster([first,daytime,third,fourth]));
      console.log(JSON.stringify({timezone,case:'journey-observed',maxConsecutiveNights:interrupted.metrics.maxConsecutiveNights}));
      if(prepared) assert.equal(engine.summarizeRegulatoryNightEvents([daytime],48,roster([first,daytime,third,fourth])).maxConsecutiveWorked,0,'summary respects selected days even when identity context contains more journeys');
      assert.equal(interrupted.metrics.maxConsecutiveNights,2,'daytime journey interrupts night journey sequence even on adjacent civil nights');
      assert.ok(!interrupted.alerts.some(a => /consecutivas.*revisar sequência/.test(a.title)), 'no three-journey warning for this fixture');
      const overnight = day('27/10/2032','13:45','01:05','14:25','00:35');
      const following = day('29/10/2032','02:10','10:30','02:50','10:00');
      assert.equal(engine.analyzeCompliance(roster([overnight])).metrics.maxConsecutiveNights,1);
      assert.equal(engine.analyzeCompliance(roster([overnight,following])).metrics.maxConsecutiveNights,2);
      const split1 = day('27/10/2032','13:45',null,'14:25','23:50');
      const split2 = day('28/10/2032',null,'01:05','00:10','00:35','REC','GRU','LA9901');
      const events = canonical.buildCanonicalRosterEvents(roster([split1,split2])).filter(e => e.kind === 'flight');
      assert.equal(new Set(events.map(e=>e.journeyId)).size,1);
      assert.equal(engine.analyzeCompliance(roster([split1,split2,following])).metrics.maxConsecutiveNights,2);
      assert.equal(measurement.measureCanonicalDuty(events,events[0].id).minutes,680,'explicit release, no duplicate +30');
      for (const [start, expected] of [['05:59',1],['06:00',0],['06:01',0]]) assert.equal(engine.analyzeCompliance(roster([day('10/10/2032',start,'08:00',start,'07:30')])).metrics.maxConsecutiveNights,expected);
      assert.equal(engine.analyzeCompliance(roster([first,third,fourth])).metrics.maxConsecutiveNights,3,'three distinct night journeys remain three');
      const availability={...day('05/10/2032','20:00','23:00','',''),type:'HSB',pairingCode:'HSB',legs:[]};
      assert.equal(engine.analyzeCompliance(roster([first,availability,fourth])).metrics.maxConsecutiveNights,2,'availability blocks a 48h-free reset but is not a night journey');
      const longBreak = day('10/10/2032','02:10','10:30','02:50','10:00');
      assert.equal(engine.analyzeCompliance(roster([first,longBreak])).metrics.maxConsecutiveNights,1,'existing 48h free reset retained');
      const unknownEnd={...first,dutyDebrief:null};
      assert.equal(engine.analyzeCompliance(roster([unknownEnd,longBreak])).metrics.maxConsecutiveNights,2,'missing release cannot prove48h free');
      console.log(JSON.stringify({timezone,case:'journey',interrupted:interrupted.metrics.maxConsecutiveNights,splitJourneyCount:1,actualUserSequenceVerified:false}));
    }
  }
  console.log('PASS actual engine/canonical source: exact minute margins and published journey sequence; synthetic only, no rule applicability or execution claimed');
} finally { modules.cleanup(); }
