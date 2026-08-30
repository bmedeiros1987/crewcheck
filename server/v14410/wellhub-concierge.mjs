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

function isRecognizedWellhubActivity(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return false;
  const canonical = detectWellhubActivityFromText(raw);
  // O detector v14.4.07 também aceita texto customizado e procura aliases dentro
  // dele. Para classificar como atividade conhecida, o resultado canônico precisa
  // ser exatamente o próprio valor, não apenas um alias aninhado em outra frase.
  return Boolean(canonical && normalize(canonical) === normalize(raw));
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
  const recognizedActivity = isRecognizedWellhubActivity(detected);
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
  // válidos com cinco ou mais tokens (ex.: São José do Rio Preto). "em" só é
  // aceito quando ligado diretamente a uma intenção geográfica de academia;
  // cláusulas de modalidade como "treino em grupo" não podem substituir GPS.
  const scoped = raw.match(/\b(?:cidade\s+de|cidade)\s+(.+)$/iu)
    || raw.match(/\b(?:academias?|wellhub|gympass|treinar)\s+em\s+(.+)$/iu);
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
