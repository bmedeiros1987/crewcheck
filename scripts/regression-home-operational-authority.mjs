import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import{pathToFileURL}from'node:url';import{build}from'esbuild';
const root=process.cwd(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'home-authority-'));
try{
 await build({stdin:{contents:`export{homeOperationalRoster}from${JSON.stringify(root+'/client/src/lib/homeOperationalRoster.ts')};export{buildCanonicalRosterEvents}from${JSON.stringify(root+'/client/src/lib/canonicalRoster.ts')};export{selectNextFlight}from${JSON.stringify(root+'/client/src/lib/nextFlightGate.ts')};`,resolveDir:root},bundle:true,platform:'node',format:'esm',outfile:dir+'/actual.mjs',alias:{'@':root+'/client/src','@shared':root+'/shared'},logLevel:'silent'});
 const m=await import(pathToFileURL(dir+'/actual.mjs'));
 const day=(date,type='DO',legs=[])=>({date,type,pairingCode:type,legs,base:'AAA',rawText:'SYNTHETIC'}),leg=(flight='QA9901')=>({flightNumber:flight,origin:'BBB',destination:'AAA',departureTime:'13:40',arrivalTime:'15:40',workType:'OP'}),roster=days=>({crewId:'SYNTHETIC-OWNER',crewName:'SYNTHETIC OWNER',month:1,year:2033,base:'AAA',rawText:'SYNTHETIC',days});
 const active=roster([day('20/01/2033'),day('01/02/2033','VC'),day('02/02/2033','VC')]),archiveDay=day('01/02/2033','VOO',[leg()]),display=roster([active.days[0],archiveDay,day('02/02/2033')]);
 const before=JSON.stringify([active,display]),projection=m.homeOperationalRoster(active,display),now=Date.parse('2033-01-20T12:00:00Z');
 const next=r=>m.selectNextFlight(m.buildCanonicalRosterEvents(r).map(e=>({...e,canonical:e})),now);
 assert.equal(next(display)?.flightNumber,'QA9901','counterproof: display-only history can contain a future flight');
 assert.equal(next(projection.roster),null,'active published vacation cannot disappear from automatic selection');assert.deepEqual(projection.conflictDates,['2033-02-01','2033-02-02']);
 assert.equal(display.days[1],archiveDay);assert.equal(JSON.stringify([active,display]),before,'neither source is mutated or saved');
 assert.equal(next(m.homeOperationalRoster(roster([day('20/01/2033')]),display).roster)?.flightNumber,'QA9901','uncovered adjacent dates keep existing continuity');
 const operating=roster([day('01/02/2033','VOO',[leg('QA9902')])]),oldVacation=roster([day('01/02/2033','VC')]);assert.equal(next(m.homeOperationalRoster(operating,oldVacation).roster)?.flightNumber,'QA9902','authority is not a hardcoded vacation preference');
 const inferred=roster([{...day('01/02/2033'),continuityInferred:true}]);assert.equal(next(m.homeOperationalRoster(inferred,display).roster)?.flightNumber,'QA9901','inferred rest cannot override a publication');
 const invalid=roster([day('31/02/2033','VC')]);assert.equal(next(m.homeOperationalRoster(invalid,display).roster)?.flightNumber,'QA9901','invalid dates never roll into a different day');
 const otherYear=roster([day('01/02/2032','VC')]);assert.equal(next(m.homeOperationalRoster(otherYear,display).roster)?.flightNumber,'QA9901','different years never alias');
 const duplicate=roster([day('01/02/2033','VOO',[leg('QA9902')]),day('01/02/2033','VOO',[leg('QA9903')])]);assert.equal(m.homeOperationalRoster(duplicate,display).roster.days.filter(d=>d.date==='01/02/2033').length,2,'separate active records on a day remain separate');
 const equivalent=roster(active.days.map(d=>({...d,rawText:'OTHER PRIVATE SOURCE TEXT'})));assert.deepEqual(m.homeOperationalRoster(active,equivalent).conflictDates,[],'raw text and unrelated metadata do not create operational conflict');
 assert.equal(m.homeOperationalRoster(active,active).roster,active,'no history keeps source identity');
 console.log('PASS real HOME operational authority: active day sovereignty (not vacation priority), historical navigation unchanged, adjacent continuity, inferred/invalid/date-year controls, multiple records and immutable sources',process.env.TZ);
}finally{fs.rmSync(dir,{recursive:true,force:true});}
