import fs from 'node:fs';

const serverPath = 'server.mjs';
if (!fs.existsSync(serverPath)) throw new Error('CrewCheck v14.0.1: server.mjs não encontrado.');

let source = fs.readFileSync(serverPath, 'utf8');

const policyMarker = 'function telegramVoiceReplyPolicy(replyText = \'\', transcript = \'\') {';
if (!source.includes(policyMarker)) {
  const anchor = `function telegramShouldEchoTranscript() {\n  return String(envAny(['TELEGRAM_CONCIERGE_ECHO_TRANSCRIPT', 'CREWCHECK_TELEGRAM_ECHO_TRANSCRIPT']) || 'false').toLowerCase() === 'true';\n}\n`;
  if (!source.includes(anchor)) throw new Error('CrewCheck v14.0.1: ponto de inserção da política de voz não localizado.');

  const policy = `${anchor}function telegramVoiceReplyPolicy(replyText = '', transcript = '') {\n  const reply = cleanTtsText(replyText);\n  const request = String(transcript || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().trim();\n  const normalizedReply = reply.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();\n  const maxCharacters = Math.max(180, Math.min(650, Number(envAny(['TELEGRAM_CONCIERGE_MAX_VOICE_CHARS', 'CREWCHECK_TELEGRAM_MAX_VOICE_CHARS']) || 420)));\n\n  if (!telegramHumanVoiceEnabled()) return { allowed: false, reason: 'voice-disabled' };\n  if (!reply) return { allowed: false, reason: 'empty-reply' };\n  if (reply.length > maxCharacters || reply.split(/\\n+/).filter(Boolean).length > 4) return { allowed: false, reason: 'long-reply' };\n\n  const locationDependentRequest = /(?:^|\\s|\\/)(hospitais?|farmacias?|academias?|academia|ginasios?|restaurantes?|mercados?|entorno|perto de mim|proxim[oa]s?|abrir rota|rota ate|check-?in)(?:\\s|$)/i.test(request);\n  if (locationDependentRequest) return { allowed: false, reason: 'location-dependent-command' };\n\n  const needsLocation = /(?:envie|mande|compartilhe|preciso da|aguardando|sem sua) localizacao|localizacao (?:atual|necessaria|nao encontrada)|ative a localizacao|perto de voce/i.test(normalizedReply);\n  if (needsLocation) return { allowed: false, reason: 'needs-location' };\n\n  const noUsefulAnswer = /nao (?:entendi|compreendi|consegui|encontrei|localizei|identifiquei|tenho|ha)|nenhuma (?:programacao|escala|resposta|informacao)|sem (?:escala|dados|programacao|informacao)|escala (?:nao|ainda nao)|envie (?:o |um )?pdf|vincule (?:o |seu )?telegram|tente novamente|indisponivel|aguardando (?:dados|escala|sincronizacao)|comando (?:nao reconhecido|desconhecido)/i.test(normalizedReply);\n  if (noUsefulAnswer) return { allowed: false, reason: 'no-useful-answer' };\n\n  const informationalDirectory = /hospitais?|farmacias?|academias?|ginasios?|restaurantes?|mercados?|enderecos?|lista de locais|resultados encontrados/i.test(normalizedReply);\n  if (informationalDirectory) return { allowed: false, reason: 'directory-result' };\n\n  return { allowed: true, reason: 'concise-operational-answer' };\n}\n`;
  source = source.replace(anchor, policy);
}

const oldSender = `async function sendHumanTelegramVoiceReply(chatId, replyText, transcript = '') {\n  const finalReply = humanizeTelegramVoiceText(replyText);\n  await showHumanRecordingAction(chatId, 2);\n  const audioReply = await sendTelegramTtsAudio(chatId, finalReply, {`;
const newSender = `async function sendHumanTelegramVoiceReply(chatId, replyText, transcript = '') {\n  const policy = telegramVoiceReplyPolicy(replyText, transcript);\n  if (!policy.allowed) return false;\n  const finalReply = humanizeTelegramVoiceText(replyText);\n  await showHumanRecordingAction(chatId, 1);\n  const audioReply = await sendTelegramTtsAudio(chatId, finalReply, {`;
if (source.includes(oldSender)) source = source.replace(oldSender, newSender);
else if (!source.includes('const policy = telegramVoiceReplyPolicy(replyText, transcript);')) throw new Error('CrewCheck v14.0.1: função de envio de voz não localizada.');

source = source.replace(
  "nativeVoiceNotes: true, atisSupported: true",
  "nativeVoiceNotes: true, conciseVoiceOnly: true, locationDirectoriesTextOnly: true, atisSupported: true",
);

fs.writeFileSync(serverPath, source, 'utf8');
console.log('CrewCheck v14.0.1: respostas de voz limitadas a retornos operacionais curtos; falhas, escala ausente e buscas por localização ficam em texto.');
