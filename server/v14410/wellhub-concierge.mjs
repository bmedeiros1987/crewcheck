import { detectWellhubActivityFromText, detectWellhubPlanFromText } from '../v14407/wellhub.mjs';

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const WELLHUB_PLAN_TOKEN = '(?:digital|starter|basic(?:\\s*\\+|\\s+plus)?|silver(?:\\s*\\+|\\s+plus)?|gold(?:\\s*\\+|\\s+plus)?|platinum|diamond(?:\\s*\\+|\\s+plus)?)';
// A declaration prefix is shared with the clarification guard. A plan token
// must still consume the entire message before it can update preferences.
const WELLHUB_EXPLICIT_PLAN_PREFIX = '(?:(?:meu\\s+)?plano\\s+(?:do\\s+)?(?:wellhub|gympass)\\s*(?:(?:é|e|eh)(?:\\s+|$)|[:\\-]\\s*)|(?:wellhub|gympass)\\s*(?:plano\\s+)?(?:(?:é|e|eh)(?:\\s+|$)|[:\\-]\\s*)|(?:uso|tenho|estou\\s+no)\\s+(?:o\\s+)?(?:wellhub|gympass)\\s+)(?:o\\s+)?';
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

// Capture the requested destination tier, rather than scanning every plan word
// in the sentence ("de Gold para Basic" must save Basic). Only direct requests
// about the speaker's own or unqualified Wellhub/Gympass plan are accepted.
const WELLHUB_PLAN_CHANGE_PREFIX = `(?:por\\s+favor\\s*,?\\s*)?(?:(?:eu\\s+)?(?:quero|gostaria\\s+de|preciso(?:\\s+de)?|(?:voce\\s+)?(?:pode|poderia))\\s+)?(?:alterar|altere|altera|mudar|mude|muda|atualizar|atualize|atualiza|trocar|troque|troca)\\s+(?:(?:o\\s+)?meu\\s+plano|(?:o\\s+)?plano)\\s+(?:do\\s+)?(?:wellhub|gympass)(?=\\s|$)`;
const WELLHUB_PLAN_CHANGE_SUFFIX = '(?:\\s*,?\\s*por\\s+favor)?\\s*[.!?]*';

function parseWellhubPlanPreference(text = '') {
  const raw = String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  if (!raw || OTHER_PLAN_CONTEXT.test(raw)) return { plan: '', declaration: false };

  const change = raw.match(new RegExp(`^${WELLHUB_PLAN_CHANGE_PREFIX}([\\s\\S]*)$`, 'i'));
  if (change) {
    const target = change[1].match(new RegExp(`^(?:\\s+no\\s+crewcheck)?(?:\\s+de\\s+${WELLHUB_PLAN_TOKEN})?\\s+para\\s+(?:o\\s+)?(?:plano\\s+)?(${WELLHUB_PLAN_TOKEN})${WELLHUB_PLAN_CHANGE_SUFFIX}$`, 'i'));
    return { plan: target ? detectWellhubPlanFromText(target[1]) : '', declaration: true };
  }

  const planOnly = raw.match(new RegExp(`^(${WELLHUB_PLAN_TOKEN})[.!]?$`, 'i'));
  if (planOnly) return { plan: detectWellhubPlanFromText(planOnly[1]), declaration: false };

  const natural = raw.match(new RegExp(
    `^(?:meu\\s+plano\\s+(?:e|eh)\\s+(?:o\\s+)?|uso\\s+(?:(?:o\\s+)?plano\\s+)?|tenho\\s+(?:(?:o\\s+)?plano\\s+)?|estou\\s+no\\s+plano\\s+)(${WELLHUB_PLAN_TOKEN})[.!]?$`,
    'i',
  ));
  if (natural) return { plan: detectWellhubPlanFromText(natural[1]), declaration: false };

  const declaration = raw.match(new RegExp(`^${WELLHUB_EXPLICIT_PLAN_PREFIX}([\\s\\S]*)$`, 'i'));
  if (!declaration) return { plan: '', declaration: false };
  const target = declaration[1].match(new RegExp(`^(${WELLHUB_PLAN_TOKEN})[.!]?$`, 'i'));
  return { plan: target ? detectWellhubPlanFromText(target[1]) : '', declaration: true };
}

export function detectWellhubPlanPreferenceFromText(text = '') {
  return parseWellhubPlanPreference(text).plan;
}

export function isWellhubPlanPreferenceMessage(text = '') {
  return Boolean(detectWellhubPlanPreferenceFromText(text));
}

export function isWellhubPlanDeclarationMessage(text = '') {
  return parseWellhubPlanPreference(text).declaration;
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
  if (/\b(?:nao|se|talvez)\b/.test(normalize(raw))) return false;
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
  if (explicitProductActivity.test(raw)) {
    // A custom activity field is not permission to save a condition or another
    // person's request as this user's preference.
    return !/\b(?:para|pra|pro|quando|se|talvez|nao|dele|dela|amigo|amiga|esposa|marido|filho|filha)\b/.test(normalize(detected));
  }
  if (!recognizedActivity) return false;

  if (/^(?:modalidade|atividade|aula|treino)\s+[\p{L}0-9 +&-]{2,60}[.!]?$/iu.test(raw)) return true;
  const direct = raw.match(/^(?:(?:wellhub|gympass)\s+)?(?:quero|prefiro|fa[cç]o|pratico|praticar)\s+([\p{L}0-9 +&-]{2,60}?)(?:\s+(?:no|do)\s+(?:wellhub|gympass))?[.!]?$/iu);
  return Boolean(direct && WELLHUB_ACTIVITY_ALIAS_PHRASES.some((alias) => normalize(alias) === normalize(direct[1])));
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
