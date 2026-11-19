import { NATIVE_PACKAGE, NATIVE_PROJECT, validNativeDeliveryId } from './registry.mjs';

export const NATIVE_SENDER_ENABLED = false;
const FCM_SEND_URL = `https://fcm.googleapis.com/v1/projects/${NATIVE_PROJECT}/messages:send`;
const MESSAGE_NAME_PREFIX = `projects/${NATIVE_PROJECT}/messages/`;
const DEFINITE_REJECTIONS = new Set([400, 401, 403, 404]);
const result = state => ({ enabled: state !== 'disabled', state, providerAccepted: state === 'accepted_unconfirmed', received: null });

function validDelivery(delivery, id) {
  return delivery?.id === id && delivery.project === NATIVE_PROJECT && delivery.package === NATIVE_PACKAGE
    && typeof delivery.token === 'string' && /^[^\x00-\x20\x7f]{20,4096}$/.test(delivery.token)
    && Number.isSafeInteger(delivery.scheduledAt) && Number.isSafeInteger(delivery.expiresAt)
    && delivery.scheduledAt < delivery.expiresAt;
}

function deliveryWindow(delivery, now) {
  if (!Number.isSafeInteger(now)) return { state: 'blocked' };
  if (now < delivery.scheduledAt) return { state: 'not_due' };
  const ttl = Math.min(Math.floor((delivery.expiresAt - now) / 1000), 86400);
  return ttl > 0 ? { ttl } : { state: 'expired' };
}

async function withinDeadline(action, signal) {
  signal.throwIfAborted();
  let abort;
  const deadline = new Promise((_, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
  });
  try { return await Promise.race([deadline, action()]); }
  finally { signal.removeEventListener('abort', abort); }
}

/** The queue issues random opaque UUIDs and must durably admit one attempt per event/installation,
 * revalidate owner, consent, generation and token under its dispatch lock, and
 * await the callback while holding that authority. An uncertain attempt must
 * never become eligible again. This module does not supply a live queue adapter,
 * OAuth identity, or a default network client. It is not an HTTP send route.
 */
export function createNativePushSender({ enabled = NATIVE_SENDER_ENABLED, withAuthorizedDelivery,
  getAccessToken, request, clock = Date.now, timeoutMs = 5000 } = {}) {
  return async deliveryId => {
    if (enabled !== true) return result('disabled');
    if ([withAuthorizedDelivery, getAccessToken, request, clock].some(fn => typeof fn !== 'function')
      || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5000) return result('unconfigured');
    if (!validNativeDeliveryId(deliveryId)) return result('blocked');

    let entered = false, closed = false, attempted = false, outcome = result('blocked');
    try {
      await withAuthorizedDelivery(deliveryId, async candidate => {
        if (entered || closed) return result('blocked');
        entered = true;
        // Take only validated primitives across the OAuth wait. An adapter's
        // returned object can be reused for a later binding or token rotation.
        const delivery = candidate && {
          id: candidate.id, project: candidate.project, package: candidate.package,
          token: candidate.token, scheduledAt: candidate.scheduledAt, expiresAt: candidate.expiresAt,
        };
        if (!validDelivery(delivery, deliveryId)) return outcome;
        const initial = deliveryWindow(delivery, clock());
        if (initial.state) return (outcome = result(initial.state));
        const signal = AbortSignal.timeout(timeoutMs);
        try {
          const accessToken = await withinDeadline(() => getAccessToken({ signal }), signal);
          if (closed) return outcome;
          if (typeof accessToken !== 'string' || !/^[A-Za-z0-9._~+/-]{8,8192}={0,2}$/.test(accessToken)) {
            return (outcome = result('credentials_unavailable'));
          }
          const window = deliveryWindow(delivery, clock());
          if (window.state) return (outcome = result(window.state));
          const response = await withinDeadline(() => {
            attempted = true;
            return request(FCM_SEND_URL, {
              method: 'POST', redirect: 'error', signal,
              headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
              body: JSON.stringify({ message: {
                token: delivery.token,
                data: { kind: 'crewcheck-update-v1', eventId: deliveryId, expiresAt: String(delivery.expiresAt) },
                // Data-only: operation and account checks must precede display in the APK.
                android: { ttl: `${window.ttl}s`, restricted_package_name: NATIVE_PACKAGE, priority: 'normal' },
              } }),
            });
          }, signal);
          if (DEFINITE_REJECTIONS.has(response?.status)) return (outcome = result('rejected'));
          if (response?.status === 200) {
            const body = await withinDeadline(() => response.json(), signal);
            const name = body?.name;
            if (typeof name === 'string' && name.startsWith(MESSAGE_NAME_PREFIX)
              && /^[A-Za-z0-9_:%.-]{1,256}$/.test(name.slice(MESSAGE_NAME_PREFIX.length))) {
              return (outcome = result('accepted_unconfirmed'));
            }
          }
          return (outcome = result('uncertain'));
        } catch {
          return (outcome = result(attempted ? 'uncertain' : 'credentials_unavailable'));
        }
      });
      return attempted && outcome.state === 'blocked' ? result('uncertain') : outcome;
    } catch {
      // An I/O attempt may already be accepted even when the durable outcome fails.
      return result(attempted ? 'uncertain' : 'blocked');
    } finally {
      closed = true;
    }
  };
}

export const sendNativePush = createNativePushSender();
