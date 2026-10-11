import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const core=fs.readFileSync('scripts/v139/apply-core.mjs','utf8');
const helper=core.slice(core.indexOf('function requireAnchor('),core.indexOf("patch('server.mjs'"));
const block=core.slice(core.indexOf('  const telegramAnchor ='),core.indexOf("  return source.replaceAll('13.8.8'"));
function patch(source){return vm.runInNewContext(`${helper}\n(function(source){${block}\nreturn source;})(fixture)`,{fixture:source});}
const cold="  if (chatId && text && await telegramTryBindFromWebhook(message, text)) return sendJson(res, 200, { ok: true, linked: true, message: 'Telegram vinculado.' });";
const first=patch(cold);assert.match(first,/message\?\.document && await handleV139Telegram\(message, sendTelegramMessage\)/);assert.equal(patch(first),first,'repeated raw route must not duplicate');
const prepared='  const v1391TelegramHandled = await handleV139Telegram(update, sendTelegramMessage);\n  if (v1391TelegramHandled) return sendJson(res, 200, { ok: true, handled: true });';
assert.equal(patch(prepared),prepared,'invalidation replay preserves the later full-update route');
assert.equal(patch(prepared),prepared,'prepared replay stays stable');
for(const malformed of ['',"if (update?.callback_query && await handleV139Telegram(update, sendTelegramMessage)) return true;",'const v1391TelegramHandled = await handleV139Telegram(update, sendTelegramMessage);'])assert.throws(()=>patch(malformed),/âncora não encontrada em Telegram CrewLock/,'incomplete/callback-only routes must still fail closed');
console.log('PASS actual apply-core CrewLock block: cold insertion, repeat, later prepared full-update route replay, no duplicate and missing/incomplete/callback-only routing rejected.');
