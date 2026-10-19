import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {realDeparture,data} from './concierge-premium-departure-router.test.mjs';
const source=fs.readFileSync('server.mjs','utf8');
const extract=name=>{const m=source.match(new RegExp(`(?:async )?function ${name}\\([\\s\\S]*?\\n}`));assert(m,name);return m[0];};
const at='2099-10-04T16:00:00Z';
for(const input of ['/hoje','/proximo','não fui acionado'])test(`actual temporal ${input} → sim renders offered tomorrow without claiming actual rest`,async()=>{
 const h=realDeparture(data('estimated'),'missing',at);
 await h.send('telegram',input);const reply=h.trace.output.at(-1);
 assert.match(reply,/amanhã/);assert.match(reply,/05\/10\/2099 às 07:00/);assert.match(reply,/sim/);assert.doesNotMatch(reply,/Você está no descanso|já chegou|Você foi acionado\./);
 if(input==='não fui acionado')assert.match(reply,/Você informou que não foi acionado/);
 await h.send('telegram','sim');assert.match(h.trace.output.at(-1),/Detalhes da programação prevista/);assert.match(h.trace.output.at(-1),/05\/10\/2099 às 07:00/);assert.match(h.trace.output.at(-1),/QA-MERGED/);
 await h.send('telegram','sim');assert.match(h.trace.output.at(-1),/Não há um pedido de detalhes válido/);
});
for(const change of ['expiry','revision','subject','binding','callback'])test(`actual sim invalidates pending details on ${change}`,async()=>{
 const roster=data('estimated'),h=realDeparture(roster,'missing',at);await h.send('telegram','/proximo');
 if(change==='expiry')h.advanceClock(121000);
 if(change==='revision'){const next=structuredClone(roster);next.days[1].legs[0].presentationTime='06:20';h.setRoster(next);}
 if(change==='subject')await h.send('telegram','obrigado');
 if(change==='binding')h.profile.linked=false;
 if(change==='callback'){await h.openInline();await h.tap('Transporte');}
 const before=h.trace.output.length;await h.send('telegram','sim');const output=h.trace.output.slice(before).join(' ');assert.doesNotMatch(output,/Detalhes da programação|QA-MERGED|07:00|05\/10\/2099/);
});

test('actual sim revalidates revision after initial await before sender',async()=>{
 const roster=data('estimated'),h=realDeparture(roster,'missing',at);await h.send('telegram','/proximo');
 const read=h.context.telegramRostersRead;let calls=0;
 h.context.telegramRostersRead=()=>{const result=read();if(++calls===2){const replacement=structuredClone(roster);replacement.days[1].legs[0].flightNumber='QA-CHANGED';h.setRoster(replacement);}return result;};
 const before=h.trace.output.length;await h.send('telegram','sim');assert(calls>=3,'must cross cached store reads before final sender');assert.doesNotMatch(h.trace.output.slice(before).join(' '),/QA-MERGED|05\/10\/2099|07:00/);
});
function flights(rows){return{year:2099,month:10,base:'BSB',days:rows.map(([flight,dep,arr,status],i)=>({date:'04/10/2099',dayNumber:4,month:10,year:2099,type:'VOO',base:'BSB',dutyReport:dep,dutyDebrief:arr,dutyReportSource:'published',dutyDebriefSource:'published',legs:[{flightNumber:flight,origin:i?'GRU':'BSB',destination:i?'BSB':'GRU',departureTime:dep,arrivalTime:arr,presentationTime:dep,...(status?{status}:{})}]}))};}
for(const scenario of ['future','ongoing','cancelled','ambiguous'])test(`actual meu voo resolves ${scenario} without historical fallback`,async()=>{
 let roster=flights([['LA1111','05:00','06:00'],['LA2222','08:00','09:00'],['LA3333','14:00','15:00']]);
 if(scenario==='cancelled')roster.days[1].legs[0].status='cancelled';
 if(scenario==='ambiguous'){roster.days=roster.days.slice(0,2);Object.assign(roster.days[0],{date:'03/10/2099',dayNumber:3,dutyReport:'23:00',dutyDebrief:'09:00'});Object.assign(roster.days[0].legs[0],{departureTime:'23:00',arrivalTime:'09:00',presentationTime:'23:00'});}
 const h=realDeparture(roster,'missing',scenario==='future'?'2099-10-04T10:00:00Z':'2099-10-04T11:30:00Z');let queries=[];
 h.context.runRadarRace=async ctx=>{queries.push(ctx.raw);return{ok:false,querySuppressed:true,message:'Consulta sintética indisponível.'};};
 await h.send('telegram','portão do meu voo');
 if(scenario==='cancelled'){assert.match(h.trace.output.at(-1),/cancelado/);assert.equal(queries.length,0);}
 else if(scenario==='ambiguous'){assert.match(h.trace.output.at(-1),/único voo/);assert.equal(queries.length,0);}
 else assert.deepEqual(queries,['LA2222']);
 assert.doesNotMatch(h.trace.output.join(' '),/LA1111/);
});

