const SENSITIVE_KEYS = /(?:name|email|phone|cpf|document|address|location|latitude|longitude|cycle|period|menstru|fertil|ovulat|sexual|symptom|diagnos|medication|health|sleep|roster|flight|employee|registration)/i;
const SAFE_KEYS = new Set(['intent', 'locale', 'tone', 'category', 'summary', 'priority', 'riskBand', 'timeBand', 'count', 'trend', 'preference']);

export class AiPrivacyError extends Error {
  constructor(message, code = 'privacy_policy_blocked') {
    super(message);
    this.name = 'AiPrivacyError';
    this.code = code;
  }
}

function cleanText(value, maxLength) {
  return String(value ?? '')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/\b(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}\b/g, '[phone]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[document]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function sanitizeExternalAiContext(context = {}, { maxTextLength = 600 } = {}) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return {};
  const safe = {};
  for (const [key, value] of Object.entries(context)) {
    if (SENSITIVE_KEYS.test(key) || !SAFE_KEYS.has(key)) continue;
    if (typeof value === 'string') safe[key] = cleanText(value, maxTextLength);
    else if (typeof value === 'number' && Number.isFinite(value)) safe[key] = value;
    else if (typeof value === 'boolean') safe[key] = value;
  }
  return safe;
}

export function assertExternalAiAllowed(request = {}) {
  if (request.critical === true || ['roster', 'compliance', 'apz', 'regulatory'].includes(request.domain)) {
    throw new AiPrivacyError('Critical operational decisions cannot depend on external AI.', 'critical_domain_local_only');
  }
  if (request.sensitivity === 'raw-sensitive') {
    throw new AiPrivacyError('Raw sensitive CrewLife/Fem data cannot leave the trusted boundary.');
  }
}
