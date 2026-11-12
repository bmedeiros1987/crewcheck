import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const file = new URL('../client/src/lib/.watch-overnight-test.mjs', import.meta.url);
fs.writeFileSync(file, ts.transpileModule(fs.readFileSync(process.env.WATCH_CONTEXT_SOURCE || 'client/src/lib/watchContext.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
try {
 const {buildCrewCheckWatchSnapshot:build}=await import(file.href);
 const at=Date.parse;
 const stay={id:'stay-occurrence-1',kind:'stay',hotel:'Synthetic hotel',origin:'REC',destination:'REC',presentation:'04:00',canonical:{startDateTime:'2032-10-18T23:00:00Z',endDateTime:'2032-10-19T12:00:00Z'}};
 const tomorrow={id:'next-leg',kind:'flight',origin:'REC',destination:'GRU',flightNumber:'TEST2',presentation:'09:20',canonical:{leg:{departureTime:'10:00',presentationTime:'09:20'},startDateTime:'2032-10-19T13:00:00Z',endDateTime:'2032-10-19T16:00:00Z'}};
 const now=at('2032-10-19T02:00:00Z');
 const s=build([stay,tomorrow],tomorrow,null,now);
 assert.equal(s.contextId,stay.id);assert.equal(s.state,'OVERNIGHT');assert.equal(s.headline,'PERNOITE');assert.equal(s.presentationTime,'');assert.equal(s.hotelPickup,'APZ hotel não informada');assert.match(s.detail,/APZ no hotel não informada/);
 const signature=[stay.id,stay.canonical.startDateTime,stay.canonical.endDateTime,stay.origin,stay.destination].join('|');
 const record={eventId:stay.id,signature,apzConfirmed:true,apzSource:'manual',apzDate:'2032-10-19',timeZone:'America/Recife',draft:{presentationTime:'07:30'}};
 const confirmed=build([stay,tomorrow],tomorrow,null,now,record);
 assert.equal(confirmed.hotelPickup,'APZ hotel 19/10 07:30 America/Recife');assert.equal(confirmed.presentationTime,'');
 assert(confirmed.validUntilEpochMs<=at('2032-10-19T10:30:00Z'));
 for(const patch of [{eventId:'other'},{signature:signature+'changed'},{apzConfirmed:false},{apzSource:'legacy-unconfirmed'},{timeZone:''},{apzDate:'2032-10-20'},{draft:{presentationTime:'25:00'}}])assert.equal(build([stay,tomorrow],tomorrow,null,now,{...record,...patch}).hotelPickup,'APZ hotel não informada');
 const apzPast=build([stay],stay,null,at('2032-10-19T10:30:00Z'),record);assert.equal(apzPast.state,'LEAVE_SOON','confirmed hotel van starts departure context at its own instant');assert.match(apzPast.hotelPickup,/07:30/);assert.equal(apzPast.presentationTime,'','hotel van is never airport presentation');
 // Before/at/after the confirmed van: context only, never a canonical rest edit.
 const original=JSON.stringify([stay,tomorrow,record]);
 for(const minute of ['10:29','10:30','10:31']){
  const clock=at('2032-10-19T'+minute+':00Z');
  const snap=build([stay,tomorrow],tomorrow,null,clock,record);
  assert.equal(snap.state,minute==='10:29'?'OVERNIGHT':'LEAVE_SOON');
  assert.match(snap.hotelPickup,/07:30 America\/Recife/);
  assert.equal(snap.presentationTime,'');
  if(minute!=='10:29'){assert.equal(snap.headline,'VAN DO HOTEL');assert.equal(snap.leaveTime,'07:30');assert.doesNotMatch(snap.headline,/SAIR EM/);}
  assert.equal(build([stay,tomorrow],tomorrow,null,clock,null).state,'OVERNIGHT','airport APZ cannot invent a hotel van');
  for(const patch of [{eventId:'other'},{signature:signature+'other'},{apzConfirmed:false},{apzSource:'imported-unverified'},{apzDate:'2032-10-20'},{timeZone:''}])assert.equal(build([stay,tomorrow],tomorrow,null,clock,{...record,...patch}).state,'OVERNIGHT','unconfirmed/divergent van never changes the context');
 }
 assert.equal(JSON.stringify([stay,tomorrow,record]),original,'projection never edits canonical stay/rest/airport APZ');
 const crossed={...record,apzDate:'2032-10-18',timeZone:'America/Recife',draft:{presentationTime:'23:30'}};
 assert.equal(build([stay],stay,null,at('2032-10-19T02:29:00Z'),crossed).state,'OVERNIGHT');
 assert.equal(build([stay],stay,null,at('2032-10-19T02:30:00Z'),crossed).state,'LEAVE_SOON','local date/fuso resolve across UTC midnight');
 const rest={id:'synthetic-rest',kind:'rest',canonical:{kind:'rest',startDateTime:'2032-10-19T00:00:00Z',endDateTime:'2032-10-20T00:00:00Z'}};
 assert.equal(build([rest],rest,null,now,record).state,'OFF_DUTY','hotel evidence cannot turn a rest-only day into work');
 const future=build([stay],stay,null,at('2032-10-18T22:59:59Z'));assert.equal(future.state,'UNKNOWN');assert.equal(future.headline,'PRÓXIMA ESCALA');
 const ended=build([stay],stay,null,at('2032-10-19T12:00:00Z'));assert.equal(ended.state,'UNKNOWN');assert.equal(ended.headline,'ESCALA ENCERRADA');assert.equal(ended.hotelPickup,'');
 const noZone={...stay,canonical:{...stay.canonical,startDateTime:'2032-10-18T20:00:00'}};assert.notEqual(build([noZone,tomorrow],tomorrow,null,now).state,'OVERNIGHT');
 const overlap={...stay,id:'other-stay'};assert.notEqual(build([stay,overlap,tomorrow],tomorrow,null,now).state,'OVERNIGHT');
 const delayed={...tomorrow,canonical:{...tomorrow.canonical,startDateTime:'2032-10-19T15:00:00Z',endDateTime:'2032-10-19T18:00:00Z'}};assert.equal(build([stay,delayed],delayed,null,now).state,'OVERNIGHT');
 // No hotel APZ can be inferred from airport APZ, departure or pickup.
 assert.equal(build([stay],{...stay,presentation:'07:30',departure:'07:30',hotelPickup:'07:30'},null,now).hotelPickup,'APZ hotel não informada');
 console.log('PASS overnight UX actual producer',process.env.TZ);
} finally {fs.unlinkSync(file);}
