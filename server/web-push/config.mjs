export const WEB_PUSH_VARIABLES = Object.freeze(['WEB_PUSH_ENABLED','WEB_PUSH_ORIGIN','VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','VAPID_SUBJECT','WEB_PUSH_ENCRYPTION_KEY']);
export function pushConfiguration(values = process.env) {
  // Disabled path reads no key material. Nothing in this change sets these values.
  if (values.WEB_PUSH_ENABLED !== 'true') return { enabled: false, configured: false };
  let origin; try { const url = new URL(values.WEB_PUSH_ORIGIN); if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return { enabled: false, configured: false }; origin = url.origin; } catch { return { enabled: false, configured: false }; }
  const publicKey = values.VAPID_PUBLIC_KEY, privateKey = values.VAPID_PRIVATE_KEY, subject = values.VAPID_SUBJECT;
  const encryptionKey = typeof values.WEB_PUSH_ENCRYPTION_KEY === 'string' && /^[a-fA-F0-9]{64}$/.test(values.WEB_PUSH_ENCRYPTION_KEY) ? Buffer.from(values.WEB_PUSH_ENCRYPTION_KEY, 'hex') : null;
  if (!publicKey || !privateKey || !/^(mailto:[^\s@]+@[^\s@]+\.[^\s@]+|https:\/\/[^\s]+)$/.test(subject || '') || !encryptionKey) return { enabled: false, configured: false };
  return { enabled: true, configured: true, origin, publicKey, privateKey, subject, encryptionKey };
}
