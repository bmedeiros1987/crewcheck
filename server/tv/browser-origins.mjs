// webOS packaged apps can serialize the app ID as a file-scheme origin.
// This list enables transport, NOT authorization. Account approval/revocation
// stays browser-origin-only; device routes retain token/single-account checks.
const PACKAGED_ORIGINS = new Set([
  'null',
  'https://appassets.androidplatform.net',
  'file://online.crewcheck.tv.pilot',
  'file://online.crewcheck.tv',
]);
export function allowsTvBrowserOrigin(value, trustedWebOrigin, accountRoute = false) {
  if (typeof value !== 'string' || typeof trustedWebOrigin !== 'string' || !trustedWebOrigin) return false;
  return !value || value === trustedWebOrigin || (!accountRoute && PACKAGED_ORIGINS.has(value));
}
