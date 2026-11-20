import fs from 'node:fs';
import ts from './source-spans.mjs';
const file='server.mjs';let source=fs.readFileSync(file,'utf8');
const imported="import {submitVerifiedTelegramBinding} from './server/telegram-binding-delivery.mjs';";
if(!source.includes(imported))source=imported+'\n'+source;
const helper=`async function sendBoundTelegramMessage(binding,chatId,text,options){
 return submitVerifiedTelegramBinding(await conciergeDbPool(),binding,{chatId},recipient=>sendTelegramMessage(recipient.chatId,text,options));
}
async function sendBoundTelegramVoiceCall(binding,username,text){
 return submitVerifiedTelegramBinding(await conciergeDbPool(),binding,{username},recipient=>sendTelegramVoiceCall(recipient.username,text));
}`;
if(!source.includes('async function sendBoundTelegramMessage('))source+='\n'+helper+'\n';
function patch(name,change){const ast=ts.createSourceFile(file,source,99,true,ts.ScriptKind.JS),node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);if(!node)throw Error('[telegram-binding] missing local transport '+name);const old=node.getText(ast),updated=change(old);source=source.slice(0,node.getStart(ast))+updated+source.slice(node.end);}
patch('runCriticalWeatherMonitorCycle',body=>body.replace('const result = await sendTelegramMessage(snapshot.chatId, [',"const weatherBinding=await telegramLinkedRecordForEmail(snapshot.email||snapshot.key);\n      const result = await sendBoundTelegramMessage(weatherBinding,snapshot.chatId, ["));
patch('handleAlarmTest',body=>{
 body=body.replace('const linkedChatId = await telegramLinkedChatIdForEmailAsync(identity.email);',"const messageBinding=await telegramLinkedRecordForEmail(identity.email);\n    const linkedChatId=messageBinding?.chatId;")
 .replace('await sendTelegramMessage(chatId, text)','await sendBoundTelegramMessage(messageBinding,chatId,text)')
 .replace('const linkedUsername = await telegramLinkedUsernameForEmailAsync(identity.email);',"const callBinding=await telegramLinkedRecordForEmail(identity.email);\n    const linkedUsername=callBinding?.username;")
 .replace('await sendTelegramVoiceCall(username, text)','await sendBoundTelegramVoiceCall(callBinding,username,text)')
 .replace('if (!identity.admin && !telegramCallResult.ok)', 'if (!identity.admin && !telegramCallResult.ok && !telegramCallResult.uncertain)');
 return body;
});
patch('handleTelegramCallCallback',body=>body.replace("  const result = await sendTelegramVoiceCall(username, 'CrewCheck chamando. Esta é a ligação solicitada pelo Concierge.');", "  const callBinding=await telegramLinkedRecordForEmail(email);\n  const result = await sendBoundTelegramVoiceCall(callBinding,username,'CrewCheck chamando. Esta é a ligação solicitada pelo Concierge.');").replace("if (!result.ok) await refundPlatformUsage", "if (!result.ok && !result.uncertain) await refundPlatformUsage").replace(/^  await sendTelegramMessage\(chatId, result.ok \? 'Ligação solicitada ao bot auxiliar\.[^\n]*$/m, "  await sendTelegramMessage(chatId, result.ok ? 'Ligação solicitada ao bot auxiliar. Atenda a chamada recebida no Telegram.' : (result.uncertain?'Resultado da ligação não confirmado. Não repita agora.':`${result.message || 'A ligação não foi aceita agora.'} A franquia não foi consumida.`), { reply_markup: conciergeKeyboard });"));
for(const [name,token] of [['runCriticalWeatherMonitorCycle','sendBoundTelegramMessage(weatherBinding'],['handleAlarmTest','sendBoundTelegramVoiceCall(callBinding'],['handleTelegramCallCallback','sendBoundTelegramVoiceCall(callBinding']]){const ast=ts.createSourceFile(file,source,99,true,ts.ScriptKind.JS),node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);if(!node?.getText(ast).includes(token))throw Error('[telegram-binding] local source fence absent '+name);}
fs.writeFileSync(file,source);
