import fs from 'node:fs';
function replace(source, anchor, value) { if (!source.includes(anchor)) throw new Error('WHATSAPP_VISITOR_PREPARATION_ANCHOR'); return source.replace(anchor, value); }
let platform = fs.readFileSync('server/platform.mjs', 'utf8');
if (!platform.includes('export async function platformWhatsAppVisitorContext')) {
  platform = "import { whatsappVisitorEnabled, createVisitorCode, completeVisitorCode, findVisitorBinding, withVisitorPhoneLock, claimVisitorMessage, unlinkVisitor, visitorRevision, visitorOwnerHash } from './concierge/whatsapp-visitor.mjs';\n" + platform;
  const start = platform.indexOf("  const ownerProfile = await db.query('SELECT * FROM crewcheck_platform_profiles WHERE email=$1', [visitor.owner_email]);", platform.indexOf('export async function handlePlatformVisitorTelegram'));
  const end = platform.indexOf("  await send(chatId, 'Comando não disponível para visitante. Use /ajuda.');\n  return true;", start);
  if (start < 0 || end < 0) throw Error('WHATSAPP_VISITOR_CANONICAL_QUERY_ANCHOR');
  platform = platform.slice(0, start) + `  await send(chatId, await platformVisitorReadReply(db, visitor, permissions, command));
  return true;` + platform.slice(end + "  await send(chatId, 'Comando não disponível para visitante. Use /ajuda.');\n  return true;".length);
  const helpers = `
// Shared read-only visitor producer. No owner account Concierge delegation.
export async function platformVisitorReadReply(db, visitor, permissions, command) {
  const ownerProfile = await db.query('SELECT * FROM crewcheck_platform_profiles WHERE email=$1', [visitor.owner_email]);
  if (!ownerProfile.rows[0] || !(await subscriptionStatus(db, ownerProfile.rows[0])).premiumAccess) return 'O acesso de visitante está pausado porque o plano Premium do titular não está ativo.';
  if (command === '/ajuda' || command === '/start' || !command.startsWith('/')) return ['/escala — próximos dias permitidos', '/proximo — próxima programação', '/hotel — pernoite compartilhado', permissions.emergency ? '/emergencia mensagem — pedir ajuda ao titular' : ''].filter(Boolean).join('\\n');
  if (command === '/hotel') {
    if (!permissions.hotels) return 'O titular não compartilhou a aba de hotéis.';
    const stays = await db.query('SELECT * FROM crewcheck_platform_stays WHERE owner_email=$1 AND share_with_visitors=TRUE AND stay_date>=CURRENT_DATE ORDER BY stay_date LIMIT 3', [visitor.owner_email]);
    const lines = stays.rows.map(stay => [stay.stay_date, stay.hotel_name, permissions.room && stay.room_cipher ? 'quarto ' + decryptPrivate(stay.room_cipher) : '', permissions.presentation && stay.presentation_time ? 'apresentação ' + stay.presentation_time : ''].filter(Boolean).join(' · '));
    return lines.length ? lines.join('\\n') : 'Nenhum pernoite foi compartilhado agora.';
  }
  if (command === '/escala' || command === '/proximo') {
    if (!permissions.roster) return 'O titular não compartilhou a escala.';
    const rosterResult = await db.query('SELECT roster FROM crewcheck_platform_rosters WHERE owner_email=$1 AND active=TRUE ORDER BY updated_at DESC LIMIT 1', [visitor.owner_email]);
    const today = new Date().toISOString().slice(0, 10);
    const days = (rosterResult.rows[0]?.roster?.days || []).filter(day => !parseDateOnly(day?.date) || parseDateOnly(day?.date) >= today).slice(0, command === '/proximo' ? 1 : 7);
    return days.length ? days.map(visitorDaySummary).join('\\n') : 'Nenhuma programação futura compartilhada.';
  }
  return 'Comando não disponível para visitante. Use /ajuda.';
}
export async function platformWhatsAppVisitorContext(binding) {
  const db = await pool(); if (!db) throw Object.assign(new Error('VISITOR_DB_UNAVAILABLE'), { code: 'VISITOR_DB_UNAVAILABLE' });
  const result = await db.query("SELECT * FROM crewcheck_platform_visitors WHERE id=$1 AND owner_email=$2 AND status='active' LIMIT 1", [binding.visitorId, binding.ownerEmail]);
  const visitor = result.rows[0]; if (!visitor) return null;
  const profile = await db.query('SELECT * FROM crewcheck_platform_profiles WHERE email=$1', [visitor.owner_email]);
  const premium = Boolean(profile.rows[0] && (await subscriptionStatus(db, profile.rows[0])).premiumAccess);
  const permissions = allowedPermissions(visitor.permissions);
  return { active: true, premium, visitorId: visitor.id, ownerEmail: visitor.owner_email, permissions, revision: visitorRevision(visitor, permissions, premium) };
}
export async function platformWhatsAppVisitorReply(binding, command) {
  const context = await platformWhatsAppVisitorContext(binding);
  if (!context?.active || !context.premium) throw Object.assign(new Error('VISITOR_NOT_AUTHORIZED'), { code: 'VISITOR_NOT_AUTHORIZED' });
  const db = await pool();
  // WhatsApp help intentionally omits unimplemented emergency effects.
  if (command === '/ajuda' || command === '/start') return ['/escala — próximos dias permitidos', '/proximo — próxima programação', '/hotel — pernoite compartilhado'].join('\\n');
  return platformVisitorReadReply(db, { id: binding.visitorId, owner_email: binding.ownerEmail }, context.permissions, command);
}
export async function platformWhatsAppVisitorBinding(phone, receiver) { return findVisitorBinding(await pool(), phone, receiver); }
export async function platformWhatsAppVisitorClaim(phone, binding, message) { const db = await pool(); if (!db) throw Error('VISITOR_DB_UNAVAILABLE'); return claimVisitorMessage(db, phone, binding, message); }
export async function platformWhatsAppVisitorComplete(phone, code, receiver) {
  return completeVisitorCode(await pool(), phone, code, receiver, { authorized: async (db, visitor) => {
    const profile = await db.query('SELECT * FROM crewcheck_platform_profiles WHERE email=$1', [visitor.owner_email]);
    return Boolean(profile.rows[0] && (await subscriptionStatus(db, profile.rows[0])).premiumAccess);
  } });
}
export async function platformWhatsAppOwnerRoleLock(phone, operation) {
  return withVisitorPhoneLock(await pool(), phone, async (_connection, binding) => binding.visitorId ? { linked: false, conflict: true } : operation());
}
async function handlePlatformWhatsAppVisitorLink(req, res, action) {
  if (!whatsappVisitorEnabled()) return sendJson(res, 404, { ok: false, message: 'Canal de visitante indisponível.' });
  const db = await pool(); if (!db) return sendJson(res, 503, { ok: false, message: 'Banco indisponível.' });
  const identity = visitorIdentity(req); if (!identity) return sendJson(res, 401, { ok: false, message: 'Acesso de visitante expirado.' });
  if (action === 'unlink') { await unlinkVisitor(db, identity); return sendJson(res, 200, { ok: true, linked: false }); }
  const body = await readBody(req, 10000);
  if (body.consentConcierge !== true) return sendJson(res, 400, { ok: false, message: 'Confirme o uso deste canal de visitante.' });
  const context = await platformWhatsAppVisitorContext(identity);
  if (!context?.active || !context.premium) return sendJson(res, 403, { ok: false, message: 'Acesso de visitante indisponível.' });
  const receiver = env('WHATSAPP_PHONE_NUMBER_ID');
  const created = await createVisitorCode(db, { id: context.visitorId, owner_email: context.ownerEmail, status: 'active' }, receiver);
  const number = env('CREWCHECK_WHATSAPP_NUMBER', env('WHATSAPP_BUSINESS_NUMBER')).replace(/\\D/g, '');
  return sendJson(res, 200, { ok: true, ...created, openUrl: /^\\d{8,16}$/.test(number) ? 'https://wa.me/' + number + '?text=' + encodeURIComponent(created.code) : '' });
}
`;
  platform = replace(platform, "  return sendJson(res, 200, { ok: true, message: 'Acesso do visitante revogado.' });", "  await unlinkVisitor(context.db, { visitorId: id, ownerEmail: context.identity.email });\n  return sendJson(res, 200, { ok: true, message: 'Acesso do visitante revogado.' });");
  platform = replace(platform, "{ ok: true, visitor: { displayName: visitor.display_name, permissions }, owner: owner.rows[0] || null, roster, stays, privacy:", "{ ok: true, whatsappAvailable: whatsappVisitorEnabled(), visitor: { displayName: visitor.display_name, permissions }, owner: owner.rows[0] || null, roster, stays, privacy:");
  const deletionAnchor = "    await client.query('DELETE FROM crewcheck_telegram_state WHERE state_key IN ($1,$2,$3,$4)'";
  const deletionIndex = platform.indexOf(deletionAnchor);
  if (deletionIndex < 0) throw Error('WHATSAPP_VISITOR_DELETION_ANCHOR');
  platform = platform.slice(0, deletionIndex) + `    await client.query("DELETE FROM crewcheck_telegram_state WHERE (state_key LIKE 'whatsapp-role:%' OR state_key LIKE 'whatsapp-visitor-code:%' OR state_key LIKE 'whatsapp-visitor-message:%') AND (JSON_UNQUOTE(JSON_EXTRACT(payload,'$.ownerEmail'))=$1 OR JSON_UNQUOTE(JSON_EXTRACT(payload,'$.ownerHash'))=$2)", [context.identity.email, visitorOwnerHash(context.identity.email)]);
` + platform.slice(deletionIndex);
  platform = replace(platform, 'function visitorDaySummary(day) {', helpers + '\nfunction visitorDaySummary(day) {');
  platform = replace(platform, "  [/^\\/api\\/platform\\/visitor\\/data$/, ['GET']],", "  [/^\\/api\\/platform\\/visitor\\/whatsapp\\/link\\/(start|unlink)$/, ['POST']],\n  [/^\\/api\\/platform\\/visitor\\/data$/, ['GET']],");
  platform = replace(platform, "    if (url.pathname === '/api/platform/visitor/data')", "    const whatsappVisitorLink = url.pathname.match(/^\\/api\\/platform\\/visitor\\/whatsapp\\/link\\/(start|unlink)$/);\n    if (whatsappVisitorLink) { await handlePlatformWhatsAppVisitorLink(req, res, whatsappVisitorLink[1]); return true; }\n    if (url.pathname === '/api/platform/visitor/data')");
  fs.writeFileSync('server/platform.mjs', platform);
}
let whatsapp = fs.readFileSync('server/whatsapp.mjs', 'utf8');
if (!whatsapp.includes('async function dispatchWhatsAppVisitor')) {
  whatsapp = "import { whatsappVisitorEnabled, handleVisitorMessage } from './concierge/whatsapp-visitor.mjs';\nimport { platformWhatsAppVisitorBinding, platformWhatsAppVisitorContext, platformWhatsAppVisitorReply, platformWhatsAppVisitorClaim, platformWhatsAppVisitorComplete, platformWhatsAppOwnerRoleLock } from './platform.mjs';\n" + whatsapp;
  const functions = `
async function dispatchWhatsAppVisitor(message) {
  const visitorText = message.type === 'text' ? String(message.text || '').trim() : '';
  const isHandoff = /^visitante_/i.test(visitorText);
  if (!whatsappVisitorEnabled()) return isHandoff;
  try {
  const receiver = phoneNumberId();
  const from = normalizePhone(message.from);
  if (!receiver || receiver !== message.phoneNumberId || !from) return true;
  const bindingCode = visitorText.match(/^visitante_([A-Za-z0-9_-]{43})$/i);
  if (isHandoff) {
    if (!bindingCode) return true;
    // Reply only through the bound visitor path, after the new relationship is revalidated.
    const linked = await platformWhatsAppVisitorComplete(from, bindingCode[1], receiver);
    if (!linked.linked) return true;
    await handleVisitorMessage({ ...message, text: 'menu' }, { enabled: whatsappVisitorEnabled, receiver: phoneNumberId, now: () => Date.now(), findBinding: platformWhatsAppVisitorBinding, context: platformWhatsAppVisitorContext, claim: platformWhatsAppVisitorClaim, reply: platformWhatsAppVisitorReply, send: sendWhatsAppText });
    return true;
  }
  const result = await handleVisitorMessage(message, { enabled: whatsappVisitorEnabled, receiver: phoneNumberId, now: () => Date.now(), findBinding: platformWhatsAppVisitorBinding, context: platformWhatsAppVisitorContext, claim: platformWhatsAppVisitorClaim, reply: platformWhatsAppVisitorReply, send: sendWhatsAppText });
  return result.handled;
  } catch { throw Object.assign(new Error('VISITOR_UNAVAILABLE'), { code: 'VISITOR_UNAVAILABLE' }); }
}
`;
  whatsapp = replace(whatsapp, 'async function handleInboundMessage(message) {', functions + '\nasync function handleInboundMessage(message) {');
  const guard = '  if (!expectedPhoneNumberId || message?.phoneNumberId !== expectedPhoneNumberId) return;';
  whatsapp = replace(whatsapp, guard, guard + '\n  if (await dispatchWhatsAppVisitor(message)) return;');
  whatsapp = replace(whatsapp, 'const linking = await tryCompleteLink(from, text);', 'const linking = whatsappVisitorEnabled() ? await platformWhatsAppOwnerRoleLock(from, () => tryCompleteLink(from, text)) : await tryCompleteLink(from, text);');
  whatsapp = replace(whatsapp, 'async function findActiveLinkByPhone(from) {', 'async function findActiveLinkByPhone(from) {\n  if (whatsappVisitorEnabled() && await platformWhatsAppVisitorBinding(normalizePhone(from), phoneNumberId())) return null;');
  fs.writeFileSync('server/whatsapp.mjs', whatsapp);
}
console.log('[whatsapp-visitor] canonical role reads and isolated visitor binding; gate OFF');

