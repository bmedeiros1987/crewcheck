// Synthetic-only projection of real phone -> Wear v1 snapshot producers.
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const root=process.env.WATCH_EXPIRY_ROOT||process.cwd(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'watch-field-expiry-'));
try {
 await build({stdin:{contents:`export * from ${JSON.stringify(path.join(root,'client/src/lib/nextFlightGate.ts'))};export * from ${JSON.stringify(path.join(root,'client/src/lib/nextFlightWatch.ts'))};export {buildCrewCheckWatchSnapshot} from ${JSON.stringify(path.join(root,'client/src/lib/watchContext.ts'))};`,resolveDir:root},bundle:true,platform:'node',format:'esm',outfile:path.join(dir,'fixture.mjs'),alias:{'@':path.join(root,'client/src')},logLevel:'silent'});
 const m=await import(pathToFileURL(path.join(dir,'fixture.mjs')).href);
 const now=Date.parse('2032-10-20T08:30:00Z'),observed='2032-10-20T08:05:00Z',deadline=Date.parse(observed)+m.RADAR_GATE_STALE_MS;
 const event={id:'synthetic-occurrence',kind:'flight',flightNumber:'QA123',origin:'CGH',destination:'CNF',departure:'07:30',arrival:'08:45',presentation:'06:40',canonical:{id:'synthetic-canonical',date:'20/10/2032',legIndex:0,leg:{departureTime:'07:30',arrivalTime:'08:45',presentationTime:'06:40'},startDateTime:'2032-10-20T10:30:00.000Z',endDateTime:'2032-10-20T11:45:00.000Z'}};
 const store=new Map(),storage={getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)};
 assert(m.writeManualGate(storage,'synthetic-owner',event,{gate:'24',terminal:'2',author:'Synthetic'},now).ok);
 const manual=m.readManualGate(storage,'synthetic-owner',event),manualBytes=JSON.stringify([...store]);
 const proof=value=>({version:1,value,sourceObservedAt:observed,provenance:'synthetic-source-observation'});
 const radar={ok:true,flight:'QA123',sourceOrigin:'CGH',sourceDestination:'CNF',scheduledDepartureUtc:event.canonical.startDateTime,updatedAt:now,status:'Embarcando',operationalEvidence:{status:proof('Embarcando')}};
 const base=m.buildCrewCheckWatchSnapshot([event],event,null,now,false);
 assert(base.validUntilEpochMs>deadline,'fixture must expose the original multi-hour expiry defect');
 const project=(info,snapshot=base,options={primaryEventId:event.id,nextFlightScheduleId:event.canonical.id})=>m.applyNextFlightToWatchSnapshot(snapshot,info,options);
 const info=m.resolveNextFlightGate({event,manual,radar,now}),statusSnapshot=project(info);
 assert.equal(info.gateSource,'manual');assert.equal(info.statusSource,'radar');assert.equal(info.usesRadar,false,'legacy gate-only guard misses this case');
 assert.equal(statusSnapshot.gate,'24');assert.match(statusSnapshot.detail,/Embarcando/);assert.equal(statusSnapshot.validUntilEpochMs,deadline,'manual gate cannot extend automatic status validity');
 const gateInfo=m.resolveNextFlightGate({event,radar:{...radar,gate:'9',status:'',operationalEvidence:{gate:proof('9')}},now});
 assert.equal(project(gateInfo).validUntilEpochMs,deadline,'source observation 25 min before receipt leaves only 5 min, not 30');
 const divergence=m.resolveNextFlightGate({event,manual,radar:{...radar,gate:'9',status:'',operationalEvidence:{gate:proof('9')}},now});
 const divergenceSnapshot=project(divergence);assert.match(divergenceSnapshot.detail,/Fonte indica portão 9/);assert.equal(divergenceSnapshot.gate,'24');assert.equal(divergenceSnapshot.validUntilEpochMs,deadline,'automatic gate in a divergence note is also displayed');
 const custom=m.resolveNextFlightGate({event,radar:{...radar,status:'',gate:'9',operationalEvidence:undefined,gateUpdate:{version:1,provider:'custom',kind:'departure-gate-update',gate:'9',flight:'QA123',origin:'CGH',destination:'CNF',scheduledDepartureUtc:event.canonical.startDateTime,sourceUpdatedAt:observed}},now});
 assert.equal(project(custom).validUntilEpochMs,deadline,'validated custom gate update uses source time too');
 const manualOnly=project(m.resolveNextFlightGate({event,manual,now}));assert.equal(manualOnly.validUntilEpochMs,base.validUntilEpochMs,'manual-only values retain canonical lifetime');
 const expired=m.resolveNextFlightGate({event,manual,radar,now:deadline+1});const renewed=project(expired,{...base,generatedAtEpochMs:deadline+1,validUntilEpochMs:deadline+3600000});assert.equal(expired.status,'');assert.doesNotMatch(renewed.detail,/Embarcando/);assert.equal(renewed.gate,'24');
 const nextOnly=project(info,base,{primaryEventId:'another-event',nextFlightScheduleId:event.canonical.id});assert.doesNotMatch(nextOnly.nextDetail,/Embarcando/);assert.equal(nextOnly.validUntilEpochMs,base.validUntilEpochMs,'an undisplayed status does not expire unrelated planned content');
 assert.equal(project({...info,automaticFieldValidUntilEpochMs:{}}).validUntilEpochMs,base.generatedAtEpochMs,'missing internal validity metadata fails closed');
 assert.deepEqual(Object.keys(statusSnapshot).filter(key=>key!=='gateSource'&&key!=='gateNote').sort(),Object.keys(base).sort(),'Wear v1 schema unchanged apart from the optional gate provenance (gateSource, gateNote)');assert(['','manual','radar','reported'].includes(statusSnapshot.gateSource??''),'gate provenance is one of the known sources');assert.equal(JSON.stringify([...store]),manualBytes,'projection never changes stored manual fields');
 console.log('PASS automatic watch field expiry: manual gate + Radar status, older observation, divergence, custom proof, missing metadata, expiry, manual preservation and unchanged Wear v1; synthetic only.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
