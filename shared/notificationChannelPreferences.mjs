export const NOTIFICATION_CHANNELS = Object.freeze(['mobilePwa', 'watch', 'crewCierge']);
export const DEFAULT_NOTIFICATION_CHANNELS = Object.freeze({ all: false, individual: Object.freeze({ mobilePwa: true, watch: false, crewCierge: false }) });
export function validateNotificationChannels(value) {
  if (!value || typeof value.all !== 'boolean' || !value.individual || NOTIFICATION_CHANNELS.some(channel => typeof value.individual[channel] !== 'boolean')) {
    throw Object.assign(new Error('Confira a seleção dos canais de notificação.'), { status: 400 });
  }
  return { all: value.all, individual: Object.fromEntries(NOTIFICATION_CHANNELS.map(channel => [channel, value.individual[channel]])) };
}
export function selectedNotificationChannels(value) {
  const preferences = validateNotificationChannels(value);
  return NOTIFICATION_CHANNELS.filter(channel => preferences.all || preferences.individual[channel]);
}

// Selection is intent, never permission, pairing, transport activation or a receipt.
// The caller supplies trusted account/event-bound readiness and receipt evidence.
export function notificationChannelProjection({ preferences, ownerId, eventKey, sourceReady = false, readiness = {}, receipts = [] }) {
  const selected = selectedNotificationChannels(preferences);
  return NOTIFICATION_CHANNELS.map(channel => {
    const base = { channel, selected: selected.includes(channel), deliveryAllowed: false, received: null, idempotencyKey: ownerId && eventKey ? JSON.stringify([ownerId, eventKey, channel]) : null };
    if (!base.selected) return { ...base, status: 'not_selected' };
    if (!ownerId || !eventKey) return { ...base, status: 'unavailable' };
    const receipt = receipts.find(item => item.ownerId === ownerId && item.eventKey === eventKey && item.channel === channel);
    if (receipt) {
      const proof = receipt.receivedProof;
      if (receipt.status === 'received' && proof?.verified === true && proof.ownerId === ownerId && proof.eventKey === eventKey && proof.channel === channel && typeof proof.at === 'string' && Number.isFinite(Date.parse(proof.at))) return { ...base, status: 'received', received: true };
      if (receipt.status === 'accepted') return { ...base, status: 'accepted_unconfirmed' };
      if (['received', 'dispatching', 'uncertain'].includes(receipt.status)) return { ...base, status: 'uncertain' };
    }
    const available = readiness[channel];
    if (sourceReady !== true || !ownerId || !eventKey || available?.ready !== true || available.ownerId !== ownerId || available.eventKey !== eventKey) return { ...base, status: 'unavailable' };
    return { ...base, status: 'eligible', deliveryAllowed: true };
  });
}
