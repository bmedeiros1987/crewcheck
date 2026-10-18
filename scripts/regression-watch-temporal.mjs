import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const src = fs.readFileSync('client/src/lib/watchContext.ts','utf8');
// Preserve the real producer and its existing shared imports; only transpile TS.
const file = new URL('../client/src/lib/.watch-temporal-test.mjs', import.meta.url);
fs.writeFileSync(file, ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
try {
 const {buildCrewCheckWatchSnapshot:build} = await import(file.href);
 const f = {id:'synthetic-flight',kind:'flight',origin:'GRU',destination:'REC',flightNumber:'TEST1',presentation:'18:20',departure:'19:05',arrival:'22:10',canonical:{startDateTime:'2032-10-18T22:05:00Z',endDateTime:'2032-10-19T01:10:00Z',journeyId:'j',journeyBoundary:'start'}};
 const at = s => Date.parse(s);
 const s = build([f],f,null,at('2032-10-18T21:00:00Z'));
 assert.equal(s.state,'REPORTING'); assert.equal(s.primaryTime,'18:20'); assert.equal(s.schedule[0].time,'19:05'); assert.equal(s.boardingTime,'18:25'); assert.match(s.detail,/Embarque previsto 18\/10 18:25/);
 assert.notEqual(build([f],f,null,at('2032-10-18T22:10:00Z')).state,'IN_FLIGHT');
 const tomorrow=build([f],f,null,at('2032-10-17T21:00:00Z'));assert.equal(tomorrow.state,'UNKNOWN');assert.equal(tomorrow.presentationTime,'');assert.match(tomorrow.detail,/18\/10 19:05 BRT/);assert.equal(tomorrow.gate,'');
 const rest={id:'folga',kind:'duty',day:{type:'FOLGA'},canonical:{kind:'rest',startDateTime:'2032-10-17T03:00:00Z',endDateTime:'2032-10-18T02:59:59Z'}};
 assert.equal(build([rest,f],f,null,at('2032-10-17T21:00:00Z')).state,'OFF_DUTY');
 const midnight={...f,presentation:'23:18',canonical:{...f.canonical,startDateTime:'2032-10-19T03:05:00Z',endDateTime:'2032-10-19T05:00:00Z'}};
 const m=build([midnight],midnight,null,at('2032-10-19T01:50:00Z'));assert.equal(m.primaryTime,'23:18');assert.equal(m.boardingTime,'23:25');assert.match(m.detail,/18\/10 23:25/);
 for(const destination of ['LIS','ZZZ']){const x={...f,destination};assert.equal(build([x],x,null,at('2032-10-18T21:00:00Z')).boardingTime,'');}
 const restSnapshot=build([rest,f],rest,null,at('2032-10-17T21:00:00Z')); assert.equal(restSnapshot.state,'OFF_DUTY'); assert.equal(restSnapshot.presentationTime,'');
 const near={...f,presentation:'00:30',departure:'01:15',canonical:{...f.canonical,startDateTime:'2032-10-18T04:15:00Z',endDateTime:'2032-10-18T06:00:00Z'}}; const nearSnapshot=build([rest,near],near,null,at('2032-10-18T01:00:00Z')); assert.equal(nearSnapshot.state,'OFF_DUTY'); assert(nearSnapshot.validUntilEpochMs >= nearSnapshot.generatedAtEpochMs);
 const missing={...f,presentation:''};assert.equal(build([missing],missing,null,at('2032-10-18T21:00:00Z')).state,'UNKNOWN');
 const ambiguous={...f,canonical:{...f.canonical,startDateTime:'2032-10-18T19:05:00'}};assert.equal(build([ambiguous],ambiguous,null,at('2032-10-18T21:00:00Z')).state,'UNKNOWN');
 const expired=build([f],f,null,at('2032-10-19T02:00:00Z'));assert.equal(expired.gate,'');assert.equal(expired.schedule.length,0);assert.match(expired.detail,/encerrada/);
 const leg={...f,id:'leg2',flightNumber:'TEST2',canonical:{...f.canonical,startDateTime:'2032-10-19T02:00:00Z',endDateTime:'2032-10-19T04:00:00Z'}};assert.equal(build([f,leg],f,null,at('2032-10-18T21:00:00Z')).nextFlight,'TEST2');
 const route={eventId:f.id,updatedAtEpochMs:at('2032-10-18T21:00:00Z'),durationMinutes:30,marginMinutes:10};const leave=build([f],f,route,route.updatedAtEpochMs);assert.equal(leave.leaveTime,'17:40');
 console.log('PASS watch temporal',process.env.TZ,JSON.stringify({state:s.state,apz:s.primaryTime,departure:s.schedule[0].time,boarding:s.boardingTime}));
} finally { fs.unlinkSync(file); }
