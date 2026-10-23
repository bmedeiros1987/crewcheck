import { authFetch, getStoredUser, getToken } from './authClient';
import { createAndroidPushLifecycle, type AndroidPushHost } from './androidPushLifecycle';

// No environment or UI switch. Registry/consent authority is not integrated yet.
export const ANDROID_PUSH_REGISTRY_ENABLED = false;
const path = '/api/platform/notifications/android-installation';
export function installAndroidPushHost() {
  return createAndroidPushLifecycle({
    target: window,
    identity: () => {
      const session = getToken(), ownerId = getStoredUser()?.id;
      return session && ownerId ? { ownerId, session } : null;
    },
    host: () => (window as unknown as { AndroidCrewCheckNative?: AndroidPushHost }).AndroidCrewCheckNative,
    register: async (snapshot, identity) => {
      if (!ANDROID_PUSH_REGISTRY_ENABLED) throw Error('ANDROID_PUSH_REGISTRY_OFF');
      if (getToken() !== identity.session || getStoredUser()?.id !== identity.ownerId) throw Error('ANDROID_PUSH_SESSION_CHANGED');
      return authFetch(path, { method: 'POST', body: JSON.stringify({ action: 'register', projectId: 'api-project-627296893301', ...snapshot }) });
    },
    revoke: async (snapshot, identity) => {
      if (!ANDROID_PUSH_REGISTRY_ENABLED) throw Error('ANDROID_PUSH_REGISTRY_OFF');
      // Capture the old authenticated session before logout; never send a new account's bearer.
      const response = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', authorization: `Bearer ${identity.session}` }, body: JSON.stringify({ action: 'revoke', installationId: snapshot.installationId, generation: snapshot.generation }) });
      if (!response.ok) throw Error('ANDROID_PUSH_REVOCATION_UNCONFIRMED');
    },
  });
}
if (typeof window !== 'undefined') installAndroidPushHost();
