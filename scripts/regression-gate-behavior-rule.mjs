// Gate behavior rule (docs/gate-behavior-rule.md): manual > proven source > reported source.
// Synthetic flights only; real resolver, watch projection, Home alert anchor and server
// projection/health functions. No provider, network or account.
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';import {pathToFileURL} from 'node:url';
import ts from 'typescript';import {build} from 'esbuild';
const root=process.cwd(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'gate-behavior-rule-'));
try {
 await build({stdin:{contents:`export * from ${JSON.stringify(path.join(root,'client/src/lib/nextFlightGate.ts'))};export * from ${JSON.stringify(path.join(root,'client/src/lib/nextFlightWatch.ts'))};export {buildCrewCheckWatchSnapshot} from ${JSON.stringify(path.join(root,'client/src/lib/watchContext.ts'))};`,resolveDir:root},bundle:true,platform:'node',format:'esm',outfile:path.join(dir,'fixture.mjs'),alias:{'@':path.join(root,'client/src')},logLevel:'silent'});
 const m=await import(pathToFileURL(path.join(dir,'fixture.mjs')).href);
 const now=Date.parse('2032-10-20T08:30:00Z'),received=now-5*60_000;
 const event={id:'synthetic-occurrence',kind:'flight',flightNumber:'QA123',origin:'CGH',destination:'CNF',departure:'07:30',arrival:'08:45',presentation:'06:40',canonical:{id:'synthetic-canonical',date:'20/10/2032',legIndex:0,leg:{departureTime:'07:30',arrivalTime:'08:45',presentationTime:'06:40'},startDateTime:'2032-10-20T10:30:00.000Z',endDateTime:'2032-10-20T11:45:00.000Z'}};
 const radar={ok:true,flight:'QA123',sourceOrigin:'CGH',sourceDestination:'CNF',scheduledDepartureUtc:event.canonical.startDateTime,updatedAt:received,gate:'12',status:'Embarcando',provider:'flightaware'};
 const resolve=(r=radar,manual=null,at=now)=>m.resolveNextFlightGate({event,radar:r,manual,now:at});

 // 3. Reported: exact occurrence, fresh receipt, no observation instant.
 const reported=resolve();
 assert.equal(reported.gate,'12');assert.equal(reported.gateSource,'reported');assert.equal(reported.reportedProvider,'FlightAware');
 assert.equal(reported.usesRadar,false,'reported never counts as a proven radar gate');
 assert.equal(reported.status,'','status without observation stays unconfirmed');
 assert.equal(reported.automaticFieldValidUntilEpochMs.gate,received+m.RADAR_GATE_STALE_MS);
 assert.equal(m.providerLabel('not-a-provider'),'Fonte operacional');assert.equal(resolve({...radar,provider:'<b>x</b>'}).reportedProvider,'Fonte operacional');
 // Expires 30 min after receipt; other flight/segment/day, position or conflict never reported.
 assert.equal(resolve(radar,null,received+m.RADAR_GATE_STALE_MS+1).gate,'');
 for(const patch of [{flight:'QA124'},{sourceOrigin:'GRU'},{scheduledDepartureUtc:'2032-10-21T10:30:00.000Z'},{gate:'POSITION 4'},{operationalConflicts:['gate']},{ok:false},{updatedAt:now+1}])
  assert.equal(resolve({...radar,...patch}).gate,'',JSON.stringify(patch));
 // A source that sent observation proof which fails is not downgraded to "reported".
 for(const patch of [{operationalEvidence:{gate:{version:1,value:'12',sourceObservedAt:'2032-10-20T06:00:00Z',provenance:'synthetic'}}},{gateUpdate:{version:1,provider:'custom',kind:'departure-gate-update',sourceUpdatedAt:'2032-10-20T06:00:00Z',gate:'12',flight:'QA123',origin:'CGH',destination:'CNF',scheduledDepartureUtc:event.canonical.startDateTime}},{gateUpdateWatermark:{sourceUpdatedAtEpochMs:received,gate:'14',conflicted:false}},
  // Conflicting gate-update history blocks it even when its number matches the reported gate.
  {gateUpdateWatermark:{sourceUpdatedAtEpochMs:received,gate:'12',conflicted:true}},{gateUpdateWatermark:{sourceUpdatedAtEpochMs:received-60_000,gate:'12',conflicted:true}}])
  assert.equal(resolve({...radar,...patch}).gate,'',JSON.stringify(patch));
 assert.equal(resolve({...radar,gateUpdateWatermark:{sourceUpdatedAtEpochMs:received,gate:'12',conflicted:false}}).gateSource,'reported','agreeing, non-conflicting history keeps it reported');

 // 2. Proven source keeps its own tier.
 const proven=resolve({...radar,operationalEvidence:{gate:{version:1,value:'12',sourceObservedAt:'2032-10-20T08:20:00Z',provenance:'synthetic'}}});
 assert.equal(proven.gateSource,'radar');assert.equal(proven.usesRadar,true);assert.equal(proven.reportedProvider,'');

 // 1. Manual always wins; a different reported gate is a divergence naming the provider.
 const store=new Map(),storage={getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)};
 assert(m.writeManualGate(storage,'synthetic-owner',event,{gate:'24',terminal:'2',author:'Synthetic'},now).ok);
 const manual=m.readManualGate(storage,'synthetic-owner',event),withManual=resolve(radar,manual);
 assert.equal(withManual.gate,'24');assert.equal(withManual.gateSource,'manual');
 assert.deepEqual(withManual.divergence,{manualGate:'24',sourceGate:'12',source:'reported'});assert.equal(withManual.reportedProvider,'FlightAware');
 assert.equal(resolve({...radar,gate:'24'},manual).divergence,null,'same value is not a divergence');

 // Watch: Wear v1 fields cannot carry the caveat, so a reported gate never reaches them as a number.
 const base=m.buildCrewCheckWatchSnapshot([event],event,null,now,false);
 const options={primaryEventId:event.id,nextFlightScheduleId:event.canonical.id};
 const watch=m.applyNextFlightToWatchSnapshot(base,reported,options);
 assert.equal(watch.gate,'');assert.equal(watch.remoteStand,false);assert.match(watch.detail,/Portão a confirmar no app/);
 assert(watch.schedule.every(item=>!item.gate),'schedule rows carry no reported gate');
 assert.doesNotMatch(JSON.stringify(watch),/"12"|P12|portão 12/i,'the reported number appears nowhere in the watch snapshot');
 const nextWatch=m.applyNextFlightToWatchSnapshot({...base,currentFlight:''},reported,{primaryEventId:'other',nextFlightScheduleId:event.canonical.id});
 assert.match(nextWatch.nextDetail,/Portão a confirmar no app/);assert.doesNotMatch(nextWatch.nextDetail,/12/);
 // Manual gate with a different reported gate: manual reaches the watch, the reported number does not.
 const divergentWatch=m.applyNextFlightToWatchSnapshot(base,withManual,options);
 assert.equal(divergentWatch.gate,'24');assert.match(divergentWatch.detail,/Fonte indica outro portão · confirme no app/);assert.doesNotMatch(divergentWatch.detail,/12/);
 // A proven gate is still projected with its observation-capped expiry.
 const provenWatch=m.applyNextFlightToWatchSnapshot(base,proven,options);
 assert.equal(provenWatch.gate,'12');assert(provenWatch.validUntilEpochMs<=Date.parse('2032-10-20T08:20:00Z')+m.RADAR_GATE_STALE_MS);

 // Alerts: a reported gate never starts or anchors a gate-change alert (Home.tsx).
 const home=fs.readFileSync('client/src/pages/Home.tsx','utf8');
 assert.match(home,/const previousGate = manualGate \|\| \(before\.gateSource === 'radar' \? before\.gate : ''\);/);
 assert.match(home,/const nextGate = after\.operationalDate && after\.gateSource === 'radar' &&/);

 // Server: the public provider key is allowlisted; per-source health is admin-only.
 const source=fs.readFileSync('server.mjs','utf8'),ast=ts.createSourceFile('server.mjs',source,99,true,ts.ScriptKind.JS);
 const fn=name=>{const node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(node,name);return node.getText(ast);};
 let admin=false,sent=null;const radarHealth=new Map([['flightaware',{lastFail:Date.parse('2032-10-20T08:00:00Z'),lastHttpStatus:401}]]);
 const scope=vm.createContext({radarHealth,process:{env:{}},radarFieldEvidenceGaps:()=>({}),ciriumRadarProjection:()=>({}),gateQuerySuppressed:()=>({}),firstKnown:(...v)=>v.find(x=>x!==undefined&&x!==null&&x!==''),
  configuredProviders:()=>[{key:'flightaware',available:true},{key:'airlabs',available:false}],radarHealthAdmin:()=>admin,sendJson:(res,status,body)=>{sent={status,body};}});
 vm.runInContext([fn('publicRadarPayload'),fn('handleRadarHealth'),fn('markProvider')].join('\n'),scope);
 assert.equal(scope.publicRadarPayload({ok:true,provider:'flightaware',gate:'12'}).provider,'flightaware');
 assert.equal('provider' in scope.publicRadarPayload({ok:true,provider:'<script>',gate:'12'}),false);
 scope.handleRadarHealth({}, {});assert.equal(sent.body.providers,undefined,'public health has no per-source detail');
 admin=true;scope.handleRadarHealth({}, {});
 assert.deepEqual(JSON.parse(JSON.stringify(sent.body.providers)),[{key:'flightaware',configured:true,lastOkAt:null,lastFailAt:'2032-10-20T08:00:00.000Z',lastHttpStatus:401,lastErrorAt:null},{key:'airlabs',configured:false,lastOkAt:null,lastFailAt:null,lastHttpStatus:null,lastErrorAt:null}]);
 assert.doesNotMatch(JSON.stringify(sent.body),/key=|apikey|x-apikey|token/i);
 scope.markProvider('airlabs',false,403);assert.equal(radarHealth.get('airlabs').lastHttpStatus,403);
 console.log('PASS gate behavior rule: manual > proven source > reported source (named, 30 min, never alert/Pulse), failed proof never downgraded, conflicting history rejected, reported number never sent to the watch, admin-only per-source health');
} finally { fs.rmSync(dir,{recursive:true,force:true}); }