for(const outcome of ['provider_mismatch','unconfigured','synthesis_failed','delivery_failed','sent','text_policy','revoked','revision_changed'])test(`actual voice router and sender ${outcome} uses bounded result and safe text fallback`,async()=>{
 const h=realDeparture(data('estimated'),'missing',at),diagnostics=[],voiceLogs=[];let synthesis=0,delivery=0;
 Object.assign(h.context,{
  console:{...console,info:(label,value)=>{assert.equal(label,'[concierge-voice-delivery]');voiceLogs.push({...value});}},
  telegramVoiceFileId:()=> 'synthetic-file',crewcheckSttConfigured:()=>true,elevenLabsSttConfigured:()=>false,telegramVoiceDuration:()=>2,
  showHumanRecordingAction:async()=>{},telegramGetFileInfo:async()=>({ok:true,fileSize:2,filePath:'synthetic'}),telegramDownloadFile:async()=>({ok:true,buffer:Buffer.from('synthetic')}),
  telegramVoiceFileName:()=> 'synthetic.ogg',telegramVoiceMime:()=> 'audio/ogg',transcribeTelegramAudio:async()=>({ok:true,text:outcome==='text_policy'?'/configuracoes':'/proximo'}),
  envAny:()=>'',conciergeVoiceScriptV14408:t=>t,conciergeVoiceProfileForSnapshotV14348:()=> 'default',telegramHumanAudioCaption:()=> 'Synthetic',telegramShouldEchoTranscript:()=>false,
  cleanTtsText:t=>t,ttsPolicySnapshot:()=>({provider:outcome==='provider_mismatch'?'none':'elevenlabs'}),elevenLabsTtsConfigured:()=>outcome!=='unconfigured',
  generateElevenLabsSpeech:async()=>{synthesis++;if(outcome==='revoked')h.profile.linked=false;if(outcome==='revision_changed')h.setRoster(data('earlier'));return outcome==='synthesis_failed'?{ok:false}:{ok:true,buffer:Buffer.from('synthetic')};},
  sendTelegramVoiceBuffer:async()=>{delivery++;return{ok:outcome!=='delivery_failed'};},telegramHumanVoiceEnabled:()=>true,
 });
 for(const name of ['sendTelegramTtsAudio','sendHumanTelegramVoiceReply','handleTelegramVoiceMessage'])vm.runInContext(extract(name),h.context);
 const human=h.context.sendHumanTelegramVoiceReply;
 h.context.sendHumanTelegramVoiceReply=(...args)=>{const sink=args[4];args[4]=result=>{diagnostics.push(result);sink?.(result);};return human(...args);};
 await h.context.processTelegramUpdate({message:{chat:{id:h.profile.chatId,type:'private'},from:{id:h.profile.chatId},voice:{file_id:'synthetic',duration:2}}});
 assert.equal(diagnostics.length,1);assert.equal(voiceLogs.length,1);assert.deepEqual(Object.keys(voiceLogs[0]).sort(),['reason','state']);assert.doesNotMatch(JSON.stringify(voiceLogs),/example\.invalid|9001|QA-MERGED|05\/10/);const result=diagnostics[0];assert.equal(voiceLogs[0].state,result.state);
 if(['provider_mismatch','unconfigured'].includes(outcome)){assert.equal(result.state,'unavailable');assert.equal(result.reason,outcome);assert.equal(synthesis,0);}
 else assert.equal(result.state,['revoked','revision_changed'].includes(outcome)?'context_expired':outcome);
 if(['revoked','revision_changed'].includes(outcome)){assert.equal(synthesis,1);assert.equal(delivery,0);assert.doesNotMatch(h.trace.output.join(' '),/05\/10\/2099|APZ|QA-MERGED/);}
 else if(outcome==='sent'){assert.equal(delivery,1);assert.doesNotMatch(h.trace.output.join(' '),/Não consegui enviar/);}
 else if(outcome==='text_policy')assert.doesNotMatch(h.trace.output.join(' '),/Não consegui enviar/);
 else assert.match(h.trace.output.at(-1),/Não consegui enviar o áudio agora; segue por texto/);
});

test('actual midnight sim retains the explicitly offered date rather than a new tomorrow',async()=>{
 const h=realDeparture(data('estimated'),'missing','2099-10-05T02:59:30Z');await h.send('telegram','/proximo');assert.match(h.trace.output.at(-1),/amanhã/);
 h.advanceClock(60000);await h.send('telegram','sim');assert.match(h.trace.output.at(-1),/05\/10\/2099 às 07:00/);assert.doesNotMatch(h.trace.output.at(-1),/06\/10\/2099/);
});

test('actual late validation invalidates expired or superseded detail delivery',async()=>{
 for(const trigger of ['expiry','subject']){
  const h=realDeparture(data('estimated'),'missing',at);await h.send('telegram','/proximo');const read=h.context.telegramRostersRead;let calls=0,changed=0;
  h.context.telegramRostersRead=()=>{const result=read();if(++calls===2){changed++;if(trigger==='expiry')h.advanceClock(121000);else h.context.crewcheckTemporalDialogue.interrupt(h.profile.chatId);}return result;};
  const before=h.trace.output.length;await h.send('telegram','sim');assert.equal(changed,1);assert.doesNotMatch(h.trace.output.slice(before).join(' '),/QA-MERGED|05\/10\/2099|07:00/);
 }
});

