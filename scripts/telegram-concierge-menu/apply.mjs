import fs from 'node:fs';
const file = 'server.mjs';
let source = fs.readFileSync(file, 'utf8');
function replace(before, after) {
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error('[telegram-menu] missing integration anchor: ' + before.slice(0, 100));
  source = source.replace(before, after);
}
function functionBody(name, body) {
  const match = new RegExp(`(?:async )?function ${name}\\(`).exec(source);
  if (!match) throw new Error('[telegram-menu] missing ' + name);
  const end = source.indexOf('\n}', match.index) + 2;
  source = source.slice(0, match.index) + body + source.slice(end);
}
const line = "import { createTelegramMenu, menuTemplate, menuGreeting, missingFinanceReply, missingComplianceReply, requestedWeatherAirport } from './server/concierge/telegram-menu.mjs';";
source = source.replace("import { createTelegramMenu, menuTemplate, menuGreeting, missingFinanceReply, missingComplianceReply } from './server/concierge/telegram-menu.mjs';", line);
source = source.replace("import { createTelegramMenu, menuTemplate, menuGreeting } from './server/concierge/telegram-menu.mjs';", line);
if (!source.includes(line)) source = line + '\n' + source;
const transportImport = "import { createTelegramMenuTransport } from './server/concierge/telegram-menu-transport.mjs';";
if (!source.includes(transportImport)) source = transportImport + '\n' + source;
const emergencyImport = "import { openEmergencyTelegramMenu } from './server/v1391/emergency.mjs';";
if (!source.includes(emergencyImport)) source = emergencyImport + '\n' + source;
const factsImport = "import { buildDutyFacts } from './server/concierge/duty-facts.mjs';";
if (!source.includes(factsImport)) source = factsImport + '\n' + source;
const keyboard = source.indexOf('const conciergeKeyboard = {');
if (keyboard >= 0) source = source.slice(0, keyboard) + "const conciergeKeyboard = menuTemplate();" + source.slice(source.indexOf('\n};', keyboard) + 3);
functionBody('conciergeHelp', "function conciergeHelp(name = '') {\n  return menuGreeting(name);\n}");
replace("function normalizeConciergeButtonText(value = '') {\n  const text = String(value || '').trim();", "function normalizeConciergeButtonText(value = '') {\n  const text = String(value || '').trim();\n  if (/^\\/[\\p{L}\\w]+(?:@\\w+)?(?:\\s|$)/u.test(text)) return text;");
replace("  if (normalized.includes('radar') || normalized.includes('portão')) return '/radar';", "  if (['radar', 'portão', 'portao', 'radar / portão', 'radar / portao'].includes(normalized)) return '/radar';");
replace("  if (normalized.includes('atis')) return '/metar';", "  if (normalized === 'atis / metar') return '/metar';\n  if (normalized === 'atis') return '/atis';");
const semanticStart = source.indexOf("  if (semantic.intent === 'explicit_command') semantic.intent = conciergeSemanticCommandIntentV14338(text);");
const semanticEnd = source.indexOf('  const resolved = await conciergeSemanticResolveV14338', semanticStart);
if (semanticStart < 0 || semanticEnd <= semanticStart) throw new Error('[telegram-menu] missing semantic dispatch');
const semanticDispatch = [
  "  if (semantic.intent === 'explicit_command') semantic.intent = conciergeSemanticCommandIntentV14338(text);",
  "  if (/^\\/(?:radar|portao|portão|metar|taf|atis)(?:@\\S+)?(?:\\s|$)/i.test(String(text))",
  "    || (semantic.intent === 'weather' && /\\b(?:metar|taf|atis)\\b/i.test(String(text)))) semantic.rewrite = String(text).trim();",
  "  if (semantic.intent === 'radar' && semantic.flight && !String(text).trim().startsWith('/')) semantic.rewrite = '/radar ' + semantic.flight;",
].join('\n') + '\n';
source = source.slice(0, semanticStart) + semanticDispatch + source.slice(semanticEnd);
const oldAirport = "  const explicit = String(text).toUpperCase().match(/\\b[A-Z]{4}\\b|\\b[A-Z]{3}\\b/);";
const parsedAirport = "  const explicitAirport = requestedWeatherAirport(text, interpretConciergeNaturalTextV14338);\n  const explicit = explicitAirport ? [explicitAirport] : null;";
source = source.replaceAll("  const explicitAirport = interpretConciergeNaturalTextV14338(String(text)).airport;", "  const explicitAirport = requestedWeatherAirport(text, interpretConciergeNaturalTextV14338);");
if (!source.includes(oldAirport) && !source.includes(parsedAirport)) throw new Error('[telegram-menu] missing weather airport extraction');
source = source.replaceAll(oldAirport, parsedAirport);
source = source.replace("      const weatherAirport = interpretConciergeNaturalTextV14338(normalizedText).airport;", "      const weatherAirport = requestedWeatherAirport(normalizedText, interpretConciergeNaturalTextV14338);");
replace("      const weatherMatch = normalizedText.toUpperCase().match(/\\b[A-Z]{4}\\b|\\b[A-Z]{3}\\b/);", "      const weatherAirport = requestedWeatherAirport(normalizedText, interpretConciergeNaturalTextV14338);\n      const weatherMatch = weatherAirport ? [weatherAirport] : null;");
functionBody('conciergePerDiemReply', "function conciergePerDiemReply(snapshot) {\n  return missingFinanceReply();\n}");
functionBody('conciergeComplianceReply', "function conciergeComplianceReply(snapshot, profile = {}) {\n  return buildDutyFacts({ profile, snapshot, accessAllowed: conciergeAccessMatches(profile, snapshot) }).summary;\n}");
source = source.replace('return conciergeComplianceReply(snapshot);', 'return conciergeComplianceReply(snapshot, profile);');
functionBody('conciergeReplyKeyboard', "function conciergeReplyKeyboard(value = '') {\n  if (/^\\/(?:configuracoes|meunome|nomeconcierge)(?:@\\S+)?/i.test(value)) return conciergeSettingsKeyboard;\n  return conciergeKeyboard;\n}");
replace("async function sendTelegramMessage(chatId, text, extra = {}) {", "async function sendTelegramMessage(chatId, text, extra = {}) {\n  extra = await crewcheckMenu.markup(chatId, extra);");
replace('  extra = await crewcheckMenu.markup(chatId, extra);', '  extra = await crewcheckMenu.markup(chatId, extra);\n  if (extra === null) return { ok: false, message: \'Contexto da consulta alterado.\' };');
const runtime = `const crewcheckMenu = createTelegramMenu({\n  ...createTelegramMenuTransport({ apiUrl: telegramApiUrl, fetch: (...args) => fetch(...args) }),\n  profile: telegramProfileForChatAsync, snapshot: conciergeLoadSnapshot,\n  reply: buildTelegramConciergeReply, send: sendTelegramMessage, answer: answerTelegramCallback,\n  weatherKeyboard: conciergeWeatherKeyboard, settingsKeyboard: conciergeSettingsKeyboard,\n  voice: (chatId, reply, text, snapshot) => sendHumanTelegramVoiceReply(chatId, crewCheckAtisVoiceText(reply), text, snapshot),\n  emergency: query => openEmergencyTelegramMenu(query, sendTelegramMessage),\n  facts: (profile, snapshot, page = 0) => buildDutyFacts({ profile, snapshot, page, accessAllowed: conciergeAccessMatches(profile, snapshot) }),\n});\n\n`;
const oldRuntime = `const crewcheckMenu = createTelegramMenu({\n  profile: telegramProfileForChatAsync, snapshot: conciergeLoadSnapshot,\n  reply: buildTelegramConciergeReply, send: sendTelegramMessage, answer: answerTelegramCallback,\n});\n\n`;
const runtimeStart = source.indexOf('const crewcheckMenu = createTelegramMenu(');
if (runtimeStart >= 0) {
  const runtimeEnd = source.indexOf('\n});', runtimeStart) + 4;
  if (runtimeEnd <= runtimeStart) throw new Error('[telegram-menu] unclosed menu runtime');
  source = source.slice(0, runtimeStart) + runtime.trimEnd() + source.slice(runtimeEnd);
}
if (!source.includes('const crewcheckMenu = createTelegramMenu(')) source = source.replace('async function processTelegramUpdate(update = {}) {', runtime + 'async function processTelegramUpdate(update = {}) {');
replace('async function processTelegramUpdate(update = {}) {', 'async function processTelegramUpdate(update = {}) {\n  if (await crewcheckMenu.callback(update)) return true;\n  if (await crewcheckMenu.text(update.message || {})) return true;');
replace('  const v1391TelegramHandled = await handleV139Telegram(update, sendTelegramMessage);', '  await crewcheckMenu.interrupt(update.message || {});\n  const v1391TelegramHandled = await handleV139Telegram(update, sendTelegramMessage);');
// The typed departure path needs the same final transport owner fence as callbacks.
replace("{ reply_markup: isWeather ? conciergeWeatherKeyboard(weatherStation, /taf/i.test(normalizedText) ? 'taf' : 'metar') : conciergeReplyKeyboard(normalizedText) }", "{ ...((profile.conciergeResponseAuthority?.kind === 'departure') ? crewcheckMenu.guard(profile) : {}), reply_markup: isWeather ? conciergeWeatherKeyboard(weatherStation, /taf/i.test(normalizedText) ? 'taf' : 'metar') : conciergeReplyKeyboard(normalizedText) }");
fs.writeFileSync(file, source);
console.log('[telegram-menu] private one-use inline navigation; direct existing producers; no live sends');
