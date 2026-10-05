import { stripTypeScriptTypes } from 'node:module';

const LEGACY_MARKER = 'await handleV139Telegram(message, sendTelegramMessage)';
const LEGACY_ANCHOR = "  if (chatId && text && await telegramTryBindFromWebhook(message, text)) return sendJson(res, 200, { ok: true, linked: true, message: 'Telegram vinculado.' });";
const LEGACY_ROUTE = "  if (chatId && message?.document && await handleV139Telegram(message, sendTelegramMessage)) return sendJson(res, 200, { ok: true, crewlock: true, message: 'Solicitação CrewLock processada.' });";
const WEBHOOK_HEADER = 'async function handleTelegramWebhook(req, res) {';
const PREPARED_PREFIX = [
  WEBHOOK_HEADER,
  "  const secret = envAny(['TELEGRAM_WEBHOOK_SECRET']);",
  '  if (secret) {',
  "    const received = String(req.headers['x-telegram-bot-api-secret-token'] || '');",
  "    if (received !== secret) return sendJson(res, 403, { ok: false, message: 'Webhook não autorizado.' });",
  '  }',
  "  if (req.method !== 'POST') return sendJson(res, 200, { ok: true, message: 'Concierge pronto para receber eventos.' });",
  '  const update = await readJsonBody(req);',
  '  const v1391TelegramHandled = await handleV139Telegram(update, sendTelegramMessage);',
  '  if (v1391TelegramHandled) return sendJson(res, 200, { ok: true, handled: true });',
].join('\n');

// Parse only: never import or execute the server. Invalidating a quote-free
// token proves the match is code rather than a comment or template literal.
// Use strip mode, not the transform emitter or a hand-written JavaScript lexer.
function isCode(source, index, length) {
  try {
    stripTypeScriptTypes(`${source.slice(0, index)}const =${source.slice(index + length)}`);
    return false;
  } catch (error) {
    return error?.code === 'ERR_INVALID_TYPESCRIPT_SYNTAX';
  }
}

function hasPreparedDispatch(source) {
  const index = source.indexOf(PREPARED_PREFIX);
  if (index < 0 || source.indexOf(PREPARED_PREFIX, index + 1) >= 0) return false;
  if (!isCode(source, index, 'async function'.length)) return false;
  const dispatchIndex = index + PREPARED_PREFIX.indexOf('const v1391TelegramHandled');
  if (!isCode(source, dispatchIndex, 'const v1391TelegramHandled'.length)) return false;
  try {
    // Export declarations are legal only at module top level. The exact prefix
    // also preserves the verified webhook/POST gates and direct dispatch order.
    stripTypeScriptTypes(`${source.slice(0, index)}export ${source.slice(index)}`);
    return true;
  } catch { return false; }
}

export function prepareTelegramCrewLock(source) {
  // Establish a valid parse before using syntax errors as lexical evidence.
  stripTypeScriptTypes(source);
  const legacyIndex = source.indexOf(LEGACY_MARKER);
  if (legacyIndex >= 0 && isCode(source, legacyIndex, 'await'.length)) return source;
  if (hasPreparedDispatch(source)) return source;
  const anchorIndex = source.indexOf(LEGACY_ANCHOR);
  if (anchorIndex < 0 || !isCode(source, anchorIndex + 2, 'if'.length)) {
    throw new Error('v13.9.0: âncora não encontrada em Telegram CrewLock');
  }
  return source.replace(LEGACY_ANCHOR, `${LEGACY_ANCHOR}\n${LEGACY_ROUTE}`);
}
