import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, readFile } from 'node:fs/promises';

await mkdir('dist/tv-deep-programming-tests',{recursive:true});
await build({
  entryPoints:['apps/tv-player/src/programming.ts'],
  bundle:true,
  platform:'node',
  format:'esm',
  outfile:'dist/tv-deep-programming-tests/programming.mjs',
});
const {
  programsForDay,programRouteCodes,programTitle,programKicker,
  airportCodeExplanation,visitorAirportLabel,simpleCodeExplanation,
  visitorRouteGlossary
}=await import('../dist/tv-deep-programming-tests/programming.mjs');

const flight=(id,origin,destination,start,end,journey='j1')=>({
  id,journeyId:journey,kind:'flight',date:'2026-09-20',startAt:start,endAt:end,
  presentation:id==='f1'?'08:00':null,flight:id==='f1'?'LA1001':'LA1002',
  origin,destination,groundBeforeMinutes:id==='f2'?70:null,confidence:'high',publishedCode:'VOO',
});
const stay={
  id:'stay1',journeyId:'j1',kind:'stay',date:'2026-09-20',
  startAt:'2026-09-20T17:00:00-03:00',endAt:'2026-09-21T06:00:00-03:00',
  presentation:null,flight:null,origin:'CWB',destination:'CWB',groundBeforeMinutes:null,
  confidence:'high',publishedCode:'PERNOITE',
};
const activities=[
  flight('f1','BSB','GRU','2026-09-20T09:00:00-03:00','2026-09-20T10:40:00-03:00'),
  flight('f2','GRU','CWB','2026-09-20T11:50:00-03:00','2026-09-20T13:00:00-03:00'),
  stay,
];
const programs=programsForDay(activities);
assert.equal(programs.length,2,'stay must not be absorbed into flight journey');
assert.equal(programs[0].kind,'journey');
assert.equal(programs[0].flights.length,2);
assert.deepEqual(programRouteCodes(programs[0]),['BSB','GRU','CWB']);
assert.match(programTitle(programs[0],false),/BSB → GRU → CWB/);
assert.equal(programKicker(programs[0]),'JORNADA · 2 ETAPAS');
assert.equal(programs[1].kind,'stay');
assert.match(programTitle(programs[1],false),/Pernoite/);

assert.deepEqual(airportCodeExplanation('SBBR'),{iata:'BSB',icao:'SBBR',city:'Brasília',known:true});
assert.deepEqual(airportCodeExplanation('BSB'),{iata:'BSB',icao:'SBBR',city:'Brasília',known:true});
assert.equal(visitorAirportLabel('SBBR',true),'Brasília (BSB)');
const bsbGlossary=visitorRouteGlossary(programs[0]).find(item=>item.iata==='BSB');
assert.equal(bsbGlossary?.icao,'SBBR');
assert.equal(simpleCodeExplanation('HSB'),'Sobreaviso em casa');
assert.equal(simpleCodeExplanation('EXTRA'),'Deslocamento como passageiro');
assert.equal(visitorRouteGlossary(programs[0]).length,3);

const calendar=await readFile('apps/tv-player/src/CalendarProgramPreview.tsx','utf8');
assert.match(calendar,/program\.kind==='stay'/);
assert.match(calendar,/program\.kind==='rest'/);
const calendarCss=await readFile('apps/tv-player/src/calendar-program-preview.css','utf8');
assert.match(calendarCss,/\.calendar-program-line\.program-stay/);
assert.match(calendarCss,/\.calendar-program-line\.program-rest/);
assert.match(calendar,/programRouteCodes/);
assert.match(calendar,/programs\.slice\(0,max\)/);

const details=await readFile('apps/tv-player/src/ProgrammingDetails.tsx','utf8');
assert.match(details,/FlightTimeline/);
assert.match(details,/stay-program-symbol/);
assert.match(details,/Portão e trânsito atuais não são reutilizados em outra programação/);
assert.match(details,/permissions\.crew/);
assert.match(details,/permissions\.finance/);
assert.match(details,/permissions\.hotel/);
assert.match(details,/permissions\.weather/);
assert.match(details,/visitorRouteGlossary/);
assert.match(details,/visitorOperationalGlossary/);

const preferences=await readFile('apps/tv-player/src/displayPreferences.tsx','utf8');
assert.match(preferences,/TvDisplayPreset='essential'\|'operational'\|'rest'\|'complete'\|'visitor'/);
assert.match(preferences,/mobility:boolean/);
assert.match(preferences,/finance:false,[\s\S]*crew:false,[\s\S]*mobility:false,[\s\S]*visitorExplanations:true/);
assert.doesNotMatch(preferences,/Object\.fromEntries/);

const home=await readFile('apps/tv-player/src/HomeEssentials.tsx','utf8');
assert.match(home,/packagedAirlinePhoto/);
assert.match(home,/ABRIR PROGRAMAÇÃO COMPLETA|Abrir programação completa/);
assert.match(home,/SAIR DE CASA/);
assert.match(home,/APRESENTAÇÃO/);
assert.match(home,/TRÂNSITO/);
assert.match(home,/PORTÃO/);
assert.match(home,/prefs\.mobility/);

const uber=await readFile('apps/tv-player/src/UberHandoff.tsx','utf8');
assert.match(uber,/hostname==='m\.uber\.com'/);
assert.match(uber,/A TV não confirma nem compra a corrida/);

const photos=await readFile('apps/tv-player/src/licensedAirlinePhotos.ts','utf8');
assert.match(photos,/LATAM/);
assert.match(photos,/CC BY 2\.0/);
assert.match(photos,/Public domain/);
assert.match(photos,/CC BY-SA 4\.0/);

console.log('PASS: full journey cards, unique overnight identity, safe drill-down, visitor translation, licensed airline imagery, personalization and phone Uber handoff.');
