import { detectWellhubActivityFromText, detectWellhubPlanFromText } from '../v14407/wellhub.mjs';

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const WELLHUB_PLAN_TOKEN = '(?:digital|starter|basic(?:\\+|\\s+plus)?|silver(?:\\+|\\s+plus)?|gold(?:\\+|\\s+plus)?|platinum|diamond(?:\\+|\\s+plus)?)';
const OTHER_PLAN_CONTEXT = /\b(?:plano\s+(?:de\s+)?(?:sa[uú]de|m[eé]dico|odontol[oó]gico|celular|telefone|telefonia|internet|dados|operadora|seguro|cart[aã]o|streaming)|amil|unimed|bradesco\s+sa[uú]de|sulamerica\s+sa[uú]de|sulamerica\s+saude)\b/i;
const NON_GYM_ACTIVITY_CONTEXT = /\b(?:aeroporto|voo|port[aã]o|escala|sa[ií]da|hotel|uber|carro|tr[aâ]nsito)\b/i;

export function isWellhubPlanPreferenceMessage(text = '') {
  const raw = String(text || '').trim();
  const detected = detectWellhubPlanFromText(raw);
  if (!detected || OTHER_PLAN_CONTEXT.test(raw)) return false;

  const planOnly = new RegExp(`^${WELLHUB_PLAN_TOKEN}[.!]?$`, 'i');
  if (planOnly.test(raw)) return true;

  const natural = new RegExp(
    `^(?:meu\\s+plano\\s+(?:é|e|eh)\\s+(?:o\\s+)?|uso\\s+(?:(?:o\\s+)?plano\\s+)?|tenho\\s+(?:(?:o\\s+)?plano\\s+)?|estou\\s+no\\s+plano\\s+)${WELLHUB_PLAN_TOKEN}[.!]?$`,
    'i',
  );
  if (natural.test(raw)) return true;

  // Menção a Wellhub/Gympass, sozinha, não transforma palavras como "Gold" em
  // preferência de plano. Exige sintaxe explícita de atualização do tier.
  const explicitProductPlan = new RegExp(
    `^(?:(?:meu\\s+)?plano\\s+(?:do\\s+)?(?:wellhub|gympass)\\s*(?:é|e|eh|:|-)\\s*|(?:wellhub|gympass)\\s*(?:plano\\s+)?(?:é|e|eh|:|-)\\s*|(?:uso|tenho|estou\\s+no)\\s+(?:o\\s+)?(?:wellhub|gympass)\\s+)${WELLHUB_PLAN_TOKEN}[.!]?$`,
    'i',
  );
  return explicitProductPlan.test(raw);
}

export function isWellhubActivityPreferenceMessage(text = '') {
  const raw = String(text || '').trim();
  const detected = detectWellhubActivityFromText(raw);
  if (!detected || NON_GYM_ACTIVITY_CONTEXT.test(raw)) return false;
  if (/\b(wellhub|gympass|academias?|modalidade|atividade|aula|treino)\b/i.test(raw)) return true;
  return /^(?:quero|prefiro|fa[cç]o|pratico|praticar)\s+[\p{L}0-9 +&-]{2,40}[.!]?$/iu.test(raw);
}

export function extractWellhubLocationHintFromText(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return { city: '', state: '' };
  const match = raw.match(/\b(?:cidade\s+de|cidade|em)\s+([\p{L}][\p{L}'’.-]*(?:\s+[\p{L}][\p{L}'’.-]*){0,3}?)(?=\s+(?:perto|pr[oó]xim[ao]|agora|hoje|com|que|para|onde)\b|[\/,.;!?]|$)/iu);
  if (!match) return { city: '', state: '' };
  const end = Number(match.index || 0) + match[0].length;
  const stateMatch = raw.slice(end).match(/^\s*[\/,-]\s*([A-Za-z]{2})\b/);
  return {
    city: String(match[1] || '').trim(),
    state: stateMatch ? String(stateMatch[1] || '').toUpperCase() : '',
  };
}

export function filterWellhubPartnersForLocation(partners = [], { city = '', state = '' } = {}) {
  const cityKey = normalize(city);
  const stateKey = normalize(state);
  if (!cityKey && !stateKey) return [...partners];
  return (partners || []).filter((partner) => {
    const partnerCity = normalize(partner?.city);
    const partnerState = normalize(partner?.state);
    if (cityKey && stateKey) return partnerCity === cityKey && partnerState === stateKey;
    if (cityKey) return partnerCity === cityKey;
    return partnerState === stateKey;
  });
}
