import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {build} from 'esbuild';import {pathToFileURL} from 'node:url';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'regulation-automatic-'));
try{
 const entry=`export * from ${JSON.stringify(path.resolve('client/src/lib/regulationAutomaticScenario.ts'))};export * from ${JSON.stringify(path.resolve('client/src/lib/regulationAircraftEvidence.ts'))};export {buildCanonicalRosterEvents} from ${JSON.stringify(path.resolve('client/src/lib/canonicalRoster.ts'))};export {getScheduledDutyLimitReference} from ${JSON.stringify(path.resolve('client/src/lib/complianceEngine.ts'))};export {regulationProgramDay} from ${JSON.stringify(path.resolve('shared/regulationScenarioPrefill.mjs'))};`;
 await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:path.join(dir,'fixture.mjs'),logLevel:'silent'});
 const m=await import(pathToFileURL(path.join(dir,'fixture.mjs')));
 const leg={flightNumber:'QA1234',origin:'BSB',destination:'GRU',departureTime:'16:00',arrivalTime:'22:55',workType:'OP',aircraftType:'A320',presentationTime:'14:53'};
 const day={date:'05/11/2026',year:2026,month:11,type:'VOO',base:'BSB',dutyReport:'14:53',dutyReportSource:'published',dutyDebrief:'23:25',dutyDebriefSource:'published',legs:[leg]};
 const events=m.buildCanonicalRosterEvents({days:[day],year:2026,month:11,base:'BSB'}).filter(e=>e.kind==='flight');
 const ui=events.map(c=>({id:c.id,kind:c.kind,canonical:c,day:c.publishedDay}));
 const c=m.regulationAutomaticContext(m.regulationProgramDay(ui,ui[0]),events[0]);
 const history={base:'BSB',year:2026,month:11,days:Array.from({length:8},(_,i)=>{const n=i+29,d=new Date(Date.UTC(2026,9,n)),date=d.toISOString().slice(0,10).split('-').reverse().join('/');return {...day,date,type:'DO',legs:[]};})};
 for(const n of [3,4]){const i=history.days.findIndex(d=>d.date===`0${n}/11/2026`);history.days[i]={...day,date:`0${n}/11/2026`,dutyReport:'19:00',dutyDebrief:'02:30',isNextDay:true,legs:[{...leg,departureTime:'20:00',arrivalTime:'02:00',isNextDay:true}]};}
 history.days[history.days.findIndex(d=>d.date===day.date)]=day;
 const candidate={...c.form,presentation:'2026-11-05T14:53',plannedEnd:'2026-11-05T23:25'};
 // Fourth argument will carry the actual publication history, not period maxima.
 const r=m.regulationAutomaticAssessment(c,candidate,null,history);
 console.log(JSON.stringify({normalDutyEnd:r.normalDutyEnd,engineStopLimit:r.engineStopLimit,margin:r.marginMinutes,history:'two preceding synthetic night duties'}));
 assert.equal(r.engineStopLimit,'2026-11-06T02:29:00.000Z','third operating night must cap at 23:29 BRT with 30min postflight and minute-resolution end before midnight');
 assert.equal(r.normalDutyEnd,'2026-11-06T02:59:00.000Z');
 assert.equal(r.marginMinutes,34);
 console.log('PASS automatic night deadline synthetic regression');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
