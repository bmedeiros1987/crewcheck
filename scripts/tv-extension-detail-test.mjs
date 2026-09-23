import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, readFile } from 'node:fs/promises';

await mkdir('dist/tv-extension-tests',{recursive:true});
await build({
  entryPoints:['apps/tv-player/src/programming.ts'],
  bundle:true,platform:'node',format:'esm',
  outfile:'dist/tv-extension-tests/programming.mjs',
});
const programming=await import('../dist/tv-extension-tests/programming.mjs');

const activities=[
  {id:'1',journeyId:'J1',kind:'flight',date:'2026-09-20',startAt:'2026-09-20T10:00:00Z',endAt:'2026-09-20T12:00:00Z',presentation:'06:30',flight:'LA1001',origin:'BSB',destination:'GRU',groundBeforeMinutes:null,confidence:'high',publishedCode:'VOO'},
  {id:'2',journeyId:'J1',kind:'flight',date:'2026-09-20',startAt:'2026-09-20T13:00:00Z',endAt:'2026-09-20T14:00:00Z',presentation:null,flight:'LA1002',origin:'GRU',destination:'CWB',groundBeforeMinutes:60,confidence:'high',publishedCode:'VOO'},
  {id:'3',journeyId:'J1',kind:'stay',date:'2026-09-20',startAt:'2026-09-20T14:00:00Z',endAt:'2026-09-21T08:00:00Z',presentation:null,flight:null,origin:'CWB',destination:'CWB',groundBeforeMinutes:null,confidence:'high',publishedCode:'PNO'},
];
const programs=programming.programsForDay(activities);
assert.equal(programs.length,2,'stay must remain separate from flight journey');
assert.equal(programs[0].kind,'journey');
assert.equal(programs[0].flights.length,2);
assert.deepEqual(programming.programRouteCodes(programs[0]),['BSB','GRU','CWB']);
assert.equal(programs[1].kind,'stay');
assert.match(programming.programTitle(programs[0],false),/BSB.*GRU.*CWB/);
assert.match(programming.programTitle(programs[1],false),/Pernoite/);
assert.match(programming.visitorAirportLabel('SBBR',true),/Brasília|BSB/);
assert.equal(programming.programPresentation(programs[0]),'06:30');

const main=await readFile('apps/tv-player/src/main.tsx','utf8');
assert.match(main,/DayProgrammingView/);
assert.match(main,/ProgramOverview/);
assert.match(main,/ProgramDetails/);
assert.match(main,/TvDisplaySettings/);
assert.match(main,/calendarProgramSummary/);

const details=await readFile('apps/tv-player/src/ProgrammingDetails.tsx','utf8');
assert.match(details,/program-leg-strip/);
assert.match(details,/program\.flights\.slice\(0,4\)/);
assert.match(details,/stay-exclusive-card/);
assert.match(details,/Tripulação/);
assert.match(details,/Financeiro/);
assert.match(details,/METEOROLOGIA/);
assert.match(details,/Ative este compartilhamento no CrewCheck do celular/);
assert.match(details,/Em linguagem simples/);

const core=await readFile('packages/tv-core/src/index.ts','utf8');
assert.match(core,/role: "flight" \| "stay" \| "rest"/);
assert.match(core,/sharePermissions\?:/);
assert.match(core,/crew: false/);
assert.match(core,/finance: false/);
assert.match(core,/mobility: false/);

const broadcast=await readFile('apps/tv-player/src/BroadcastPanels.tsx','utf8');
assert.match(broadcast,/O QUE IMPORTA PARA APRESENTAR/);
assert.match(broadcast,/TRÂNSITO/);
assert.match(broadcast,/UberHandoff mobility=\{mobility\} compact/);
assert.match(broadcast,/visitorAirportLabel/);
assert.match(broadcast,/trustedAirlinePhoto/);
assert.match(broadcast,/if\(!visual\?\.licensed \|\| !visual\.imageUrl \|\| !visual\.source\)return null/);

const uber=await readFile('apps/tv-player/src/UberHandoff.tsx','utf8');
assert.match(uber,/hostname==='m\.uber\.com'/);
assert.match(uber,/A TV não confirma nem compra a corrida/);

const prefs=await readFile('apps/tv-player/src/displayPreferences.tsx','utf8');
assert.match(prefs,/finance:false,crew:false/);
assert.match(prefs,/applyPreset/);
assert.match(prefs,/modo visitante real/);

const css=(await readFile('apps/tv-player/src/tv.css','utf8'))+'\n'+(await readFile('apps/tv-player/src/programming-details.css','utf8'))+'\n'+(await readFile('apps/tv-player/src/broadcast.css','utf8'));
assert.doesNotMatch(css,/display:\s*grid\b/);
assert.doesNotMatch(css,/(?:^|[;{])\s*gap\s*:/);

console.log('PASS: TV premium extension groups journeys, isolates stays, keeps visitor/privacy gates, phone-only Uber and webOS-4-safe layout.');
