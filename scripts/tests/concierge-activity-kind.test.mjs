import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { jsPDF } from 'jspdf';
import { parsePdfOnServer } from '../../server/rosterParser.mjs';
import { prepareConciergeCanonicalBridge } from '../p1-concierge-journey/bridge.mjs';
import { conciergeFinalizeReplyV14354 as finalize } from '../../server/v14354/concierge-language.mjs';
import { conciergeHumanizeReplyV14408 as humanize } from '../../server/v14408/concierge-human.mjs';

// Synthetic PDF/identities only. No original roster, credentials, DB or network.
const prepared=process.argv.includes('--materialized');
const root=process.cwd();
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'concierge-activity-label-'));
const copied=['server/v1404/telegram-language.mjs','server/v1403/telegram-human.mjs','server/v1403/premium-helpers.snippet','server/v1403/build-reply.snippet'];
for(const name of copied){fs.mkdirSync(path.dirname(path.join(temporary,name)),{recursive:true});fs.copyFileSync(name,path.join(temporary,name));}
fs.writeFileSync(path.join(temporary,'package.json'),JSON.stringify({type:'module',scripts:{}}));
const apply=()=>execFileSync(process.execPath,[path.join(root,'scripts/v14314/apply.mjs')],{cwd:temporary,stdio:'pipe'});
if(!prepared) apply();
const language=await import(pathToFileURL(path.join(temporary,'server/v1404/telegram-language.mjs')));
prepareConciergeCanonicalBridge();
const {normalizeRosterDays}=await import('../../server/concierge/generated/canonicalRoster.mjs');
const server=fs.readFileSync('server.mjs','utf8');
const helpers=fs.readFileSync(path.join(temporary,'server/v1403/premium-helpers.snippet'),'utf8');
const extract=(name)=>{for(const source of [server,helpers]){const m=source.match(new RegExp(`(?:async )?function ${name}\\([\\s\\S]*?\\n}`));if(m)return m[0];}throw Error('Missing production function '+name);};
let now=Date.parse('2026-10-19T13:02:00Z');
class Clock extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
let cache={snapshots:{}};const database=new Map();
const clone=value=>JSON.parse(JSON.stringify(value));
const context=vm.createContext({Date:Clock,Intl,...language,
  conciergeInactiveCodes:new Set(['DO','DOF','DOP','DOPR','DR','OFF','VC']),
  telegramRostersRead:()=>clone(cache),telegramRostersWrite:value=>{cache=clone(value);return true;},
  conciergeDbPut:async(key,value)=>{database.set(key,clone(value));return true;},conciergeDbGet:async key=>clone(database.get(key)||null),
  conciergeAccessMatches:()=>true,normalizeConciergeButtonText:value=>value,
  isWellhubPlanPreferenceMessage:()=>false,isWellhubActivityPreferenceMessage:()=>false,
  conciergeIdentityFlow:async(_text,_profile,snapshot)=>({handled:false,snapshot}),conciergeEasterEggReply:()=>'',
});
const functions=['conciergeSafeKey','conciergeSnapshotForProfile','conciergeMinimizeRoster','conciergeRosterDiagnostics','conciergeSaveSnapshot','conciergeSaveSnapshotAsync','conciergeLoadSnapshot','conciergeRosterDayParts','conciergeTime','conciergeProgramDate','conciergeProgramRecords','conciergeDateKey','conciergeRecordDateKey','conciergePresentationTime','conciergeDayForKey','conciergePremiumScheduleReply'];
if(prepared)functions.unshift('conciergeCareCode','conciergeCareState','conciergeCarePresentation');
vm.runInContext(functions.map(extract).join('\n'),context);
if(prepared)vm.runInContext(extract('buildTelegramConciergeReplyCore'),context);
const profile={email:'fixture@example.test',name:'Fixture',chatId:'101',linked:true,authenticated:true};
const day=(code,date='19/10/2026',start='06:30',end='12:30')=>({date,type:code,pairingCode:code,dutyReport:start,dutyDebrief:end,base:'BSB',legs:[],rawText:'synthetic published activity'});
const roster=days=>({month:10,year:2026,base:'BSB',crewName:'SYNTHETIC',rawText:'synthetic',days});
async function saveLoad(input){await context.conciergeSaveSnapshotAsync(profile,input,{source:'synthetic-import'});cache={snapshots:{}};return context.conciergeLoadSnapshot(profile);}
const render=async(snapshot,query='/hoje')=>humanize(finalize(prepared?await context.buildTelegramConciergeReplyCore(query,profile,snapshot):await context.conciergePremiumScheduleReply(snapshot,'today',profile),query),query);

