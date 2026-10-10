export type PushBinding = { ownerId: string; installationId: string; consentRevision: number };
export type PushDependencies = {
  enabled: boolean; currentOwner: () => string | null; registration: ServiceWorkerRegistration;
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
  const ownerId = dependencies.currentOwner(), operation = ++operationGeneration;
  const current = () => operation === operationGeneration && dependencies.currentOwner() === ownerId;
  if (dependencies.enabled !== true || confirmed !== true || !ownerId || !publicKey) return { status: 'blocked', received: null };
  if (await dependencies.permission() !== 'granted') return { status: 'permission_not_granted', received: null };
  if (!current()) return { status: 'account_changed', received: null };
  return exclusive(async () => {
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
  });
}
export async function revokeCrewCheckPush(dependencies: PushDependencies) {
  operationGeneration++;
  return exclusive(async () => {
  await dependencies.cancelWorker(); // Local privacy boundary first, even offline.
  const ownerId = dependencies.currentOwner(); let serverRevocationConfirmed = false;
  try { if (ownerId) { await dependencies.revokeInstallation(ownerId); serverRevocationConfirmed = true; } } catch {}
  // Remote revocation occurs even if permission loss removed the subscription.
  const subscription = await dependencies.registration.pushManager.getSubscription();
  const unsubscribed = subscription ? await subscription.unsubscribe() : true;
  return { status: unsubscribed ? 'inactive' : 'local_cancellation_unconfirmed', serverRevocationConfirmed };
  });
}
