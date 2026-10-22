import { classifyConversation, containsConversationInstruction } from "../../shared/concierge-conversation-intent.mjs";
export { conversationIntent } from "../../shared/concierge-conversation-intent.mjs";
import { createHash } from 'node:crypto';
import { buildDutyFacts } from './duty-facts.mjs';
import { PROVIDER_LIMITS, READ_TOOLS } from './conversation-provider.mjs';

const unavailable = () => ({ state: 'unavailable', mode: 'deterministic', facts: [], reply: 'Não há fatos autorizados e atuais para esta consulta. Consulte a escala publicada.' });
const digest = value => createHash('sha256').update(value).digest('hex');
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 160;
const instant = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value));


function hasInjection(value) {
  if (typeof value === 'string') return containsConversationInstruction(value);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => containsConversationInstruction(key) || hasInjection(child));
}

function render(facts, source, now, intent, more) {
  const display = value => value === null ? 'não comprovado' : new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(value);
  return [intent === 'nextDuty.read' ? 'Próxima programação do snapshot:' : 'Programações do snapshot:',
    ...facts.map(f => `${f.date}: apresentação ${display(f.start)}; liberação ${display(f.end)}; duração publicada ${f.minutes === null ? 'não comprovada' : f.minutes + ' min'}.`),
    facts.length ? '' : 'Nenhuma programação comprovada encontrada. Dados ausentes permanecem desconhecidos.',
    more && intent === 'schedule.read' ? 'Leitura parcial: até três programações. Consulte a escala completa.' : '',
    `Fonte: ${source.origin}; revisão ${source.revision}.`,
    `Atualização do snapshot: ${source.updatedAt}; consulta: ${new Date(now).toISOString()}.`,
    'Fuso do leitor: America/Sao_Paulo, BRT (UTC−03:00). Fuso original do documento não comprovado.',
    'Correspondência com a escala ativa não comprovada. Programação prevista não comprova execução, repouso ou conformidade.',
  ].filter(Boolean).join('\n');
}

/** Request-scoped read capability. The host, never the model/request body,
 * supplies an authorized context and revalidates account/session/revision.
 * snapshotJSON is deliberately a bounded JSON string: no executable getters,
 * raw object references, functions or provider-supplied identities are read.
 */