for(const phase of ['before','during'])test(`actual copied identity readers deny sim after relink ${phase}`,async()=>{
 const h=realDeparture(data('estimated'),'missing',at);h.profile.accessKeyHash='synthetic-access-hash-AAA';let current={...h.profile};
 const original=h.context.telegramRostersRead;h.context.telegramRostersRead=()=>{const result=original();for(const value of Object.values(result.snapshots))value.accessKeyHash='synthetic-access-hash-AAA';return result;};
 h.context.telegramLinksRead=()=>({linked:{synthetic:{...current}}});h.context.telegramLinksWrite=()=>true;
 vm.runInContext(extract('telegramProfileForChat')+'\n'+extract('telegramProfileForChatAsync'),h.context);
 const runtime=source.match(/const crewcheckMenu = createTelegramMenu\([\s\S]*?\n}\);/);vm.runInContext(runtime[0].replace('const crewcheckMenu =','globalThis.crewcheckMenu ='),h.context);
 await h.send('telegram','/proximo');assert.match(h.trace.output.at(-1),/Quer os detalhes/);
 const relink=()=>{current={...current,email:'route-b@example.invalid'};};
 if(phase==='before')relink();else{const read=h.context.telegramRostersRead;let calls=0;h.context.telegramRostersRead=()=>{const result=read();if(++calls===2)relink();return result;};}
 const before=h.trace.output.length;await h.send('telegram','sim');assert.doesNotMatch(h.trace.output.slice(before).join(' '),/QA-MERGED|05\/10\/2099|07:00|Detalhes da programação/);
});

for(const changed of [false,true])test(`actual meu voo accepted Radar persists only its own revision, external change=${changed}`,async()=>{
 const h=realDeparture(flights([['LA1234','08:00','09:00']]),'missing','2099-10-04T10:00:00Z');let queries=0,saves=0;
 h.context.runRadarRace=async ctx=>{queries++;return{ok:true,flight:'LA1234',origin:'BSB',destination:'GRU',gate:'46',scheduledDepartureUtc:ctx.gateQueryEvidence.scheduledDepartureUtc,sourceReceivedAt:'2099-10-04T10:00:00Z'};};
 if(changed){const save=h.context.conciergeSaveSnapshotAsync;h.context.conciergeSaveSnapshotAsync=async(...args)=>{const result=await save(...args);if(args[2]?.lastRadar){saves++;h.setRoster(flights([['LA4321','08:00','09:00']]));}return result;};}
 await h.send('telegram','portão do meu voo');assert.equal(queries,1);
 if(changed){assert.equal(saves,1);assert.doesNotMatch(h.trace.output.join(' '),/LA1234|Portão: 46/);}else assert.match(h.trace.output.at(-1),/Portão: 46/);
});

test('actual concurrent topic invalidates old response and cannot recreate a stale offer',async()=>{
 const h=realDeparture(data('estimated'),'missing',at);const read=h.context.telegramRostersRead;let reads=0,changed=0;
 h.context.telegramRostersRead=()=>{const result=read();if(++reads===2){changed++;void h.context.crewcheckTemporalDialogue.handle('outro assunto',h.profile,result.snapshots[h.profile.email]);}return result;};
 await h.send('telegram','/proximo');assert.equal(changed,1);assert.doesNotMatch(h.trace.output.join(' '),/QA-MERGED|05\/10\/2099|07:00/);
 await h.send('telegram','sim');assert.match(h.trace.output.at(-1),/Não há um pedido de detalhes válido/);
});

for(const text of ['não','cancelar'])test(`actual declined detail offer ${text} stays cancelled`,async()=>{
 const h=realDeparture(data('estimated'),'missing',at);await h.send('telegram','/proximo');await h.send('telegram',text);assert.match(h.trace.output.at(-1),/cancelada/);
 await h.send('telegram','sim');assert.match(h.trace.output.at(-1),/Não há um pedido de detalhes válido/);
});

test('actual meu voo gate becomes unavailable if accepted source expires during persistence',async()=>{
 const h=realDeparture(flights([['LA1234','08:00','09:00']]),'missing','2099-10-04T10:00:00Z');let saves=0,queries=0;
 h.context.runRadarRace=async ctx=>{queries++;return{ok:true,flight:'LA1234',origin:'BSB',destination:'GRU',gate:'EXPIRING_GATE',scheduledDepartureUtc:ctx.gateQueryEvidence.scheduledDepartureUtc,sourceReceivedAt:'2099-10-04T09:30:01Z'};};
 const save=h.context.conciergeSaveSnapshotAsync;h.context.conciergeSaveSnapshotAsync=async(...args)=>{const result=await save(...args);if(args[2]?.lastRadar){saves++;h.advanceClock(2000);}return result;};
 await h.send('telegram','portão do meu voo');assert.equal(queries,1);assert.equal(saves,1);assert.doesNotMatch(h.trace.output.join(' '),/LA1234|EXPIRING_GATE|08:00/);
});
