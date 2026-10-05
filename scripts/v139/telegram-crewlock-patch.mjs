import { spawnSync } from 'node:child_process';

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
const READ_UPDATE = '  const update = await readJsonBody(req);';
const DEDUPLICATION_GATE = "  if (!crewcheckTelegramUpdateClaim(update)) return sendJson(res, 200, { ok: true, duplicate: true, message: 'Evento já processado.' });";
// v1424 preserves the v1391 dispatch and inserts this exact existing replay gate.
const PREPARED_PREFIXES = [PREPARED_PREFIX, PREPARED_PREFIX.replace(READ_UPDATE, `${READ_UPDATE}\n${DEDUPLICATION_GATE}`)];

// Parse only: never import or execute the server. Invalidating a quote-free
// token proves the match is code rather than a comment or template literal.
// --check parses native JavaScript modules on every existing CI Node version.
// Clear NODE_OPTIONS so inherited preload hooks cannot execute while checking.
function assertModuleSyntax(source) {
  const result = spawnSync(process.execPath, ['--check', '--input-type=module'], {
    input: source, encoding: 'utf8', timeout: 5_000, maxBuffer: 1_000_000,
    env: { NODE_OPTIONS: '' },
  });
  if (result.error) throw result.error;
  if (result.status === 0) return;
  const error = new Error('Telegram preparation could not validate server module syntax.');
  if (result.status === 1 && /\bSyntaxError:/.test(result.stderr)) error.code = 'CREWCHECK_INVALID_MODULE_SYNTAX';
  throw error;
}

function isCode(source, index, length) {
  try {
    assertModuleSyntax(`${source.slice(0, index)}const =${source.slice(index + length)}`);
    return false;
  } catch (error) {
    return error?.code === 'CREWCHECK_INVALID_MODULE_SYNTAX';
  }
}

function hasPreparedDispatch(source) {
  const matches = PREPARED_PREFIXES.flatMap(prefix => {
    const index = source.indexOf(prefix);
    return index < 0 ? [] : [{ prefix, index, duplicate: source.indexOf(prefix, index + 1) >= 0 }];
  });
  if (matches.length !== 1 || matches[0].duplicate) return false;
  const { prefix, index } = matches[0];
  if (!isCode(source, index, 'async function'.length)) return false;
  const dispatchIndex = index + prefix.indexOf('const v1391TelegramHandled');
  if (!isCode(source, dispatchIndex, 'const v1391TelegramHandled'.length)) return false;
  try {
    // Export declarations are legal only at module top level. The exact prefix
    // also preserves the verified webhook/POST gates and direct dispatch order.
    assertModuleSyntax(`${source.slice(0, index)}export ${source.slice(index)}`);
    return true;
  } catch { return false; }
}

export function prepareTelegramCrewLock(source) {
  // Establish a valid parse before using syntax errors as lexical evidence.
  assertModuleSyntax(source);
  const legacyIndex = source.indexOf(LEGACY_MARKER);
  if (legacyIndex >= 0 && isCode(source, legacyIndex, 'await'.length)) return source;
  if (hasPreparedDispatch(source)) return source;
  const anchorIndex = source.indexOf(LEGACY_ANCHOR);
  if (anchorIndex < 0 || !isCode(source, anchorIndex + 2, 'if'.length)) {
    throw new Error('v13.9.0: âncora não encontrada em Telegram CrewLock');
  }
  return source.replace(LEGACY_ANCHOR, `${LEGACY_ANCHOR}\n${LEGACY_ROUTE}`);
}
