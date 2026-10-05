import { buildProgramSummary } from '../v1404/telegram-language.mjs';
import { conciergeFormatTextV14354 } from '../v14354/concierge-language.mjs';
import {
  normalizeElevenLabsVoiceProfileV14348,
  publicElevenLabsVoiceCatalogV14348,
  resolveElevenLabsVoiceV14348,
} from '../v14348/elevenlabs-voice-policy.mjs';

const HUMOR_COOLDOWN_MS = 12 * 60 * 60 * 1000;

export function normalizeConciergeMode(value) {
  const normalized = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  return ['comic', 'comico', 'humor', 'leve'].includes(normalized) ? 'comic' : 'formal';
}

export function normalizeConciergeVoiceProfile(value) {
  return normalizeElevenLabsVoiceProfileV14348(value);
}

export function conciergeVoiceCatalog(env = process.env) {
  return publicElevenLabsVoiceCatalogV14348(env).map(({ id, label }) => {
    const voice = resolveElevenLabsVoiceV14348(id, env);
    return { id, label, voiceId: voice.voiceId, available: voice.configured };
  });
}

export function publicConciergeVoiceCatalog(env = process.env) {
  return publicElevenLabsVoiceCatalogV14348(env);
}

export function conciergeVoiceIdForPreferences(preferences = {}, env = process.env) {
  const profile = normalizeConciergeVoiceProfile(preferences);
  const catalog = conciergeVoiceCatalog(env);
  return catalog.find((item) => item.id === profile)?.voiceId
    || resolveElevenLabsVoiceV14348('default', env).voiceId;
}

export function normalizeConciergePreferences(input = {}, previous = {}, env = process.env) {
  const mode = normalizeConciergeMode(input.mode ?? input.personalityMode ?? previous.mode ?? previous.personalityMode);
  const requestedVoice = normalizeConciergeVoiceProfile(input.voiceProfile ?? previous.voiceProfile);
  const catalog = conciergeVoiceCatalog(env);
  const voiceProfile = catalog.some((item) => item.id === requestedVoice) ? requestedVoice : 'default';
  return {
    ...previous,
    ...input,
    mode,
    personalityMode: mode,
    voiceProfile,
  };
}

