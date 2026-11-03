import crypto from 'node:crypto';

const PROOF = 'crewcheckServerProof';
const CONTEXT_KEYS = ['crewcheck', 'crewcheckPeriodKey', 'crewcheckEventKey'];

export class CalendarProvenanceError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function deny() {
  throw new CalendarProvenanceError(409, 'GOOGLE_EVENT_PROVENANCE_REQUIRED',
    'Este evento não tem comprovação segura desta conexão CrewCheck. Eventos pessoais ou antigos foram preservados; nenhuma adoção automática será feita.');
}

function privateContext(event) {
  const props = event?.extendedProperties?.private;
  if (!props || props.crewcheck !== 'true') deny();
  for (const key of CONTEXT_KEYS.slice(1)) {
    if (typeof props[key] !== 'string' || !props[key].trim() || props[key].length > 1024) deny();
  }
  return props;
}

function signature(event, binding) {
  const props = privateContext(event);
  // Bind to the actual authorization grant, not a caller-supplied Google account.
  // Access-token refresh preserves refresh_token; a new grant fails closed.
  if (!binding.secret || !binding.userKey || !binding.refreshToken || !binding.calendarId || !event.id) deny();
  return crypto.createHmac('sha256', binding.secret)
    .update(JSON.stringify(['crewcheck-calendar-event-v1', binding.userKey,
      binding.refreshToken, binding.calendarId, event.id, ...CONTEXT_KEYS.map((key) => props[key])]))
    .digest('base64url');
}

export function stampCreatedEvent(input, binding) {
  privateContext(input);
  // Never sign a client-selected existing ID, iCalUID or imported resource.
  const { id: _id, iCalUID: _uid, ...event } = input;
  event.id = crypto.randomBytes(20).toString('hex'); // Google base32hex-compatible.
  event.extendedProperties = { ...event.extendedProperties, private: { ...event.extendedProperties.private } };
  event.extendedProperties.private[PROOF] = `v1.${signature(event, binding)}`;
  return event;
}

export function assertEventProvenance(event, eventId, binding) {
  if (!event || event.id !== eventId || event.status === 'cancelled') deny();
  const proof = privateContext(event)[PROOF];
  const expected = `v1.${signature(event, binding)}`;
  if (typeof proof !== 'string' || !/^v1\.[A-Za-z0-9_-]{43}$/.test(proof)
    || !crypto.timingSafeEqual(Buffer.from(proof), Buffer.from(expected))) deny();
  if (typeof event.etag !== 'string' || !/^"[^"\r\n]+"$/.test(event.etag)) deny();
}

export function preservePatchProvenance(patch, event) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) deny();
  if ('id' in patch || 'iCalUID' in patch) deny();
  if ('extendedProperties' in patch) {
    const incoming = patch.extendedProperties?.private;
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) deny();
    for (const key of [...CONTEXT_KEYS, PROOF]) {
      if (key in incoming && incoming[key] !== event.extendedProperties.private[key]) deny();
    }
    return { ...patch, extendedProperties: { ...patch.extendedProperties,
      private: { ...incoming, ...Object.fromEntries([...CONTEXT_KEYS, PROOF].map((key) => [key, event.extendedProperties.private[key]])) } } };
  }
  return patch;
}
