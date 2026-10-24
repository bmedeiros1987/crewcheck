export type AndroidPushSnapshot = { enabled: boolean; installationId?: string; ownerId?: string; generation?: string; tokenRevision?: string; token?: string };
export type AndroidPushHost = {
  nativePushStatus(): string;
  setNativePushSession(ownerHint: string): boolean;
  requestNativePushToken(): boolean;
};
type Identity = { ownerId: string; session: string } | null;
export type AndroidPushDependencies = {
  target: EventTarget;
  identity(): Identity;
  host(): AndroidPushHost | undefined;
  // Contract only: no mounted native registry or default fetch implementation.
  register(snapshot: AndroidPushSnapshot, identity: NonNullable<Identity>): Promise<{ registered: boolean }>;
  revoke(snapshot: AndroidPushSnapshot, identity: NonNullable<Identity>): Promise<void>;
};
/** Explicit enrollment, distinct from notification permission and Web Push. */
export function createAndroidPushLifecycle(deps: AndroidPushDependencies) {
  let operation = 0;
  let optedOwner: string | null = null;
  const read = (): AndroidPushSnapshot | null => {
    try { const value = JSON.parse(deps.host()?.nativePushStatus() || 'null'); return value?.enabled === true ? value : null; }
    catch { return null; }
  };
  const same = (identity: NonNullable<Identity>, captured: AndroidPushSnapshot, generation: number) => {
    const now = deps.identity(), native = read();
    return native !== null && generation === operation && now?.ownerId === identity.ownerId && now.session === identity.session
      && native?.ownerId === captured.ownerId && native.installationId === captured.installationId
      && native.generation === captured.generation && native.tokenRevision === captured.tokenRevision && native.token === captured.token;
  };
  const invalidate = () => {
    operation++;
    optedOwner = null;
    const identity = deps.identity(), prior = read();
    // Synchronous local tombstone precedes logout/token replacement. Failure is
    // unconfirmed, never a delivery authorization; service cannot display yet.
    if (prior) {
      try { deps.host()?.setNativePushSession(''); } catch { /* fail closed */ }
      if (identity && prior.ownerId === identity.ownerId) void deps.revoke(prior, identity).catch(() => {});
    }
  };
  const reconcile = async () => {
    const identity = deps.identity(), captured = read(), generation = ++operation;
    if (!identity || optedOwner !== identity.ownerId || !captured || captured.ownerId !== identity.ownerId || !captured.token) return 'inactive';
    try {
      const result = await deps.register(captured, identity);
      if (!same(identity, captured, generation)) return 'stale';
      return result.registered === true ? 'registered' : 'unconfirmed';
    } catch { return 'unconfirmed'; }
  };
  const activate = async (confirmed: boolean) => {
    const identity = deps.identity(), native = read();
    if (!confirmed || !identity || !native) return 'disabled';
    operation++;
    try {
      if (deps.host()?.setNativePushSession(identity.ownerId) !== true) return 'unconfirmed';
      optedOwner = identity.ownerId;
      if (deps.host()?.requestNativePushToken() !== true) { optedOwner = null; return 'unconfirmed'; }
      return (read()?.token ? await reconcile() : 'token_pending');
    } catch { optedOwner = null; return 'unconfirmed'; }
  };
  const changed = () => {
    const current = deps.identity(), native = read();
    if (native && native.ownerId && native.ownerId !== current?.ownerId) invalidate();
    // Same-account JWT renewal may retry pending enrollment; never grants consent.
    if (current?.ownerId === optedOwner) void reconcile();
  };
  const storage = (event: Event) => { if ([null, 'crewcheck_auth_user', 'crewcheck_auth_token'].includes((event as StorageEvent).key)) changed(); };
  const listeners: Array<[string, EventListener]> = [
    ['crewcheck:auth-will-change', invalidate], ['crewcheck:auth-expired', invalidate],
    ['crewcheck:auth-changed', changed], ['crewcheck:native-ready', changed],
    ['focus', changed], ['online', changed], ['storage', storage],
  ];
  listeners.forEach(([event, listener]) => deps.target.addEventListener(event, listener));
  return { activate, reconcile, revoke: invalidate, dispose: () => { operation++; optedOwner = null; listeners.forEach(([event, listener]) => deps.target.removeEventListener(event, listener)); } };
}
