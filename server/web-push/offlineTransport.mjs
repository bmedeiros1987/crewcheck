import { CREWCHECK_PUSH_ENABLED, pushEventKey, validPushEnvelope } from '../../shared/crewcheckPushContract.mjs';
// No provider is loaded, no environment flag activates sends, and no credentials
// are read. Repository/provider are injected only by isolated regression fixtures.
export async function dispatchMockPush({ repository, mockProvider, installation, envelope, context, now }) {
  if (mockProvider?.kind !== 'isolated-web-push-mock') throw Error('Somente transporte isolado permitido.');
  const eligible = () => validPushEnvelope(envelope) && Number.isFinite(now) && Date.parse(envelope.expiresAt) > now && installation?.active === true && installation.ownerId === envelope.ownerId && installation.installationId === envelope.installationId && installation.revision === envelope.consentRevision && context?.ownerId === envelope.ownerId && context?.sourceVerified === true && context?.eligible === true && context?.consent === true;
  if (!eligible()) return { status: 'blocked', received: null };
  const key = pushEventKey(envelope.ownerId, envelope.eventKey, envelope.installationId, envelope.consentRevision);
  return repository.transaction(key, async record => {
    if (record.status) return { status: record.status, received: null };
    if (!await repository.isCurrent(installation, context)) return { status: 'revoked', received: null };
    await record.save({ status: 'dispatching', key });
    try {
      const result = await mockProvider.send(envelope);
      const status = [404, 410].includes(result.statusCode) ? 'expired_subscription' : result.accepted === true ? 'accepted_unconfirmed' : 'uncertain';
      await record.save({ status, key }); return { status, received: null };
    } catch { await record.save({ status: 'uncertain', key }); return { status: 'uncertain', received: null }; }
  });
}
export function livePushAvailability() { return { enabled: CREWCHECK_PUSH_ENABLED, configured: false, scheduled: false, received: null }; }
