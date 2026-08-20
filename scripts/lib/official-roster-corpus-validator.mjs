const FORBIDDEN_PATTERNS = [
  { label: 'identidade nominal rotulada', pattern: /\b(?:CREW|NAME|NOME)\s*[:=-]\s*[A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý' -]{3,}/i },
  { label: 'sequência de oito dígitos', pattern: /\b\d{8}\b/ },
  { label: 'identificador operacional', pattern: /\bAIRCOM_[A-Z0-9_]+\b/i },
  { label: 'endereço de e-mail', pattern: /@[a-z0-9.-]+\.[a-z]{2,}/i },
  { label: 'telefone brasileiro', pattern: /\+?55\s*\(?\d{2}\)?\s*\d{4,5}[-\s]?\d{4}/ },
  { label: 'designador de voo contíguo', pattern: /\bLA\d{3,4}\b/i },
];

const FORBIDDEN_IDENTITY_KEY = /(?:^|\.)(?:crewName|employeeName|employeeId|crewId|registration|matricula|userName|fullName)$/i;

// A fixture pré-parser pública deve provar uma classe de bug, não republicar
// uma escala mensal. Os limites são deliberadamente folgados para geometria
// pdfjs real, mas pequenos o bastante para rejeitar um mês operacional inteiro.
export const PREPARSER_MINIMIZATION_LIMITS = Object.freeze({
  maxBytes: 20_000,
  maxPages: 2,
  maxItems: 240,
  maxTokens: 320,
  maxOperationalDateMarkers: 6,
  maxFlightMarkers: 8,
});

const validCanonicalDate = /^\d{2}\/\d{2}\/\d{4}$/;
const aimsDateMarker = /^\d{2}(?:Jan|Feb|Mar|Apr|May|Ma|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Fev|Abr|Mai|Ago|Set|Out|Dez)$/i;
const rosterDateMarker = /^\d{2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{4}$/i;

function walk(value, visitor, keyPath = '$') {
  visitor(value, keyPath);
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visitor, `${keyPath}[${index}]`));
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => walk(item, visitor, `${keyPath}.${key}`));
  }
}

function extractPdfjsItems(fixture) {
  if (!Array.isArray(fixture?.pages)) return [];
  return fixture.pages.flatMap((page) => Array.isArray(page?.items) ? page.items : []);
}

function tokenizePdfjsItems(items) {
  return items
    .flatMap((item) => String(item?.str ?? '').split(/\s+/))
    .map((token) => token.trim())
    .filter(Boolean);
}

function countFlightMarkers(tokens) {
  let count = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = String(tokens[index]).toUpperCase();
    if (/^LA\d{3,4}$/.test(token)) {
      count += 1;
      continue;
    }
    if (token === 'LA' && /^\d{3,4}$/.test(String(tokens[index + 1] ?? ''))) count += 1;
  }
  return count;
}

function countOperationalDateMarkers(fixture, tokens) {
  let canonicalDates = 0;
  walk(fixture, (value, keyPath) => {
    if (typeof value !== 'string') return;
    if (/date|start|end|started|finished/i.test(keyPath) && validCanonicalDate.test(value)) canonicalDates += 1;
  });

  const tokenDates = tokens.filter((token) => {
    const value = String(token).trim();
    return aimsDateMarker.test(value)
      || rosterDateMarker.test(value)
      || validCanonicalDate.test(value)
      || /(?:^|\D)\d{2}\/\d{2}\/\d{4}(?:$|\D)/.test(value);
  }).length;

  return Math.max(canonicalDates, tokenDates);
}

export function validateOfficialRosterFixture({ fixture, raw, fileName = 'fixture' }) {
  const errors = [];
  const serialized = typeof raw === 'string' ? raw : JSON.stringify(fixture);

  if (!fixture || typeof fixture !== 'object' || Array.isArray(fixture)) {
    return {
      errors: [`${fileName}: raiz deve ser objeto`],
      stats: { layer: 'invalid', byteLength: Buffer.byteLength(serialized || '') },
    };
  }

  if (!/anonym/i.test(String(fixture.source ?? ''))) {
    errors.push(`${fileName}: source deve declarar anonimização`);
  }

  for (const { label, pattern } of FORBIDDEN_PATTERNS) {
    if (pattern.test(serialized)) errors.push(`${fileName}: possível dado sensível (${label})`);
  }

  let hasStructuredIdentity = false;
  walk(fixture, (value, keyPath) => {
    if (hasStructuredIdentity || !FORBIDDEN_IDENTITY_KEY.test(keyPath)) return;
    if ((typeof value === 'string' && value.trim()) || typeof value === 'number') hasStructuredIdentity = true;
  });
  if (hasStructuredIdentity) errors.push(`${fileName}: possível dado sensível (campo de identidade estruturado)`);

  const items = extractPdfjsItems(fixture);
  const tokens = tokenizePdfjsItems(items);
  const hasPagesField = Object.prototype.hasOwnProperty.call(fixture, 'pages');
  const pageCount = Array.isArray(fixture.pages) ? fixture.pages.length : 0;
  const operationalDateMarkers = countOperationalDateMarkers(fixture, tokens);
  const flightMarkers = countFlightMarkers(tokens);
  const byteLength = Buffer.byteLength(serialized);
  const layer = hasPagesField ? 'pre-parser' : 'derived';

  if (operationalDateMarkers === 0) errors.push(`${fileName}: nenhuma data operacional reconhecida`);

  if (layer === 'pre-parser') {
    if (!Array.isArray(fixture.pages) || fixture.pages.length === 0) {
      errors.push(`${fileName}: fixture pré-parser deve conter pages como array não vazio`);
    } else if (fixture.pages.some((page) => !Array.isArray(page?.items) || page.items.length === 0)) {
      errors.push(`${fileName}: cada página pré-parser deve conter items como array não vazio`);
    }
    if (fixture.privacy?.classification !== 'synthetic-minimal') {
      errors.push(`${fileName}: fixture pré-parser pública deve declarar privacy.classification=synthetic-minimal`);
    }
    if (fixture.privacy?.realIdentifiers !== false) {
      errors.push(`${fileName}: fixture pré-parser pública deve declarar privacy.realIdentifiers=false`);
    }

    const limits = PREPARSER_MINIMIZATION_LIMITS;
    if (byteLength > limits.maxBytes) errors.push(`${fileName}: fixture pré-parser excede ${limits.maxBytes} bytes`);
    if (pageCount > limits.maxPages) errors.push(`${fileName}: fixture pré-parser excede ${limits.maxPages} páginas`);
    if (items.length > limits.maxItems) errors.push(`${fileName}: fixture pré-parser excede ${limits.maxItems} itens pdfjs`);
    if (tokens.length > limits.maxTokens) errors.push(`${fileName}: fixture pré-parser excede ${limits.maxTokens} tokens`);
    if (operationalDateMarkers > limits.maxOperationalDateMarkers) {
      errors.push(`${fileName}: fixture pré-parser excede ${limits.maxOperationalDateMarkers} marcadores de data`);
    }
    if (flightMarkers > limits.maxFlightMarkers) {
      errors.push(`${fileName}: fixture pré-parser excede ${limits.maxFlightMarkers} marcadores de voo`);
    }
  }

  return {
    errors,
    stats: {
      layer,
      byteLength,
      pageCount,
      itemCount: items.length,
      tokenCount: tokens.length,
      operationalDateMarkers,
      flightMarkers,
    },
  };
}
