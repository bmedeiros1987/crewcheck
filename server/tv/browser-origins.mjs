// TV package origins may call device-token routes, never account-control routes.
// The authenticated CrewCheck web/mobile control plane is explicitly allowed to
// manage TV permissions. Origin is defense-in-depth; bearer/account checks remain mandatory.
const TV_DEVICE_ORIGINS = new Set([
  'null',
  'file://online.crewcheck.tv.pilot',
  'file://online.crewcheck.tv',
]);
const ACCOUNT_CONTROL_ORIGINS = new Set([
  'https://crewcheck.online',
  'https://appassets.androidplatform.net',
]);

export function allowsTvBrowserOrigin(value, trustedWebOrigin, accountRoute = false) {
  if (typeof value !== 'string' || typeof trustedWebOrigin !== 'string' || !trustedWebOrigin) return false;
  if (!value || value === trustedWebOrigin) return true;
  if (accountRoute) return ACCOUNT_CONTROL_ORIGINS.has(value);
  return ACCOUNT_CONTROL_ORIGINS.has(value) || TV_DEVICE_ORIGINS.has(value);
}
