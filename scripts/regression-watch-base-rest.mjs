// Synthetic-only Watch base-rest projection. Run raw and after canonical preparation.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {build} from 'esbuild';
const root=process.cwd(),out=fs.mkdtempSync(path.join(os.tmpdir(),'watch-base-rest-'));
globalThis.fetch=()=>{throw new Error('No external calls in synthetic Watch test');};
const now=Date.parse('2032-10-25T17:46:00Z');let checks=0;
try {
 await build({stdin:{contents:`export * from ${JSON.stringify(root+'/client/src/lib/watchContext.ts')};export * from ${JSON.stringify(root+'/client/src/lib/canonicalRoster.ts')};export * from ${JSON.stringify(root+'/client/src/lib/scheduleActivityClassification.ts')};`,resolveDir:root},bundle:true,format:'esm',platform:'node',outfile:out+'/source.mjs',logLevel:'silent'});
 const lib=await import(pathToFileURL(out+'/source.mjs').href);
 const {buildCrewCheckWatchSnapshot:watch}=lib;
 const rest=(patch={})=>({id:'synthetic-base-rest',kind:'stay',origin:'BSB',destination:'BSB',day:{type:'DESCANSO_BASE_CONTINUIDADE',pairingCode:'DESCANSO BASE'},canonical:{kind:'stay',startDateTime:'2032-10-25T13:00:00Z',endDateTime:'2032-10-26T13:00:00Z',publishedDay:{type:'DESCANSO_BASE_CONTINUIDADE',pairingCode:'DESCANSO BASE'}},...patch});
 const next={id:'future-flight',kind:'flight',flightNumber:'QA200',origin:'BSB',destination:'GRU',canonical:{kind:'flight',leg:{departureTime:'11:00',presentationTime:'10:00'},startDateTime:'2032-10-26T14:00:00Z',endDateTime:'2032-10-26T16:00:00Z'}};
 const clean=s=>{assert.equal(s.state,'UNKNOWN');assert.equal(s.headline,'DESCANSO NA BASE');for(const field of ['overnight','hotelPickup','presentationTime','presentationPlace','leaveTime','trafficDetail','currentFlight','currentRoute','boardingTime','eta','connection'])assert.equal(s[field],'',field);assert(!s.schedule.some(x=>x.title==='Pernoite'));assert(!s.detail.includes('hotel'));assert(s.detail.includes('não é folga publicada'));checks+=15;};
 const event=rest();const original=JSON.stringify(event);clean(watch([event,next],next,null,now));clean(watch([event],event,null,now));assert.equal(JSON.stringify(event),original);checks++;
 const signature=[event.id,event.canonical.startDateTime,event.canonical.endDateTime,event.origin,event.destination].join('|');
 const record={eventId:event.id,signature,apzConfirmed:true,apzSource:'manual',apzDate:'2032-10-26',timeZone:'America/Sao_Paulo',draft:{presentationTime:'09:30'}};
 const hotelRest=rest({hotel:'Manually saved synthetic hotel'});const before=JSON.stringify(record);clean(watch([hotelRest,next],next,null,now,record));assert.equal(JSON.stringify(record),before);checks++;
 const away=rest({id:'away',origin:'REC',destination:'REC',hotel:'Synthetic hotel',day:{type:'PERNOITE_CONTINUIDADE'},canonical:{...event.canonical,publishedDay:{type:'PERNOITE_CONTINUIDADE'}}});
 const a=watch([away,next],next,null,now);assert.equal(a.state,'OVERNIGHT');assert.equal(a.headline,'PERNOITE');assert.equal(a.overnight,'Synthetic hotel');assert.equal(a.hotelPickup,'APZ hotel não informada');checks+=4;
 const explicit=rest({id:'explicit-base-hotel',day:{type:'HOTEL'},canonical:{...event.canonical,publishedDay:{type:'HOTEL'}}});assert.equal(watch([explicit],explicit,null,now).state,'OVERNIGHT');checks++;
 for(const at of [Date.parse(event.canonical.startDateTime)-1,Date.parse(event.canonical.endDateTime)]){const s=watch([event],event,null,at);assert.equal(s.state,'UNKNOWN');assert.notEqual(s.headline,'DESCANSO NA BASE');assert.equal(s.hotelPickup,'');assert.equal(s.overnight,'');checks+=4;}
 const invalid=rest({canonical:{...event.canonical,startDateTime:'2032-10-25T10:00:00'}});assert.notEqual(watch([invalid,next],next,null,now).headline,'DESCANSO NA BASE');checks++;
 const overlap=rest({id:'other'});assert.notEqual(watch([event,overlap,next],next,null,now).headline,'DESCANSO NA BASE');checks++;
 const flight={...next,id:'active-flight',canonical:{...next.canonical,startDateTime:'2032-10-25T17:00:00Z',endDateTime:'2032-10-25T19:00:00Z'}};assert.equal(watch([event,flight],flight,null,now).contextId,'active-flight');checks++;
 const off={id:'day-off',kind:'duty',day:{type:'DO'},canonical:{kind:'rest',startDateTime:event.canonical.startDateTime,endDateTime:event.canonical.endDateTime,publishedDay:{type:'DO'}}};const f=watch([off],off,null,now);assert.equal(f.state,'OFF_DUTY');assert.equal(f.headline,'FOLGA');checks+=2;
 // Conflicting stale projections must not let inferred recovery override published DO.
 // A normal canonical roster already suppresses the inferred marker on a DO day.
 for(const selected of [next,{id:'placeholder',kind:'empty',placeholder:true},off]) {
  const conflict=watch([event,off,next],selected,null,now);
  assert.equal(conflict.contextId,'day-off');assert.equal(conflict.state,'OFF_DUTY');assert.equal(conflict.headline,'FOLGA');assert.equal(conflict.hotelPickup,'');checks+=4;
 }
 assert.equal(watch([event,off,flight],flight,null,now).contextId,'active-flight');checks++;
 const genericRecovery={...off,id:'generic-recovery',day:{type:'REST'},canonical:{...off.canonical,publishedDay:{type:'REST'}}};
 assert.equal(lib.classifyScheduleActivity(genericRecovery),'REPOUSO');
 const recoveryConflict=watch([event,genericRecovery,next],next,null,now);
 assert.equal(recoveryConflict.headline,'DESCANSO NA BASE');assert.equal(recoveryConflict.state,'UNKNOWN');checks+=3;
 const nextBase=rest({id:'future-base',canonical:{...event.canonical,startDateTime:'2032-10-27T13:00:00Z',endDateTime:'2032-10-28T13:00:00Z'}});assert.equal(watch([flight,nextBase],flight,null,now).overnight,'');checks++;

 // Execute actual Home projection/selection, including its presentation management.
 const source=fs.readFileSync('client/src/pages/Home.tsx','utf8');
 const ast=ts.createSourceFile('Home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const names=['buildLegs','applyPresentationManagement','managedPresentationForEvent','parseTimeStrict','presentationLearningKey','presentationOverrideKey','projectedFlightQuality','dedupeProjectedLegs','eventStartDateTime','eventEndDateTime','isOperationalEvent','eventIsNow','noFutureLeg','nextFlight','chronologicalNextRosterLeg'];
 const functions=names.map(name=>{const node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(node,`actual Home ${name}`);return node.getText(ast)}).join('\n');
 class FixtureDate extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
 const ctx=vm.createContext({...lib,Date:FixtureDate,safe:(v,f='')=>v==null||v===''?f:String(v),city:v=>v,normalizedAirlineCode:()=> 'QA',airlineNameFor:()=> 'Synthetic',addMinutesToTime:()=>'',parseDate:()=>new FixtureDate(),pad2:n=>String(n).padStart(2,'0'),loadPresentationOverrides:()=>({}),loadPresentationRules:()=>({}),dateChip:d=>d.toISOString().slice(0,10),placeholderLeg:()=>({id:'empty',placeholder:true})});
 vm.runInContext(ts.transpileModule(functions+'\nglobalThis.project=buildLegs;globalThis.choose=nextFlight;',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,ctx);
 const day=(n,origin,destination)=>({date:`${n}/10/2032`,dayNumber:n,month:10,year:2032,dayOfWeek:'',type:'VOO',pairingCode:'QA',dutyReport:'07:00',dutyReportSource:'published',dutyDebrief:'10:30',dutyDebriefSource:'published',legs:[{flightNumber:'QA'+n,origin,destination,departureTime:'08:00',arrivalTime:'10:00',presentationTime:'07:00',workType:'OP'}],base:origin,hotel:null,rawText:''});
 for(const base of ['BSB',' bsb ']){
  const roster={base,month:10,year:2032,days:[day(24,'GRU','BSB'),day(26,'BSB','GRU')]};
  const before=JSON.stringify(roster),events=ctx.project(roster),marker=events.find(e=>e.day.continuityInferred);
  assert(marker);assert.equal(marker.day.type,'DESCANSO_BASE_CONTINUIDADE');assert.equal(lib.classifyScheduleActivity(marker),'REPOUSO');
  clean(watch(events,ctx.choose(events),null,now));assert.equal(JSON.stringify(roster),before);checks+=4;
 }
 const awayEvents=ctx.project({base:'BSB',month:10,year:2032,days:[day(24,'GRU','REC'),day(26,'REC','GRU')]});
 assert.equal(watch(awayEvents,ctx.choose(awayEvents),null,now).state,'OVERNIGHT');checks++;
 console.log('PASS Watch base-rest actual source pipeline',process.env.TZ||'default',checks,'assertions');
} finally {fs.rmSync(out,{recursive:true,force:true});}
