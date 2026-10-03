import fs from 'node:fs';
const file = 'server/whatsapp.mjs';
let source = fs.readFileSync(file, 'utf8');
const marker = '// Bind inbound replies to the existing configured sender only.';
if (!source.includes(marker)) {
  const start = source.indexOf('async function handleInboundMessage(message) {');
  const end = source.indexOf('\nasync function processWhatsAppPayload(', start);
  if (start < 0 || end < 0) throw new Error('[whatsapp-sender] inbound handler missing');
  let handler = source.slice(start, end);
  handler = handler.replace('async function handleInboundMessage(message) {', `async function handleInboundMessage(message) {
  ${marker}
  const expectedPhoneNumberId = phoneNumberId();
  if (!expectedPhoneNumberId || message?.phoneNumberId !== expectedPhoneNumberId) return;`);
  handler = handler.replaceAll('{ replyToMessageId: message.id }', '{ replyToMessageId: message.id, expectedPhoneNumberId }');
  const anchor = "  if (!Number(link.consent_concierge)) return;";
  if (!handler.includes(anchor)) throw new Error('[whatsapp-sender] consent guard missing');
  handler = handler.replace(anchor, `${anchor}
  const linkIdentity = value => JSON.stringify([String(value?.email || '').trim().toLowerCase(), String(value?.linked_at || '')]);
  const originalIdentity = linkIdentity(link);
  const stillLinked = async () => {
    const current = await findActiveLinkByPhone(from);
    return current?.email && !current.revoked_at && Number(current.consent_concierge) === 1 &&
      linkIdentity(current) === originalIdentity;
  };`);
  handler = handler.replace('if (reply.trim()) await sendWhatsAppText(', 'if (reply.trim() && await stillLinked()) await sendWhatsAppText(');
  handler = handler.replace("    await sendWhatsAppText(from, 'Não consegui concluir", "    if (await stillLinked()) await sendWhatsAppText(from, 'Não consegui concluir");
  source = source.slice(0, start) + handler + source.slice(end);
}
const guard = "  if (Object.hasOwn(options, 'expectedPhoneNumberId') && (!options.expectedPhoneNumberId || options.expectedPhoneNumberId !== senderId)) return { ok: false, code: 'WHATSAPP_SENDER_MISMATCH' };";
if (!source.includes(guard)) {
  const anchor = '  const senderId = phoneNumberId();';
  if (!source.includes(anchor)) throw new Error('[whatsapp-sender] outbound sender missing');
  source = source.replace(anchor, `${anchor}\n${guard}`);
}
fs.writeFileSync(file, source);
console.log('[whatsapp-sender] existing sender allowlist enforced before linking; reply sender and binding rechecked');
