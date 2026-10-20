import { captureAuthSession, type AuthUser } from './authClient';

type Session = ReturnType<typeof captureAuthSession>;
type Host = { session: Session; lease: string; revoked: boolean };
type NativeHost = { admitWatchHost?(): string; revokeWatchHost?(lease: string): boolean };
let admitted: Host | null = null;

function nativeHost(): NativeHost | undefined {
  return (window as unknown as { CrewCheckNative?: NativeHost }).CrewCheckNative;
}
function attachNative(host: Host) {
  if (!host.session.isCurrent()) { revokeCapturedWatchHost(host); return; }
  if (host !== admitted || host.revoked || host.lease) return;
  try { host.lease = nativeHost()?.admitWatchHost?.() || ''; } catch { /* No native admission. */ }
}

/** Call ONLY with the successful, still-current getMe result. Neither ready nor demo calls this. */
export function admitVerifiedWatchHost(session: Session, user: AuthUser): void {
  const owner = String(user?.id || user?.email || '').trim().toLowerCase();
  if (!session.token || !owner || owner !== session.owner || !session.isCurrent()) return;
  invalidate();
  const host: Host = { session, lease: '', revoked: false };
  admitted = host;
  attachNative(host);
}

/** Capture the object, never look up a replacement lease from a delayed callback. */
export function captureWatchHost(): Host | null { return admitted; }
export function watchHostLease(host: Host | null): string {
  if (host && !host.session.isCurrent()) revokeCapturedWatchHost(host);
  return host && host === admitted && !host.revoked ? host.lease : '';
}
export function revokeCapturedWatchHost(host: Host | null): void {
  if (!host || host.revoked) return;
  if (admitted === host) admitted = null;
  host.revoked = true;
  // Captured old lease only: never read/acquire a replacement from a callback.
  if (host.lease) {
    try { nativeHost()?.revokeWatchHost?.(host.lease); } catch { /* Native reports uncertain persistence. */ }
  }
}
function invalidate() { revokeCapturedWatchHost(admitted); }
if (typeof window !== 'undefined') {
  window.addEventListener('crewcheck:native-ready', () => { if (admitted) attachNative(admitted); });
  for (const name of ['crewcheck:auth-will-change', 'crewcheck:auth-changed', 'crewcheck:auth-expired'])
    window.addEventListener(name, invalidate);
  window.addEventListener('storage', (event: StorageEvent) => {
    if (event.key === null || event.key === 'crewcheck_auth_token' || event.key === 'crewcheck_auth_user') invalidate();
  });
}
