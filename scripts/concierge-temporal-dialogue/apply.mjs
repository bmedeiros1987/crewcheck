import fs from 'node:fs';
let source=fs.readFileSync('server.mjs','utf8');
const line="import { createTemporalDialogue } from './server/concierge/temporal-dialogue.mjs';";
if(!source.includes(line))source=line+'\n'+source;
function patch(name,transform){const m=new RegExp(`async function ${name}\\(`).exec(source);if(!m)throw Error('missing '+name);const end=source.indexOf('\n}',m.index)+2;source=source.slice(0,m.index)+transform(source.slice(m.index,end))+source.slice(end);}
const anchor="async function buildTelegramConciergeReply(text = '', profile = {}, snapshot = null) {";
const hooked=anchor+"\n  const temporal = await crewcheckTemporalDialogue.handle(text, profile, snapshot);\n  if (temporal) return temporal.reply;";
if(!source.includes(hooked)){if(!source.includes(anchor))throw Error('missing actual outer wrapper');source=source.replace(anchor,hooked);}
const runtime=`const crewcheckTemporalDialogue = createTemporalDialogue({
  now: () => Date.now(), authorized: (...args) => conciergeDepartureOwnerCurrent(...args),
  profile: (...args) => telegramProfileForChatAsync(...args),
  profileNow: profile => ({...telegramProfileForChat({chat:{id:profile.chatId,type:'private'},from:{id:profile.chatId}}),channel:'telegram',chatType:'private'}),
  snapshot: (...args) => conciergeLoadSnapshot(...args), snapshotNow: profile => conciergeSnapshotForProfile(profile),
  access: conciergeAccessMatches, minimize: conciergeMinimizeRoster,
  programs: roster => conciergeJourneyProgramRecords(roster, conciergeProgramRecords(roster)),
  events: buildCanonicalRosterEvents, explicitFlight: conciergeExtractFlight,
  summary: record => buildProgramSummary({record,label:'A próxima programação',includeGreeting:false}),
  radar: conciergeRadarReply,
  radarCurrent: (payload,evidence,roster) => gateQueryDay(evidence).allowed && radarResultDecision(payload,evidence,Date.now()).allowed && Boolean(findPublishedGateLeg(roster,evidence,buildCanonicalRosterEvents(roster))),
});\n\n`;
if(!source.includes('const crewcheckTemporalDialogue ='))source=source.replace('const crewcheckMenu = createTelegramMenu(',runtime+'const crewcheckMenu = createTelegramMenu(');
source=source.replace("profile.conciergeResponseAuthority?.kind === 'departure'",'profile.conciergeResponseAuthority');
// Observe the existing admitted update before auxiliary early returns/queues.
// This changes no webhook URL, token, secret, registration or service setting.
patch('handleTelegramWebhook',body=>body.includes('crewcheckTemporalDialogue.observe(update)')?body:body.replace('  await crewcheckMenu.interrupt(update.message || {});','  crewcheckTemporalDialogue.observe(update);\n  await crewcheckMenu.interrupt(update.message || {});'));
patch('processTelegramUpdate',body=>{
 body=body.replace('  if (update.callback_query) crewcheckTemporalDialogue.interrupt(update.callback_query.message?.chat?.id);\n','');
 if(body.includes('crewcheckTemporalDialogue.run(update,'))return body;
 const start=body.indexOf('\n');return body.slice(0,start)+'\n  return crewcheckTemporalDialogue.run(update, async () => {'+body.slice(start,-2)+'\n  });\n}';
});
patch('sendTelegramMessage',body=>{
 if(body.includes('producerDeliveryCheck'))return body;
 const before='  const deliveryCheck = crewcheckMenu.deliveryCheck(extra);';
 if(!body.includes(before))throw Error('missing final transport authority from parent1128');
 return body.replace(before,`  const producerDeliveryCheck = crewcheckMenu.deliveryCheck(extra);
  const contextCheck = producerDeliveryCheck || crewcheckMenu.hasOwnerGuard(extra) ? crewcheckTemporalDialogue.currentTurnCheck() : crewcheckTemporalDialogue.currentDeliveryCheck();
  const deliveryCheck = producerDeliveryCheck || contextCheck ? () => (!producerDeliveryCheck || producerDeliveryCheck()) && (!contextCheck || contextCheck()) : null;`);
});
patch('conciergeRadarReply',body=>{
 if(body.includes('const temporalSaved = await conciergeSaveSnapshotAsync('))return body;
 const start=body.indexOf('{')+1;body=body.slice(0,start)+"\n  if (profile.channel === 'telegram' && !await crewcheckTemporalDialogue.protect(profile,snapshot)()) return gateQuerySuppressed({reason:'response-context-expired'}).message;"+body.slice(start);
 body=body.replace("  const radar = await runRadarRace(queryContext, info?.leg?.origin || '', info?.leg?.destination || '');", "  const radar = await runRadarRace(queryContext, info?.leg?.origin || '', info?.leg?.destination || '');\n  profile.conciergeResponseAuthority?.acceptRadar?.(radar,queryContext.gateQueryEvidence);");
 body=body.replace('  snapshot = currentSnapshot;', "  if (profile.conciergeResponseAuthority?.beforeRadarWrite && !await profile.conciergeResponseAuthority.beforeRadarWrite(currentSnapshot)) return gateQuerySuppressed({reason:'response-occurrence-changed'}).message;\n  snapshot = currentSnapshot;");
 body=body.replace('    conciergeApplyRadar(snapshot, info, radar);', "    conciergeApplyRadar(snapshot, info, radar);\n    if (profile.conciergeResponseAuthority?.prepareRadarWrite && !profile.conciergeResponseAuthority.prepareRadarWrite(snapshot)) return gateQuerySuppressed({reason:'response-occurrence-changed'}).message;");
 const save="await conciergeSaveSnapshotAsync(profile, snapshot.roster, { source: snapshot.source || 'radar', lastRadar: { ...radar, updatedAt: new Date().toISOString() } });";
 if(!body.includes(save))throw Error('missing existing Radar write');
 return body.replace(save,"const temporalSaved = "+save+"\n    if (profile.conciergeResponseAuthority?.acceptWrite && !profile.conciergeResponseAuthority.acceptWrite(temporalSaved)) return gateQuerySuppressed({reason:'response-occurrence-changed'}).message;");
});
patch('sendTelegramTtsAudio',body=>body.includes("deliveryState:'context_expired'")?body:body
 .replace('configured: false, provider: policy.provider',"deliveryState: 'unavailable', deliveryReason: 'provider_mismatch', configured: false, provider: policy.provider")
 .replace("configured: false, provider: 'elevenlabs'","deliveryState: 'unavailable', deliveryReason: 'unconfigured', configured: false, provider: 'elevenlabs'")
 .replace('  const generated = await generateElevenLabsSpeech',"  if ((options.validate && !await options.validate()) || (options.checkNow && !options.checkNow())) return {ok:false,deliveryState:'context_expired'};\n  const generated = await generateElevenLabsSpeech")
 .replace('if (!generated.ok) return generated;',"if (!generated.ok) return {...generated,deliveryState:generated.configured === false ? 'unavailable' : 'synthesis_failed',deliveryReason:generated.configured === false ? 'voice_unavailable' : ''};\n  if ((options.validate && !await options.validate()) || (options.checkNow && !options.checkNow())) return {ok:false,deliveryState:'context_expired'};")
 .replace('return { ...sent, provider:',"return { ...sent, deliveryState: sent?.ok ? 'sent' : 'delivery_failed', provider:"));
