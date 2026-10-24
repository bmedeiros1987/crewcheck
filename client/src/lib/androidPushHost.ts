import { getStoredUser, getToken } from './authClient';
import { createAndroidPushLifecycle, createAndroidRegistryProtocol, type AndroidPushHost } from './androidPushLifecycle';

// No environment or UI switch. Registry/consent authority is not integrated yet.
export const ANDROID_PUSH_REGISTRY_ENABLED = false;
const path = '/api/platform/notifications/android-installation';
export function installAndroidPushHost() {
  let protocol: ReturnType<typeof createAndroidRegistryProtocol> | undefined;
  const registry = () => {
    // Keep OFF free of storage, lock, random-ID and network I/O.
    if (!ANDROID_PUSH_REGISTRY_ENABLED) throw Error('ANDROID_PUSH_REGISTRY_OFF');
    if (!protocol) protocol = createAndroidRegistryProtocol({
      current: identity => getToken() === identity.session && getStoredUser()?.id === identity.ownerId,
      lock: async (installationId, run) => {
        if (!navigator.locks?.request) throw Error('ANDROID_PUSH_LOCK_UNAVAILABLE');
        return navigator.locks.request(`crewcheck-native-registry:${installationId}`, { mode: 'exclusive' }, run);
      },
      journal: {
        read: key => { const value = localStorage.getItem(key); return value === null ? null : JSON.parse(value); },
        write: (key, value) => localStorage.setItem(key, JSON.stringify(value)),
        remove: key => localStorage.removeItem(key),
      },
      mutationId: () => {
        if (!crypto.randomUUID) throw Error('ANDROID_PUSH_RANDOM_UNAVAILABLE');
        return crypto.randomUUID();
      },
      request: async (identity, method, installationId, body) => {
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
        try {
          // Captured identity for both CAS reads and mutations, including logout.
          const response = await fetch(method === 'GET' ? `${path}?installationId=${encodeURIComponent(installationId)}` : path, {
            method, credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
            headers: { 'content-type': 'application/json', authorization: `Bearer ${identity.session}` },
            ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
          });
          const result = await response.json();
          if (!response.ok) {
            if (response.status === 409 && result?.code === 'NATIVE_REVISION_CHANGED')
              throw Object.assign(Error('ANDROID_PUSH_CAS_REJECTED'), { status: 409, code: 'NATIVE_REVISION_CHANGED' });
            throw Error('ANDROID_PUSH_REGISTRY_UNCONFIRMED');
          }
          return result;
        } finally { clearTimeout(timer); }
      },
    });
    return protocol;
  };
  return createAndroidPushLifecycle({
    target: window,
    identity: () => {
      const session = getToken(), ownerId = getStoredUser()?.id;
      return session && ownerId ? { ownerId, session } : null;
    },
    host: () => (window as unknown as { AndroidCrewCheckNative?: AndroidPushHost }).AndroidCrewCheckNative,
    register: async (snapshot, identity, explicitConsent) => registry().register(snapshot, identity, explicitConsent === true),
    revoke: async (snapshot, identity) => {
      await registry().revoke(snapshot, identity);
    },
  });
}
if (typeof window !== 'undefined') installAndroidPushHost();
