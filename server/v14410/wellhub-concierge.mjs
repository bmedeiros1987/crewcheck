import { detectWellhubPlanFromText } from '../v14407/wellhub.mjs';

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const WELLHUB_PLAN_TOKEN = '(?:digital|starter|basic(?:\\+|\\s+plus)?|silver(?:\\+|\\s+plus)?|gold(?:\\+|\\s+plus)?|platinum|diamond(?:\\+|\\s+plus)?)';
const OTHER_PLAN_CONTEXT = /\b(?:plano\s+(?:de\s+)?(?:sa[uú]de|m[eé]dico|odontol[oó]gico|celular|telefone|telefonia|internet|dados|operadora|seguro|cart[aã]o|streaming)|amil|unimed|bradesco\s+sa[uú]de|sulamerica\s+sa[uú]de|sulamerica\s+saude)\b/i;

export function isWellhubPlanPreferenceMessage(text = '') {
  const raw = String(text || '').trim();
  const detected = detectWellhubPlanFromText(raw);
  if (!detected) return false;
  if (/\b(wellhub|gympass)\b/i.test(raw)) return true;
  if (OTHER_PLAN_CONTEXT.test(raw)) return false;

  const planOnly = new RegExp(`^${WELLHUB_PLAN_TOKEN}[.!]?$`, 'i');
  if (planOnly.test(raw)) return true;

  const natural = new RegExp(
    `^(?:meu\\s+plano\\s+(?:é|e|eh)\\s+(?:o\\s+)?|uso\\s+(?:(?:o\\s+)?plano\\s+)?|tenho\\s+(?:(?:o\\s+)?plano\\s+)?|estou\\s+no\\s+plano\\s+)${WELLHUB_PLAN_TOKEN}[.!]?$`,
    'i',
  );
  return natural.test(raw);
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
    if (cityKey) return normalize(partner?.city) === cityKey;
    return normalize(partner?.state) === stateKey;
  });
}
