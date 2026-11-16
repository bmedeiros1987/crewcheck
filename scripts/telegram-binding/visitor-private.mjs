import fs from 'node:fs';import spans from './source-spans.mjs';
const file='server/platform.mjs';let source=fs.readFileSync(file,'utf8');const fn=spans.createSourceFile(file,source).statements.find(n=>n.name?.text==='handlePlatformVisitorTelegram');if(!fn)throw Error('[telegram-binding] visitor handler missing');let text=fn.getText();
if(!text.includes('// telegram-visitor-private-transport-v1')){
 const anchor="  if (!chatId) return false;";if(!text.includes(anchor))throw Error('[telegram-binding] visitor entry missing');text=text.replace(anchor,anchor+"\n  // telegram-visitor-private-transport-v1\n  if(message?.chat?.type!=='private'||!/^[1-9]\\d{0,19}$/.test(chatId)||String(message?.from?.id||'')!==chatId)return false;");source=source.slice(0,fn.getStart())+text+source.slice(fn.end);
}
const old="    await db.query('UPDATE crewcheck_platform_visitors SET telegram_chat_id=$2,telegram_token_hash=$3,updated_at=NOW() WHERE id=$1', [visitor.id, chatId, retiredTokenHash()]);";
const guarded=`    // telegram-visitor-invite-cas-v1: consume only the token actually read.
    const consumed = await db.query("UPDATE crewcheck_platform_visitors SET telegram_chat_id=$2,telegram_token_hash=$3,updated_at=NOW() WHERE id=$1 AND telegram_token_hash=$4 AND status IN ('invited','active')", [visitor.id, chatId, retiredTokenHash(), sha256(bind[1])]);
    if (consumed.rowCount !== 1) {
      await send(chatId, 'Este vínculo de visitante expirou ou foi revogado. Peça um novo convite ao titular.');
      return true;
    }`;
if(!source.includes('// telegram-visitor-invite-cas-v1')){
 if(!source.includes(old))throw Error('[telegram-binding] visitor invite update missing');source=source.replace(old,guarded);
}
const header="import {createTelegramVisitorReplyGuard} from './telegram-visitor-reply-guard.mjs';";
if(!source.includes(header))source=header+'\n'+source;
if(!source.includes('// telegram-visitor-private-reply-recheck-v1')){
 const node=spans.createSourceFile(file,source).statements.find(n=>n.name?.text==='handlePlatformVisitorTelegram');let body=node.getText();
 const anchor="  if (command === '/ajuda' || command === '/start' || !command.startsWith('/')) {";
 if(!body.includes(anchor))throw Error('[telegram-binding] visitor command gate missing');
 body=body.replace(anchor,"  // telegram-visitor-private-reply-recheck-v1\n  const visitorReply=createTelegramVisitorReplyGuard({db,visitor,chatId,ownerId:ownerProfile.rows[0]?.public_id,allowedPermissions,subscriptionStatus,send});\n"+anchor);
 const hotel="      await send(chatId, lines.length ? lines.join('\\n') : 'Nenhum pernoite foi compartilhado agora.');";
 const roster="      await send(chatId, days.length ? days.map(visitorDaySummary).join('\\n') : 'Nenhuma programação futura compartilhada.');";
 if(!body.includes(hotel)||!body.includes(roster))throw Error('[telegram-binding] visitor private reply anchors missing');
 body=body.replace(hotel,"      visitorReply.observe('SELECT * FROM crewcheck_platform_stays WHERE owner_email=$1 AND share_with_visitors=TRUE AND stay_date>=CURRENT_DATE ORDER BY stay_date LIMIT 3',[visitor.owner_email],stays.rows);\n"+hotel.replace('await send(chatId,','await visitorReply.send('));
 body=body.replace(roster,"      visitorReply.observe('SELECT roster FROM crewcheck_platform_rosters WHERE owner_email=$1 AND active=TRUE ORDER BY updated_at DESC LIMIT 1',[visitor.owner_email],rosterResult.rows);\n"+roster.replace('await send(chatId,','await visitorReply.send('));
 source=source.slice(0,node.getStart())+body+source.slice(node.end);
}
fs.writeFileSync(file,source);
