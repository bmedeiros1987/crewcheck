import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {buildDutyFacts} from '../../server/concierge/duty-facts.mjs';
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

for(const outcome of ['provider_mismatch','unconfigured','voice_unavailable','synthesis_failed','delivery_failed','sent','text_policy','revoked','revision_changed'])test(`actual voice router and sender ${outcome} uses bounded result and safe text fallback`,async()=>{
 const h=realDeparture(data('estimated'),'missing',at),diagnostics=[],voiceLogs=[];let synthesis=0,delivery=0;
 Object.assign(h.context,{
  console:{...console,info:(label,value)=>{assert.equal(label,'[concierge-voice-delivery]');voiceLogs.push({...value});}},
  telegramVoiceFileId:()=> 'synthetic-file',crewcheckSttConfigured:()=>true,elevenLabsSttConfigured:()=>false,telegramVoiceDuration:()=>2,
  showHumanRecordingAction:async()=>{},telegramGetFileInfo:async()=>({ok:true,fileSize:2,filePath:'synthetic'}),telegramDownloadFile:async()=>({ok:true,buffer:Buffer.from('synthetic')}),
  telegramVoiceFileName:()=> 'synthetic.ogg',telegramVoiceMime:()=> 'audio/ogg',transcribeTelegramAudio:async()=>({ok:true,text:outcome==='text_policy'?'/configuracoes':'/proximo'}),
  envAny:()=>'',conciergeVoiceScriptV14408:t=>t,conciergeVoiceProfileForSnapshotV14348:()=> 'default',telegramHumanAudioCaption:()=> 'Synthetic',telegramShouldEchoTranscript:()=>false,
  cleanTtsText:t=>t,ttsPolicySnapshot:()=>({provider:outcome==='provider_mismatch'?'none':'elevenlabs'}),elevenLabsTtsConfigured:()=>outcome!=='unconfigured',
  generateElevenLabsSpeech:async()=>{synthesis++;if(outcome==='revoked')h.profile.linked=false;if(outcome==='revision_changed')h.setRoster(data('earlier'));return outcome==='voice_unavailable'?{ok:false,configured:false}:outcome==='synthesis_failed'?{ok:false}:{ok:true,buffer:Buffer.from('synthetic')};},
  sendTelegramVoiceBuffer:async()=>{delivery++;return{ok:outcome!=='delivery_failed'};},telegramHumanVoiceEnabled:()=>true,
 });
 for(const name of ['sendTelegramTtsAudio','sendHumanTelegramVoiceReply','handleTelegramVoiceMessage'])vm.runInContext(extract(name),h.context);
 const human=h.context.sendHumanTelegramVoiceReply;
 h.context.sendHumanTelegramVoiceReply=(...args)=>{const sink=args[4];args[4]=result=>{diagnostics.push(result);sink?.(result);};return human(...args);};
 await h.context.processTelegramUpdate({message:{chat:{id:h.profile.chatId,type:'private'},from:{id:h.profile.chatId},voice:{file_id:'synthetic',duration:2}}});
 assert.equal(diagnostics.length,1);assert.equal(voiceLogs.length,1);assert.deepEqual(Object.keys(voiceLogs[0]).sort(),['reason','state']);assert.doesNotMatch(JSON.stringify(voiceLogs),/example\.invalid|9001|QA-MERGED|05\/10/);const result=diagnostics[0];assert.equal(voiceLogs[0].state,result.state);
 if(['provider_mismatch','unconfigured'].includes(outcome)){assert.equal(result.state,'unavailable');assert.equal(result.reason,outcome);assert.equal(synthesis,0);}
 else if(outcome==='voice_unavailable'){assert.equal(result.state,'unavailable');assert.equal(result.reason,'voice_unavailable');assert.equal(synthesis,1);assert.equal(delivery,0);}
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
 h.context.telegramRostersRead=()=>{const result=read();if(++reads===2){changed++;void h.send('telegram','outro assunto');}return result;};
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

function actualTools(h){
 h.context.buildDutyFacts=buildDutyFacts;h.context.envAny=()=>'';
 for(const name of ['conciergeCallConfirmationKeyboard','requestConciergeCallConfirmation'])vm.runInContext(extract(name),h.context);
 return h;
}
for(const text of ['/conformidade','revisar escala','/ligacao'])test(`common entry clears pending offer before early return ${text}`,async()=>{
 const h=actualTools(realDeparture(data('estimated'),'missing',at));await h.send('telegram','/proximo');assert.match(h.trace.output.at(-1),/Quer os detalhes/);await h.send('telegram',text);
 const before=h.trace.output.length;await h.send('telegram','sim');assert.doesNotMatch(h.trace.output.slice(before).join(' '),/Detalhes da programação|QA-MERGED|05\/10\/2099|07:00/);
});
for(const change of ['apz','base','earlier'])test(`real Radar enrichment cannot adopt external ${change} during await`,async()=>{
 const roster=flights([['LA1234','08:00','09:00']]),h=actualTools(realDeparture(roster,'missing','2099-10-04T10:00:00Z'));let saves=0,queries=0,applies=0;
 const apply=h.context.conciergeApplyRadar;h.context.conciergeApplyRadar=(...args)=>{applies++;return apply(...args);};const save=h.context.conciergeSaveSnapshotAsync;h.context.conciergeSaveSnapshotAsync=async(...args)=>{if(args[2]?.lastRadar)saves++;return save(...args);};
 h.context.runRadarRace=async ctx=>{queries++;const changed=structuredClone(roster);if(change==='apz'){changed.days[0].dutyReport='08:30';changed.days[0].legs[0].presentationTime='08:30';}if(change==='base')changed.base='GRU';if(change==='earlier'){const prior=structuredClone(changed.days[0]);Object.assign(prior,{type:'ASB',pairingCode:'ASB',dutyReport:'07:00',dutyDebrief:'07:30',legs:[]});changed.days.unshift(prior);}h.setRoster(changed);return{ok:true,flight:'LA1234',origin:'BSB',destination:'GRU',gate:'STALE_GATE_46',scheduledDepartureUtc:ctx.gateQueryEvidence.scheduledDepartureUtc,sourceReceivedAt:'2099-10-04T10:00:00Z'};};
 await h.send('telegram','portão do meu voo');assert.equal(queries,1);assert.equal(applies,0);assert.equal(saves,0);assert.doesNotMatch(h.trace.output.join(' '),/LA1234|STALE_GATE_46/);
});
function voiceTools(){
 const h=actualTools(realDeparture(data('estimated'),'missing',at)),voice=[],states=[];let transcribeHook=null,synthHook=null,sendHook=null;
 Object.assign(h.context,{console:{...console,info:(_label,value)=>states.push({...value})},telegramVoiceFileId:()=> 'synthetic',crewcheckSttConfigured:()=>true,elevenLabsSttConfigured:()=>false,telegramVoiceDuration:()=>2,showHumanRecordingAction:async()=>{},telegramGetFileInfo:async()=>({ok:true,fileSize:2,filePath:'synthetic'}),telegramDownloadFile:async()=>({ok:true,buffer:Buffer.from('synthetic')}),telegramVoiceFileName:()=> 'synthetic.ogg',telegramVoiceMime:()=> 'audio/ogg',transcribeTelegramAudio:async()=>{if(transcribeHook)await transcribeHook();return{ok:true,text:'/amanha'};},conciergeVoiceScriptV14408:t=>t,conciergeVoiceProfileForSnapshotV14348:()=> 'default',telegramHumanAudioCaption:()=> 'Synthetic',telegramShouldEchoTranscript:()=>true,cleanTtsText:t=>t,ttsPolicySnapshot:()=>({provider:'elevenlabs'}),elevenLabsTtsConfigured:()=>true,generateElevenLabsSpeech:async text=>{if(synthHook)await synthHook();return{ok:true,buffer:Buffer.from('synthetic'),text};},sendTelegramVoiceBuffer:async(...args)=>{voice.push(args);if(sendHook)await sendHook();return{ok:true};},telegramHumanVoiceEnabled:()=>true});
 for(const name of ['sendTelegramTtsAudio','sendHumanTelegramVoiceReply','handleTelegramVoiceMessage'])vm.runInContext(extract(name),h.context);
 return{...h,voice,states,setTranscribe:fn=>{transcribeHook=fn;},setSynth:fn=>{synthHook=fn;},setVoiceSend:fn=>{sendHook=fn;},audio:()=>h.context.processTelegramUpdate({message:{chat:{id:h.profile.chatId,type:'private'},from:{id:h.profile.chatId},voice:{file_id:'synthetic',duration:2}}})};
}
for(const phase of ['stt','synthesis'])for(const next of ['text','callback','incoming-stt'])test(`immutable entry turn cancels old audio during ${phase} on ${next}`,async()=>{
 const h=voiceTools();let signal,release;const started=new Promise(r=>signal=r),gate=new Promise(r=>release=r);let entered=0;
 const hold=async()=>{if(++entered===1){signal();await gate;}};if(phase==='stt')h.setTranscribe(hold);else h.setSynth(hold);
 const old=h.audio();await started;let newer=null,releaseNew=null;
 if(next==='text')await h.send('telegram','/conformidade');
 if(next==='callback'){await h.openInline();await h.tap('Transporte');}
 if(next==='incoming-stt'){let signalNew;const newStarted=new Promise(r=>signalNew=r),newGate=new Promise(r=>releaseNew=r);h.setTranscribe(async()=>{signalNew();await newGate;});newer=h.audio();await newStarted;}
 const before=h.trace.output.length;release();await old;assert.equal(h.voice.length,0,'old voice must not reach transport');assert.doesNotMatch(h.trace.output.slice(before).join(' '),/QA-MERGED|05\/10\/2099|Entendi:/);
 if(newer){h.context.telegramShouldEchoTranscript=()=>false;h.setSynth(null);releaseNew();await newer;assert.equal(h.voice.length,1,'new unchanged voice remains deliverable');}
});
for(const boundary of ['voice-result','echo-markup'])test(`accepted voice cannot authorize transcript echo after relink ${boundary}`,async()=>{
 const h=voiceTools();let changed=0;const relink=()=>{if(!changed){changed++;h.profile.email='route-b@example.invalid';}};
 if(boundary==='voice-result')h.setVoiceSend(relink);else{const markup=h.context.crewcheckMenu.markup;h.context.crewcheckMenu.markup=async(...args)=>{const result=await markup(...args);if(h.voice.length)relink();return result;};}
 await h.audio();assert.equal(h.voice.length,1,'already accepted voice is not claimed recalled');assert.equal(changed,1);assert.doesNotMatch(h.trace.output.join(' '),/Entendi:/);
});
for(const boundary of ['final-auth','before-voice-send'])test(`current cache authority rejects old audio at ${boundary}`,async()=>{
 const h=voiceTools();let synthesized=0,armed=false,mutated=0;const change=()=>{if(mutated)return;mutated++;const replacement=data('estimated');replacement.days[1].legs[0].presentationTime='07:30';h.setRoster(replacement);};
 h.setSynth(async()=>{synthesized++;armed=true;});
 if(boundary==='final-auth'){const load=h.context.conciergeLoadSnapshot;let read=false;h.context.conciergeLoadSnapshot=async(...args)=>{const result=await load(...args);if(armed)read=true;return result;};const auth=h.context.telegramProfileForChatAsync;h.context.telegramProfileForChatAsync=async(...args)=>{const result=await auth(...args);if(read)change();return result;};}
 else{const actual=h.context.sendTelegramTtsAudio;h.context.sendTelegramTtsAudio=async(...args)=>{const options=args[2],validate=options.validate;options.validate=async()=>{const result=await validate();if(armed)change();return result;};return actual(...args);};}
 await h.audio();assert.equal(synthesized,1);assert.equal(mutated,1);assert.equal(h.voice.length,0);assert.doesNotMatch(h.trace.output.join(' '),/QA-MERGED|05\/10\/2099|Entendi:/);
});
test('unchanged real voice path still delivers audio and optional guarded echo',async()=>{const h=voiceTools();await h.audio();assert.equal(h.voice.length,1);assert.match(h.trace.output.at(-1),/Entendi:/);});