patch('sendHumanTelegramVoiceReply',body=>{
 if(body.includes('onResult'))return body;
 body=body.replace('snapshot = null) {','snapshot = null, onResult = () => {}, validate = null, delivery = {}) {');
 body=body.replace('  const policy = premiumVoicePolicy',`  const turnCheck = crewcheckTemporalDialogue.currentTurnCheck();
  const producerCheck = delivery.checkNow || (!validate ? crewcheckTemporalDialogue.currentDeliveryCheck() : null);
  const checkNow = () => (!producerCheck || producerCheck()) && (!turnCheck || turnCheck());
  const producerValidate = validate || crewcheckTemporalDialogue.currentValidator();
  const finalValidate = async () => (!producerValidate || await producerValidate()) && checkNow();
  const policy = premiumVoicePolicy`);
 body=body.replace('if (!policy.allowed) return false;',"if (!policy.allowed) { onResult({state:'text_policy',reason:policy.reason}); return false; }");
 body=body.replace('    caption: telegramHumanAudioCaption(),','    validate: finalValidate, checkNow,\n    caption: telegramHumanAudioCaption(),');
 body=body.replace('  if (audioReply?.ok) {',"  onResult({state:audioReply?.deliveryState || (audioReply?.ok ? 'sent' : 'unavailable'),reason:audioReply?.deliveryReason || ''});\n  if (audioReply?.ok) {");
 body=body.replace('    if (telegramShouldEchoTranscript() && transcript) {','    if (telegramShouldEchoTranscript() && transcript) {\n      if (!await finalValidate() || !checkNow()) return true;');
 return body.replace('await sendTelegramMessage(chatId, `Entendi: “${String(transcript).slice(0, 500)}”`);','await sendTelegramMessage(chatId, `Entendi: “${String(transcript).slice(0, 500)}”`, delivery.extra || {});');
});
patch('handleTelegramVoiceMessage',body=>{
 if(body.includes('let audioResult'))return body;
 body=body.replace('  if (!chatId || !fileId) return false;','  if (!chatId || !fileId) return false;\n  let interpreted = false;\n  try {');
 body=body.replace("    const transcript = String(result.text || '').trim();", "    const transcript = String(result.text || '').trim();\n    if (!crewcheckTemporalDialogue.subject(transcript)) return true;\n    interpreted = true;");
 body=body.replace('    const reply = await buildTelegramConciergeReply','    crewcheckTemporalDialogue.protect(profile, snapshot);\n    const reply = await buildTelegramConciergeReply');
 body=body.replace('    const humanAudioSent = await sendHumanTelegramVoiceReply(chatId, reply, transcript, snapshot);',"    let audioResult = {state:'unavailable'};\n    const humanAudioSent = await sendHumanTelegramVoiceReply(chatId, reply, transcript, snapshot, result => { audioResult = result; }, profile.conciergeResponseAuthority?.validate, {checkNow:profile.conciergeResponseAuthority?.checkNow,extra:crewcheckMenu.guard(profile)});");
 body=body.replace('    if (humanAudioSent) return true;',"    console.info('[concierge-voice-delivery]', {state:audioResult.state,reason:audioResult.reason || ''});\n    if (humanAudioSent || audioResult.state === 'context_expired') return true;");
 body=body.replace('await sendTelegramMessage(chatId, reply, { reply_markup: conciergeReplyKeyboard(normalizeConciergeButtonText(transcript)) });',"await sendTelegramMessage(chatId, audioResult.state === 'text_policy' ? reply : 'Não consegui enviar o áudio agora; segue por texto.\\n\\n' + reply, { ...crewcheckMenu.guard(profile), reply_markup: conciergeReplyKeyboard(normalizeConciergeButtonText(transcript)) });");
 return body.slice(0,-2)+'\n  } finally { if (!interpreted) crewcheckTemporalDialogue.abandon(); }\n}';
});
fs.writeFileSync('server.mjs',source);
