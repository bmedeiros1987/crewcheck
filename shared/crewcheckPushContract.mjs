export const CREWCHECK_PUSH_ENABLED = false;
export function validPushEnvelope(value) {
  return Boolean(value && value.schema === 'crewcheck-notice-v1' && ['installationId','ownerId','eventKey'].every(key => typeof value[key] === 'string' && value[key].length >= 8 && value[key].length <= 160) && Number.isSafeInteger(value.consentRevision) && value.consentRevision > 0 && Number.isFinite(Date.parse(value.expiresAt)) && value.route === '/app');
}
export function pushEventKey(ownerId, eventKey, installationId, consentRevision) {
  return JSON.stringify([ownerId, eventKey, installationId, consentRevision]);
}
