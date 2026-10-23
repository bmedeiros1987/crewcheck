// Capability only: no environment reads, SDK, ambient fetch, startup or callsite.
// The authenticated host/provider owns intent/schema validation and rendering.
export const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
export const GROQ_MODELS = Object.freeze(['openai/gpt-oss-20b']);
export const GROQ_TRANSPORT_LIMITS = Object.freeze({ inputBytes: 512, outputTokens: 128,
  contentBytes: 128, responseBytes: 8192, timeoutMs: 1000, maxCalls: 20 });
const faultCodes = new WeakMap();
function fault(code) {
  const error = new Error(`GROQ_${code}`);
  error.name = 'GroqTransportError'; error.code = `GROQ_${code}`;
  faultCodes.set(error, code);
  return error;
}
const object = value => value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const keys = (value, allowed) => object(value) && Object.keys(value).every(key => allowed.includes(key));
const bytes = value => Buffer.byteLength(value, 'utf8');
function requestBody(request, model) {
  try {
    const inputModel = request?.model, inputMessages = request?.messages, outputTokens = request?.max_tokens, format = request?.response_format;
    if (!keys(request, ['model', 'messages', 'max_tokens', 'response_format'])
      || inputModel !== model || !Number.isInteger(outputTokens) || outputTokens < 1 || outputTokens > GROQ_TRANSPORT_LIMITS.outputTokens
      || !keys(format, ['type']) || format.type !== 'json_object'
      || !Array.isArray(inputMessages) || inputMessages.length !== 2) throw fault('REQUEST');
    const messages = [0, 1].map(i => {
      const message = inputMessages[i], role = message?.role, content = message?.content;
      if (!keys(message, ['role', 'content']) || role !== (i === 0 ? 'system' : 'user') || typeof content !== 'string') throw fault('REQUEST');
      return { role, content };
    });
    const body = JSON.stringify({ model, messages, max_completion_tokens: outputTokens,
      response_format: { type: 'json_object' }, stream: false });
    if (bytes(body) > GROQ_TRANSPORT_LIMITS.inputBytes) throw fault('INPUT_LIMIT');
    return body;
  } catch (error) { throw fault(faultCodes.get(error) || 'REQUEST'); }
}
function cancelBody(response) {
  try { Promise.resolve(response?.body?.cancel()).catch(() => {}); } catch {}
}
function cooldown(headers, at) {
  const raw = headers?.get?.('retry-after');
  const seconds = typeof raw === 'string' && /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : NaN;
  const date = typeof raw === 'string' && !Number.isFinite(seconds) ? Date.parse(raw) : NaN;
  return Math.max(60_000, Number.isFinite(seconds) ? seconds * 1000 : Number.isFinite(date) ? date - at : 60_000);
}
async function readContent(response, signal) {
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers?.get?.('content-type') || '')) throw fault('RESPONSE');
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > GROQ_TRANSPORT_LIMITS.responseBytes)) throw fault('RESPONSE_LIMIT');
  if (!response.body?.getReader) throw fault('RESPONSE');
  const reader = response.body.getReader();
  const stop = () => { try { Promise.resolve(reader.cancel()).catch(() => {}); } catch {} };
  signal.addEventListener('abort', stop, { once: true });
  const chunks = []; let size = 0;
  try {
    if (signal.aborted) throw fault('ABORTED');
    for (;;) {
      const chunk = await reader.read();
      if (signal.aborted) throw fault('ABORTED');
      if (chunk.done) break;
      if (!(chunk.value instanceof Uint8Array)) throw fault('RESPONSE');
      size += chunk.value.byteLength;
      if (size > GROQ_TRANSPORT_LIMITS.responseBytes) throw fault('RESPONSE_LIMIT');
      chunks.push(chunk.value);
    }
    const all = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.byteLength; }
    const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(all));
    const choice = payload?.choices?.[0], message = choice?.message;
    if (!Array.isArray(payload?.choices) || payload.choices.length !== 1 || choice.finish_reason !== 'stop'
      || message?.role !== 'assistant' || typeof message.content !== 'string' || !message.content
      || message.tool_calls != null || message.function_call != null || message.refusal != null) throw fault('RESPONSE');
    if (bytes(message.content) > GROQ_TRANSPORT_LIMITS.contentBytes) throw fault('OUTPUT_LIMIT');
    try { if (!object(JSON.parse(message.content))) throw fault('RESPONSE'); }
    catch { throw fault('RESPONSE'); }
    // Untrusted text, not a final answer. The existing provider must parse its
    // JSON and validate the allowlist/empty arguments before any host action.
    return message.content;
  } catch (error) { throw fault(faultCodes.get(error) || 'RESPONSE'); }
  finally { signal.removeEventListener('abort', stop); stop(); try { reader.releaseLock(); } catch {} }
}

