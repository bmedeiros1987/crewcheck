const DEFAULT_TTL_MS = 10 * 60 * 1000;
const MAX_FILTER_KEYS = 12;
const MAX_STRING_LENGTH = 160;

const ALLOWED_INTENTS = new Set([
  'academias',
  'farmacias',
  'hospitais',
  'hoteis',
  'locais-proximos',
  'restaurantes',
  'mercados',
  'transporte',
  'saida',
]);

function safeString(value, maxLength = MAX_STRING_LENGTH) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function safeScalar(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') return safeString(value);
  return null;
}

export function normalizePendingGeographicIntent(value) {
  const intent = safeString(value, 48)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-');
  return ALLOWED_INTENTS.has(intent) ? intent : '';
}

export function sanitizePendingGeographicIntentFilters(filters = {}) {
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) return {};
  const entries = Object.entries(filters).slice(0, MAX_FILTER_KEYS);
  const result = {};
  for (const [rawKey, rawValue] of entries) {
    const key = safeString(rawKey, 48).replace(/[^a-zA-Z0-9_-]/g, '');
    if (!key) continue;
    if (Array.isArray(rawValue)) {
      const values = rawValue
        .slice(0, 8)
        .map((item) => safeScalar(item))
        .filter((item) => item !== null && item !== '');
      if (values.length) result[key] = values;
      continue;
    }
    const value = safeScalar(rawValue);
    if (value !== null && value !== '') result[key] = value;
  }
  return result;
}

export function createPendingGeographicIntent(intent, {
  filters = {},
  chatId = '',
  userId = '',
  now = new Date(),
  ttlMs = DEFAULT_TTL_MS,
} = {}) {
  const normalizedIntent = normalizePendingGeographicIntent(intent);
  if (!normalizedIntent) return null;

  const scopedChatId = safeString(chatId, 96);
  const scopedUserId = safeString(userId, 96);
  if (!scopedChatId || !scopedUserId) return null;

  const createdAt = new Date(now);
  if (!Number.isFinite(createdAt.getTime())) return null;
  const safeTtlMs = Math.max(60_000, Math.min(Number(ttlMs) || DEFAULT_TTL_MS, 30 * 60 * 1000));

  return {
    intent: normalizedIntent,
    filters: sanitizePendingGeographicIntentFilters(filters),
    chatId: scopedChatId,
    userId: scopedUserId,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + safeTtlMs).toISOString(),
  };
}

export function pendingGeographicIntentState(record, {
  chatId = '',
  userId = '',
  now = new Date(),
} = {}) {
  if (!record || typeof record !== 'object') return { status: 'missing', usable: false, intent: null };

  const intent = normalizePendingGeographicIntent(record.intent);
  const createdAt = new Date(record.createdAt || '');
  const expiresAt = new Date(record.expiresAt || '');
  const current = new Date(now);
  if (!intent || !Number.isFinite(createdAt.getTime()) || !Number.isFinite(expiresAt.getTime()) || !Number.isFinite(current.getTime())) {
    return { status: 'invalid', usable: false, intent: null };
  }

  const expectedChatId = safeString(chatId, 96);
  const expectedUserId = safeString(userId, 96);
  const recordChatId = safeString(record.chatId, 96);
  const recordUserId = safeString(record.userId, 96);

  if (!expectedChatId || !expectedUserId || !recordChatId || !recordUserId) {
    return { status: 'scope-missing', usable: false, intent: null };
  }
  if (expectedChatId !== recordChatId || expectedUserId !== recordUserId) {
    return { status: 'scope-mismatch', usable: false, intent: null };
  }
  if (current.getTime() > expiresAt.getTime()) {
    return { status: 'expired', usable: false, intent: null };
  }

  return {
    status: 'fresh',
    usable: true,
    intent: {
      intent,
      filters: sanitizePendingGeographicIntentFilters(record.filters),
      chatId: recordChatId,
      userId: recordUserId,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    },
  };
}

export function consumePendingGeographicIntent(record, options = {}) {
  const state = pendingGeographicIntentState(record, options);
  if (!state.usable) return { consumed: false, intent: null, next: null, status: state.status };
  return { consumed: true, intent: state.intent, next: null, status: 'consumed' };
}

export const PENDING_GEOGRAPHIC_INTENT_TTL_MS = DEFAULT_TTL_MS;
export const PENDING_GEOGRAPHIC_INTENTS = Object.freeze(Array.from(ALLOWED_INTENTS));
