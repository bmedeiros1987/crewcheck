import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, readFile } from 'node:fs/promises';

await mkdir('dist/tv-extension-tests',{recursive:true});
await build({
  entryPoints:['apps/tv-player/src/programming.ts'],
  bundle:true,platform:'node',format:'esm',
  outfile:'dist/tv-extension-tests/programming.mjs',
});
const mod=await import('../dist/tv-extension-tests/programming.mjs');

const flight=(id,journeyId,origin,destination,startAt,endAt,extra={})=>({
  id,journeyId,kind:'flight',date:'2026-09-19',startAt,endAt,presentation:null,
  flight:id.toUpperCase(),origin,destination,groundBeforeMinutes:null,confidence:'high',publishedCode:'VOO',...extra,
});
const values=[
  flight('la1','j1','BSB','GRU','2026-09-19T10:00:00Z','2026-09-19T11:30:00Z',{presentation:'08:50'}),
  flight('la2','j1','GRU','REC','2026-09-19T12:30:00Z','2026-09-19T15:20:00Z',{groundBeforeMinutes:60}),
  flight('la3','j1','REC','FOR','2026-09-19T16:20:00Z','2026-09-19T17:30:00Z',{groundBeforeMinutes:60}),
  {id:'stay1',journeyId:'j1',kind:'stay',date:'2026-09-19',startAt:'2026-09-19T17:30:00Z',endAt:'2026-09-20T08:00:00Z',presentation:null,flight:null,origin:'FOR',destination:'FOR',groundBeforeMinutes:null,confidence:'high',publishedCode:'PERNOITE'},
];
const programs=mod.programsForDay(values);
assert.equal(programs.length,2,'stay must never be absorbed into flight journey card');
assert.equal(programs[0].flights.length,3,'full journey must keep all legs');
assert.equal(mod.programRouteCodes(programs[0]).join('>'),'BSB>GRU>REC>FOR');
assert.equal(mod.programPresentation(programs[0]),'08:50');
assert.match(mod.programTitle(programs[0],false),/BSB → GRU → REC → FOR/);
assert.match(mod.programTitle(programs[0],true),/Brasília \(BSB\)/);
assert.equal(mod.visitorAirportLabel('SBBR',true),'Brasília (BSB · SBBR)');
assert.equal(mod.visitorAirportLabel('SCEL',true),'Santiago (SCL · SCEL)');
assert.equal(programs[1].kind,'stay');
assert.match(mod.programTitle(programs[1],false),/Pernoite/);
const summary=mod.calendarProgramSummary(values,false);
assert.equal(summary.programs,2);
assert.match(summary.meta,/3 etapas/);
assert.match(summary.meta,/1 pernoite/);
assert.equal(mod.simpleCodeExplanation('HSB'),'Sobreaviso em casa');

const details=await readFile('apps/tv-player/src/ProgrammingDetails.tsx','utf8');
assert.match(details,/ProgramOverview/);
assert.match(details,/ProgramDetails/);
assert.match(details,/FlightTimeline/);
assert.match(details,/stay-exclusive-card/);
assert.match(details,/Ative este compartilhamento no CrewCheck do celular/);
assert.match(details,/Códigos IATA aparecem acompanhados da cidade/);
assert.match(details,/UberHandoff/);
assert.match(details,/Não informada/);

const prefs=await readFile('apps/tv-player/src/displayPreferences.tsx','utf8');
for(const field of ['gate','traffic','weather','finance','crew','hotel','visitorExplanations','airlinePhoto']) assert.match(prefs,new RegExp(field));
assert.match(prefs,/Autorização no celular/);

const uber=await readFile('apps/tv-player/src/UberHandoff.tsx','utf8');
assert.match(uber,/hostname==='m\.uber\.com'/);
assert.match(uber,/A TV não confirma nem compra a corrida/);

const broadcast=await readFile('apps/tv-player/src/BroadcastPanels.tsx','utf8');
assert.match(broadcast,/O QUE IMPORTA PARA APRESENTAR/);
assert.match(broadcast,/traffic/);
assert.match(broadcast,/licensed/);
assert.match(broadcast,/Foto oficial\/licenciada/);
assert.doesNotMatch(broadcast,/backgroundImage:[^\n]*http:/);

const compatibilityCss=(await readFile('apps/tv-player/src/broadcast.css','utf8'))+'\n'+(await readFile('apps/tv-player/src/programming-details.css','utf8'));
assert.doesNotMatch(compatibilityCss,/display\s*:\s*grid\b/);
assert.doesNotMatch(compatibilityCss,/grid-template/);
assert.doesNotMatch(compatibilityCss,/(?:^|[;{])\s*gap\s*:/m);

const main=await readFile('apps/tv-player/src/main.tsx','utf8');
assert.match(main,/type View = [^\n]*'Agora'[^\n]*'Dia' \| 'Programação' \| 'Detalhes'/);
assert.match(main,/DayProgrammingView/);
assert.match(main,/ProgramOverview/);
assert.match(main,/ProgramDetails/);
assert.match(main,/calendarProgramSummary/);

console.log('PASS: TV extension has full multi-leg programs, distinct stays, drilldown, visitor language, personalization and safe Uber handoff.');