for(const [code,label]of[['ASB','reserva'],['HSB','sobreaviso'],['HSBE','sobreaviso especial'],['RES','reserva operacional'],['RSV','reserva operacional']])test(`${code}: normalize → persist/read → Hoje retains enum and clocks`,async()=>{
  const input=roster([day(code)]);const normalized=normalizeRosterDays(clone(input));
  assert.equal(normalized.days[0].type,code);assert.equal(normalized.days[0].dutyReport,'06:30');assert.equal(normalized.days[0].dutyDebrief,'12:30');
  const before=JSON.stringify(normalized);const snapshot=await saveLoad(normalized);
  assert.equal(snapshot.roster.days[0].type,code);assert.equal(snapshot.roster.days[0].pairingCode,code);
  assert.equal(snapshot.roster.days[0].dutyReport,'06:30');assert.equal(snapshot.roster.days[0].dutyDebrief,'12:30');
  const reply=await render(snapshot);assert(reply.includes(`você tem ${label}.`),reply);
  assert(reply.includes('06:30')&&reply.includes('12:30'),reply);
  if(code==='ASB')assert(!/sobreaviso/i.test(reply),reply);
  assert.equal(JSON.stringify(normalized),before,'consumer/storage must not rewrite input');
});

for(const code of ['ZZZ','ASBX','HSBX'])test(`${code}: unknown code is never guessed as reserve or standby`,async()=>{
  const snapshot=await saveLoad(roster([day(code)]));const reply=await render(snapshot);
  assert(!/reserva|sobreaviso/i.test(reply));assert(reply.toLowerCase().includes(code.toLowerCase()));
  assert.equal(snapshot.roster.days[0].type,code);
});

function syntheticPdf(code){const pdf=new jsPDF({orientation:'landscape',unit:'pt',format:[800,1400],compress:false});pdf.setFontSize(10);
  pdf.text('Escala de Tripulante Convertida para padrao AIMS',25,30);
  pdf.text('Tripulante: SYNTHETIC -BP:00000000 -Base: BSB -01/10/2026 ate31/10/2026',25,50);
  ['19Oct',code,'06:30','12:30'].forEach((value,index)=>pdf.text(value,55,90+index*14));
  return Buffer.from(pdf.output('arraybuffer')).toString('base64');}
for(const code of ['ASB','HSB'])test(`real server PDF parser preserves ${code}; no parser repair needed for fixture`,async()=>{
  const {roster:parsed}=await parsePdfOnServer({filename:'synthetic.pdf',dataBase64:syntheticPdf(code)});
  const event=parsed.days.find(d=>d.dayNumber===19&&d.type===code);assert(event,JSON.stringify(parsed.days.map(d=>({date:d.date,type:d.type}))));
  assert.equal(event.dutyReport,'06:30');assert.equal(event.dutyDebrief,'12:30');
  const normalized=normalizeRosterDays(parsed);const selected=normalized.days.find(d=>d.dayNumber===19&&d.type===code);assert(selected);
  assert.equal(selected.dutyReport,'06:30');assert.equal(selected.dutyDebrief,'12:30');
});

for(const [instant,wanted]of[['2026-10-19T02:59:59Z','sobreaviso'],['2026-10-19T03:00:00Z','reserva'],['2026-10-19T13:02:00Z','reserva'],['2026-10-20T02:59:59Z','reserva'],['2026-10-20T03:00:00Z','sobreaviso']])test(`Hoje uses Sao Paulo civil day at ${instant}`,async()=>{
  now=Date.parse(instant);const snapshot=await saveLoad(roster([day('HSB','18/10/2026','22:30','04:30'),day('ASB'),day('HSB','20/10/2026')]));
  const reply=await render(snapshot);assert(reply.includes(`você tem ${wanted}.`),reply);
  now=Date.parse('2026-10-19T13:02:00Z');
});

test('year boundary and host timezone do not change published day or activity',async()=>{
  const snapshot=await saveLoad({...roster([day('ASB','31/12/2026'),day('HSB','01/01/2027')]),month:12,year:2026});
  for(const [instant,label]of[['2027-01-01T02:59:59Z','reserva'],['2027-01-01T03:00:00Z','sobreaviso']]){now=Date.parse(instant);assert((await render(snapshot)).includes(`você tem ${label}.`));}
  now=Date.parse('2026-10-19T13:02:00Z');
});

test('repair already materialized bad label; preparation is idempotent and leaves HSB intact',()=>{
  const file=path.join(temporary,'server/v1404/telegram-language.mjs');const initial=fs.readFileSync(file,'utf8');
  fs.writeFileSync(file,initial.replace("ASB:'reserva'","ASB:'sobreaviso'"));apply();
  const repaired=fs.readFileSync(file,'utf8');assert(repaired.includes("ASB:'reserva'"));assert(repaired.includes("HSB:'sobreaviso'"));
  apply();assert.equal(fs.readFileSync(file,'utf8'),repaired);
});

test.after(()=>fs.rmSync(temporary,{recursive:true,force:true}));
