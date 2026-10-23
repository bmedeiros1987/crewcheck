import { buildCanonicalRosterEvents } from './canonicalRoster';
import { measureCanonicalDuty, publishedDutyEndpoints } from './canonicalDutyMeasurement';
import type { CrewRoster } from './pdfParser';
import { classifyConversation, containsConversationInstruction, type ConversationIntent } from '../../../shared/concierge-conversation-intent.mjs';

export type LocalCrewciergeBinding = { owner: string; sessionEpoch: string; revision: string; contentHash: string };
type LocalIdentity = { owner: string; sessionEpoch: string };
export type LocalCrewciergeContext = LocalCrewciergeBinding & { intent: ConversationIntent; expiresAt: number; selectionKey: string };
export type LocalCrewciergeOptions = {
  identity(): LocalIdentity | null;
  // Only an existing, locally selected roster may be supplied. Never restore
  // automatically, fetch, or substitute the planned/other-account archive.
  readSnapshot(owner: string): string | null;
  isCurrent(binding: LocalCrewciergeBinding): boolean;
  now?(): number;
};
type Fact = { start: number; end: number; minutes: number };
const unavailable = () => ({ state: 'unavailable' as const, facts: [] as Fact[], reply: 'Dados locais indisponíveis para esta conta e revisão. Consulte a escala publicada; nenhum horário ou valor foi estimado.' });
const unknown = () => ({ state: 'unsupported' as const, facts: [] as Fact[], reply: 'Não entendi esta consulta local. Posso consultar a próxima jornada ou resumir a escala salva. APZ do hotel e saída da van precisam de fontes próprias.' });
const validId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 160;
function safeDate(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) return false;
  return Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function injected(value: unknown): boolean {
  if (typeof value === 'string') return containsConversationInstruction(value);
  return Boolean(value && typeof value === 'object' && Object.entries(value).some(([key, child]) => containsConversationInstruction(key) || injected(child)));
}
function ordinaryClockEvidence(day: any): boolean {
  if (!Object.prototype.hasOwnProperty.call(day, 'publishedClockEvidence')) return true;
  const evidence = day.publishedClockEvidence;
  // The canonical normalizer preserves pre-dedup evidence. Accept its ordinary
  // single record only when it matches the complete selected publication; never
  // discard records or clocks erased by physical-leg selection/deduplication.
  const fields = ['dutyReport', 'dutyDebrief', 'dutyReportSource', 'dutyDebriefSource'];
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)
    || Object.keys(evidence).some(key => ![...fields, 'legs'].includes(key))
    || fields.some(key => evidence[key] !== day[key])
    || !Array.isArray(evidence.legs) || evidence.legs.length !== day.legs.length) return false;
  const clocks = ['departureTime', 'arrivalTime', 'presentationTime'];
  if (evidence.legs.some((leg: any) => !leg || typeof leg !== 'object' || Array.isArray(leg)
    || Object.keys(leg).some(key => !clocks.includes(key)))) return false;
  const keys = (legs: any[]) => legs.map(leg => JSON.stringify(clocks.map(key => leg[key] ?? null))).sort();
  const original = keys(evidence.legs), selected = keys(day.legs);
  return new Set(original).size === original.length && original.every((key, i) => key === selected[i]);
}
function completeDay(day: any): boolean {
  const m = typeof day?.date === 'string' ? day.date.match(/^(\d\d)\/(\d\d)\/(\d{4})$/) : null;
  if (!m) return false;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  if (!safeDate(iso + 'T12:00:00.000Z')) return false;
  if (day.year !== Number(m[3]) || day.month !== Number(m[2]) || (day.dayNumber != null && day.dayNumber !== Number(m[1]))) return false;
  if (!Array.isArray(day.legs) || day.legs.length > 12 || !ordinaryClockEvidence(day)) return false;
  // Explicit multi-day markers and preserved duplicate publications need the
  // fuller domain evidence reader before this small browser slice accepts them.
  if (new Set(day.legs.map((leg: any) => JSON.stringify([leg?.flightNumber, leg?.origin, leg?.destination, leg?.departureTime]))).size !== day.legs.length) return false;
  return [day, ...day.legs].every(row => row && typeof row === 'object' && !Array.isArray(row)
    && (row.status == null || String(row.status).trim().toLowerCase() === 'confirmed')
    && (row.isNextDay == null || typeof row.isNextDay === 'boolean')
    && (row.arrivalDayOffset == null || (Number.isInteger(row.arrivalDayOffset) && row.arrivalDayOffset >= 0 && row.arrivalDayOffset <= 1))
    && ['presentationTimeSource', 'departureTimeSource', 'arrivalTimeSource'].every(key => row[key] == null || row[key] === 'published')
    && ['dutyReport', 'dutyDebrief', 'presentationTime', 'departureTime', 'arrivalTime'].every(key => !String(row[key] || '').includes('(+')));
}

/** Client-only, read-only capability. No network/provider, persistence, timer,
 * singleton conversation, server import or implicit roster restoration.
 * The host must clear rendered replies/context on auth/selection lifecycle.
 */
