export type PushBinding = { ownerId: string; installationId: string; consentRevision: number; subscriptionHash?: string };
export type PushDependencies = {
  enabled: boolean; ownerId: string | null; currentOwner: () => string | null; registration: ServiceWorkerRegistration;
  withSubscriptionLock: <T>(run: () => Promise<T>) => Promise<T>;
  permission: () => Promise<NotificationPermission>;
  subscribe: (registration: ServiceWorkerRegistration, key: string) => Promise<PushSubscription>;
  save: (subscription: PushSubscriptionJSON, ownerId: string) => Promise<PushBinding>;
  revokeInstallation: (ownerId: string) => Promise<void>;
  beginWorker: () => Promise<number>;
  bindWorker: (binding: PushBinding, generation: number) => Promise<boolean>;
  cancelWorker: (generation?: number) => Promise<boolean>;
};
let operationGeneration = 0;
let mutationQueue: Promise<unknown> = Promise.resolve();
async function exclusive<T>(run: () => Promise<T>): Promise<T> { const previous=mutationQueue; let release!:()=>void; mutationQueue=new Promise<void>(resolve=>{release=resolve;}); await previous; try{return await run();}finally{release();} }
export function invalidateCrewCheckPushActivation() { return ++operationGeneration; }
export function crewCheckPushOperationGeneration() { return operationGeneration; }
export async function activateCrewCheckPush(dependencies: PushDependencies, publicKey: string, confirmed: boolean) {
  const ownerId = dependencies.ownerId, operation = ++operationGeneration;
  const current = () => operation === operationGeneration && dependencies.currentOwner() === ownerId;
  if (dependencies.enabled !== true || confirmed !== true || !ownerId || !publicKey || !current()) return { status: 'blocked', received: null };
  if (await dependencies.permission() !== 'granted') return { status: 'permission_not_granted', received: null };
  if (!current()) return { status: 'account_changed', received: null };
  return exclusive(() => dependencies.withSubscriptionLock(async () => {
  if (!current()) return { status: 'account_changed', received: null };
  const generation = await dependencies.beginWorker();
  if (!current()) { await dependencies.cancelWorker(generation); return { status: 'account_changed', received: null }; }
  let subscription: PushSubscription | undefined;
  try {
    subscription = await dependencies.subscribe(dependencies.registration, publicKey);
    if (!current()) throw Error('Conta mudou durante ativação.');
    const binding = await dependencies.save(subscription.toJSON(), ownerId);
    if (!current() || binding.ownerId !== ownerId) throw Error('Conta mudou durante ativação.');
    const bound = await dependencies.bindWorker(binding, generation);
    if (!current() || !bound) throw Error('O vínculo mudou durante ativação.');
    return { status: 'registered', received: null };
  } catch {
    // CAS cleanup cannot clear/unsubscribe a newer activation's binding.
    if (await dependencies.cancelWorker(generation)) {
      if (subscription) await subscription.unsubscribe();
      try { await dependencies.revokeInstallation(ownerId); } catch {}
    }
    return { status: 'activation_unconfirmed', received: null };
  }
  }));
}
export async function revokeCrewCheckPush(dependencies: PushDependencies) {
  const ownerId = dependencies.ownerId, operation = ++operationGeneration;
  const current = () => !!ownerId && operation === operationGeneration && dependencies.currentOwner() === ownerId;
  const stale = () => ({ status: 'account_changed', serverRevocationConfirmed: false });
  if (!current()) return stale();
  return exclusive(() => dependencies.withSubscriptionLock(async () => {
    if (!current()) return stale();
    // Cancel the owner binding before fallible subscription access. The origin
    // lock remains held through lookup/unsubscribe and blocks new activations.
    const cancelled = await dependencies.cancelWorker();
    if (!current()) return stale();
    if (!cancelled) return { status: 'local_cancellation_unconfirmed', serverRevocationConfirmed: false };
    let serverRevocationConfirmed = false;
    try { await dependencies.revokeInstallation(ownerId!); serverRevocationConfirmed = true; } catch {}
    if (!current()) return { status: 'account_changed', serverRevocationConfirmed };
    // Remote revocation still occurs when the old subscription is already absent.
    let unsubscribed = false;
    try {
      const subscription = await dependencies.registration.pushManager.getSubscription();
      if (!current()) return { status: 'account_changed', serverRevocationConfirmed };
      unsubscribed = subscription ? await subscription.unsubscribe() : true;
    } catch {} // Lookup/unsubscribe failure must not undo or overstate cancellation.
    if (!current()) return { status: 'account_changed', serverRevocationConfirmed };
    return { status: unsubscribed ? 'inactive' : 'local_cancellation_unconfirmed', serverRevocationConfirmed };
  }));
}
