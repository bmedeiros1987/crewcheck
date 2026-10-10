type Binding = { ownerId: string; installationId: string; consentRevision: number };
type Dependencies = {
  enabled: boolean; currentOwner: () => string | null; registration: ServiceWorkerRegistration;
  permission: () => Promise<NotificationPermission>;
  subscribe: (registration: ServiceWorkerRegistration, key: string) => Promise<PushSubscription>;
  save: (subscription: PushSubscriptionJSON, ownerId: string) => Promise<Binding>;
  revoke: (subscription: PushSubscriptionJSON, ownerId: string) => Promise<void>;
  bindWorker: (binding: Binding | null) => Promise<void>;
};
// No UI mounts/calls this in production. Permission is requested only through an
// explicit activation call. No bearer token is persisted in the service worker.
export async function activateCrewCheckPush(dependencies: Dependencies, publicKey: string, confirmed: boolean) {
  const ownerId = dependencies.currentOwner();
  if (dependencies.enabled !== true || confirmed !== true || !ownerId || !publicKey) return { status: 'blocked', received: null };
  if (await dependencies.permission() !== 'granted') return { status: 'permission_not_granted', received: null };
  if (dependencies.currentOwner() !== ownerId) return { status: 'account_changed', received: null };
  const subscription = await dependencies.subscribe(dependencies.registration, publicKey);
  try {
    if (dependencies.currentOwner() !== ownerId) throw Error('Conta mudou durante ativação.');
    const binding = await dependencies.save(subscription.toJSON(), ownerId);
    if (dependencies.currentOwner() !== ownerId || binding.ownerId !== ownerId) throw Error('Conta mudou durante ativação.');
    await dependencies.bindWorker(binding);
    return { status: 'registered', received: null };
  } catch {
    await dependencies.bindWorker(null); await subscription.unsubscribe();
    return { status: 'activation_unconfirmed', received: null };
  }
}
export async function revokeCrewCheckPush(dependencies: Dependencies) {
  const ownerId = dependencies.currentOwner();
  await dependencies.bindWorker(null); // Local privacy boundary first, including offline logout.
  const subscription = await dependencies.registration.pushManager.getSubscription();
  if (!subscription) return { status: 'inactive', serverRevocationConfirmed: false };
  let serverRevocationConfirmed = false;
  try { if (ownerId) { await dependencies.revoke(subscription.toJSON(), ownerId); serverRevocationConfirmed = true; } }
  catch { /* Remains explicit; never report remote revocation when offline. */ }
  const unsubscribed = await subscription.unsubscribe();
  return { status: unsubscribed ? 'inactive' : 'local_cancellation_unconfirmed', serverRevocationConfirmed };
}