export function createConversationPilot({ readContext, isCurrent, provider = null, clock = Date.now } = {}) {
  return async function answer(text) {
    const request = classifyConversation(text);
    if (request.kind === 'unsupported') return null; // Existing CrewCierge retains unsupported intents.
    if (request.kind === 'clarify') return { state: 'clarification', mode: 'deterministic', facts: [], reply: request.reply };
    let intent = request.intent;
    let conversationDeadline = Infinity;
    try {
      if (typeof readContext !== 'function' || typeof isCurrent !== 'function') return unavailable();
      const context = await readContext();
      const now = clock();
      if (!Number.isFinite(now) || !context || context.accessAllowed !== true
        || !validId(context.accountId) || !validId(context.sessionId) || !validId(context.revision)
        || typeof context.snapshotJSON !== 'string' || Buffer.byteLength(context.snapshotJSON) > 256_000) return unavailable();
      const snapshot = JSON.parse(context.snapshotJSON);
      const binding = Object.freeze({ accountId: context.accountId, sessionId: context.sessionId, revision: context.revision, snapshotHash: digest(context.snapshotJSON) });
      const current = async () => (await isCurrent(binding)) === true;
      if (!await current() || !snapshot || !instant(snapshot.updatedAt)
        || now - Date.parse(snapshot.updatedAt) < 0 || now - Date.parse(snapshot.updatedAt) > 15 * 60_000
        || !['app', 'telegram-pdf'].includes(snapshot.source) || hasInjection(snapshot)) return unavailable();
      if (request.kind === 'continuation') {
        const previous = context.conversation;
        if (!previous || previous.intent !== 'nextDuty.read' || !Number.isFinite(previous.expiresAt) || previous.expiresAt <= now
          || Object.entries(binding).some(([key, value]) => previous[key] !== value)) {
          return { state: 'clarification', mode: 'deterministic', facts: [], reply: 'Qual programação você quer consultar? Não há contexto válido desta conta e desta revisão. Você pode perguntar pela próxima jornada.' };
        }
        intent = previous.intent;
        conversationDeadline = previous.expiresAt;
      }
      // Conservative status fence: the existing measurement reader does not
      // establish active/cancelled status. Until domain authority is wired,
      // any non-confirmed status blocks this pilot rather than inventing it.
      const days = snapshot.roster?.days;
      if (!Array.isArray(days) || days.length > 370 || days.some(day => !day || !Array.isArray(day.legs) || day.legs.length > 12
        || [day, ...day.legs].some(row => !row || (row.status != null && String(row.status).trim().toLowerCase() !== 'confirmed')
          || (row.isNextDay != null && typeof row.isNextDay !== 'boolean')
          || ['presentationTimeSource', 'departureTimeSource', 'arrivalTimeSource'].some(key => row[key] != null && row[key] !== 'published')))) return unavailable();
      const result = buildDutyFacts({ profile: context.profile, snapshot, accessAllowed: true });
      if (!['available', 'no_data'].includes(result.state)) return unavailable();
      const duties = result.items.filter(row => row.kind === 'duty');
      if (duties.some(row => row.start === null || !Number.isFinite(row.start))) return unavailable();
      const remaining = duties.filter(row => row.end === null || row.end >= now);
      // Missing end cannot establish whether an old program is still active.
      if (remaining.some(row => row.start < now && row.end === null)) return unavailable();
      const selected = intent === 'nextDuty.read' ? remaining.slice(0, 1) : remaining.slice(0, 3);
      const facts = selected.map(({ date, start, end, minutes }) => ({ date, start, end, minutes }));
      const source = { origin: snapshot.source === 'app' ? 'snapshot sincronizado do app' : 'snapshot PDF recebido no Telegram', revision: result.revision, updatedAt: snapshot.updatedAt };
      let mode = 'deterministic';
      if (provider) {
        const abort = new AbortController();
        let timer;
        try {
          // Exactly one selection, zero iterative model/tool loops. The model
          // sees only an intent enum. Facts never enter its context.
          const choice = await Promise.race([
            Promise.resolve().then(() => provider.select({ intent, signal: abort.signal })),
            new Promise((_, reject) => { timer = setTimeout(() => { abort.abort(); reject(new Error('DEADLINE')); }, PROVIDER_LIMITS.timeoutMs); }),
          ]);
          const serialized = JSON.stringify(choice);
          if (typeof serialized !== 'string' || Buffer.byteLength(serialized) > PROVIDER_LIMITS.outputTokens) throw new Error('OUTPUT_BUDGET');
          if (!choice || Object.keys(choice).sort().join(',') !== 'arguments,tool' || !READ_TOOLS.includes(choice.tool) || choice.tool !== intent
            || !choice.arguments || Array.isArray(choice.arguments) || Object.keys(choice.arguments).length !== 0) throw new Error('TOOL_DENIED');
          mode = 'synthetic-provider';
        } catch { /* Fail to the same deterministic facts, never model prose. */ }
        finally { clearTimeout(timer); abort.abort(); }
      }
      if (!await current()) return unavailable();
      const deliveredAt = clock();
      if (!Number.isFinite(deliveredAt) || deliveredAt < now || deliveredAt >= conversationDeadline
        || deliveredAt - Date.parse(snapshot.updatedAt) > 15 * 60_000) return unavailable();
      return { state: facts.length ? 'available' : 'no_data', mode, facts, source, reply: render(facts, source, deliveredAt, intent, remaining.length > selected.length) };
    } catch { return unavailable(); }
  };
}

/** Integration seam for the EXISTING CrewCierge reply builder, not a new chat.
 * OFF passes the exact arguments/return/errors to its existing handler. No
 * runtime callsite or environment activation is installed in this pilot.
 */
export function createCrewciergeConversationAdapter({ legacyReply, pilot, enabled = false }) {
  if (typeof legacyReply !== 'function') throw new TypeError('legacyReply required');
  return async (...args) => {
    if (enabled !== true) return legacyReply(...args);
    try {
      const answer = await pilot(args[0]);
      if (answer !== null) return answer.reply;
    } catch { return unavailable().reply; }
    return legacyReply(...args);
  };
}
