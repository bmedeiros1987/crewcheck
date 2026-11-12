import { captureAuthSession } from './authClient';

/** Local read/write fence only; never authenticates a health source or enables collection. */
export type LifeHealthSession = { owner: string; token: string | null; isCurrent(): boolean };
export const isLifeHealthCacheKey = (key: string) => key.startsWith('crewcheck:life:');
export function invalidateLifeHealthCache(storage: Storage = localStorage): void {
  try {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
    for (const key of keys) if (key && isLifeHealthCacheKey(key)) storage.removeItem(key);
  } catch {}
  if (typeof window !== 'undefined') {
    delete (window as any).__crewcheckLifeCompanionSummary;
    window.dispatchEvent(new CustomEvent('crewcheck:life-cache-invalidated'));
  }
}
export function readLifeHealthCache<T>(session: LifeHealthSession, key: string, fallback: T, storage: Storage = localStorage): T {
  if (!isLifeHealthCacheKey(key) || !session.token || !session.owner || !session.isCurrent()) return fallback;
  try {
    const entry = JSON.parse(storage.getItem(key) || 'null');
    if (entry?.schema !== 2 || entry.owner !== session.owner || !Object.prototype.hasOwnProperty.call(entry, 'value') || !session.isCurrent()) {
      storage.removeItem(key); // unattributed legacy/foreign cache is never adopted
      return fallback;
    }
    return entry.value as T;
  } catch { return fallback; }
}
export function writeLifeHealthCache(session: LifeHealthSession, key: string, value: unknown, storage: Storage = localStorage): boolean {
  if (!isLifeHealthCacheKey(key) || !session.token || !session.owner || !session.isCurrent()) return false;
  try {
    storage.setItem(key, JSON.stringify({ schema: 2, owner: session.owner, value }));
    return true;
  } catch { return false; }
}

export function clearCompanionHealthCache(session: LifeHealthSession, storage: Storage = localStorage): void {
  if (!session.token || !session.owner || !session.isCurrent()) return;
  try {
    storage.removeItem('crewcheck:life:companion-summary:v1');
    const key = 'crewcheck:life:health-history:v1';
    const history = readLifeHealthCache<unknown[]>(session, key, [], storage);
    if (Array.isArray(history)) writeLifeHealthCache(session, key, history.filter((item: any) =>
      !['samsung_health', 'samsung-companion'].includes(item?.source)), storage);
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('crewcheck:life-adaptive-update', { detail: { key } }));
  } catch {}
}

// Installed by main.tsx before rendering App, independently of the Life screen.
if (typeof window !== 'undefined') {
  for (const name of ['crewcheck:auth-will-change', 'crewcheck:auth-changed', 'crewcheck:auth-expired'])
    window.addEventListener(name, () => invalidateLifeHealthCache());
  window.addEventListener('storage', (event) => {
    if (event.key === null || event.key === 'crewcheck_auth_token' || event.key === 'crewcheck_auth_user')
      invalidateLifeHealthCache();
  });
  window.addEventListener('crewcheck:life-companion-summary', () => clearCompanionHealthCache(captureAuthSession()));
}
