import { detectWellhubActivityFromText, detectWellhubPlanFromText } from '../v14407/wellhub.mjs';

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const WELLHUB_PLAN_TOKEN = '(?:digital|starter|basic(?:\\+|\\s+plus)?|silver(?:\\+|\\s+plus)?|gold(?:\\+|\\s+plus)?|platinum|diamond(?:\\+|\\s+plus)?)';
const OTHER_PLAN_CONTEXT = /\b(?:plano\s+(?:de\s+)?(?:sa[uú]de|m[eé]dico|odontol[oó]gico|celular|telefone|telefonia|internet|dados|operadora|seguro|cart[aã]o|streaming)|amil|unimed|bradesco\s+sa[uú]de|sulamerica\s+sa[uú]de|sulamerica\s+saude)\b/i;
const NON_GYM_ACTIVITY_CONTEXT = /\b(?:aeroporto|voo|port[aã]o|escala|sa[ií]da|hotel|uber|carro|tr[aâ]nsito)\b/i;

// Keep the boundary vocabulary aligned with the aliases accepted by the v14.4.07
// detector, but re-check them as whole normalized phrases before a detected value is
// allowed to mutate Concierge state. The upstream detector intentionally does broad
// substring discovery for search; preference writes need stronger evidence.
const WELLHUB_ACTIVITY_ALIAS_PHRASES = [
  'musculacao', 'musculação', 'treino de forca', 'treino de força', 'bodybuilding', 'fisiculturismo',
  'hiit', 'pilates', 'yoga', 'zumba', 'jump', 'step', 'pump', 'funcional', 'circuito funcional', 'circuitos funcionais',
  'spinning', 'bike', 'cycling', 'power bike', 'danca', 'dança', 'fit dance', 'fitness dance', 'danca de salao', 'dança de salão',
  'luta', 'fight', 'artes marciais', 'boxe', 'jiu jitsu', 'jiu-jitsu', 'muay thai', 'cardio', 'abdominal', 'abd', 'gap',
  'regeneracao', 'regeneração', 'treino hibrido', 'treino híbrido', 'personal', 'alongamento', 'natacao', 'natação',
  'crossfit', 'corrida',
];

function containsWholeNormalizedPhrase(text = '', phrase = '') {
  const haystack = ` ${normalize(text)} `;
  const needle = normalize(phrase);
  return Boolean(needle && haystack.includes(` ${needle} `));
}

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

function isRecognizedWellhubActivity(raw = '', detected = '') {
  const expected = normalize(detected);
  if (!expected) return false;
  return WELLHUB_ACTIVITY_ALIAS_PHRASES.some((alias) => {
    if (!containsWholeNormalizedPhrase(raw, alias)) return false;
    return normalize(detectWellhubActivityFromText(alias)) === expected;
  });
}

export function isWellhubActivityPreferenceMessage(text = '') {
  const raw = String(text || '').trim();
  const detected = detectWellhubActivityFromText(raw);
  if (!detected || NON_GYM_ACTIVITY_CONTEXT.test(raw)) return false;
  if (/smart\s*fit/i.test(raw) && !/\b(wellhub|gympass)\b/i.test(raw)) return false;

  // O detector aceita atividade/modalidade customizada. Para não transformar
  // frases genéricas como "atividade da empresa" em preferência de academia,
  // atividade customizada só é aceita quando o usuário a ancora explicitamente
  // ao produto Wellhub/Gympass. Atividades conhecidas podem usar a gramática
  // natural curta anunciada pelo Concierge ("quero Pilates", "modalidade Yoga").
  // A confirmação de atividade conhecida precisa observar o alias na mensagem
  // original com fronteira de frase; substring de palavra (personalizar/abdicar)
  // não é evidência suficiente para persistir preferência.
  const recognizedActivity = isRecognizedWellhubActivity(raw, detected);
  const explicitProductActivity = /^(?:(?:wellhub|gympass)\s+(?:modalidade|atividade|aula|treino)\s*(?:é|e|eh|:|-)?\s*|(?:minha\s+)?(?:modalidade|atividade)\s+(?:do\s+)?(?:wellhub|gympass)\s*(?:é|e|eh|:|-)\s*)[\p{L}0-9 +&-]{2,60}[.!]?$/iu;
  if (explicitProductActivity.test(raw)) return true;
  if (!recognizedActivity) return false;

  if (/^(?:modalidade|atividade|aula|treino)\s+[\p{L}0-9 +&-]{2,60}[.!]?$/iu.test(raw)) return true;
  if (/\b(wellhub|gympass)\b/i.test(raw) && /\b(aula|treino|quero|prefiro|fa[cç]o|pratico|praticar|modalidade|atividade)\b/i.test(raw)) return true;
  return /^(?:quero|prefiro|fa[cç]o|pratico|praticar)\s+[\p{L}0-9 +&-]{2,40}[.!]?$/iu.test(raw);
}

export function extractWellhubLocationHintFromText(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return { city: '', state: '' };

  // Não limite a cidade por quantidade de palavras. Há municípios brasileiros
  // válidos com cinco ou mais tokens (ex.: São José do Rio Preto). Fora de
  // `cidade`/`cidade de`, aceitamos `em` somente logo após academia(s). Isso
  // evita interpretar expressões de modalidade como `treinar em grupo` como GPS.
  const scoped = raw.match(/\b(?:cidade\s+de|cidade)\s+(.+)$/iu)
    || raw.match(/\bacademias?\s+em\s+(.+)$/iu);
  if (!scoped) return { city: '', state: '' };
  const tail = String(scoped[1] || '').trim();
  if (!tail) return { city: '', state: '' };

  const withState = tail.match(/^(.+?)\s*[\/,-]\s*([A-Za-z]{2})\b/);
  if (withState) {
    return {
      city: String(withState[1] || '').replace(/\s+/g, ' ').trim().replace(/[\/,;-]+$/g, '').trim(),
      state: String(withState[2] || '').toUpperCase(),
    };
  }

  const cityOnly = tail.match(/^(.+?)(?=\s+(?:perto|pr[oó]xim[ao]|agora|hoje|com|que|para|onde)\b|[.;!?]|$)/iu);
  const city = String(cityOnly?.[1] || '').replace(/\s+/g, ' ').trim().replace(/[\/,;-]+$/g, '').trim();
  return { city, state: '' };
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
