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
const line = "import { createTelegramMenu, menuTemplate, menuGreeting, missingFinanceReply, missingComplianceReply } from './server/concierge/telegram-menu.mjs';";
source = source.replace("import { createTelegramMenu, menuTemplate, menuGreeting } from './server/concierge/telegram-menu.mjs';", line);
if (!source.includes(line)) source = line + '\n' + source;
const keyboard = source.indexOf('const conciergeKeyboard = {');
if (keyboard >= 0) source = source.slice(0, keyboard) + "const conciergeKeyboard = menuTemplate();" + source.slice(source.indexOf('\n};', keyboard) + 3);
functionBody('conciergeHelp', "function conciergeHelp(name = '') {\n  return menuGreeting(name);\n}");
functionBody('conciergePerDiemReply', "function conciergePerDiemReply(snapshot) {\n  return missingFinanceReply();\n}");
functionBody('conciergeComplianceReply', "function conciergeComplianceReply(snapshot) {\n  return missingComplianceReply();\n}");
functionBody('conciergeReplyKeyboard', "function conciergeReplyKeyboard(value = '') {\n  if (/^\\/(?:configuracoes|meunome|nomeconcierge)(?:@\\S+)?/i.test(value)) return conciergeSettingsKeyboard;\n  return conciergeKeyboard;\n}");
replace("async function sendTelegramMessage(chatId, text, extra = {}) {", "async function sendTelegramMessage(chatId, text, extra = {}) {\n  extra = await crewcheckMenu.markup(chatId, extra);");
const runtime = `const crewcheckMenu = createTelegramMenu({\n  profile: telegramProfileForChatAsync, snapshot: conciergeLoadSnapshot,\n  reply: buildTelegramConciergeReply, send: sendTelegramMessage, answer: answerTelegramCallback,\n});\n\n`;
if (!source.includes('const crewcheckMenu = createTelegramMenu(')) source = source.replace('async function processTelegramUpdate(update = {}) {', runtime + 'async function processTelegramUpdate(update = {}) {');
replace('async function processTelegramUpdate(update = {}) {', 'async function processTelegramUpdate(update = {}) {\n  if (await crewcheckMenu.callback(update)) return true;\n  if (await crewcheckMenu.text(update.message || {})) return true;');
fs.writeFileSync(file, source);
console.log('[telegram-menu] private one-use inline navigation; direct existing producers; no live sends');
