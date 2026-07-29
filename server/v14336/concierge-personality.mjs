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
  if (!text.trim()) return false;
  return !/(emergencia|hospital|pronto atendimento|farmacia|medic|rbac|regulament|irregular|conformidade|seguranca|cancelad|desviad|atrasad|portao|status|radar|metar|taf|tempo severo|saida|rota|localizacao|expirou|nao encontrei|nao consegui|indisponivel|confirme imediatamente)/i.test(text);
}

function humorVariants(destination) {
  const code = String(destination || '').toUpperCase();
  if (code === 'MAB') return [
    { key: 'MAB-marabalas', text: 'Marabalas apareceu de novo no mapa.' },
    { key: 'MAB-figurinha', text: 'Marabá já está virando figurinha repetida.' },
  ];
  if (code === 'IMP') return [
    { key: 'IMP-imperatrevas', text: 'Imperatrevas voltou à programação — apelido leve, aeroporto confirmado como IMP.' },
    { key: 'IMP-frequente', text: 'Imperatriz já conhece essa mala de longe.' },
  ];
  if (code === 'CNF') return [
    { key: 'CNF-conflitos', text: 'Conflitos apareceu outra vez — o código operacional continua CNF.' },
    { key: 'CNF-carteirinha', text: 'Confins já pode separar a carteirinha de visitante frequente.' },
  ];
  if (!code) return [];
  return [
    { key: `${code}-porta-retrato`, text: `De novo para ${code}? Aproveita para trocar o porta-retrato.` },
    { key: `${code}-frequente`, text: `${code} está firme na lista de destinos frequentes.` },
  ];
}

export function decorateConciergeReply(reply, { preferences = {}, roster = {}, now = new Date(), random = Math.random } = {}) {
  const original = String(reply || '').trim();
  const mode = normalizeConciergeMode(preferences.mode ?? preferences.personalityMode);
  if (mode !== 'comic' || !conciergeHumorEligible(original)) return { reply: original, humorApplied: false, humorKey: '' };
  const lastAt = new Date(preferences.lastHumorAt || 0).getTime();
  const current = new Date(now).getTime();
  if (Number.isFinite(lastAt) && current - lastAt < HUMOR_COOLDOWN_MS) return { reply: original, humorApplied: false, humorKey: '' };
  const chance = Number(random());
  if (!Number.isFinite(chance) || chance > 0.34) return { reply: original, humorApplied: false, humorKey: '' };
  const destination = conciergeFrequentDestination(roster);
  const candidates = humorVariants(destination).filter((item) => item.key !== preferences.lastHumorKey);
  if (!candidates.length) return { reply: original, humorApplied: false, humorKey: '' };
  const indexSeed = Math.max(0, Math.min(0.999999, Number(random()) || 0));
  const selected = candidates[Math.floor(indexSeed * candidates.length)] || candidates[0];
  return {
    reply: `${original}\n\nNota leve: ${selected.text}`,
    humorApplied: true,
    humorKey: selected.key,
    destination,
  };
}

export const CONCIERGE_HUMOR_COOLDOWN_MS = HUMOR_COOLDOWN_MS;
