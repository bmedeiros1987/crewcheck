import fs from 'node:fs';
import ts from './source-spans.mjs';
const target='server.mjs';let source=fs.readFileSync(target,'utf8');
const snippets=fs.readFileSync(new URL('./server-functions.mjs',import.meta.url),'utf8');
const ast=ts.createSourceFile('snippets.mjs',snippets,99,true,ts.ScriptKind.JS);
const replacements=new Map(ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name).map(n=>[n.name.text,n.getText(ast)]));
const parsed=ts.createSourceFile(target,source,99,true,ts.ScriptKind.JS),edits=[];
for(const[name,body]of replacements){const fn=parsed.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);if(!fn)throw Error('[telegram-binding] missing canonical function: '+name);edits.push({start:fn.getStart(parsed),end:fn.end,body});}
for(const edit of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,edit.start)+edit.body+source.slice(edit.end);
const imports=["import {assertTelegramReplyScopeBinding} from './server/telegram-binding-reply-scope.mjs';","import {requireExistingIdentity} from './server/v139/common.mjs';","import {createTelegramBindingRuntime} from './server/telegram-binding-runtime.mjs';","import {createTelegramBindingChallenge,TelegramBindingError} from './server/telegram-binding-state.mjs';"];
for(const line of imports)if(!source.includes(line))source=line+'\n'+source;
const runtime="const telegramBindingRuntime=createTelegramBindingRuntime({pool:conciergeDbPool,readCache:telegramLinksRead,writeCache:telegramLinksWrite});";
if(!source.includes(runtime))source=runtime+'\n'+source;
// Both endpoints are installed upstream. An old cache must not bypass the resolver.
source=source.replaceAll('const linked = data.linked?.[user.email] || await telegramLinkedRecordForEmail(user.email);','const linked = await telegramLinkedRecordForEmail(user.email);');
source=source.replaceAll('await persistTelegramLinkRecord(updated, data);','await persistTelegramLinkRecord(updated, data, linked);');
for(const name of ['handleCallMeBotAuthorize','handleCallMeBotVerify']){const parsed=ts.createSourceFile(target,source,99,true,ts.ScriptKind.JS),fn=parsed.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);if(!fn)throw Error('[telegram-binding] missing CallMeBot route');let body=fn.getText(parsed);if(!body.includes('bindingIdentity=await requireExistingIdentity'))body=body.replace('  const user = telegramRequestUser(req, body);',"  const user = telegramRequestUser(req, body);\n  const bindingIdentity=await requireExistingIdentity(req,res);if(!bindingIdentity)return;user.email=bindingIdentity.email;user.authenticated=true;");source=source.slice(0,fn.getStart(parsed))+body+source.slice(fn.end);}
// Capture the source before the external verification call, not its return.
if(!source.includes('const callVerificationSource = structuredClone(linked);'))source=source.replace("  const result = await sendTelegramVoiceCall(username, 'CrewCheck chamando. Seu CallMeBot foi autorizado corretamente.');","  const callVerificationSource = structuredClone(linked);\n  const result = await sendTelegramVoiceCall(username, 'CrewCheck chamando. Seu CallMeBot foi autorizado corretamente.');");
source=source.replace("  await persistTelegramLinkRecord(updated, data, linked);\n  return sendJson(res, 200, { ok: true, linked: true, username, callMeBotReady: true", "  await persistTelegramLinkRecord(updated, data, callVerificationSource);\n  return sendJson(res, 200, { ok: true, linked: true, username, callMeBotReady: true");
const callback="  // telegram-binding-confirmation-v1\n  const bindingCallback=update?.callback_query;\n  if(String(bindingCallback?.data||'').startsWith('cc_link_confirm:')){\n    const message={chat:bindingCallback.message?.chat,from:bindingCallback.from};\n    await telegramTryBindFromWebhook(message,'/confirmar_vinculo '+String(bindingCallback.data).slice('cc_link_confirm:'.length));\n    await answerTelegramCallback(bindingCallback.id,'Solicitação de vínculo processada.');\n    return true;\n  }\n";
if(!source.includes('// telegram-binding-confirmation-v1')){const anchor='async function processTelegramUpdate(update = {}) {';if(!source.includes(anchor))throw Error('[telegram-binding] missing update admission');source=source.replace(anchor,anchor+'\n'+callback);}
// Sync legacy readers cannot serve cached identity. Existing callers become async.
source=(source.includes("async function alarmChannelConfigured(")?source:source.replace("function alarmChannelConfigured(channel = '', email = '') {","async function alarmChannelConfigured(channel = '', email = '') {")).replace('Boolean(telegramLinkedUsernameForEmail(email))','Boolean(await telegramLinkedUsernameForEmailAsync(email))').replace('const username = telegramLinkedUsernameForEmail(identity.email);','const username = await telegramLinkedUsernameForEmailAsync(identity.email);').replace('configured: alarmChannelConfigured(channel, identity.email)','configured: await alarmChannelConfigured(channel, identity.email)');
const finalAst=ts.createSourceFile(target,source,99,true,ts.ScriptKind.JS);
for(const name of ['telegramLinkedChatIdForEmail','telegramLinkedUsernameForEmail']){const fn=finalAst.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);if(!fn)throw Error('[telegram-binding] missing legacy getter');source=source.slice(0,fn.getStart(finalAst))+`function ${name}(){throw new TelegramBindingError('ASYNC_CANONICAL_LOOKUP_REQUIRED');}`+source.slice(fn.end);break;}
// Reparse after each edit so spans never point into earlier replacement text.
{const next=ts.createSourceFile(target,source,99,true,ts.ScriptKind.JS),fn=next.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='telegramLinkedUsernameForEmail');if(!fn)throw Error('[telegram-binding] missing username getter');source=source.slice(0,fn.getStart(next))+"function telegramLinkedUsernameForEmail(){throw new TelegramBindingError('ASYNC_CANONICAL_LOOKUP_REQUIRED');}"+source.slice(fn.end);}
if(source!==fs.readFileSync(target,'utf8'))fs.writeFileSync(target,source);
function update(file,body){const before=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,before,99,true,ts.ScriptKind.JS);let after=before;for(const[name,replacement]of Object.entries(body)){const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);if(!fn)throw Error('[telegram-binding] missing reader '+name);const body=fn.modifiers?.some(x=>x.kind===ts.SyntaxKind.ExportKeyword)&&!replacement.startsWith('export ')?'export '+replacement:replacement;after=after.slice(0,fn.getStart(ast))+body+after.slice(fn.end);}const prefix=file==='server/telegram-fast-ack.mjs'?"./telegram-binding-state.mjs":"../telegram-binding-state.mjs";if(!after.includes(`from '${prefix}'`))after=`import {readVerifiedTelegramBinding} from '${prefix}';\n`+after;if(after!==before)fs.writeFileSync(file,after);}
update('server/v139/delivery.mjs',{telegramLink:"export async function telegramLink(db,email){return readVerifiedTelegramBinding(db,{email});}".replace(/^export /,'')});
// The function node excludes its export modifier only in its text? Preserve it below.
update('server/v139/bidsNotify.mjs',{bidTelegramLink:"async function bidTelegramLink(db,email){const [rows]=await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE',[`link-email:${email}`]);if(!rows.length)return null;try{return await readVerifiedTelegramBinding(db,{email});}catch(error){if(['LINK_STATE_AMBIGUOUS','PRIVATE_CHAT_REQUIRED','INVALID_BINDING_RECORD','INVALID_LINK_METADATA','INVALID_BINDING_OWNER','INVALID_BINDING_IDENTITY','LINK_ACCOUNT_CHANGED','LINK_CODE_REVOKED'].includes(error?.code))return null;throw error;}}"});
update('server/telegram-fast-ack.mjs',{linkedTelegramRecord:"async function linkedTelegramRecord(db,email){try{return await readVerifiedTelegramBinding(db,{email:safeEmail(email)})||{};}catch{return {};}}"});
console.log('[telegram-binding] canonical readers, challenge protocol and metadata CAS; real transfer remains blocked without delivery admission');

