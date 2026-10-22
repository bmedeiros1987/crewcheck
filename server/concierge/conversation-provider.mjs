// Offline contract pilot. No HTTP implementation, credentials, environment
// flags, SDK, retry or provider startup is installed by this module.
export const PROVIDER_LIMITS = Object.freeze({ steps: 1, inputTokens: 512, outputTokens: 128, timeoutMs: 1000 });
export const READ_TOOLS = Object.freeze(['nextDuty.read', 'schedule.read']);

/** Provider interface: select({ intent, signal }) -> { tool, arguments: {} }.
 * Only a locally recognized intent reaches this interface; never user text,
 * account identifiers, source text, roster facts or conversation history.
 * The injected transport is an offline fixture, not a production Groq client.
 */
export function createGroqPilotProvider({ enabled = false, transport } = {}) {
  return Object.freeze({
    async select({ intent, signal }) {
      if (enabled !== true) throw new Error('PROVIDER_OFF');
      if (typeof transport !== 'function' || !READ_TOOLS.includes(intent)) throw new Error('OFFLINE_TRANSPORT_REQUIRED');
      const request = Object.freeze({
        model: 'synthetic-groq-contract',
        messages: Object.freeze([
          Object.freeze({ role: 'system', content: 'Return only the requested allowlisted read tool and empty arguments as JSON.' }),
          Object.freeze({ role: 'user', content: JSON.stringify({ intent }) }),
        ]),
        max_tokens: PROVIDER_LIMITS.outputTokens,
        response_format: Object.freeze({ type: 'json_object' }),
      });
      // UTF-8 bytes are a conservative token upper bound for this fixed ASCII
      // fixture protocol. No claim about a real model tokenizer is made.
      if (Buffer.byteLength(JSON.stringify(request)) > PROVIDER_LIMITS.inputTokens) throw new Error('INPUT_BUDGET');
      const raw = await transport(request, { signal });
      if (typeof raw !== 'string' || Buffer.byteLength(raw) > PROVIDER_LIMITS.outputTokens) throw new Error('OUTPUT_BUDGET');
      return JSON.parse(raw);
    },
  });
}
