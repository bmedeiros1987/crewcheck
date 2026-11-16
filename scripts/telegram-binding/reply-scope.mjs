import fs from 'node:fs';import spans from './source-spans.mjs';
const file='server.mjs';let source=fs.readFileSync(file,'utf8');
const header="import {withTelegramBindingReplyScope,submitScopedTelegramReply,hasTelegramBindingReplyScope} from './server/telegram-binding-reply-scope.mjs';";
source=source.split('\n').filter(line=>line!==header&&line!=="import {withTelegramBindingReplyScope,submitScopedTelegramReply} from './server/telegram-binding-reply-scope.mjs';").join('\n');source=header+'\n'+source;
const declarations=spans.createSourceFile(file,source).statements;
const sender=declarations.find(n=>n.name?.text==='sendTelegramMessage');if(!sender)throw Error('[telegram-binding] missing local reply transport');
let text=sender.getText();if(!text.includes('return submitScopedTelegramReply(chatId,async()=>{')){
 const opening='async function sendTelegramMessage(chatId, text, extra = {}) {';if(!text.startsWith(opening)||!text.endsWith('}'))throw Error('[telegram-binding] unexpected reply transport');
 text=opening+'\n  return submitScopedTelegramReply(chatId,async()=>{'+text.slice(opening.length,-1)+'  });\n}';source=source.slice(0,sender.getStart())+text+source.slice(sender.end);
}
const wrapper=`async function runTelegramWebhookWithBindingScope(update,run) {
  if(hasTelegramBindingReplyScope())return run();
  const message=update?.message||update?.edited_message||update?.callback_query?.message;
  const linking=/^\\/(?:start|confirmar_vinculo)(?:@\\w+)?\\s+cc_[A-Za-z0-9_-]{12,80}$/i.test(String(message?.text||'').trim())||String(update?.callback_query?.data||'').startsWith('cc_link_confirm:');
  if(linking||message?.chat?.type!=='private'||!message?.chat?.id)return run();
  return withTelegramBindingReplyScope(await conciergeDbPool(),{chatId:String(message.chat.id)},run);
}`;
for(const [name,body]of [['runTelegramWebhookWithBindingScope',wrapper],['processTelegramUpdateWithBindingScope',`async function processTelegramUpdateWithBindingScope(update = {}) {
 return runTelegramWebhookWithBindingScope(update,()=>processTelegramUpdate(update));
}`]]){
 const node=spans.createSourceFile(file,source).statements.find(n=>n.name?.text===name);
 source=node?source.slice(0,node.getStart())+body+source.slice(node.end):source+'\n'+body+'\n';
}
{
 const node=spans.createSourceFile(file,source).statements.find(n=>n.name?.text==='handleTelegramWebhook');if(!node)throw Error('[telegram-binding] missing webhook');let body=node.getText();
 if(!body.includes('return runTelegramWebhookWithBindingScope(update,async()=>{')){
  const anchor='  const update = await readJsonBody(req);';if(!body.includes(anchor))throw Error('[telegram-binding] webhook read missing');
  body=body.replace(anchor,anchor+'\n  return runTelegramWebhookWithBindingScope(update,async()=>{');body=body.slice(0,-1)+'  });\n}';source=source.slice(0,node.getStart())+body+source.slice(node.end);
 }
}
const old='    processTelegramUpdate(update).catch((error) => {';const next='    processTelegramUpdateWithBindingScope(update).catch((error) => {';
if(!source.includes(next)){if(!source.includes(old))throw Error('[telegram-binding] missing real webhook dispatch');source=source.replace(old,next);}
source=source.replace('const payload = { chat_id: chatId, text: rich.text.slice(0, 3900), disable_web_page_preview: true, ...extra,', 'const payload = { ...extra, chat_id: chatId, text: rich.text.slice(0, 3900), disable_web_page_preview: true,');
source=source.replace('ok: Boolean(response.ok && data.ok !== false), configured: true, status: response.status, data, message: response.ok ?', 'ok: Boolean(response.ok && data.ok === true), uncertain: data.ok !== false && !(response.ok && data.ok === true), definitiveRejection: data.ok === false, configured: true, status: response.status, data, message: response.ok && data.ok === true ?');
source=source.replace("return { ok: false, configured: true, message: 'Mensagem não entregue agora.' };", "return { ok: false, uncertain: true, configured: true, message: 'Mensagem não entregue agora.' };");
for(const message of ['Contexto da consulta alterado.','Concierge aguardando configuração.','Chat do Telegram não configurado.']){
 // These literal preflight returns occur before fetch; no ambiguous provider outcome.
 const lines=source.split('\n');source=lines.map(line=>line.includes("message: '"+message+"'")&&line.includes('return { ok: false,')&&!line.includes('definitiveRejection')?line.replace('return { ok: false,','return { ok: false, uncertain: false, definitiveRejection: true,'):line).join('\n');
}
fs.writeFileSync(file,source);
