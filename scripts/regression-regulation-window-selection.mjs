import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {loadClientModules,TYPE_ONLY_PDF_PARSER_STUB} from './lib/ts-module-harness.mjs';
import {resolveRegulationProgram,regulationProgramDay} from '../shared/regulationScenarioPrefill.mjs';
const makeDay=(date)=>({date,type:'VOO',dayOfWeek:'ter',pairingCode:'TEST',dutyReport:'06:00',dutyReportSource:'published',dutyDebrief:'09:30',dutyDebriefSource:'published',legs:[{flightNumber:'TEST0001',origin:'BSB',destination:'GRU',departureTime:'07:00',arrivalTime:'09:00',workType:'OP'}]});
const active={crewId:'synthetic',base:'BSB',month:10,year:2032,days:[makeDay('20/10/2032')]},windowRoster={...active,days:[makeDay('20/09/2032'),...active.days]};
const harness=loadClientModules({prefix:'regulation-window-',stubs:TYPE_ONLY_PDF_PARSER_STUB,files:['client/src/lib/rosterContinuity.ts','client/src/lib/canonicalRoster.ts']});
try{
 const build=roster=>harness.load('canonicalRoster').buildCanonicalRosterEvents(roster).filter(event=>event.kind==='flight').map(canonical=>({id:canonical.id,kind:canonical.kind,day:canonical.publishedDay,canonical}));
 const events=build(active),rosterEvents=build(windowRoster),selected=rosterEvents.find(event=>event.day.date==='20/09/2032');assert(selected);assert(!events.some(e=>e.id===selected.id));
 const home=fs.readFileSync(process.env.REGULATION_HOME_SOURCE||'client/src/pages/Home.tsx','utf8'),ast=ts.createSourceFile('Home.tsx',home,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const initializers={};function visit(node){if(ts.isVariableDeclaration(node)&&['regulationEvent','regulationDay'].includes(node.name.getText(ast)))initializers[node.name.getText(ast)]=node.initializer.getText(ast);ts.forEachChild(node,visit);}visit(ast);
 assert(initializers.regulationEvent);assert(initializers.regulationDay);
 const evaluate=(name,context)=>new Function('events','rosterEvents','event','regulationContext','regulationEvent','resolveRegulationProgram','regulationProgramDay',`return (${initializers[name]});`)(events,rosterEvents,events[0],context,context?.selected,resolveRegulationProgram,regulationProgramDay);
 const context={programId:selected.id},resolved=evaluate('regulationEvent',context);assert.equal(resolved?.id,selected.id,'selected program must resolve in the collection actually displayed by Escala');
 const day=evaluate('regulationDay',{...context,selected:resolved});assert.equal(day.legs.length,1);assert.match(day.date,/2032/);
 assert.equal(evaluate('regulationEvent',{programId:'stale-or-other-owner'}),null,'unknown context must fail closed');
 assert.equal(evaluate('regulationEvent',null).id,events[0].id,'global entry stays on the active operational roster');
 console.log('PASS prepared Home actual resolver/builder: retained September selection with October active, same displayed collection, stale context closed, active global entry unchanged');
}finally{harness.cleanup();}