/** Same async transport(request,{signal}) boundary as the synthetic pilot.
 * Real model ID is required; synthetic-groq-contract is deliberately denied.
 * Budget is per capability lifetime, NOT a durable daily/org spending limit.
 */
export function createGroqHttpTransport(options = {}) {
  let enabled, credential, model, fetchImpl, now, timeoutMs, maxCalls;
  try {
    enabled = options?.enabled === true;
    if (!enabled) return async () => { throw fault('OFF'); };
    ({ credential, model = 'openai/gpt-oss-20b', fetchImpl, now = Date.now,
      timeoutMs = GROQ_TRANSPORT_LIMITS.timeoutMs, maxCalls = 1 } = options);
    if (typeof credential !== 'string' || !/^[A-Za-z0-9_-]{8,256}$/.test(credential)
      || !GROQ_MODELS.includes(model) || typeof fetchImpl !== 'function' || typeof now !== 'function'
      || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > GROQ_TRANSPORT_LIMITS.timeoutMs
      || !Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > GROQ_TRANSPORT_LIMITS.maxCalls) throw fault('CONFIG');
  } catch { throw fault('CONFIG'); }
  let calls = 0, busy = false, cooldownUntil = -Infinity, lastClock = -Infinity;
  return async (request, controls = {}) => {
    let timer, abortListener, controller, response, ownsSlot = false, signal, work;
    try {
      signal = controls?.signal;
      if (signal != null && (typeof signal.aborted !== 'boolean' || typeof signal.addEventListener !== 'function'
        || typeof signal.removeEventListener !== 'function')) throw fault('REQUEST');
      const body = requestBody(request, model);
      const at = now();
      if (!Number.isFinite(at) || at < lastClock) throw fault('CLOCK');
      lastClock = at;
      if (signal?.aborted) throw fault('ABORTED');
      if (busy) throw fault('BUSY');
      if (at < cooldownUntil) throw fault('RATE_LIMIT');
      if (calls >= maxCalls) throw fault('BUDGET');
      controller = new AbortController();
      let rejectInterruption;
      const interrupted = new Promise((_, reject) => { rejectInterruption = reject; });
      const interrupt = code => { rejectInterruption(fault(code)); controller.abort(); };
      abortListener = () => interrupt('ABORTED');
      signal?.addEventListener('abort', abortListener, { once: true });
      timer = setTimeout(() => interrupt('TIMEOUT'), timeoutMs);
      if (controller.signal.aborted) return await interrupted;
      // No await before reservation; concurrent calls cannot bypass the cap.
      busy = true; ownsSlot = true; calls++;
      work = (async () => {
        try {
          response = await fetchImpl(GROQ_ENDPOINT, { method: 'POST', redirect: 'error', cache: 'no-store', credentials: 'omit',
            headers: { authorization: `Bearer ${credential}`, 'content-type': 'application/json' }, body, signal: controller.signal });
          if (response?.redirected || (response?.status >= 300 && response?.status < 400)
            || (response?.url && response.url !== GROQ_ENDPOINT)) throw fault('REDIRECT');
          if (response?.status === 429) {
            const previousCooldown = cooldownUntil; cooldownUntil = Infinity;
            const receivedAt = now();
            if (!Number.isFinite(receivedAt) || receivedAt < lastClock) { cooldownUntil = Infinity; throw fault('CLOCK'); }
            lastClock = receivedAt;
            cooldownUntil = Math.max(previousCooldown, receivedAt + cooldown(response.headers, receivedAt));
            throw fault('RATE_LIMIT');
          }
          // A cancelled caller must not erase organization throttling learned
          // from a late same-origin 429. Admit headers before abandoning body;
          // the settled caller still receives its original timeout/abort.
          if (controller.signal.aborted) throw fault('ABORTED');
          if (response?.status === 401 || response?.status === 403) throw fault('AUTH');
          if (response?.status !== 200) throw fault('HTTP');
          return await readContent(response, controller.signal);
        } finally { cancelBody(response); }
      })().finally(() => { busy = false; });
      return await Promise.race([work, interrupted]);
    } catch (error) { throw fault(faultCodes.get(error) || 'NETWORK'); }
    finally {
      clearTimeout(timer);
      try { signal?.removeEventListener('abort', abortListener); } catch {}
      controller?.abort(); cancelBody(response);
      if (ownsSlot && !work) busy = false;
    }
  };
}
