// No-op until an explicitly enabled composition installs its lifecycle hooks.
// Calls only follow authenticated unlink/deletion, never an inbound identity.
let owner = null;
export function installWhatsAppLifecycle(erase) {
  if (owner || typeof erase !== 'function') throw Error('WHATSAPP_LIFECYCLE_OWNED');
  const token = {erase}; owner = token;
  return () => {if (owner === token) owner = null;};
}
export async function eraseWhatsAppAccountState(email, context) {
  if (owner) await owner.erase(email, context);
}
