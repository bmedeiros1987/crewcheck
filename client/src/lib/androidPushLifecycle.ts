export type AndroidPushSnapshot = { enabled: boolean; installationId?: string; ownerId?: string; generation?: string; tokenRevision?: string; token?: string };
export type AndroidPushHost = {
  nativePushStatus(): string;
  setNativePushSession(ownerHint: string): boolean;
  requestNativePushToken(): boolean;
};
type Identity = { ownerId: string; session: string } | null;
type RegistryIdentity = NonNullable<Identity>;
type RegistryOperation = {
  schema: 1; owner: string; installationId: string; mutationId: string;
  action: 'register' | 'rotate' | 'revoke'; generation: number; tokenRevision: number;
  expectedRevision: number; expectedConsentRevision: number; rejected?: boolean;
};
export type AndroidRegistryProtocolDependencies = {
  current(identity: RegistryIdentity): boolean;
  request(identity: RegistryIdentity, method: 'GET' | 'POST', installationId: string, body?: Record<string, unknown>): Promise<unknown>;
  lock<T>(installationId: string, run: () => Promise<T>): Promise<T>;
  journal: { read(key: string): unknown; write(key: string, value: unknown): void; remove(key: string): void };
  mutationId(): string;
};
const protocolError = () => { throw Error('ANDROID_PUSH_PROTOCOL_UNCONFIRMED'); };
const nativeCounter = (value: unknown, positive = false): number => {
  if (typeof value === 'string') {
    if (!/^(0|[1-9][0-9]{0,15})$/.test(value)) return protocolError();
    value = Number(value);
  }
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < (positive ? 1 : 0)) return protocolError();
  return value;
};
const registryObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return protocolError();
  return value as Record<string, unknown>;
};
/** Unmounted client protocol. Journal contains operation metadata only, never
 * bearer or FCM token. A retained ID is reconciled, never replaced after an
 * uncertain commit. Caller must supply a cross-context exclusive lock. */
