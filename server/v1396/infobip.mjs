const INFOBIP_API_KEY_ALIASES = [
  'INFOBIP_API_KEY',
  'CREWCHECK_INFOBIP_API_KEY',
];

const INFOBIP_BASE_URL_ALIASES = [
  'INFOBIP_BASE_URL',
  'INFOBIP_API_BASE_URL',
  'CREWCHECK_INFOBIP_BASE_URL',
];

const INFOBIP_FROM_ALIASES = [
  'INFOBIP_PHONE_FROM',
  'INFOBIP_FROM',
  'INFOBIP_CALLER_ID',
  'INFOBIP_VOICE_FROM',
  'CREWCHECK_INFOBIP_FROM',
];

function firstEnvironmentValue(environment, aliases) {
  for (const alias of aliases) {
    const value = String(environment?.[alias] || '').trim();
    if (value) return { value, source: alias };
  }
  return { value: '', source: '' };
}

export function normalizeInfobipBaseUrl(value = '') {
  let candidate = String(value || '').trim();
  if (!candidate) return '';
  if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' || !parsed.hostname) return '';
    return parsed.origin;
  } catch {
    return '';
  }
}

export function normalizeInfobipApiKey(value = '') {
  return String(value || '').trim().replace(/^App\s+/i, '').trim();
}

export function normalizeInfobipEndpoint(value = '') {
  const candidate = String(value || '').trim();
  if (!candidate) return '';
  if (/^[+\d\s().-]+$/.test(candidate)) return candidate.replace(/\D/g, '');
  return candidate;
}

export function normalizeInfobipVoice(value = '') {
  const candidate = String(value || '').trim();
  if (!candidate) return null;
  if (candidate.startsWith('{')) {
    try {
      const parsed = JSON.parse(candidate);
      const name = String(parsed?.name || '').trim();
      const gender = String(parsed?.gender || '').trim();
      if (!name) return null;
      return gender ? { name, gender } : { name };
    } catch {
      return { name: candidate };
    }
  }
  return { name: candidate };
}

export function normalizeInfobipLanguage(value = '') {
  const primary = String(value || 'pt').trim().toLowerCase().split(/[-_]/)[0];
  return /^[a-z]{2}$/.test(primary) ? primary : 'pt';
}

export function infobipConfiguration(environment = process.env) {
  const apiKeyEntry = firstEnvironmentValue(environment, INFOBIP_API_KEY_ALIASES);
  const baseUrlEntry = firstEnvironmentValue(environment, INFOBIP_BASE_URL_ALIASES);
  const fromEntry = firstEnvironmentValue(environment, INFOBIP_FROM_ALIASES);
  const apiKey = normalizeInfobipApiKey(apiKeyEntry.value);
  const baseUrl = normalizeInfobipBaseUrl(baseUrlEntry.value);
  const from = normalizeInfobipEndpoint(fromEntry.value);
  const missing = [];
  if (!apiKey) missing.push('INFOBIP_API_KEY');
  if (!baseUrlEntry.value) missing.push('INFOBIP_BASE_URL');
  else if (!baseUrl) missing.push('INFOBIP_BASE_URL (URL HTTPS inválida)');
  if (!from) missing.push('INFOBIP_PHONE_FROM (ou INFOBIP_FROM)');
  return {
    provider: 'infobip',
    configured: missing.length === 0,
    detected: Boolean(apiKeyEntry.value || baseUrlEntry.value || fromEntry.value),
    apiKey,
    baseUrl,
    from,
    language: normalizeInfobipLanguage(firstEnvironmentValue(environment, ['INFOBIP_VOICE_LANGUAGE', 'INFOBIP_LANGUAGE']).value),
    voice: normalizeInfobipVoice(firstEnvironmentValue(environment, ['INFOBIP_VOICE_NAME', 'INFOBIP_TTS_VOICE']).value),
    sources: {
      apiKey: apiKeyEntry.source,
      baseUrl: baseUrlEntry.source,
      from: fromEntry.source,
    },
    missing,
  };
}

export function infobipPublicStatus(environment = process.env) {
  const configuration = infobipConfiguration(environment);
  return {
    provider: configuration.provider,
    configured: configuration.configured,
    detected: configuration.detected,
    missing: configuration.missing,
    sources: configuration.sources,
  };
}

function redactInfobipDiagnostic(value = '') {
  return String(value || '')
    .replace(/\bApp\s+\S+/gi, '[credencial]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[número]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

export function infobipProviderErrorDetail(raw = '') {
  const source = String(raw || '').trim();
  if (!source) return '';
  let parsed = null;
  try { parsed = JSON.parse(source); } catch {}
  const exception = parsed?.requestError?.serviceException || parsed?.serviceException || null;
  const code = redactInfobipDiagnostic(exception?.messageId || parsed?.errorCode || parsed?.code || '');
  const description = redactInfobipDiagnostic(exception?.text || parsed?.message || parsed?.error || source);
  const validation = exception?.validationErrors || parsed?.validationErrors;
  const validationText = validation && typeof validation === 'object'
    ? redactInfobipDiagnostic(Object.entries(validation).map(([field, reason]) => `${field}: ${reason}`).join('; '))
    : '';
  return [code, description, validationText].filter(Boolean).filter((value, index, all) => all.indexOf(value) === index).join(' — ').slice(0, 320);
}

export function buildInfobipTtsRequest({ environment = process.env, phone = '', text = '' } = {}) {
  const configuration = infobipConfiguration(environment);
  if (!configuration.configured) {
    return {
      ok: false,
      configured: false,
      provider: 'infobip',
      missing: configuration.missing,
      message: `Infobip incompleta: ${configuration.missing.join(', ')}.`,
    };
  }
  const destination = normalizeInfobipEndpoint(phone || environment.CREWCHECK_ADMIN_PHONE || '');
  if (!/^\d{8,15}$/.test(destination)) {
    return {
      ok: false,
      configured: true,
      provider: 'infobip',
      message: 'Informe o telefone com DDI, usando de 8 a 15 dígitos.',
    };
  }
  const message = {
    from: configuration.from,
    destinations: [{ to: destination }],
    text: String(text || '').trim().slice(0, 240),
    language: configuration.language,
  };
  if (configuration.voice) message.voice = configuration.voice;
  return {
    ok: true,
    configured: true,
    provider: 'infobip',
    url: `${configuration.baseUrl}/tts/3/advanced`,
    headers: {
      authorization: `App ${configuration.apiKey}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: { messages: [message] },
  };
}
