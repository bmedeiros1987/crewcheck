import { INFOBIP_WHATSAPP_RELEASE_ENABLED } from './infobip-whatsapp-candidate.mjs';

const phone = value => typeof value === 'string' && /^[1-9]\d{7,14}$/.test(value);
const messageId = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(value);
function origin(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash ||
      !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.api\.infobip\.com$/.test(url.hostname)) throw Error('INFOBIP_ORIGIN');
  return url.origin;
}
export function buildInfobipTextRequest(proposal, configuration) {
  const base = origin(configuration.baseUrl);
  if (!phone(configuration.sender) || proposal?.provider !== 'infobip' || proposal.sender !== configuration.sender ||
      !phone(proposal.recipient) || !messageId(proposal.messageId) || !messageId(proposal.replyToMessageId) ||
      typeof proposal.text !== 'string' || !proposal.text.trim() || proposal.text.length > 4_000 ||
      typeof configuration.apiKey !== 'string' || !/^[A-Za-z0-9_-]{16,256}$/.test(configuration.apiKey)) throw Error('INFOBIP_REQUEST');
  const binding = JSON.parse(proposal.bindingStamp);
  if (!Array.isArray(binding) || binding.length !== 5 || !binding[0] || !binding[1] ||
      binding[2] !== 'infobip' || binding[3] !== proposal.sender || binding[4] !== proposal.recipient) throw Error('INFOBIP_BINDING');
  return { url: `${base}/whatsapp/1/message/text`, options: {
    method: 'POST', redirect: 'error', headers: {
      authorization: `App ${configuration.apiKey}`, 'content-type': 'application/json', accept: 'application/json',
    },
    body: JSON.stringify({from: proposal.sender, to: proposal.recipient,
      messageId: proposal.messageId, content: {text: proposal.text}}),
  }};
}

async function responseJson(response) {
  const reader = response?.body?.getReader?.();
  if (!reader) throw Error('INFOBIP_RESPONSE');
  const chunks = []; let bytes = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > 16_384) throw Error('INFOBIP_RESPONSE_LIMIT');
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { await reader.cancel().catch(() => {}); }
}

// No default fetch, network agent or environment lookup. The production entry
// stays hard OFF; exercise() is explicit dependency-injected test plumbing.
export function createInfobipTextTransport({ baseUrl, sender, apiKey, request, timeoutMs = 5_000 }) {
  if (typeof request !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5_000) throw Error('INFOBIP_CONFIGURATION');
  origin(baseUrl);
  if (!phone(sender) || typeof apiKey !== 'string' || !/^[A-Za-z0-9_-]{16,256}$/.test(apiKey)) throw Error('INFOBIP_CONFIGURATION');
  const configuration = Object.freeze({baseUrl, sender, apiKey});
  return {
    send: async () => ({status: INFOBIP_WHATSAPP_RELEASE_ENABLED ? 'blocked' : 'disabled'}),
    async exercise(proposal, {signal: externalSignal} = {}) {
      let built;
      try { built = buildInfobipTextRequest(proposal, configuration); }
      catch { return {status: 'blocked'}; }
      const controller = new AbortController();
      let timer;
      const work = async () => {
        const response = await request(built.url, {...built.options, signal: controller.signal});
        // Never follow provider redirects and never echo raw error diagnostics.
        if (response?.redirected || !Number.isInteger(response?.status) || response.status < 200 || response.status >= 300) return {status: 'uncertain'};
        const body = await responseJson(response);
        if (body?.messageId !== proposal.messageId || body?.to !== proposal.recipient ||
            body?.status?.groupId !== 1 || body?.status?.groupName !== 'PENDING' ||
            body?.status?.id !== 26 || body?.status?.name !== 'PENDING_ACCEPTED') return {status: 'uncertain'};
        return {status: 'accepted_unconfirmed'};
      };
      const abort = () => controller.abort();
      try {
        if (externalSignal?.aborted) return {status: 'uncertain'};
        externalSignal?.addEventListener('abort', abort, {once: true});
        return await Promise.race([work(), new Promise(resolve => {
          timer = setTimeout(() => {controller.abort(); resolve({status: 'uncertain'});}, timeoutMs);
        })]);
      } catch { return {status: 'uncertain'}; }
      finally { clearTimeout(timer); externalSignal?.removeEventListener('abort', abort); }
    },
  };
}
