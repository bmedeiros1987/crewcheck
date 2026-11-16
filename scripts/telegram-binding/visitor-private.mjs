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
fs.writeFileSync(file,source);
