import fs from 'node:fs';import spans from './source-spans.mjs';
const file='server/platform.mjs';let source=fs.readFileSync(file,'utf8');const fn=spans.createSourceFile(file,source).statements.find(n=>n.name?.text==='handlePlatformVisitorTelegram');if(!fn)throw Error('[telegram-binding] visitor handler missing');let text=fn.getText();
if(!text.includes('// telegram-visitor-private-transport-v1')){
 const anchor="  if (!chatId) return false;";if(!text.includes(anchor))throw Error('[telegram-binding] visitor entry missing');text=text.replace(anchor,anchor+"\n  // telegram-visitor-private-transport-v1\n  if(message?.chat?.type!=='private'||!/^[1-9]\\d{0,19}$/.test(chatId)||String(message?.from?.id||'')!==chatId)return false;");source=source.slice(0,fn.getStart())+text+source.slice(fn.end);
}
fs.writeFileSync(file,source);
