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

  // Referência explícita ao produto sempre ganha, desde que um tier válido tenha sido detectado.
  if (/\b(wellhub|gympass)\b/i.test(raw)) return true;

  // Não sequestra frases sobre plano de saúde, celular, internet etc. só porque o nome
  // do plano também é "Silver" ou "Gold".
  if (OTHER_PLAN_CONTEXT.test(raw)) return false;

  const planOnly = new RegExp(`^${WELLHUB_PLAN_TOKEN}[.!]?$`, 'i');
  if (planOnly.test(raw)) return true;

  // Gramática natural curta aceita pelo Concierge quando o assunto é inequívoco.
  // Exemplos: "meu plano é Silver+", "uso Gold", "tenho Basic+".
  const natural = new RegExp(
    `^(?:meu\\s+plano\\s+(?:é|e|eh)\\s+(?:o\\s+)?|uso\\s+(?:(?:o\\s+)?plano\\s+)?|tenho\\s+(?:(?:o\\s+)?plano\\s+)?|estou\\s+no\\s+plano\\s+)${WELLHUB_PLAN_TOKEN}[.!]?$`,
    'i',
  );
  return natural.test(raw);
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
