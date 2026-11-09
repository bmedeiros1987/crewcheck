import { createHmac, timingSafeEqual } from 'node:crypto';

const equal = (a, b) => {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

export function verifyInfobipBasic(rawHeaders, username, password) {
  if (!Array.isArray(rawHeaders) || rawHeaders.length % 2 ||
      typeof username !== 'string' || !username || /[:\r\n]/.test(username) ||
      typeof password !== 'string' || password.length < 32 || /[\r\n]/.test(password)) return false;
  const values = [];
  for (let i = 0; i < rawHeaders.length; i += 2) {
    if (String(rawHeaders[i]).toLowerCase() === 'authorization') values.push(rawHeaders[i + 1]);
  }
  return values.length === 1 && typeof values[0] === 'string' &&
    equal(values[0], `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`);
}

// Support ticket 5517884, 2026-10-21: SHA256=<64 hex>, case-insensitive.
// Header names are unsigned. Refuse ambiguity rather than combine duplicates.
function signature(rawHeaders) {
  if (!Array.isArray(rawHeaders) || rawHeaders.length % 2) return null;
  const values = [];
  for (let i = 0; i < rawHeaders.length; i += 2) {
    if (typeof rawHeaders[i] !== 'string') return null;
    if (rawHeaders[i].toLowerCase() === 'x-hub-signature') values.push(rawHeaders[i + 1]);
  }
  if (values.length !== 1 || typeof values[0] !== 'string') return null;
  return /^sha256=([a-f0-9]{64})$/i.exec(values[0])?.[1] || null;
}

export function verifyInfobipHmac(rawHeaders, rawBody, secretKey) {
  if (typeof secretKey !== 'string' || !secretKey.length || !Buffer.isBuffer(rawBody) || rawBody.length > 65_536) return false;
  const hex = signature(rawHeaders);
  if (!hex) return false;
  // Literal UTF-8, no trim/normalization/hex/base64 decoding. Never parse first.
  const expected = createHmac('sha256', Buffer.from(secretKey, 'utf8')).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(hex, 'hex'));
}

// Explicit policy, never sniff headers or fall back between authentication modes.
// Capture primitive values once so caller mutation cannot rotate a live policy.
export function createInfobipWebhookAuthenticator(configuration) {
  if (!configuration || typeof configuration !== 'object') throw Error('INFOBIP_AUTH_CONFIGURATION');
  if (configuration.mode === 'basic') {
    const {username, password} = configuration;
    const example = ['Authorization', `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`];
    if (!verifyInfobipBasic(example, username, password)) throw Error('INFOBIP_AUTH_CONFIGURATION');
    return Object.freeze({mode: 'basic', acceptsHeaders: rawHeaders => verifyInfobipBasic(rawHeaders, username, password),
      verify: rawHeaders => verifyInfobipBasic(rawHeaders, username, password)});
  }
  if (configuration.mode === 'hmac-sha256') {
    const {secretKey} = configuration;
    if (typeof secretKey !== 'string' || !secretKey.length) throw Error('INFOBIP_AUTH_CONFIGURATION');
    return Object.freeze({mode: 'hmac-sha256', acceptsHeaders: rawHeaders => signature(rawHeaders) !== null,
      verify: (rawHeaders, rawBody) => verifyInfobipHmac(rawHeaders, rawBody, secretKey)});
  }
  throw Error('INFOBIP_AUTH_CONFIGURATION');
}