export function createLocalCrewcierge(options: LocalCrewciergeOptions) {
  return async (text: string, previous?: LocalCrewciergeContext) => {
    const request = classifyConversation(text);
    if (request.kind === 'unsupported') return unknown();
    if (request.kind === 'clarify') return { state: 'clarification' as const, facts: [] as Fact[], reply: request.reply };
    try {
      const initial = options.identity();
      const identity = initial ? { owner: initial.owner, sessionEpoch: initial.sessionEpoch } : null;
      const now = (options.now || Date.now)();
      if (!identity || !validId(identity.owner) || !validId(identity.sessionEpoch) || !Number.isFinite(now)) return unavailable();
      const raw = options.readSnapshot(identity.owner);
      if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > 256_000) return unavailable();
      const snapshot = JSON.parse(raw);
      if (snapshot?.version !== 1 || snapshot.kind !== 'locally-selected-roster' || snapshot.owner !== identity.owner
        || !validId(snapshot.revision) || !safeDate(snapshot.capturedAt) || injected(snapshot)) return unavailable();
      const capturedAt = Date.parse(snapshot.capturedAt);
      // Saved publication, not live operational truth. Seven-day upper bound
      // is conservative pilot policy, never a claim that status is current.
      if (capturedAt > now || now - capturedAt > 7 * 24 * 60 * 60_000) return unavailable();
      const roster: CrewRoster = snapshot.roster;
      if (!Array.isArray(roster?.days) || roster.days.length > 370 || !roster.days.every(completeDay)
        || new Set(roster.days.map(day => day.date)).size !== roster.days.length) return unavailable();
      const bytes = new TextEncoder().encode(JSON.stringify(roster));
      const contentHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(v => v.toString(16).padStart(2, '0')).join('');
      const binding = Object.freeze({ owner: identity.owner, sessionEpoch: identity.sessionEpoch, revision: snapshot.revision, contentHash });
      const current = () => {
        const active = options.identity();
        return active?.owner === binding.owner && active.sessionEpoch === binding.sessionEpoch && options.isCurrent(binding) === true;
      };
      if (!current()) return unavailable();
      let intent: ConversationIntent;
      if (request.kind === 'continuation') {
        if (!previous || previous.intent !== 'nextDuty.read' || !Number.isFinite(previous.expiresAt) || previous.expiresAt <= now
          || Object.entries(binding).some(([key, value]) => previous[key as keyof LocalCrewciergeBinding] !== value)) {
          return { state: 'clarification' as const, facts: [] as Fact[], reply: 'Qual programação? Não há contexto válido desta conta, sessão e revisão. Você pode perguntar pela próxima jornada.' };
        }
        intent = previous.intent;
      } else intent = request.intent;
      const events = buildCanonicalRosterEvents(roster);
      const journeys = new Map<string, string>();
      for (const event of events) if (['flight', 'duty'].includes(event.kind)) journeys.set(event.journeyId, event.id);
      const facts: Fact[] = [];
      for (const id of journeys.values()) {
        const measured = measureCanonicalDuty(events, id);
        const endpoints = publishedDutyEndpoints(events, id);
        if (measured?.state !== 'available' || measured.minutes === null || endpoints.start === null || endpoints.end === null) return unavailable();
        if (endpoints.end > now) facts.push({ start: endpoints.start, end: endpoints.end, minutes: measured.minutes });
      }
      facts.sort((a, b) => a.start - b.start);
      const deliveredAt = (options.now || Date.now)();
      if (!current() || !Number.isFinite(deliveredAt) || deliveredAt < now || deliveredAt - capturedAt > 7 * 24 * 60 * 60_000
        || (request.kind === 'continuation' && deliveredAt >= previous!.expiresAt)) return unavailable();
      const remaining = facts.filter(fact => fact.end > deliveredAt);
      if (remaining.filter(fact => fact.start <= deliveredAt).length > 1
        || remaining.some((fact, i) => i > 0 && (fact.start === remaining[i - 1].start || fact.start < remaining[i - 1].end))) {
        return { state: 'clarification' as const, facts: [] as Fact[], reply: 'A programação salva está ambígua: há jornadas sobrepostas ou com o mesmo início. Confira a escala publicada e faça uma nova consulta.' };
      }
      const selected = remaining.slice(0, intent === 'nextDuty.read' ? 1 : 3);
      const selectionKey = JSON.stringify(selected);
      if (request.kind === 'continuation' && previous!.selectionKey !== selectionKey) return { state: 'clarification' as const, facts: [] as Fact[], reply: 'A programação pertinente mudou com o horário. Pergunte novamente pela próxima jornada.' };
      const format = (time: number) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(time);
      const context: LocalCrewciergeContext = { ...binding, intent, selectionKey, expiresAt: Math.min(deliveredAt + 120_000, capturedAt + 7 * 24 * 60 * 60_000) };
      return { state: selected.length ? 'available' as const : 'no_data' as const, facts: selected, context,
        reply: [intent === 'nextDuty.read' ? 'Próxima programação salva:' : 'Resumo da escala salva:',
          ...selected.map(f => `Apresentação publicada: ${format(f.start)}; liberação publicada: ${format(f.end)}; duração publicada: ${f.minutes} min.`),
          selected.length ? '' : 'Nenhuma programação comprovada encontrada; dados ausentes não são zero.',
          facts.length > selected.length && intent === 'schedule.read' ? 'Resumo parcial: até três programações.' : '',
          `Fonte: escala selecionada e salva neste dispositivo. Revisão de conteúdo: ${contentHash.slice(0, 12)}.`,
          `Cache capturado: ${snapshot.capturedAt}; consulta: ${new Date(deliveredAt).toISOString()}.`,
          'Dados salvos, sem consulta à escala ativa ou confirmação de execução/repouso/conformidade. Local da apresentação não comprovado; não confirma APZ do hotel ou saída da van.',
          'Fuso do leitor: America/Sao_Paulo, BRT (UTC−03:00); fuso original do documento não comprovado.',
          'Portão, status e meteorologia não foram consultados; cache desses campos não é informação ao vivo.',
        ].filter(Boolean).join('\n') };
    } catch { return unavailable(); }
  };
}
