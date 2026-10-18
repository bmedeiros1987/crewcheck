// Synthetic-only integration: execute the actual canonical producer AND extracted
// Home projection/selection functions. No copied projection, roster, API or UI session.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'watch-source-'));
try {
 const root=process.cwd();
 fs.writeFileSync(path.join(dir,'entry.ts'),`export {normalizeRosterDays,buildCanonicalRosterEvents,selectNextRosterEvent,isOperationalCanonicalEvent} from ${JSON.stringify(root+'/client/src/lib/canonicalRoster.ts')}; export * from ${JSON.stringify(root+'/client/src/lib/scheduleActivityClassification.ts')}; export {resolveNextFlightGate} from ${JSON.stringify(root+'/client/src/lib/nextFlightGate.ts')}; export {applyNextFlightToWatchSnapshot} from ${JSON.stringify(root+'/client/src/lib/nextFlightWatch.ts')}; export {buildCrewCheckWatchSnapshot} from ${JSON.stringify(root+'/client/src/lib/watchContext.ts')};`);
 await build({entryPoints:[path.join(dir,'entry.ts')],outfile:path.join(dir,'bundle.mjs'),bundle:true,alias:{'@':root+'/client/src'},platform:'node',format:'esm',logLevel:'silent'});
 const lib=await import(pathToFileURL(path.join(dir,'bundle.mjs')).href);
 let now=Date.parse('2032-10-18T21:00:00Z');
 class FixtureDate extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
 const source=fs.readFileSync('client/src/pages/Home.tsx','utf8');
 const ast=ts.createSourceFile('Home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const names=['buildLegs','applyPresentationManagement','managedPresentationForEvent','parseTimeStrict','presentationLearningKey','presentationOverrideKey','projectedFlightQuality','dedupeProjectedLegs','eventStartDateTime','eventEndDateTime','isOperationalEvent','eventIsNow','noFutureLeg','nextFlight','chronologicalNextRosterLeg'];
 const functions=names.map(name=>{const node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(node,`Real Home function ${name}`);return node.getText(ast);}).join('\n');
 let overrides={};
 const ctx=vm.createContext({...lib,Date:FixtureDate,
   // External display/format adapters only; source/normalization/projection/selection are real.
   safe:(v,fallback='')=>v==null||v===''?fallback:String(v),city:v=>v,
   normalizedAirlineCode:()=> 'QA',airlineNameFor:()=> 'Synthetic',
   addMinutesToTime:()=>'',parseDate:()=>new FixtureDate(),pad2:n=>String(n).padStart(2,'0'),
   loadPresentationOverrides:()=>overrides,loadPresentationRules:()=>({}),dateChip:d=>d.toISOString().slice(0,10),
   placeholderLeg:()=>({id:'empty',placeholder:true}),
 });
 vm.runInContext(ts.transpileModule(functions+'\n globalThis.project=buildLegs;globalThis.choose=nextFlight;', {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,ctx);
 const roster=(leg,extra={})=>({month:10,year:2032,base:'GRU',rawText:'SYNTHETIC ONLY',days:[{date:'18/10/2032',dayNumber:18,month:10,year:2032,type:'VOO',pairingCode:'QA',base:'GRU',rawText:'SYNTHETIC ONLY',legs:[{flightNumber:'QA123',origin:'GRU',destination:'REC',arrivalTime:'22:10',...leg}],...extra}]});
 const snapshot=r=>{const events=ctx.project(r);return {events,selected:ctx.choose(events),out:lib.buildCrewCheckWatchSnapshot(events,ctx.choose(events),null,now)};};
 // Missing APZ becomes STD in canonical compatibility fields, but MUST NOT become watch APZ.
 const absent=snapshot(roster({departureTime:'19:05'}));
 assert.equal(absent.events[0].presentation,'19:05','Reproduce actual upstream fallback');
 assert.equal(absent.out.presentationTime,'');assert.notEqual(absent.out.state,'REPORTING');assert.equal(absent.out.schedule[0].presentation,'');assert(!/Apres\./.test(absent.out.schedule[0].detail));
 const published=snapshot(roster({departureTime:'19:05',presentationTime:'18:20'}));assert.equal(published.out.presentationTime,'18:20');assert.equal(published.out.boardingTime,'18:25');
 const dayReport=snapshot(roster({departureTime:'19:05'},{dutyReport:'18:20',dutyReportSource:'published'}));assert.equal(dayReport.out.presentationTime,'18:20');
 const defaultReport=snapshot(roster({departureTime:'19:05'},{dutyReport:'19:05'}));assert.equal(defaultReport.out.presentationTime,'');
 const duty=snapshot({...roster({}),days:[{date:'18/10/2032',dayNumber:18,month:10,year:2032,type:'RES',pairingCode:'RES',base:'GRU',legs:[],dutyReport:'18:20',dutyReportSource:'published',dutyDebrief:'23:59',rawText:'SYNTHETIC ONLY'}]});assert.equal(duty.out.presentationTime,'18:20');assert.equal(duty.out.state,'REPORTING');
 for(const dutyReportSource of ['estimated','unknown','absent',undefined]) {
   const unknown=snapshot(roster({departureTime:'19:05'},{dutyReport:'18:20',...(dutyReportSource ? {dutyReportSource} : {})}));
   assert.equal(unknown.events[0].presentation,'18:20');
   assert.equal(unknown.out.presentationTime,'',`Day APZ source ${dutyReportSource} is not publication proof`);
   assert.notEqual(unknown.out.state,'REPORTING');
   assert.equal(unknown.out.schedule[0].presentation,'');
   const dutyUnknown=snapshot({...roster({}),days:[{date:'18/10/2032',dayNumber:18,month:10,year:2032,type:'RES',pairingCode:'RES',base:'GRU',legs:[],dutyReport:'18:20',dutyReportSource,dutyDebrief:'23:59',rawText:'SYNTHETIC ONLY'}]});assert.equal(dutyUnknown.out.presentationTime,'');assert.equal(dutyUnknown.out.state,'UNKNOWN');assert.equal(dutyUnknown.out.primaryTime,'');
   overrides={[ctx.presentationOverrideKey(unknown.events[0])]:{presentation:'18:10',label:'SYNTHETIC manual'}};
   assert.equal(snapshot(roster({departureTime:'19:05'},{dutyReport:'18:20',...(dutyReportSource ? {dutyReportSource} : {})})).out.presentationTime,'18:10','Explicit per-event manual control remains known');
   overrides={};
 }
 // A future duty's prose must not resurrect a rejected report clock.
 const dutyRoster=dutyReportSource=>({...roster({}),days:[{date:'18/10/2032',dayNumber:18,month:10,year:2032,type:'RES',pairingCode:'RES',base:'GRU',legs:[],dutyReport:'18:20',dutyReportSource,dutyDebrief:'23:59',rawText:'SYNTHETIC ONLY'}]});
 const savedNow=now; now=Date.parse('2032-10-17T15:00:00Z');
 for(const source of ['estimated','unknown','absent',undefined]) {
   const futureDuty=snapshot(dutyRoster(source));
   assert.equal(futureDuty.out.primaryTime,'');assert.equal(futureDuty.out.presentationTime,'');assert.equal(futureDuty.out.schedule[0].time,'');
   for(const field of ['detail','nextDetail']) {
     assert.match(futureDuty.out[field],/18\/10.*horário a confirmar.*BRT/);
     assert(!futureDuty.out[field].includes('18:20'),`Future ${field} must not certify ${source} report`);
   }
   overrides={[ctx.presentationOverrideKey(futureDuty.events[0])]:{presentation:'18:10',label:'SYNTHETIC manual'}};
   const manualFuture=snapshot(dutyRoster(source));
   for(const field of ['detail','nextDetail']) {assert.match(manualFuture.out[field],/18\/10.*18:10.*BRT/);assert(!manualFuture.out[field].includes('18:20'));}
   overrides={[ctx.presentationOverrideKey(futureDuty.events[0])]:{presentation:'18:30',label:'SYNTHETIC later manual'}};
   const laterManual=snapshot(dutyRoster(source));
   for(const field of ['detail','nextDetail']) assert.match(laterManual.out[field],/18\/10.*18:30.*BRT/,'Manual time change preserves canonical event date');
   overrides={};
 }
 const publishedFuture=snapshot(dutyRoster('published'));
 for(const field of ['detail','nextDetail']) assert.match(publishedFuture.out[field],/18\/10.*18:20.*BRT/);
 now=savedNow;
 const sameClock=snapshot(roster({departureTime:'19:05'},{dutyReport:'19:05',dutyReportSource:'published'}));assert.equal(sameClock.out.presentationTime,'19:05','Published marker proves even APZ equal to STD; legacy equality alone does not');
 // Canonical departure fallback00:00 is not publication evidence.
 now=Date.parse('2032-10-18T02:00:00Z');
 const noStd=snapshot(roster({}));assert.equal(noStd.events[0].departure,'00:00');assert.equal(noStd.out.boardingTime,'');assert.equal(noStd.out.primaryTime,'');assert.equal(noStd.out.schedule[0].time,'');assert.match(noStd.out.detail,/a confirmar/);
 const noStdInfo=lib.resolveNextFlightGate({event:noStd.events[0],now});const enriched=lib.applyNextFlightToWatchSnapshot(noStd.out,noStdInfo,{primaryEventId:noStd.events[0].id,nextFlightScheduleId:noStd.events[0].canonical.id});assert(!enriched.nextDetail.includes('00:00'),'Gate projection must not reintroduce canonical fallback STD');
 now=Date.parse('2032-10-18T15:00:00Z');
 const folga=snapshot({...roster({}),days:[{date:'18/10/2032',dayNumber:18,month:10,year:2032,type:'DO',pairingCode:'DO',base:'GRU',legs:[],rawText:'SYNTHETIC ONLY'}]});
 assert.equal(folga.selected.placeholder,true,'Actual Home selects noFutureLeg for a rest-only roster');assert.equal(folga.out.state,'OFF_DUTY');assert.equal(folga.out.headline,'FOLGA');assert.equal(folga.out.presentationTime,'');assert(folga.out.validUntilEpochMs>now);assert.equal(lib.buildCrewCheckWatchSnapshot(folga.events,undefined,null,now).state,'OFF_DUTY');
 now=Date.parse('2032-10-19T15:00:00Z');const ended=snapshot({...roster({}),days:[{date:'18/10/2032',dayNumber:18,month:10,year:2032,type:'DO',pairingCode:'DO',base:'GRU',legs:[],rawText:'SYNTHETIC ONLY'}]});assert.equal(ended.out.state,'UNKNOWN');
 console.log('PASS real canonical → Home buildLegs/managedPresentation/nextFlight → watch producer: missing APZ/STD, known leg/day/duty APZ, explicit day provenance/manual controls including future duty prose, Folga-only placeholder, ended Folga',process.env.TZ);
} finally {fs.rmSync(dir,{recursive:true,force:true});}
