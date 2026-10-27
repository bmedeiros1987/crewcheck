export const CREWCHECK_PUSH_ENABLED = false;
export function validPushEnvelope(value) {
  const gate = value && (Object.hasOwn(value, 'authorityEpoch') || Object.hasOwn(value, 'topicRevision') || (typeof value.eventKey === 'string' && value.eventKey.startsWith('gate-change-v1:')));
  if (gate && (Object.keys(value).length !== 9 || !/^[A-Za-z0-9_-]{8,160}$/.test(value.authorityEpoch || '') || typeof value.authorityEpoch !== 'string' || !Number.isSafeInteger(value.topicRevision) || value.topicRevision < 1 || !/^gate-change-v1:[a-f0-9]{64}$/.test(value.eventKey || ''))) return false;
  return Boolean(value && value.schema === 'crewcheck-notice-v1' && ['installationId','ownerId','eventKey'].every(key => typeof value[key] === 'string' && value[key].length >= 8 && value[key].length <= 160) && Number.isSafeInteger(value.consentRevision) && value.consentRevision > 0 && Number.isFinite(Date.parse(value.expiresAt)) && value.route === '/app');
}
export function pushEventKey(ownerId, eventKey, installationId, consentRevision) {
  return JSON.stringify([ownerId, eventKey, installationId, consentRevision]);
}