// The existing authenticated visitor portal owns the handoff; no anonymous access page.
let client = fs.readFileSync('client/src/pages/VisitorAccessPage.tsx', 'utf8');
if (!client.includes('async function linkVisitorWhatsApp')) {
  client = replace(client, "import { useEffect, useMemo, useState }", "import { useEffect, useMemo, useRef, useState }");
  client = replace(client, 'type VisitorData = {', 'type VisitorData = {\n  whatsappAvailable?: boolean;');
  client = replace(client, "  const t = copy[browserLocale()];", `  const [whatsappLink, setWhatsAppLink] = useState<{ code: string; openUrl: string; expiresInMinutes: number } | null>(null);
  const whatsappOperation = useRef(0);
  async function linkVisitorWhatsApp() {
    const operation = ++whatsappOperation.current;
    setBusy(true); setWhatsAppLink(null);
    try {
      const result = await visitorRequest('/api/platform/visitor/whatsapp/link/start', { method: 'POST', body: JSON.stringify({ consentConcierge: true }) });
      if (operation === whatsappOperation.current) setWhatsAppLink({ code: result.code, openUrl: result.openUrl, expiresInMinutes: result.expiresInMinutes });
    } catch { if (operation === whatsappOperation.current) toast.error('Não consegui vincular este acesso ao WhatsApp.'); }
    finally { if (operation === whatsappOperation.current) setBusy(false); }
  }
  async function unlinkVisitorWhatsApp() {
    const operation = ++whatsappOperation.current;
    setBusy(true); setWhatsAppLink(null);
    try {
      await visitorRequest('/api/platform/visitor/whatsapp/link/unlink', { method: 'POST', body: '{}' });
      if (operation === whatsappOperation.current) toast.success('WhatsApp desvinculado deste acesso.');
    } catch { if (operation === whatsappOperation.current) toast.error('Não consegui confirmar a desvinculação.'); }
    finally { if (operation === whatsappOperation.current) setBusy(false); }
  }
  const t = copy[browserLocale()];`);
  client = replace(client, '  async function logout() {', '  async function logout() {\n    ++whatsappOperation.current; setWhatsAppLink(null); setBusy(false);');
  client = replace(client, "</nav>{tab === 'roster'", `</nav>{data?.whatsappAvailable && <section className="cv-section"><h2>WhatsApp de visitante</h2><p>Ao vincular, você autoriza consultas pelo WhatsApp somente com as permissões que o titular já compartilhou neste acesso.</p><button type="button" onClick={linkVisitorWhatsApp} disabled={busy}>Vincular WhatsApp</button><button type="button" onClick={unlinkVisitorWhatsApp} disabled={busy}>Desvincular WhatsApp</button>{whatsappLink && <div><p>Envie este código pelo seu WhatsApp em até {whatsappLink.expiresInMinutes} minutos. Não compartilhe o código.</p><code>{whatsappLink.code}</code>{whatsappLink.openUrl.startsWith('https://wa.me/') && <a href={whatsappLink.openUrl} target="_blank" rel="noopener noreferrer">Abrir WhatsApp com o código</a>}</div>}</section>}{tab === 'roster'`);
  fs.writeFileSync('client/src/pages/VisitorAccessPage.tsx', client);
}
