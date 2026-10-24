// No FCM identity, token provider, endpoint, scheduler or network call is wired.
// A future sender must compose durable outbox admission/revocation/uncertainty
// with proven cloudmessaging.messages.create and native display authority.
export const NATIVE_SENDER_ENABLED = false;
export async function sendNativePush() {
  return {enabled:NATIVE_SENDER_ENABLED,state:'disabled',providerAccepted:false,received:null};
}
