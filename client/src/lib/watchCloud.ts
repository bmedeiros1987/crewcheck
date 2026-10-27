import type { CrewCheckWatchSnapshot } from '@/lib/watchContext';

// CrewWatch cloud sync, phone side. The Android app hands the paired watch a credential
// once per account; afterwards the watch downloads this same projection from the server
// when the phone is away. Publishing is deduplicated (the projection is rebuilt every
// minute but rarely changes), and nothing happens on the web, without the native watch
// bridge, or while the server reports the feature disabled.

export type WatchCloudNative = {
  setWatchCloudCredential?: (credential: string) => boolean;
  clearWatchCloudCredential?: () => boolean;
};
export type WatchCloudSession = { token: string | null; owner: string; isCurrent: () => boolean };
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Deps = { fetch: typeof globalThis.fetch; storage: Storage; native: () => WatchCloudNative | null | undefined; now?: () => number };

const PAIRED = 'crewcheck:watch-cloud:v1:paired:';
// Re-send an unchanged projection at most this often, so the watch's "updated" age stays honest.
export const WATCH_CLOUD_REFRESH_MS = 30 * 60_000;
// The builder moves validUntil with the clock; re-send once the validity grew this much,
// so the cloud copy does not expire long before the one on the phone.
export const WATCH_CLOUD_VALIDITY_STEP_MS = 10 * 60_000;
// After the server says the feature is off, ask again only after this long.
const DISABLED_RETRY_MS = 6 * 60 * 60_000;

const contentKey = (snapshot: CrewCheckWatchSnapshot) => JSON.stringify({ ...snapshot, generatedAtEpochMs: 0, validUntilEpochMs: 0 });

export function createWatchCloudPublisher({ fetch, storage, native, now = Date.now }: Deps) {
  let disabledUntil = 0, inFlight = false, lastKey = '', lastSentAt = 0, lastOwner = '', lastValidUntil = 0;
  const bridge = () => { const n = native(); return n && typeof n.setWatchCloudCredential === 'function' ? n : null; };
  const call = (session: WatchCloudSession, method: string, path: string, body?: unknown) => fetch(path, {
    method, credentials: 'omit', cache: 'no-store',
    headers: { authorization: `Bearer ${session.token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const disabled = (response: Response) => {
    if (response.status !== 404) return false;
    disabledUntil = now() + DISABLED_RETRY_MS;
    return true;
  };

  async function ensurePaired(session: WatchCloudSession, n: WatchCloudNative): Promise<boolean> {
    if (storage.getItem(PAIRED + session.owner) === '1') return true;
    const response = await call(session, 'POST', '/api/watch/cloud/pair');
    if (disabled(response) || !response.ok) return false;
    const { credential } = await response.json();
    // A session that changed while waiting must not hand its credential to the watch.
    if (!session.isCurrent() || typeof credential !== 'string' || n.setWatchCloudCredential?.(credential) !== true) return false;
    storage.setItem(PAIRED + session.owner, '1');
    return true;
  }

  return {
    async publish(snapshot: CrewCheckWatchSnapshot, session: WatchCloudSession): Promise<'sent' | 'skipped'> {
      const n = bridge();
      if (!n || !session.token || !session.owner || !session.isCurrent() || now() < disabledUntil || inFlight) return 'skipped';
      const key = contentKey(snapshot);
      if (session.owner === lastOwner && key === lastKey && now() - lastSentAt < WATCH_CLOUD_REFRESH_MS
        && snapshot.validUntilEpochMs - lastValidUntil < WATCH_CLOUD_VALIDITY_STEP_MS) return 'skipped';
      inFlight = true;
      try {
        if (!await ensurePaired(session, n) || !session.isCurrent()) return 'skipped';
        const response = await call(session, 'PUT', '/api/watch/cloud/snapshot', { snapshot });
        // The server lost or revoked the pairing: pair again on the next publish.
        if (response.status === 409) storage.removeItem(PAIRED + session.owner);
        if (disabled(response) || !response.ok) return 'skipped';
        lastOwner = session.owner; lastKey = key; lastSentAt = now(); lastValidUntil = snapshot.validUntilEpochMs;
        return 'sent';
      } catch {
        return 'skipped'; // Auxiliary channel: Bluetooth sync is unaffected.
      } finally {
        inFlight = false;
      }
    },
    /** Logout or account change: revoke on the server (while the token still works) and on the watch. */
    async forget(session: Pick<WatchCloudSession, 'token' | 'owner'>): Promise<void> {
      lastKey = ''; lastSentAt = 0; lastOwner = ''; lastValidUntil = 0;
      if (!session.owner || storage.getItem(PAIRED + session.owner) !== '1') return;
      storage.removeItem(PAIRED + session.owner);
      try { native()?.clearWatchCloudCredential?.(); } catch {}
      try { if (session.token) await call({ ...session, isCurrent: () => true }, 'DELETE', '/api/watch/cloud'); } catch {}
    },
  };
}

let shared: ReturnType<typeof createWatchCloudPublisher> | null = null;
export function watchCloudPublisher() {
  if (!shared) {
    const publisher = createWatchCloudPublisher({
      fetch: (input, init) => globalThis.fetch(input, init),
      storage: globalThis.localStorage,
      native: () => (globalThis as { AndroidCrewCheckNative?: WatchCloudNative }).AndroidCrewCheckNative,
    });
    // authClient announces logout/account change without importing this module.
    globalThis.addEventListener?.('crewcheck:watch-cloud-forget', event => {
      const detail = (event as CustomEvent<{ token?: unknown; owner?: unknown }>).detail;
      if (typeof detail?.owner === 'string') void publisher.forget({ token: typeof detail.token === 'string' ? detail.token : '', owner: detail.owner });
    });
    shared = publisher;
  }
  return shared;
}