export function conciergeFrequentDestination(roster = {}) {
  const counts = new Map();
  for (const day of Array.isArray(roster?.days) ? roster.days : []) {
    for (const leg of Array.isArray(day?.legs) ? day.legs : []) {
      const destination = String(leg?.destination || '').trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(destination)) continue;
      counts.set(destination, (counts.get(destination) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || '';
}

export function conciergeHumorEligible(reply = '') {
  const text = String(reply || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (!text.trim() || text.includes('?')) return false;
  return !/(nao identifiquei|nao entendi|aguardando configuracao|nenhuma programacao|alerta|critico|procediment|portas|nao posso|nao tenho acesso|nao consigo|sem dados|falha|erro|emergencia|hospital|pronto atendimento|farmacia|medic|rbac|regulament|irregular|conformidade|seguranca|cancelad|desviad|atrasad|portao|status|radar|metar|taf|tempo severo|saida recomendada|saia de casa|rota|localizacao|expirou|nao encontrei|nao consegui|indisponivel|confirme imediatamente)/i.test(text);
}

// Only the current response's unique canonical program may supply a joke.
// Monthly frequency, old conversation context and base are not live location.
export function conciergeHumorContext(reply = '', { roster = {}, records = [] } = {}) {
  const base = String(roster?.base || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(base) || !Array.isArray(records)) return null;
  const flights = [...String(reply).matchAll(/\b((?:[A-Z][A-Z0-9]|[0-9][A-Z])\d{2,6})\b/g)].map((match) => match[1]);
  if (!flights.length) return null;
  const matches = records.filter((record) => {
    const legs = record?.legs;
    if (!Array.isArray(legs) || legs.length !== flights.length) return false;
    if (!record.start || !record.end || !Number.isFinite(new Date(record.start).getTime()) || !Number.isFinite(new Date(record.end).getTime())
      || new Date(record.end) < new Date(record.start)) return false;
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(record.start));
    const [year, month, day] = date.split('-');
    const explicitDates = [...String(reply).matchAll(/\b(?:\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}(?:\/\d{4})?)\b/g)].map((match) => match[0]);
    if (explicitDates.some((value) => ![date, `${day}/${month}`, `${day}/${month}/${year}`].includes(value))) return false;
    return legs.every((leg, index) => {
      const flight = String(leg?.flightNumber || '').trim().toUpperCase().replace(/\s+/g, '');
      const line = String(reply).split('\n').find((value) => value.includes(`${flight}:`) || value.includes(`${flight} ·`)) || '';
      // Reuse the current renderer: canonical preparation can expand airport
      // names (e.g. Guarulhos to São Paulo — Guarulhos). No parallel catalog.
      const expectedLine = buildProgramSummary({ record: { ...record, legs: [leg] }, includeGreeting: false }).split('\n').at(-1);
      const numericLine = conciergeFormatTextV14354(line);
      const departureIndex = numericLine.indexOf(String(leg.departureTime));
      const arrivalIndex = numericLine.indexOf(String(leg.arrivalTime), departureIndex + String(leg.departureTime).length);
      const routeMatches = (line.includes(`${leg.origin} → ${leg.destination}`) && departureIndex >= 0 && arrivalIndex > departureIndex)
        || numericLine === conciergeFormatTextV14354(expectedLine);
      return routeMatches && flight === flights[index]
        && /^[A-Z]{3}$/.test(String(leg.origin || '')) && /^[A-Z]{3}$/.test(String(leg.destination || ''))
        && (!index || legs[index - 1].destination === leg.origin)
        && ['departureTime', 'arrivalTime'].every((key) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(leg[key] || '')) && conciergeFormatTextV14354(line).includes(leg[key]));
    });
  });
  if (matches.length !== 1) return null;
  const legs = matches[0].legs;
  const origin = legs[0].origin;
  const destination = legs.at(-1).destination;
  const kind = destination === base ? 'return' : origin === base ? 'start'
    : legs.some((leg) => leg.destination === base) ? 'transit' : 'away';
  return { base, origin, destination, kind };
}

export function conciergeHumorSensitive(query = '', reply = '') {
  const text = `${query} ${reply}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  // Suppression is transient and deliberately conservative, including quoted or
  // negated mentions. This never diagnoses grief or stores sensitive state.
  return /\b(luto|falec\w*|morreu|morte|velorio|funeral|silencio|silencioso|discreto|serio|seriedade|sofr\w*|triste\w*|doente|doenca|saude|acidente|emergencia|urgente|risco|seguranca|rbac|regulament\w*|conformidade|limite|atras\w*|cancel\w*|desvio|portao|radar|metar|taf|atis|hospital|medic\w*|farmacia|dor|cansad\w*|exaust\w*|assedio|demissao|pagamento|cobranca|divida|dinheiro|ansiedade|depress\w*|suicid\w*|trauma|violencia|panico|meteorologia|tempestade|erro|falha)\b|(?:sem|nao.*|pare de)\s+(?:piadas?|brinc\w*|humor)|nao (?:quero|estou para|tenho vontade de) (?:conversa|conversar|papo)|(?:ficar|estar|deixe-me|me deixe) quiet[oa]|nao estou bem|perdi (?:meu|minha|um|uma)|a confirmar|nao (?:esta |foi |e )?confirmad/i.test(text);
}

function humorVariants({ base, origin, destination, kind }) {
  const variants = {
    return: [
      `A programação termina na sua base, ${base}. A base ficou com os créditos finais.`,
      `${base} fecha essa programação. A base fez questão da última palavra.`,
    ],
    start: [
      `${base} abre essa programação. A base ficou com os créditos de abertura.`,
      `A programação começa na sua base, ${base}. O primeiro capítulo já tem endereço.`,
    ],
    transit: [
      `${base} aparece no meio dessa programação. Participação especial da base.`,
      `Tem passagem por ${base} no roteiro. A base fez uma ponta nessa programação.`,
    ],
    away: [
      `${origin} → ${destination} nessa programação. A escala trouxe o roteiro; eu fico com as legendas.`,
      `${destination} fecha essa programação. Pelo menos o roteiro coube no resumo.`,
    ],
  };
  return variants[kind].map((text, index) => ({ key: `${base}-${kind}-${index}`, text }));
}

export function decorateConciergeReply(reply, { preferences = {}, roster = {}, records = [], query = '', intent = '', suppressHumor = false, now = new Date(), random = Math.random } = {}) {
  const original = String(reply || '').trim();
  const mode = normalizeConciergeMode(preferences.mode ?? preferences.personalityMode);
  if (mode !== 'comic' || suppressHumor || !['next', 'schedule_date', 'next_after_context', 'summary'].includes(intent) || conciergeHumorSensitive(query, original) || !conciergeHumorEligible(original)) return { reply: original, humorApplied: false, humorKey: '' };
  const lastAt = new Date(preferences.lastHumorAt || 0).getTime();
  const current = new Date(now).getTime();
  if (!Number.isFinite(current)) return { reply: original, humorApplied: false, humorKey: '' };
  if (Number.isFinite(lastAt) && current - lastAt < HUMOR_COOLDOWN_MS) return { reply: original, humorApplied: false, humorKey: '' };
  const chance = Number(random());
  if (!Number.isFinite(chance) || chance > 0.34) return { reply: original, humorApplied: false, humorKey: '' };
  const context = conciergeHumorContext(original, { roster, records });
  if (!context) return { reply: original, humorApplied: false, humorKey: '' };
  const candidates = humorVariants(context).filter((item) => item.key !== preferences.lastHumorKey);
  if (!candidates.length) return { reply: original, humorApplied: false, humorKey: '' };
  const indexSeed = Math.max(0, Math.min(0.999999, Number(random()) || 0));
  const selected = candidates[Math.floor(indexSeed * candidates.length)] || candidates[0];
  return {
    reply: `${original}\n\nNota leve: ${selected.text}`,
    humorApplied: true,
    humorKey: selected.key,
    destination: context.destination,
  };
}

export const CONCIERGE_HUMOR_COOLDOWN_MS = HUMOR_COOLDOWN_MS;

