import fs from 'node:fs';

const VERSION = '14.0.3';
const read = (path) => fs.readFileSync(path, 'utf8');
const write = (path, content) => fs.writeFileSync(path, content, 'utf8');

function replaceRequired(source, pattern, replacement, label) {
  pattern.lastIndex = 0;
  if (!pattern.test(source)) throw new Error(`CrewCheck v${VERSION}: ponto não localizado — ${label}.`);
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

const files = {
  keyboards: 'server/v1403/keyboards.snippet',
  requestUser: 'server/v1403/request-user.snippet',
  helpers: 'server/v1403/premium-helpers.snippet',
  buildReply: 'server/v1403/build-reply.snippet',
  human: 'server/v1403/telegram-human.mjs',
};
for (const file of Object.values(files)) {
  if (!fs.existsSync(file)) throw new Error(`CrewCheck v${VERSION}: arquivo ausente — ${file}.`);
}

const serverPath = 'server.mjs';
let server = read(serverPath);
const anchor = "import { buildInfobipTtsRequest, infobipConfiguration, infobipPublicStatus } from './server/v1396/infobip.mjs';";
const premiumImport = "import { DEFAULT_CONCIERGE_NAME, airportName, buildBlankDaySummary, buildConciergeSettingsReply, buildDepartureSummary, buildProgramSummary, cleanDisplayName, isPremiumConcierge, preferredConciergeName, preferredUserName, premiumGreeting, premiumVoicePolicy, premiumVoiceText, spokenTime } from './server/v1403/telegram-human.mjs';";
if (!server.includes(premiumImport)) {
  if (!server.includes(anchor)) throw new Error(`CrewCheck v${VERSION}: import base não localizado.`);
  server = server.replace(anchor, `${anchor}\n${premiumImport}`);
}

server = server
  .replace("|| 0.48),", "|| 0.34),")
  .replace("|| 0.78),", "|| 0.86),")
  .replace("|| 0.18),", "|| 0.32),")
  .replace(/const policy = (?:telegramVoiceReplyPolicy|premiumVoicePolicy)\([^;\n]+;/, "const policy = premiumVoicePolicy(replyText, transcript, Math.max(420, Math.min(700, Number(envAny(['TELEGRAM_CONCIERGE_MAX_VOICE_CHARS', 'CREWCHECK_TELEGRAM_MAX_VOICE_CHARS']) || 650))));")
  .replace(/const finalReply = (?:humanizeTelegramVoiceText|premiumVoiceText)\(replyText\);/, 'const finalReply = premiumVoiceText(replyText);')
  .replace('await showHumanRecordingAction(chatId, 2);', 'await showHumanRecordingAction(chatId, 1);');

server = replaceRequired(
  server,
  /const conciergeKeyboard = \{[\s\S]*?\n\};\n(?:const conciergeFunctionKeyboard = \{[\s\S]*?\n\};\nconst conciergeSettingsKeyboard = \{[\s\S]*?\n\};\n)?function normalizeConciergeButtonText\(value = ''\) \{[\s\S]*?\n\}/,
  read(files.keyboards).trim(),
  'teclados',
);

server = replaceRequired(
  server,
  /function telegramRequestUser\(req, body = \{\}\) \{[\s\S]*?\n\}/,
  read(files.requestUser).trim(),
  'identidade Telegram',
);

const marker = '// CrewCheck v14.0.3 — Concierge humano, natural e personalizável.';
if (!server.includes(marker)) {
  const builder = "async function buildTelegramConciergeReply(text = '', profile = {}, snapshot = null) {";
  if (!server.includes(builder)) throw new Error(`CrewCheck v${VERSION}: builder não localizado.`);
  server = server.replace(builder, `${read(files.helpers).trim()}\n${builder}`);
}

server = replaceRequired(
  server,
  /async function buildTelegramConciergeReply\(text = '', profile = \{\}, snapshot = null\) \{[\s\S]*?\n\}\nasync function handleParsePdfApi/,
  `${read(files.buildReply).trim()}\nasync function handleParsePdfApi`,
  'roteador natural',
);

server = server.replace(
  "const snapshot = await conciergeSaveSnapshotAsync(profile, roster, { source: String(body.source || 'app'), fileName: String(body.fileName || ''), diagnostics: body.diagnostics || null });",
  "const snapshot = await conciergeSaveSnapshotAsync(profile, roster, { source: String(body.source || 'app'), fileName: String(body.fileName || ''), diagnostics: body.diagnostics || null, premiumAccess: user.premiumAccess, subscriptionPlan: user.subscriptionPlan, subscriptionStatus: user.subscriptionStatus, preferences: { premiumAccess: user.premiumAccess, subscriptionPlan: user.subscriptionPlan, subscriptionStatus: user.subscriptionStatus, userRole: user.role || body.rank || body.role || '', conciergeName: existingSnapshot?.preferences?.conciergeName || DEFAULT_CONCIERGE_NAME } });",
);
server = server.replace(
  "const snapshot = await conciergeSaveSnapshotAsync(profile, roster, { source: 'telegram-pdf', fileName: document.file_name || 'escala.pdf', parserDiagnostics: parsed.diagnostics || null });",
  "const snapshot = await conciergeSaveSnapshotAsync(profile, roster, { source: 'telegram-pdf', fileName: document.file_name || 'escala.pdf', parserDiagnostics: parsed.diagnostics || null, preferences: { conciergeName: (await conciergeLoadSnapshot(profile))?.preferences?.conciergeName || DEFAULT_CONCIERGE_NAME } });",
);

write(serverPath, server);
console.log(`CrewCheck v${VERSION}: núcleo natural do Telegram aplicado.`);
