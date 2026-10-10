import fs from 'node:fs';
const path = 'server/whatsapp.mjs';
let source = fs.readFileSync(path, 'utf8');
const marker = 'await deliverWhatsAppMenuMessage(message,';
const gateMarker = 'const menuEnabled = whatsappMenuEnabled();';
if (source.includes(marker) && !source.includes(gateMarker)) {
  throw new Error('[whatsapp-menu] rebuild clean source to replace the ungated preview');
}
if (!source.includes(gateMarker)) {
  const anchor = 'async function handleInboundMessage(message) {';
  const start = source.indexOf(anchor);
  const insertion = source.indexOf('  const link = await findActiveLinkByPhone(from);', start);
  if (start < 0 || insertion < 0) throw new Error('[whatsapp-menu] prepared inbound adapter missing');
  // Keep the original branch intact: OFF must execute the same protected handler,
  // including account linking, provider calls and message count.
  source = source.slice(0, insertion) + `  if (menuEnabled) {
    await deliverWhatsAppMenuMessage(message, {
      findLink: findActiveLinkByPhone,
      handler: whatsappConciergeHandler,
      send: (to, text, options) => sendWhatsAppText(to, text, { ...options, expectedPhoneNumberId }),
    });
    return;
  }

` + source.slice(insertion);
  const senderGuard = '  if (!expectedPhoneNumberId || message?.phoneNumberId !== expectedPhoneNumberId) return;';
  if (!source.includes(senderGuard)) throw new Error('[whatsapp-menu] configured sender protection must be prepared first');
  source = source.replace(senderGuard, `${senderGuard}\n  const menuEnabled = whatsappMenuEnabled();`);
}
const importLine = "import { deliverWhatsAppMenuMessage, whatsappMenuEnabled } from './concierge/whatsapp-menu.mjs';";
if (!source.includes(importLine)) source = importLine + '\n' + source;
fs.writeFileSync(path, source);
console.log('[whatsapp-menu] opt-in text menu; default OFF preserves the existing handler');
