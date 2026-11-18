/** One installation-wide operational contact. Not a registry or a calling service. */
export const ESCALA_CONTACT_SCHEMA = 'crewcheck.escala-contact.v1';
export const DEFAULT_ESCALA_DIAL_STRING = '01141746343';
export const ESCALA_CONTACT_READ_PATH = '/api/operational/escala-contact';
export const ESCALA_CONTACT_ADMIN_PATH = '/api/admin/escala-contact';

// Deliberately excludes service/MMI codes, URI parameters, pauses and extensions.
// This is a bounded dial-string safety check, not verification of number ownership.
export function validEscalaDialString(value) {
  return typeof value === 'string' && /^(?:[0-9]{8,15}|\+[1-9][0-9]{7,14})$/.test(value);
}
export function escalaTelUri(value) {
  return validEscalaDialString(value) ? `tel:${value}` : null;
}
export function validEscalaContact(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join(',') !== 'dialString,revision,schema,updatedAt'
      || value.schema !== ESCALA_CONTACT_SCHEMA || !validEscalaDialString(value.dialString)
      || !Number.isSafeInteger(value.revision) || value.revision < 0 || value.revision >= Number.MAX_SAFE_INTEGER) return false;
  if (value.revision === 0) return value.dialString === DEFAULT_ESCALA_DIAL_STRING && value.updatedAt === null;
  return typeof value.updatedAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.updatedAt)
    && Number.isFinite(Date.parse(value.updatedAt)) && new Date(value.updatedAt).toISOString() === value.updatedAt;
}
export function defaultEscalaContact() {
  return { schema: ESCALA_CONTACT_SCHEMA, dialString: DEFAULT_ESCALA_DIAL_STRING, revision: 0, updatedAt: null };
}
