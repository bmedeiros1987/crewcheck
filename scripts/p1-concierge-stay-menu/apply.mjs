import fs from 'node:fs';

function update(file, transform) {
  const before = fs.readFileSync(file, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(file, after);
}
function replace(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[concierge-stay-menu] missing ${label}`);
  return source.replace(before, after);
}

update('server.mjs', source => {
  if (!source.includes("from './server/concierge/stay-menu.mjs'")) source = "import { stayMenuReply } from './server/concierge/stay-menu.mjs';\n" + source;
  const replyStart = "async function buildTelegramConciergeReply(text = '', profile = {}, snapshot = null) {";
  source = replace(source, replyStart, `${replyStart}\n  const stayMenu = await stayMenuReply(text, profile);\n  if (stayMenu.handled) return stayMenu.reply;`, 'final Concierge wrapper');
  source = replace(source, "[{ text: '🏨 Hotéis' }, { text: '🏥 Hospitais' }]", "[{ text: '🏨 Meu pernoite' }, { text: '🏥 Hospitais' }]", 'Telegram menu');
  source = replace(source, "  if (normalized === 'hotéis' || normalized === 'hoteis') return '/hoteis';", "  if (normalized === 'meu pernoite' || normalized === 'hotéis' || normalized === 'hoteis') return '/hoteis';", 'legacy hotel alias');
  source = replace(source, "{ command: 'hoteis', description: 'Hotéis e pernoites' }", "{ command: 'hoteis', description: 'Meu pernoite e registros salvos' }", 'Telegram command description');
  // Trust the actual Telegram transport type, including audio/callback paths.
  source = replace(source, '  const cached = telegramProfileForChat(message);', "  const cached = { ...telegramProfileForChat(message), channel: 'telegram', chatType: String(message?.chat?.type || '') };", 'Telegram private channel provenance');
  source = replace(source, "return { email: conciergeSafeKey(persisted.email), name: persisted.name || cached.name, chatId: cached.chatId, linked: true, accessKeyHash: persisted.accessKeyHash || '' };", "return { ...cached, email: conciergeSafeKey(persisted.email), name: persisted.name || cached.name, chatId: cached.chatId, linked: true, accessKeyHash: persisted.accessKeyHash || '' };", 'persisted Telegram provenance');
  // The app can carry a linked Telegram chatId; only the trusted call site
  // identifies the request channel. Do not promote access-key sessions to JWT.
  source = replace(source, "buildTelegramConciergeReply(String(body.text || body.message || ''), profile, snapshot)", "buildTelegramConciergeReply(String(body.text || body.message || ''), { ...profile, channel: 'app' }, snapshot)", 'app request provenance');
  return source;
});

update('server/v1391/emergency.mjs', source => {
  if (!source.includes("from '../concierge/stay-menu.mjs'")) source = "import { stayMenuIntent } from '../concierge/stay-menu.mjs';\n" + source;
  // The legacy hotel interceptor otherwise sends twelve records with rooms
  // before the shared Concierge can handle the new menu/history requests.
  const anchor = "  const text = String(message?.text || message?.caption || '').trim();";
  source = replace(source, anchor, `${anchor}\n  if (stayMenuIntent(text)) return false;`, 'legacy hotel interceptor');
  return source;
});
console.log('[concierge-stay-menu] compact private history; explicit app registration handoff; no stay writes');
