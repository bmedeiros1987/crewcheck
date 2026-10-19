import fs from 'node:fs';
let source=fs.readFileSync('server.mjs','utf8');
const line="import { createTemporalDialogue } from './server/concierge/temporal-dialogue.mjs';";
if(!source.includes(line))source=line+'\n'+source;
const anchor="async function buildTelegramConciergeReply(text = '', profile = {}, snapshot = null) {";
const hooked=anchor+"\n  const temporal = await crewcheckTemporalDialogue.handle(text, profile, snapshot);\n  if (temporal) return temporal.reply;";
if(!source.includes(hooked)){if(!source.includes(anchor))throw Error('missing actual outer wrapper');source=source.replace(anchor,hooked);}
const runtime=`const crewcheckTemporalDialogue = createTemporalDialogue({
  now: () => Date.now(), authorized: conciergeDepartureOwnerCurrent, snapshot: conciergeLoadSnapshot,
  programs: roster => conciergeJourneyProgramRecords(roster, conciergeProgramRecords(roster)),
  events: buildCanonicalRosterEvents, explicitFlight: conciergeExtractFlight,
  summary: record => buildProgramSummary({record,label:'A próxima programação',includeGreeting:false}),
  radar: conciergeRadarReply,
  radarCurrent: (payload, evidence, roster) => gateQueryDay(evidence).allowed && radarResultDecision(payload,evidence,Date.now()).allowed && Boolean(findPublishedGateLeg(roster,evidence,buildCanonicalRosterEvents(roster))),
});\n\n`;
if(!source.includes('const crewcheckTemporalDialogue ='))source=source.replace('const crewcheckMenu = createTelegramMenu(',runtime+'const crewcheckMenu = createTelegramMenu(');
source=source.replace("profile.conciergeResponseAuthority?.kind === 'departure'",'profile.conciergeResponseAuthority');
const save="await conciergeSaveSnapshotAsync(profile, snapshot.roster, { source: snapshot.source || 'radar', lastRadar: { ...radar, updatedAt: new Date().toISOString() } });";
const saved="const temporalSaved = "+save+"\n    profile.conciergeResponseAuthority?.acceptWrite?.(temporalSaved);";
if(!source.includes(saved)){if(!source.includes(save))throw Error('missing existing Radar write boundary');source=source.replace(save,saved);}
fs.writeFileSync('server.mjs',source);

if(!source.includes('if (update.callback_query) crewcheckTemporalDialogue.interrupt('))source=source.replace('  if (await crewcheckMenu.callback(update)) return true;', '  if (update.callback_query) crewcheckTemporalDialogue.interrupt(update.callback_query.message?.chat?.id);\n  if (await crewcheckMenu.callback(update)) return true;');
// Preserve the existing audio path and boolean API; report only a bounded state
// to the caller. No synthesis, provider activation or transport happens here.
function patch(name, transform){
 const m=new RegExp(`async function ${name}\\(`).exec(source);if(!m)throw Error('missing '+name);
 const end=source.indexOf('\n}',m.index)+2;source=source.slice(0,m.index)+transform(source.slice(m.index,end))+source.slice(end);
}
patch('sendTelegramTtsAudio',body=>body.includes("deliveryState:'context_expired'") ? body : body
 .replace("configured: false, provider: policy.provider", "deliveryState: 'unavailable', deliveryReason: 'provider_mismatch', configured: false, provider: policy.provider")
 .replace("configured: false, provider: 'elevenlabs'", "deliveryState: 'unavailable', deliveryReason: 'unconfigured', configured: false, provider: 'elevenlabs'")
 .replace('  const generated = await generateElevenLabsSpeech', "  if (options.validate && !await options.validate()) return {ok:false,deliveryState:'context_expired'};\n  const generated = await generateElevenLabsSpeech")
 .replace('if (!generated.ok) return generated;', "if (!generated.ok) return {...generated,deliveryState:generated.configured === false ? 'unavailable' : 'synthesis_failed',deliveryReason:generated.configured === false ? 'voice_unavailable' : ''};\n  if (options.validate && !await options.validate()) return {ok:false,deliveryState:'context_expired'};")
 .replace('return { ...sent, provider:', "return { ...sent, deliveryState: sent?.ok ? 'sent' : 'delivery_failed', provider:"));
patch('sendHumanTelegramVoiceReply',body=>body.includes('onResult') ? body : body
 .replace("snapshot = null) {", "snapshot = null, onResult = () => {}, validate = null) {")
 .replace('if (!policy.allowed) return false;', "if (!policy.allowed) { onResult({state:'text_policy',reason:policy.reason}); return false; }")
 .replace('    caption: telegramHumanAudioCaption(),', '    validate,\n    caption: telegramHumanAudioCaption(),')
 .replace('  if (audioReply?.ok) {', "  onResult({state:audioReply?.deliveryState || (audioReply?.ok ? 'sent' : 'unavailable'),reason:audioReply?.deliveryReason || ''});\n  if (audioReply?.ok) {"));
patch('handleTelegramVoiceMessage',body=>body.includes('let audioResult') ? body : body
 .replace('    const reply = await buildTelegramConciergeReply', '    crewcheckTemporalDialogue.protect(profile, snapshot);\n    const reply = await buildTelegramConciergeReply')
 .replace('    const humanAudioSent = await sendHumanTelegramVoiceReply(chatId, reply, transcript, snapshot);', "    let audioResult = {state:'unavailable'};\n    const humanAudioSent = await sendHumanTelegramVoiceReply(chatId, reply, transcript, snapshot, result => { audioResult = result; }, profile.conciergeResponseAuthority?.validate);")
 .replace('    if (humanAudioSent) return true;', "    console.info('[concierge-voice-delivery]', {state:audioResult.state,reason:audioResult.reason || ''});\n    if (humanAudioSent || audioResult.state === 'context_expired') return true;")
 .replace('await sendTelegramMessage(chatId, reply, { reply_markup: conciergeReplyKeyboard(normalizeConciergeButtonText(transcript)) });', "await sendTelegramMessage(chatId, audioResult.state === 'text_policy' ? reply : 'Não consegui enviar o áudio agora; segue por texto.\\n\\n' + reply, { ...crewcheckMenu.guard(profile), reply_markup: conciergeReplyKeyboard(normalizeConciergeButtonText(transcript)) });"));
fs.writeFileSync('server.mjs',source);

patch('conciergeRadarReply',body=>body.includes('acceptRadar?.') ? body : body.replace("  const radar = await runRadarRace(queryContext, info?.leg?.origin || '', info?.leg?.destination || '');", "  const radar = await runRadarRace(queryContext, info?.leg?.origin || '', info?.leg?.destination || '');\n  profile.conciergeResponseAuthority?.acceptRadar?.(radar,queryContext.gateQueryEvidence);"));
fs.writeFileSync('server.mjs',source);
