import { buildInfobipTtsRequest } from './v1396/infobip.mjs';

const failed = (provider, code, configured = true) => ({ ok: false, uncertain: true, delivered: null, configured, provider, code });

// One attempt only. A timeout, lost ACK, redirect or unrecognized response must
// remain uncertain: the existing queue must not place another call automatically.
async function boundedResponse(url, init, { fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, redirect: 'error', signal: controller.signal });
    if (controller.signal.aborted) throw new Error('CALL_TIMEOUT');
    const chunks = [];
    let length = 0;
    for await (const chunk of response.body || []) {
      length += chunk.byteLength;
      if (controller.signal.aborted || length > 16_384) {
        controller.abort();
        throw new Error('CALL_RESPONSE_UNAVAILABLE');
      }
      chunks.push(chunk);
    }
    if (controller.signal.aborted) throw new Error('CALL_TIMEOUT');
    const raw = Buffer.concat(chunks).toString('utf8');
    return { response, raw };
  } finally { clearTimeout(timer); }
}

export async function sendTelegramWakeupCall({ username, text, environment = process.env, fetchImpl = globalThis.fetch, timeoutMs = 15_000 }) {
  const provider = 'telegram-call';
  const user = String(username || '').trim().replace(/^@/, '');
  if (/^(false|0|off|no)$/i.test(String(environment.CALLMEBOT_TELEGRAM_CALL_ENABLED || '')) || !user) return failed(provider, 'CALL_DISABLED_OR_UNLINKED', false);
  if (!/^[a-zA-Z0-9_]{5,32}$/.test(user)) return failed(provider, 'CALL_RECIPIENT_INVALID', false);
  const url = new URL('https://api.callmebot.com/start.php');
  url.searchParams.set('user', `@${user}`);
  url.searchParams.set('text', String(text || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 240));
  url.searchParams.set('lang', environment.CALLMEBOT_TELEGRAM_LANG || 'pt-BR-Standard-A');
  url.searchParams.set('rpt', '1');
  url.searchParams.set('cc', 'missed');
  url.searchParams.set('timeout', '30');
  try {
    const { response, raw } = await boundedResponse(url, { method: 'GET' }, { fetchImpl, timeoutMs });
    if (!response.ok || !raw.trim() || /(error|invalid|unauthor|disabled|not allowed)/i.test(raw)) return failed(provider, 'CALL_NOT_CONFIRMED');
    // CallMeBot has no delivery receipt here. Text carbon copy is not proof of a call.
    return { ok: true, configured: true, provider, accepted: true, delivered: null };
  } catch { return failed(provider, 'CALL_RESULT_UNCERTAIN'); }
}

export async function sendInfobipWakeupCall({ phone, text, environment = process.env, fetchImpl = globalThis.fetch, timeoutMs = 15_000 }) {
  const provider = 'infobip';
  const request = buildInfobipTtsRequest({ phone, text, environment });
  if (!request.ok) return { ...request, uncertain: true, delivered: null };
  try {
    const { response, raw } = await boundedResponse(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(request.body) }, { fetchImpl, timeoutMs });
    const parsed = JSON.parse(raw);
    const messages = parsed?.messages;
    // HTTP 200 alone can carry a rejected Voice message. Require the sole receipt
    // to match the one intended destination and a pending/delivered status group.
    const receipt = Array.isArray(messages) && messages.length === 1 ? messages[0] : null;
    if (!response.ok || !receipt || String(receipt.to) !== request.body.messages[0].destinations[0].to || !receipt.messageId || ![1, 3].includes(receipt.status?.groupId)) return failed(provider, 'CALL_NOT_CONFIRMED');
    return { ok: true, configured: true, provider, accepted: true, delivered: null };
  } catch { return failed(provider, 'CALL_RESULT_UNCERTAIN'); }
}

