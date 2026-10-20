// Actual Home pulse/call-site and canonical selectors; synthetic storage/providers only.
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';import {pathToFileURL} from 'node:url';
import ts from 'typescript';import {build} from 'esbuild';
const root=process.env.GATE_PULSE_ROOT||process.cwd(),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gate-pulse-'));
try{
 const entry=path.join(tmp,'entry.ts');fs.writeFileSync(entry,`export * from '${root}/client/src/lib/nextFlightGate.ts';export {buildCanonicalRosterEvents,selectNextRosterEvent} from '${root}/client/src/lib/canonicalRoster.ts';`);
 await build({entryPoints:[entry],outfile:path.join(tmp,'bundle.mjs'),bundle:true,platform:'node',format:'esm',alias:{'@':root+'/client/src'},logLevel:'silent'});
 const m=await import(pathToFileURL(path.join(tmp,'bundle.mjs')).href),source=fs.readFileSync(path.join(root,'client/src/pages/Home.tsx'),'utf8'),ast=ts.createSourceFile('Home.tsx',source,99,true,ts.ScriptKind.TSX);
 const fn=name=>{const n=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(n,name);return n.getText(ast)};
 let call;function walk(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useOperationalRadarPulse')call=n.getText(ast);ts.forEachChild(n,walk)}walk(ast);assert(call,'actual Home pulse call site');
 const roster={year:2032,month:10,base:'BSB',days:[{date:'20/10/2032',type:'VOO',dutyReport:'04:10',legs:[
  {flightNumber:'LA4001',origin:'BSB',destination:'CGH',departureTime:'05:00',arrivalTime:'06:45'},
  {flightNumber:'LA4002',origin:'CGH',destination:'CNF',departureTime:'07:30',arrivalTime:'08:45'},
  {flightNumber:'LA4003',origin:'CNF',destination:'CGH',departureTime:'09:30',arrivalTime:'10:55'}]}]};
 const events=m.buildCanonicalRosterEvents(roster).filter(e=>e.kind==='flight').map(c=>({...c,canonical:c,date:new Date(c.startDateTime)}));
 let now=Date.parse('2032-10-20T08:42:00Z');const requests=[],timers=[],cleanups=[];let cached=null;
 const scope=vm.createContext({events,Date:class extends Date{static now(){return now}},selectNextRosterEvent:e=>m.selectNextRosterEvent(e,new Date(now)),selectNextFlight:e=>m.selectNextFlight(e,now),nextFlight:()=>null,useEffect:f=>cleanups.push(f()),readRadarSnapshot:e=>cached?.id===e.id?cached:null,fetchRadarSnapshot:async(e,force)=>{requests.push({flight:e.flightNumber,id:e.id,force});return {ok:false}},RADAR_CARD_REFRESH_MS:300000,window:{setInterval:(f,ms)=>{timers.push({f,ms});return timers.length},clearInterval:()=>{}}});
 vm.runInContext(ts.transpileModule(fn('nextRealFlight')+'\n'+fn('useOperationalRadarPulse')+'\nconst flightEvent=nextRealFlight(events);'+call+';',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,scope);
 const selected=m.selectNextFlight(events,now);assert.equal(selected.flightNumber,'LA4002');
 if(process.argv.includes('--expect-before')){assert.equal(requests[0]?.flight,'LA4001');console.log('COUNTERPROOF: at05:42BRT card=LA4002, actual automatic pulse=LA4001; no source request for displayed next flight');}
 else{
  assert.equal(requests[0]?.flight,selected.flightNumber,'automatic pulse must query the flight actually displayed on the card');assert.equal(requests.length,1);assert.equal(requests[0].force,false);assert.equal(timers.length,1);assert.equal(timers[0].ms,300000,'preserve existing cadence');
  cached={id:selected.id,updatedAt:now};timers[0].f();assert.equal(requests.length,1,'fresh cache does not add provider queries');
  cached=null;now=Date.parse('2032-10-20T10:51:00Z');timers[0].f();assert.equal(requests.at(-1).flight,'LA4003','reselect after boarding grace without requiring parent rerender');
  now=Date.parse('2032-10-20T16:00:00Z');const count=requests.length;timers[0].f();assert.equal(requests.length,count,'no future flight means zero query');cleanups.forEach(f=>f?.());timers[0].f();assert.equal(requests.length,count,'cleanup stops the pulse');
  const store=new Map(),storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},manualNow=Date.parse('2032-10-20T08:42:00Z');
  const saved=m.writeManualGate(storage,'synthetic-owner',selected,{gate:'24',author:'Synthetic'},manualNow);assert(saved.ok);const before=JSON.stringify([...store]);const manual=m.readManualGate(storage,'synthetic-owner',selected);assert.equal(m.resolveNextFlightGate({event:selected,manual,now:manualNow}).gate,'24');assert.equal(m.readManualGate(storage,'synthetic-owner',events[0]),null,'manual for next flight cannot be borrowed by active flight');assert.equal(m.readManualGate(storage,'other-owner',selected),null);assert.equal(JSON.stringify([...store]),before,'reads never overwrite or remove manual gate');
  console.log('PASS actual Home call/pulse: displayed next flight, fresh-cache suppression, unchanged5min cadence, rollover without parent render, no future query, cleanup and manual identity/precedence preserved; offline');
 }
}finally{fs.rmSync(tmp,{recursive:true,force:true})}
