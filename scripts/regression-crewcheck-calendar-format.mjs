import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = await mkdtemp(join(tmpdir(), 'crewcheck-calendar-'));
try {
 const outfile = join(dir, 'calendar.mjs');
 await build({ entryPoints: ['client/src/lib/calendarExport.ts'], outfile, bundle:true, platform:'node', format:'esm' });
 const { generateICalendar } = await import(pathToFileURL(outfile));
 const day = {date:'18/09/2026', type:'VOO', pairingCode:'P1', dutyReport:'22:30', dutyDebrief:'06:00', isNextDay:true, base:'GRU', legs:[{flightNumber:'LA1234',origin:'GRU',destination:'BSB',departureTime:'23:30',arrivalTime:'01:00',isNextDay:true,workType:'OP'}]};
 const roster = {crewName:'PESSOA TESTE',crewId:'123',base:'GRU',rank:'CC',year:2026,month:9,days:[day,{...day,date:'19/09/2026',type:'DO',legs:[],dutyReport:null,dutyDebrief:null}],rawText:''};
 const result = generateICalendar(roster,[],{mode:'all',includeReminders:false});
 assert.match(result,/SUMMARY:CrewCheck · Voo · GRU → BSB/);
 assert.match(result,/Apresentação: 22:30/);
 assert.match(result,/Término: 06:00 \(dia seguinte\)/);
 assert.match(result,/1\. LA1234 · GRU → BSB/);
 assert.match(result,/SUMMARY:CrewCheck · DO · Folga/);
 assert.match(result,/DTEND;TZID=America\/Sao_Paulo:20260919T060000/);
 assert.match(result,/DTEND;VALUE=DATE:20260920/);
 assert.doesNotMatch(result.split('END:VEVENT')[0],/123\) Pessoa Teste|Gratificação|Notes:|C\/I:/);
 const missing = generateICalendar({...roster,days:[{...day,dutyReport:null,dutyDebrief:null}]},[],{mode:'all'});
 assert.match(missing,/Apresentação: não informada/);
 assert.match(missing,/Término da jornada: não informado/);
 const reserve = generateICalendar({...roster,days:[{...day,type:'ASB',legs:[]}]});
 assert.match(reserve,/SUMMARY:CrewCheck · Reserva no aeroporto · ASB/);
 console.log('CrewCheck calendar format: titles, overnight, all-day, missing report and reserve passed');
} finally { await rm(dir,{recursive:true,force:true}); }