// Bind the imported text/call transport to a canonical source record. Public
// onboarding replies use server.mjs's separate message transport, not this API.
{
 const file='server/v139/delivery.mjs',before=fs.readFileSync(file,'utf8');let after=before;const text=fs.readFileSync(new URL('./delivery-functions.mjs',import.meta.url),'utf8'),ast=ts.createSourceFile('delivery-snippets',text,99,true,ts.ScriptKind.JS);
 for(const replacement of ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name)){const parsed=ts.createSourceFile(file,after,99,true,ts.ScriptKind.JS),old=parsed.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===replacement.name.text);if(!old)throw Error('[telegram-binding] missing transport');after=after.slice(0,old.getStart(parsed))+replacement.getText(ast)+after.slice(old.end);}
 const header="import {submitVerifiedTelegramBinding} from '../telegram-binding-delivery.mjs';\n";if(!after.includes(header.trim()))after=header+after;if(after!==before)fs.writeFileSync(file,after);
}
{
 const file='server/v139/auth.mjs',before=fs.readFileSync(file,'utf8');const after=before.replace('const link = await telegramLink(db, email);','const link = await telegramLink(db, email).catch(() => null);').replace('await sendTelegram(link?.chatId, message)','await sendTelegram(link?.chatId, message, link)').replace('await callTelegram(link?.username, spoken)','await callTelegram(link?.username, spoken, { binding: link })');if(after!==before)fs.writeFileSync(file,after);
}
{
 const file='server/v139/bidsNotify.mjs',before=fs.readFileSync(file,'utf8'),after=before.replace('await send(link.chatId, text)','await send(link.chatId, text, link)');if(after!==before)fs.writeFileSync(file,after);
}
{
 const file='server/telegram-fast-ack.mjs',before=fs.readFileSync(file,'utf8');let after=before;
 const parsed=ts.createSourceFile(file,after,99,true,ts.ScriptKind.JS),old=parsed.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='deliverJob');
 if(!old)throw Error('[telegram-binding] missing job transport');
 after=after.slice(0,old.getStart(parsed))+fs.readFileSync(new URL('./deliver-job.mjs',import.meta.url),'utf8').trim()+after.slice(old.end);
 after=after.replace('const chatId = await linkedTelegramChatId(db, monitor.email);',"const monitorBinding = await linkedTelegramRecord(db, monitor.email);\n          const chatId = String(monitorBinding?.chatId || '');").replace('await sendTelegram(chatId, commuteAlertMessage(monitor, route, learning, reason))','await sendTelegram(chatId, commuteAlertMessage(monitor, route, learning, reason), monitorBinding)');
 if(after!==before)fs.writeFileSync(file,after);
}
{
 const file='server/platform.mjs',before=fs.readFileSync(file,'utf8');let after=before;
 const imports="import {readVerifiedTelegramBinding} from './telegram-binding-state.mjs';\nimport {submitVerifiedTelegramBinding} from './telegram-binding-delivery.mjs';\n";if(!after.includes("from './telegram-binding-delivery.mjs'"))after=imports+after;
 after=after.replace("const telegramState = await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=$1 LIMIT 1', [`link-email:${visitor.owner_email}`]).catch(() => ({ rows: [] }));\n  const telegramChatId = telegramState.rows[0]?.payload?.chatId || '';", "const ownerBinding = await readVerifiedTelegramBinding(db,{email:visitor.owner_email}).catch(()=>null);\n  const telegramChatId = ownerBinding?.chatId || '';");
 after=after.replace('sendTelegramDirect(telegramChatId, alertText),','submitVerifiedTelegramBinding(db,ownerBinding,{chatId:telegramChatId},()=>sendTelegramDirect(telegramChatId, alertText)),');
 if(after!==before)fs.writeFileSync(file,after);
}
await import('./ui.mjs');
{
 const file='client/src/pages/Home.tsx',before=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,before,99,true,ts.ScriptKind.TSX),fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='openTelegramBinding');if(!fn)throw Error('[telegram-binding] missing Home connect action');
 const text=fs.readFileSync(new URL('./open-telegram.ts',import.meta.url),'utf8').trim(),header="import {authFetch as telegramBindingAuthFetch,captureAuthSession as captureTelegramBindingSession} from '@/lib/authClient';\n";let after=before.slice(0,fn.getStart(ast))+text+before.slice(fn.end);if(!after.includes(header.trim()))after=header+after;if(after!==before)fs.writeFileSync(file,after);
}
await import('./local-transports.mjs');
await import('./reply-scope.mjs');
await import('./authenticated-queue.mjs');
await import('./visitor-private.mjs');
await import('./account-deletion-client.mjs');
