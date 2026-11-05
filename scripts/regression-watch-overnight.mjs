import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build as bundle } from 'esbuild';
const file = new URL('../client/src/lib/.watch-overnight-test.mjs', import.meta.url);
await bundle({entryPoints:[process.env.WATCH_CONTEXT_SOURCE || 'client/src/lib/watchContext.ts'],outfile:file.pathname,bundle:true,platform:'node',format:'esm',target:'es2022',logLevel:'silent'});
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
 const apzPast=build([stay],stay,null,at('2032-10-19T10:30:00Z'),record);assert.equal(apzPast.hotelPickup,'APZ hotel não informada');
 const future=build([stay],stay,null,at('2032-10-18T22:59:59Z'));assert.equal(future.state,'UNKNOWN');assert.equal(future.headline,'PRÓXIMA ESCALA');
 const ended=build([stay],stay,null,at('2032-10-19T12:00:00Z'));assert.equal(ended.state,'UNKNOWN');assert.equal(ended.headline,'ESCALA ENCERRADA');assert.equal(ended.hotelPickup,'');
 const noZone={...stay,canonical:{...stay.canonical,startDateTime:'2032-10-18T20:00:00'}};assert.notEqual(build([noZone,tomorrow],tomorrow,null,now).state,'OVERNIGHT');
 const overlap={...stay,id:'other-stay'};assert.notEqual(build([stay,overlap,tomorrow],tomorrow,null,now).state,'OVERNIGHT');
 const delayed={...tomorrow,canonical:{...tomorrow.canonical,startDateTime:'2032-10-19T15:00:00Z',endDateTime:'2032-10-19T18:00:00Z'}};assert.equal(build([stay,delayed],delayed,null,now).state,'OVERNIGHT');
 // No hotel APZ can be inferred from airport APZ, departure or pickup.
 assert.equal(build([stay],{...stay,presentation:'07:30',departure:'07:30',hotelPickup:'07:30'},null,now).hotelPickup,'APZ hotel não informada');
 console.log('PASS overnight UX actual producer',process.env.TZ);
} finally {fs.unlinkSync(file);}
