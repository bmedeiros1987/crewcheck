import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';

// Only seed the existing expansion state for SSR. All detail/store/projection
// code is real; interactive lifecycle and geometry are tested in the browser.
const source = fs.readFileSync('client/src/components/v1391/AimsRosterTable.tsx', 'utf8');
const initial = "const [expandedKey, setExpandedKey] = useState<string | null>(null);";
assert(source.includes(initial));
const bundle = await build({stdin:{contents:`import React from 'react';import{renderToStaticMarkup}from'react-dom/server';import{AimsRosterTable}from'./client/src/components/v1391/AimsRosterTable';import{CalendarRosterView}from'./client/src/components/v1391/CalendarRosterView';import{stayOperationalSignature}from'./client/src/lib/stayOperationalProjection';export{stayOperationalSignature};export const render=(events,operationalEvents=events)=>renderToStaticMarkup(<AimsRosterTable events={events} operationalEvents={operationalEvents} showHistory={false}/>);export const renderCalendar=(events,operationalEvents,day)=>renderToStaticMarkup(<CalendarRosterView events={events} operationalEvents={operationalEvents} month={day.slice(0,7)} zoom='day' selectedDay={day}/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'node',format:'esm',jsx:'automatic',loader:{'.css':'empty'},packages:'external',plugins:[{name:'open-actual-detail',setup(b){b.onLoad({filter:/AimsRosterTable\.tsx$/},()=>({contents:source.replace(initial,initial.replace('(null)',"(events[0].id + '#0')")),loader:'tsx',resolveDir:path.resolve('client/src/components/v1391')}));}}]});
const temp = fs.mkdtempSync(path.join(os.tmpdir(),'stay-details-'));
try {
  // External React resolves from this checkout, not from the temporary folder.
  const modulePath = path.resolve('artifacts/stay-details-render.mjs');fs.mkdirSync(path.dirname(modulePath),{recursive:true});fs.writeFileSync(modulePath,bundle.outputFiles[0].text);
  const {render,renderCalendar,stayOperationalSignature} = await import('file://'+modulePath);
  const values=new Map();globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  const owner=id=>{localStorage.setItem('crewcheck_auth_user',JSON.stringify({id}));localStorage.setItem('crewcheck_auth_token',id);};owner('A');
  const stay={id:'synthetic-stay',kind:'stay',title:'Pernoite',subtitle:'Hotel/pernoite em Curitiba',day:{date:'21/10/2032',type:'PERNOITE'},origin:'CWB',destination:'CWB',canonical:{date:'2032-10-21',startDateTime:'2032-10-21T03:00:00Z',endDateTime:'2032-10-22T02:59:00Z',publishedDay:{}}};
  const flight={id:'next-flight',kind:'flight',origin:'CWB',destination:'FOR',canonical:{date:'2032-10-22',startDateTime:'2032-10-22T08:00:00Z'}};
  const record={eventId:stay.id,signature:stayOperationalSignature(stay),draft:{hotelName:'Hotel sintético A',room:'QUARTO-PRIVADO-A',presentationTime:'04:20',stayDate:'2032-10-21'},timeZone:'America/Sao_Paulo',apzDate:'2032-10-22',apzSource:'manual',apzConfirmed:true,choice:{mode:'relative',leadMinutes:90},breakfastPlan:'with'};
  const save=(patch={})=>localStorage.setItem('crewcheck_stay_editor_v2:A',JSON.stringify({version:2,accountId:'A',defaultLeadMinutes:90,stays:{[stay.id]:{...record,...patch}}}));
  const view=(events=[stay,flight],event=events[0])=>render([event],events);
  save();let html=view();assert.match(html,/QUARTO-PRIVADO-A/,'expanded AIMS stay reads canonical private data instead of only repeating subtitle');assert.match(html,/Hotel sintético A/);assert.match(html,/22\/10\/2032.*04:20.*America\/Sao_Paulo/);assert.match(html,/Hotel\/pernoite em Curitiba/,'published source remains unchanged');assert.doesNotMatch(html,/pickup|MyCrewCare|Atualizado/i);assert.equal(view(),html,'reload-equivalent read is stable');
  for(const patch of [{apzConfirmed:false},{apzSource:'legacy-unconfirmed'},{timeZone:'Invalid/Zone'},{apzDate:'2032-10-23'}]){save(patch);html=view();assert.match(html,/QUARTO-PRIVADO-A/);assert.match(html,/Não confirmada/);assert.doesNotMatch(html,/04:20/);}
  save();for(const events of [[{...stay,canonical:{...stay.canonical,endDateTime:'2032-10-22T02:58:00Z'}},flight],[stay,{...stay},flight]]){html=view(events);assert.doesNotMatch(html,/QUARTO-PRIVADO-A|Hotel sintético A|04:20/);}
  html=view([stay,{...flight,origin:'OTHER'}]);assert.doesNotMatch(html,/04:20/);assert.match(html,/QUARTO-PRIVADO-A/);
  owner('B');assert.doesNotMatch(view(),/QUARTO-PRIVADO-A|Hotel sintético A|04:20/);owner('A');assert.match(view(),/QUARTO-PRIVADO-A/);
  save({signature:'legacy'});assert.doesNotMatch(view(),/QUARTO-PRIVADO-A|Hotel sintético A|04:20/);
  for(const [day,next] of [['2032-10-31','2032-11-01'],['2032-12-31','2033-01-01']]){
    const event={...stay,day:{date:day,type:'PERNOITE'},canonical:{date:day,startDateTime:day+'T03:00:00Z',endDateTime:next+'T02:59:00Z',publishedDay:{}}};
    const following={...flight,canonical:{date:next,startDateTime:next+'T08:00:00Z'}};
    save({signature:stayOperationalSignature(event),apzDate:next});
    const calendar=(context)=>renderCalendar([event],context,day);
    assert.match(calendar([event,following]),new RegExp(next.split('-').reverse().join('/')+'.*04:20'),'calendar detail retains full operational context across month/year');
    assert.doesNotMatch(calendar([event]),/04:20/,'counterproof: slicing operational context loses the valid APZ');
    assert.doesNotMatch(calendar([event,{...event,day:{date:next}},following]),/QUARTO-PRIVADO-A|04:20/,'duplicate ID outside the visible day remains ambiguous');
  }
  // Exercise the actual materializer and its generated savedFor, not raw Home.
  fs.mkdirSync(path.join(temp,'client/src/pages'),{recursive:true});fs.copyFileSync('client/src/pages/Home.tsx',path.join(temp,'client/src/pages/Home.tsx'));
  const materializer=fs.readFileSync('scripts/stay-editor/apply.mjs','utf8');
  const boundary=materializer.indexOf("  source = source.replace('<PresentationStayManagerView");assert(boundary>0);
  // Raw Home has not received upstream Brand/header preparation. Execute the
  // unchanged Hotels transform only; the existing CI prepares the full chain.
  const apply=path.join(temp,'apply-hotels.mjs');fs.writeFileSync(apply,materializer.slice(0,boundary)+'  fs.writeFileSync(path, source);\n}\n');
  execFileSync(process.execPath,[apply],{cwd:temp});
  const prepared=fs.readFileSync(path.join(temp,'client/src/pages/Home.tsx'),'utf8');
  const start=prepared.indexOf('  function savedFor(event: ZeroLeg) {'),end=prepared.indexOf('\n  function openEditor(',start);assert(start>=0&&end>start);
  assert.match(prepared,/current\.apzDate\?\.split/,'generated Hotels card displays saved APZ date, clock and zone');
  const helper=await build({stdin:{contents:`import{readStayOperationalProjection}from'./client/src/lib/stayOperationalProjection';export function read(event,events){const saved=[];const rosterDayIso=()=>'';const safe=(x,f)=>x||f;const city=x=>x;${prepared.slice(start,end)}return savedFor(event);}`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm'});
  const api=await import('data:text/javascript;base64,'+Buffer.from(helper.outputFiles[0].text).toString('base64'));
  save();const saved=api.read(stay,[stay,flight]);assert.equal(saved.room,'QUARTO-PRIVADO-A');assert.equal(saved.presentationTime,'04:20');assert.equal(saved.apzDate,'2032-10-22');assert.equal(saved.timeZone,'America/Sao_Paulo');assert.equal(saved.localEditorOnly,true);
  save({apzConfirmed:false});assert.equal(api.read(stay,[stay,flight]).presentationTime,'');assert.equal(api.read(stay,[stay,flight]).apzDate,'');assert.equal(api.read(stay,[stay,flight]).timeZone,'');
  const once=fs.readFileSync(path.join(temp,'client/src/pages/Home.tsx'),'utf8');execFileSync(process.execPath,[apply],{cwd:temp});assert.equal(fs.readFileSync(path.join(temp,'client/src/pages/Home.tsx'),'utf8'),once,'materializer remains idempotent');
  console.log('PASS real expanded AIMS SSR and materialized Hotels savedFor: canonical room/hotel/date/zone, account/occurrence/duplicate/legacy/invalid APZ, adjacent-day bounds, private-only and idempotence. No browser lifecycle claim.');
} finally {fs.rmSync(temp,{recursive:true,force:true});}
