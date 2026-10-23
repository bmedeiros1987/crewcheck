import { createConversationClassifier } from './conversation-classifier.mjs';
import { READ_TOOLS } from './conversation-provider.mjs';
import { createHash } from 'node:crypto';

const readIntents = READ_TOOLS;
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 160;
const changed = (deliveryAllowed = false) => ({ handled: true, deliveryAllowed, state: 'clarification', facts: [], reply: 'A conta, sessão ou seleção mudou. Confira a programação e faça uma nova consulta.' });
const denied = (deliveryAllowed = false) => ({ handled: true, deliveryAllowed, state: 'unavailable', facts: [], reply: 'Não há dados autorizados e atuais para esta consulta.' });
const unknown = () => ({ handled: true, deliveryAllowed: true, state: 'unsupported', facts: [], reply: 'Não entendi esta consulta. Posso consultar a próxima jornada ou resumir a escala salva.' });
const selection = value => value?.context?.selectionKey || value?.selectionKey;

/** Reuses an injected existing canonical account reader, without constructing a
 * Telegram profile. loadSnapshot is a server-authorized read, never ask/restore.
 * Assembly of the real authenticated endpoint remains the owning host's task.
 */
export function createAccountConversationRead({ createReader, loadSnapshot, checkNow, clock = Date.now } = {}) {
  if (![createReader, loadSnapshot, checkNow, clock].every(fn => typeof fn === 'function')) throw Error('READ_CAPABILITY_CONFIG');
  return async ({ intent, followup, binding, context }) => {
    if (!readIntents.includes(intent) || checkNow(binding) !== true) return denied();
    const raw = await loadSnapshot(binding);
    const matches = () => typeof raw === 'string' && Buffer.byteLength(raw) <= 256000 && checkNow(binding) === true
      && createHash('sha256').update(raw).digest('hex') === binding.selectionHash;
    if (!matches()) return denied();
    const reader = createReader({ identity: () => matches() ? { owner: binding.owner, sessionEpoch: binding.epoch } : null,
      readSnapshot: owner => owner === binding.owner && matches() ? raw : null, now: clock,
      isCurrent: value => matches() && value.owner === binding.owner && value.sessionEpoch === binding.epoch && value.revision === binding.revision });
    return reader(followup ? 'e o horário?' : intent === 'nextDuty.read' ? 'próxima jornada' : 'resumo da escala', context);
  };
}

/** Stateless admission/orchestration capability, NOT an installed HTTP host.
 * admit/isCurrent/checkNow/read are trusted code-injected server capabilities.
 * Identity comes solely from admit, never text, JSON body or a fake Telegram
 * sender. read must be the existing account-bound canonical read capability.
 */
export function createConversationReadHost({ enabled = false, admit, isCurrent, checkNow, read,
  classify = createConversationClassifier(), clock = Date.now } = {}) {
  // Opaque, non-serializable references to the existing reader's context. This
  // does not implement a second temporal router or store user conversation text.
  const contexts = new WeakMap();
  return async (request, text, previous = null) => {
    if (enabled !== true) return { handled: false };
    try {
      if (![admit, isCurrent, checkNow, read, classify, clock].every(fn => typeof fn === 'function')) return denied();
      const admission = await admit(request);
      if (!admission || admission.allowed !== true) return denied();
      const binding = Object.freeze(Object.fromEntries(['owner', 'sessionId', 'epoch', 'turnId', 'revision', 'selectionHash'].map(key => [key, admission[key]])));
      const expiresAt = admission.expiresAt, startedAt = clock();
      if (!Object.values(binding).every(validId) || !Number.isFinite(expiresAt) || !Number.isFinite(startedAt)) return denied();
      const currentNow = () => { const at = clock(); return Number.isFinite(at) && at >= startedAt && at < expiresAt && checkNow(binding) === true; };
      const current = async () => await isCurrent(binding) === true && currentNow();
      if (!await current()) return changed();
      const prior = previous && typeof previous === 'object' ? contexts.get(previous) : null;
      const priorContext = prior && ['owner', 'sessionId', 'epoch', 'revision', 'selectionHash'].every(key => prior.binding[key] === binding[key]) ? prior.context : null;
      const hasContext = Boolean(priorContext);
      const readOne = async (intent, followup = false) => {
        if (!currentNow()) return null;
        const value = await read(Object.freeze({ intent, followup, binding, context: followup ? priorContext : null }));
        if (!await current()) return null;
        return value;
      };
      let baseline = null, preparationFailure = null;
      const choice = await classify(text, { hasContext, canSend: currentNow, beforeModel: async () => {
        // Reuse the actual reader for both potential selections before inference.
        // These are local read probes, not model/tool loops or external requests.
        baseline = new Map();
        for (const intent of readIntents) {
          const value = await readOne(intent, hasContext && intent === 'nextDuty.read');
          if (!value || !['available', 'no_data'].includes(value.state) || typeof selection(value) !== 'string') { preparationFailure = value || denied(); return false; }
          baseline.set(intent, selection(value));
        }
        return await current();
      } });
      if (!await current()) return changed();
      if (preparationFailure) return preparationFailure.state === 'clarification'
        ? { handled: true, deliveryAllowed: true, state: 'clarification', facts: [], reply: preparationFailure.reply } : denied(true);
      if (choice?.intent === 'clarify') return { handled: true, deliveryAllowed: true, state: 'clarification', facts: [], reply: typeof choice.reply === 'string' && choice.mode === 'deterministic' ? choice.reply : 'Qual programação você quer consultar? Apresentação no aeroporto, APZ do hotel e saída da van são horários diferentes.' };
      if (!readIntents.includes(choice?.intent)) return unknown();
      const value = await readOne(choice.intent, choice.followup === true);
      if (!value) return changed();
      if (!currentNow()) return changed();
      if (baseline && baseline.get(choice.intent) !== selection(value)) return changed(true);
      if (!['available', 'no_data', 'clarification', 'unavailable'].includes(value.state) || typeof value.reply !== 'string' || !Array.isArray(value.facts)) return denied();
      const output = { handled: true, deliveryAllowed: true, state: value.state, facts: value.facts, reply: value.reply };
      if (choice.intent === 'nextDuty.read' && value.context && value.state === 'available') {
        const reference = Object.freeze({}); contexts.set(reference, { binding, context: value.context });
        Object.defineProperty(output, 'continuation', { value: reference });
      }
      return output;
    } catch { return denied(); }
  };
}

/** Composition order only; no admission/router/sender is created or installed.
 * Telegram owner must invoke inside its admitted run and preserve its guards.
 * App uses createConversationReadHost directly, without Telegram identities.
 */
export function composeTemporalFirst({ enabled = false, temporalHandle, readContinuation } = {}) {
  if (typeof temporalHandle !== 'function' || typeof readContinuation !== 'function') throw Error('COMPOSITION_CONFIG');
  return async (...args) => {
    const temporal = await temporalHandle(...args);
    if (temporal !== null || enabled !== true) return temporal;
    const read = await readContinuation(...args);
    return read?.handled === true && read.state !== 'unsupported' ? read : null;
  };
}