export function createAndroidRegistryProtocol(deps: AndroidRegistryProtocolDependencies) {
  const confirmed = new Map<string, { owner: string; generation: number; tokenRevision: number; token: string; revision: number; consentRevision: number }>();
  const key = (installationId: string) => `crewcheck_native_push_pending_v1:${encodeURIComponent(installationId)}`;
  const pending = (installationId: string): RegistryOperation | null => {
    const raw = deps.journal.read(key(installationId));
    if (raw === null || raw === undefined) return null;
    const value = registryObject(raw);
    const allowed = ['schema', 'owner', 'installationId', 'mutationId', 'action', 'generation', 'tokenRevision', 'expectedRevision', 'expectedConsentRevision', 'rejected'];
    if (Object.keys(value).some(name => !allowed.includes(name)) || value.schema !== 1 || typeof value.owner !== 'string'
      || value.installationId !== installationId || typeof value.mutationId !== 'string' || !/^[A-Za-z0-9_-]{8,160}$/.test(value.mutationId)
      || !['register', 'rotate', 'revoke'].includes(String(value.action)) || (value.rejected !== undefined && typeof value.rejected !== 'boolean')) return protocolError();
    for (const name of ['generation', 'tokenRevision', 'expectedRevision', 'expectedConsentRevision']) {
      if (typeof value[name] !== 'number') return protocolError();
      nativeCounter(value[name], name === 'generation' || name === 'tokenRevision');
    }
    return value as unknown as RegistryOperation;
  };
  const persist = (operation: RegistryOperation) => {
    deps.journal.write(key(operation.installationId), operation);
    if (JSON.stringify(pending(operation.installationId)) !== JSON.stringify(operation)) protocolError();
  };
  const snapshot = (value: AndroidPushSnapshot, identity: RegistryIdentity) => {
    if (!value.enabled || value.ownerId !== identity.ownerId || !value.installationId || !/^[A-Za-z0-9_-]{8,160}$/.test(value.installationId)) return protocolError();
    return { installationId: value.installationId, generation: nativeCounter(value.generation, true), tokenRevision: nativeCounter(value.tokenRevision, true), token: value.token };
  };
  const readState = async (identity: RegistryIdentity, installationId: string) => {
    const result = registryObject(await deps.request(identity, 'GET', installationId));
    if (result.installationId !== installationId || result.registryConfirmed !== true || result.received !== null || typeof result.registered !== 'boolean') return protocolError();
    const revision = nativeCounter(result.revision), consentRevision = nativeCounter(result.consentRevision);
    if (revision === 0) {
      if (consentRevision !== 0 || result.registered || result.generation !== undefined || result.tokenRevision !== undefined) return protocolError();
      return { revision, consentRevision, registered: false, generation: 0, tokenRevision: 0 };
    }
    if (consentRevision < 1) return protocolError();
    return { revision, consentRevision, registered: result.registered, generation: nativeCounter(result.generation, true), tokenRevision: nativeCounter(result.tokenRevision, true) };
  };
  const apply = async (identity: RegistryIdentity, operation: RegistryOperation, token?: string) => {
    const active = operation.action !== 'revoke';
    const body: Record<string, unknown> = { action: operation.action, projectId: 'api-project-627296893301', package: 'com.crewcheck.app',
      installationId: operation.installationId, mutationId: operation.mutationId, expectedRevision: operation.expectedRevision,
      expectedConsentRevision: operation.expectedConsentRevision, generation: String(operation.generation), tokenRevision: String(operation.tokenRevision), consent: operation.action === 'register' };
    if (active) {
      if (!token || token.length < 20 || token.length > 4096 || /[\x00-\x20\x7f]/.test(token)) return protocolError();
      body.token = token;
    }
    persist(operation); // durable ID/readback precedes every POST
    try {
      const result = registryObject(await deps.request(identity, 'POST', operation.installationId, body));
      if (result.registryConfirmed !== true || result.received !== null || result.installationId !== operation.installationId
        || result.mutationId !== operation.mutationId || result.generation !== operation.generation || result.tokenRevision !== operation.tokenRevision
        || result.revision !== operation.expectedRevision + 1 || result.consentRevision !== operation.expectedConsentRevision + (operation.action === 'rotate' ? 0 : 1)
        || result.registered !== active || result.revoked !== !active || typeof result.duplicate !== 'boolean') return protocolError();
      if (active && !deps.current(identity)) return protocolError();
      deps.journal.remove(key(operation.installationId));
      if (pending(operation.installationId) !== null) return protocolError();
      if (active) confirmed.set(operation.installationId, { owner: identity.ownerId, generation: operation.generation, tokenRevision: operation.tokenRevision, token: token!, revision: result.revision as number, consentRevision: result.consentRevision as number });
      else confirmed.delete(operation.installationId);
      return { registered: active, revoked: !active };
    } catch (error) {
      const rejected = error as { status?: number; code?: string };
      if (rejected.status === 409 && rejected.code === 'NATIVE_REVISION_CHANGED') persist({ ...operation, rejected: true });
      throw Error('ANDROID_PUSH_REGISTRY_UNCONFIRMED');
    }
  };
  const fresh = (identity: RegistryIdentity, state: { revision: number; consentRevision: number }, native: { installationId: string; generation: number; tokenRevision: number }, action: RegistryOperation['action']): RegistryOperation => {
    if (state.revision === Number.MAX_SAFE_INTEGER || state.consentRevision === Number.MAX_SAFE_INTEGER) return protocolError();
    const mutationId = deps.mutationId(); if (!/^[A-Za-z0-9_-]{8,160}$/.test(mutationId)) return protocolError();
    return { schema: 1, owner: identity.ownerId, installationId: native.installationId, mutationId, action,
      generation: native.generation, tokenRevision: native.tokenRevision, expectedRevision: state.revision, expectedConsentRevision: state.consentRevision };
  };
  return {
    register(value: AndroidPushSnapshot, identity: RegistryIdentity, explicitConsent: boolean) {
      const native = snapshot(value, identity);
      return deps.lock(native.installationId, async () => {
        if (!deps.current(identity)) return protocolError();
        const old = pending(native.installationId);
        if (old && (old.owner !== identity.ownerId || old.action === 'revoke')) return protocolError();
        if (old && !old.rejected) {
          if (old.generation !== native.generation || old.tokenRevision !== native.tokenRevision) return protocolError();
          return apply(identity, old, native.token); // fixed-ID reconciliation only
        }
        const state = await readState(identity, native.installationId);
        if (state.generation > native.generation || (old && old.generation > native.generation)) return protocolError();
        if (!deps.current(identity)) return protocolError();
        const prior = confirmed.get(native.installationId);
        if (state.registered && prior?.owner === identity.ownerId && prior.generation === native.generation && prior.tokenRevision === native.tokenRevision
          && prior.token === native.token && prior.revision === state.revision && prior.consentRevision === state.consentRevision) return { registered: true, revoked: false };
        const action = explicitConsent ? 'register' : state.registered && state.generation === native.generation && native.tokenRevision > state.tokenRevision ? 'rotate' : null;
        if (!action) return { registered: false, revoked: false };
        return apply(identity, fresh(identity, state, native, action), native.token);
      });
    },
    revoke(value: AndroidPushSnapshot, identity: RegistryIdentity) {
      const native = snapshot(value, identity);
      return deps.lock(native.installationId, async () => {
        const old = pending(native.installationId);
        if (old && old.owner !== identity.ownerId) return protocolError();
        if (old?.action === 'revoke' && !old.rejected) return apply(identity, old);
        const state = await readState(identity, native.installationId);
        // Fences a possibly late enrollment at the captured native generation.
        // A known CAS rejection may be replanned on the next explicit reconcile.
        if (state.generation > native.generation || (old && old.generation > native.generation)) return protocolError();
        const fence = { ...native, tokenRevision: Math.max(native.tokenRevision, state.tokenRevision, old?.tokenRevision || 0) };
        return apply(identity, fresh(identity, state, fence, 'revoke'));
      });
    },
  };
}
export type AndroidPushDependencies = {
  target: EventTarget;
  identity(): Identity;
  host(): AndroidPushHost | undefined;
  // Contract only: no mounted native registry or default fetch implementation.
  register(snapshot: AndroidPushSnapshot, identity: NonNullable<Identity>, explicitConsent?: boolean): Promise<{ registered: boolean }>;
  revoke(snapshot: AndroidPushSnapshot, identity: NonNullable<Identity>): Promise<void>;
};
/** Explicit enrollment, distinct from notification permission and Web Push. */
export function createAndroidPushLifecycle(deps: AndroidPushDependencies) {
  let operation = 0;
  let optedOwner: string | null = null;
  let pendingConsent = false;
  type CapturedScope = { snapshot: AndroidPushSnapshot; identity: RegistryIdentity };
  let scope: CapturedScope | null = null;
  let revocation: CapturedScope | null = null;
  let revoking: Promise<boolean> | null = null;
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
  const retryRevocation = (): Promise<boolean> => {
    if (revoking) return revoking;
    const captured = revocation;
    if (!captured) return Promise.resolve(true);
    revoking = (async () => {
      await Promise.resolve();
      try {
        await deps.revoke(captured.snapshot, captured.identity);
        if (revocation === captured) revocation = null;
        return true;
      } catch { return false; }
      finally { revoking = null; }
    })();
    return revoking;
  };
  const invalidate = () => {
    operation++;
    optedOwner = null;
    pendingConsent = false;
    const identity = deps.identity(), prior = read();
    const previousIdentity = scope?.identity || identity;
    const captured = previousIdentity && prior?.ownerId === previousIdentity.ownerId
      ? { snapshot: prior, identity: previousIdentity } : scope;
    scope = null;
    // Synchronous local tombstone precedes logout/token replacement. Failure is
    // unconfirmed, never a delivery authorization; service cannot display yet.
    if (prior) {
      try { deps.host()?.setNativePushSession(''); } catch { /* fail closed */ }
    }
    // Retain the old bearer only in memory. A new account cannot replace an
    // uncertain revocation or supply its own bearer to retry it.
    if (!revocation && captured) revocation = captured;
    return retryRevocation();
  };
  const reconcile = async () => {
    const identity = deps.identity(), captured = read(), generation = ++operation;
    if (revocation) return 'unconfirmed';
    if (!identity || optedOwner !== identity.ownerId || !captured || captured.ownerId !== identity.ownerId || !captured.token) return 'inactive';
    scope = { snapshot: captured, identity };
    try {
      const result = await deps.register(captured, identity, pendingConsent);
      if (!same(identity, captured, generation)) return 'stale';
      if (result.registered === true) pendingConsent = false;
      return result.registered === true ? 'registered' : 'unconfirmed';
    } catch { return 'unconfirmed'; }
  };
  const activate = async (confirmed: boolean) => {
    let identity = deps.identity(), native = read();
    if (!confirmed || !identity || !native) return 'disabled';
    if (scope && scope.identity.ownerId !== identity.ownerId) void invalidate();
    if (!await retryRevocation()) return 'unconfirmed';
    identity = deps.identity(); native = read();
    if (!identity || !native) return 'disabled';
    operation++;
    try {
      if (deps.host()?.setNativePushSession(identity.ownerId) !== true) return 'unconfirmed';
      optedOwner = identity.ownerId;
      pendingConsent = true;
      const captured = read();
      if (captured?.ownerId === identity.ownerId) scope = { snapshot: captured, identity };
      if (deps.host()?.requestNativePushToken() !== true) { optedOwner = null; return 'unconfirmed'; }
      return (read()?.token ? await reconcile() : 'token_pending');
    } catch { optedOwner = null; pendingConsent = false; return 'unconfirmed'; }
  };
  const changed = () => {
    const current = deps.identity(), native = read();
    if (native && native.ownerId && native.ownerId !== current?.ownerId) invalidate();
    if (revocation) { void retryRevocation(); return; }
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
  return { activate, reconcile, revoke: invalidate, dispose: () => { operation++; optedOwner = null; pendingConsent = false; listeners.forEach(([event, listener]) => deps.target.removeEventListener(event, listener)); } };
}
