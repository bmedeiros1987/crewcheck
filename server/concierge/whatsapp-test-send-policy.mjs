import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';

const scopes = new AsyncLocalStorage();
const phone = value => String(value || '').replace(/^\+/, '');
const deny = code => ({ allowed: false, code: `WHATSAPP_TEST_${code}` });
export const whatsappTestProfileActive = () => Boolean(String(process.env.CREWCHECK_WHATSAPP_TEST_PROFILE || ''));
function configuration() {
  const mode = String(process.env.CREWCHECK_WHATSAPP_TEST_PROFILE || '');
  if (!mode) return { active: false, stamp: '' };
  if (mode !== 'restricted') return { active: true, ...deny('CONFIG_INVALID') };
  let recipients;
  try { recipients = JSON.parse(process.env.CREWCHECK_WHATSAPP_TEST_RECIPIENTS || ''); } catch { return { active: true, ...deny('CONFIG_INVALID') }; }
  if (!Array.isArray(recipients) || recipients.length !== 2 || recipients.some(value => typeof value !== 'string' || !/^\+?\d{8,16}$/.test(value))) return { active: true, ...deny('CONFIG_INVALID') };
  recipients = recipients.map(phone).sort();
  const receiver = String(process.env.CREWCHECK_WHATSAPP_TEST_PHONE_NUMBER_ID || '');
  if (recipients[0] === recipients[1] || !/^\d{1,80}$/.test(receiver) || receiver !== String(process.env.WHATSAPP_PHONE_NUMBER_ID || '')) return { active: true, ...deny('CONFIG_INVALID') };
  if (process.env.CREWCHECK_WHATSAPP_TEST_TRANSPORT_ATTESTED !== 'true' || process.env.CREWCHECK_WHATSAPP_TEST_ISOLATION_ATTESTED !== 'true') return { active: true, ...deny('UNATTESTED') };
  const stamp = crypto.createHash('sha256').update(JSON.stringify([mode, recipients, receiver])).digest('hex');
  return { active: true, allowed: true, recipients, receiver, stamp };
}
function envelopeDecision(message, cfg, now = Date.now()) {
  if (!cfg.active) return { allowed: true };
  if (!cfg.allowed) return cfg;
  if (!cfg.recipients.includes(phone(message?.from))) return deny('RECIPIENT_DENIED');
  if (message?.phoneNumberId !== cfg.receiver || typeof message?.id !== 'string' || !/^\S{1,191}$/.test(message.id)) return deny('RECEIVER_OR_MESSAGE_MISMATCH');
  if (!/^\d{10,11}$/.test(String(message?.timestamp || ''))) return deny('WINDOW_UNKNOWN');
  const sentAt = Number(message.timestamp) * 1000;
  if (now < sentAt) return deny('WINDOW_FUTURE');
  if (now - sentAt >= 23 * 60 * 60 * 1000) return deny('WINDOW_EXPIRED');
  return { allowed: true };
}
export const whatsappTestProfileStamp = () => configuration().stamp ?? null;
export const whatsappTestInboundAllowed = message => envelopeDecision(message, configuration()).allowed === true;
export function whatsappTestJobAllowed(message, stamp) {
  const cfg = configuration();
  if (stamp !== undefined && stamp !== '' && typeof stamp !== 'string') return false;
  if ((stamp || '') !== cfg.stamp) return false;
  return envelopeDecision(message, cfg).allowed === true;
}
export function whatsappTestMenuCommandAllowed(message) {
  if (!whatsappTestProfileActive()) return true;
  return message?.type === 'text' && /^(?:menu|\/menu|\/escala|\/proximo|\/resumo|\/diarias|\/financeiro)$/i.test(String(message.text || '').trim());
}
export async function withWhatsAppTestReply(message, path, work) {
  const cfg = configuration();
  if (path === 'pdf' && !whatsappTestJobAllowed(message, message?.testProfileStamp)) return { ok: false, code: 'WHATSAPP_TEST_PROFILE_CHANGED' };
  const decision = envelopeDecision(message, cfg);
  if (!decision.allowed) return { ok: false, code: decision.code };
  if (cfg.active && !['inbound','pdf'].includes(path)) return { ok: false, code: 'WHATSAPP_TEST_PATH_UNPROVED' };
  if (cfg.active && path === 'pdf' && message.testProfileStamp !== cfg.stamp) return { ok: false, code: 'WHATSAPP_TEST_PROFILE_CHANGED' };
  const scope = Object.freeze({ from: phone(message?.from), id: message?.id, phoneNumberId: message?.phoneNumberId, timestamp: message?.timestamp,
    stamp: cfg.stamp, path, ownerLink: message?.type === 'text' && /^\d{6}$/.test(String(message.text || '').trim()) });
  return scopes.run(scope, work);
}
export function whatsappTestSendDecision(to, receiver, options = {}, now = Date.now()) {
  const cfg = configuration(), scope = scopes.getStore();
  if (!cfg.active && !scope?.stamp) return { allowed: true };
  if (!cfg.allowed) return deny(cfg.active ? (cfg.code?.replace('WHATSAPP_TEST_', '') || 'CONFIG_INVALID') : 'PROFILE_CHANGED');
  if (!scope || scope.stamp !== cfg.stamp) return deny('PROFILE_CHANGED');
  const decision = envelopeDecision(scope, cfg, now);
  if (!decision.allowed) return decision;
  if (phone(to) !== scope.from || !cfg.recipients.includes(phone(to))) return deny('RECIPIENT_DENIED');
  if (receiver !== cfg.receiver || options.expectedPhoneNumberId !== receiver || options.replyToMessageId !== scope.id) return deny('RECEIVER_OR_MESSAGE_MISMATCH');
  if (!(scope.path === 'pdf' || ['menu','visitor'].includes(options.testReplyPath) || (scope.path === 'inbound' && scope.ownerLink))) return deny('PATH_UNPROVED');
  return { allowed: true };
}
