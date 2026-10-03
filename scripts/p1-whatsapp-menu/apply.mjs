import fs from 'node:fs';
const path = 'server/whatsapp.mjs';
let source = fs.readFileSync(path, 'utf8');
const marker = 'await deliverWhatsAppMenuMessage(message,';
if (!source.includes(marker)) {
  const start = source.indexOf('  const link = await findActiveLinkByPhone(from);', source.indexOf('async function handleInboundMessage(message)'));
  const end = source.indexOf('\n}\n\nasync function processWhatsAppPayload', start);
  if (start < 0 || end < 0) throw new Error('[whatsapp-menu] prepared inbound adapter missing');
  source = source.slice(0, start) + `  await deliverWhatsAppMenuMessage(message, {
    findLink: findActiveLinkByPhone,
    handler: whatsappConciergeHandler,
    send: sendWhatsAppText,
  });` + source.slice(end);
}
const receiverGuard = "  const expectedPhoneId = phoneNumberId();\n  if (!expectedPhoneId || message?.phoneNumberId !== expectedPhoneId) return;";
if (!source.includes(receiverGuard)) {
  const anchor = 'async function handleInboundMessage(message) {';
  if (!source.includes(anchor)) throw new Error('[whatsapp-menu] inbound boundary missing');
  source = source.replace(anchor, anchor + '\n' + receiverGuard);
}
const importLine = "import { deliverWhatsAppMenuMessage } from './concierge/whatsapp-menu.mjs';";
if (!source.includes(importLine)) source = importLine + '\n' + source;
fs.writeFileSync(path, source);
console.log('[whatsapp-menu] deterministic text menu and post-query account authorization');
