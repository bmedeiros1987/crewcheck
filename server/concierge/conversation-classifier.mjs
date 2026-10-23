import { classifyConversation, containsConversationInstruction } from '../../shared/concierge-conversation-intent.mjs';
import { PROVIDER_LIMITS, READ_TOOLS } from './conversation-provider.mjs';
import { GROQ_MODELS } from './groq-transport.mjs';

export const CLASSIFICATION_INTENTS = Object.freeze([...READ_TOOLS, 'clarify', 'unsupported']);
const clarify = 'Qual programação você quer consultar? Apresentação no aeroporto, APZ do hotel e saída da van são horários diferentes.';
const result = (intent, mode, followup = false, reply = '') => Object.freeze({ intent, mode, followup, reply });
const unsupported = () => result('unsupported', 'deterministic');
const protectedTopic = value => /\b(?:financeiro|diarias|salario|receber|radar|portao|gate|metar|conformidade|legal|amanha|hoje|ontem|depois|conta|email|usuario|cancelar|apagar|salvar|enviar|agendar)\b/.test(value);

/** No runtime activation, ambient transport, credentials, facts or identity.
 * Provider inference is opt-in and only an injected mock is used by this PR.
 * beforeModel/canSend belong to the authenticated host, never request JSON.
 */
export function createConversationClassifier({ enabled = false, transport = null,
  timeoutMs = PROVIDER_LIMITS.timeoutMs } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > PROVIDER_LIMITS.timeoutMs) throw Error('CLASSIFIER_CONFIG');
  return async (text, controls = {}) => {
    let timer, controller;
    try {
      const local = classifyConversation(text);
      if (local.kind === 'clarify') return result('clarify', 'deterministic', false, local.reply);
      if (local.kind === 'read') return result(local.intent, 'deterministic');
      if (local.kind === 'continuation') return controls.hasContext === true
        ? result('nextDuty.read', 'deterministic', true) : result('clarify', 'deterministic', false, clarify);
      if (enabled !== true || typeof transport !== 'function' || typeof text !== 'string'
        || !text.trim() || Buffer.byteLength(text) > 160 || containsConversationInstruction(text)) return unsupported();
      const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      if (protectedTopic(normalized) || /[@\d]/.test(text)) return unsupported();
      // Unknown anaphora without owner-held context must not become a fresh
      // query just because a model returns nextDuty.read.
      if (/^(?:e\b|isso\b|essa\b|esse\b)/.test(normalized.trim()) && controls.hasContext !== true) return result('clarify', 'deterministic', false, clarify);
      if (typeof controls.beforeModel !== 'function' || typeof controls.canSend !== 'function'
        || await controls.beforeModel() !== true || controls.canSend() !== true) return unsupported();
      const request = Object.freeze({ model: GROQ_MODELS[0], messages: Object.freeze([
        Object.freeze({ role: 'system', content: 'JSON {"intent":"..."}. nextDuty.read=next duty; schedule.read=saved roster; clarify=ambiguous airport report/hotel APZ/van or unbound followup; unsupported=other. No facts/args.' }),
        Object.freeze({ role: 'user', content: JSON.stringify({ text: text.trim(), followup: controls.hasContext === true }) }),
      ]), max_tokens: PROVIDER_LIMITS.outputTokens, response_format: Object.freeze({ type: 'json_object' }) });
      // Account, session, roster and prior conversation never enter this object.
      if (Buffer.byteLength(JSON.stringify(request)) > PROVIDER_LIMITS.inputTokens || controls.canSend() !== true) return unsupported();
      controller = new AbortController();
      const raw = await Promise.race([
        Promise.resolve().then(() => {
          if (controls.canSend() !== true || controller.signal.aborted) throw Error('CLASSIFIER_CANCELLED');
          return transport(request, { signal: controller.signal });
        }),
        new Promise((_, reject) => { timer = setTimeout(() => { reject(Error('CLASSIFIER_TIMEOUT')); controller.abort(); }, timeoutMs); }),
      ]);
      if (controls.canSend() !== true || typeof raw !== 'string' || Buffer.byteLength(raw) > PROVIDER_LIMITS.outputTokens) return unsupported();
      const parsed = JSON.parse(raw);
      if (!parsed || Array.isArray(parsed) || Object.keys(parsed).join(',') !== 'intent'
        || !CLASSIFICATION_INTENTS.includes(parsed.intent)) return unsupported();
      return result(parsed.intent, 'injected-classifier', controls.hasContext === true && parsed.intent === 'nextDuty.read', parsed.intent === 'clarify' ? clarify : '');
    } catch { return unsupported(); }
    finally { clearTimeout(timer); controller?.abort(); }
  };
}
