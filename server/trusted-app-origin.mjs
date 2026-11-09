// One extra app origin the operator may explicitly trust for confirmation POSTs, for example the
// host's own HTTPS address while the domain does not point to it yet. Unset by default, so every
// handler keeps exactly its current origins. It is read from this variable only: never derived
// from Host or X-Forwarded-Host, never a list, pattern or wildcard, and independent of any
// channel activation or credential.
export const TRUSTED_APP_ORIGIN_VARIABLE = 'CREWCHECK_TRUSTED_APP_ORIGIN';

const hostname = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** The configured origin in its exact canonical form, or '' when unset or not acceptable. */
export function configuredTrustedAppOrigin(values = process.env) {
  const raw = values?.[TRUSTED_APP_ORIGIN_VARIABLE];
  if (typeof raw !== 'string' || !raw || raw.length > 300) return '';
  let url;
  try { url = new URL(raw); } catch { return ''; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) return '';
  // Exact spelling only: a trailing slash, upper case or any rewrite by the parser is refused.
  if (url.origin !== raw || !hostname.test(url.hostname)) return '';
  return url.origin;
}

/** Exact comparison of the request's Origin header with the allowed origins. */
export function originAllowed(origin, allowed) {
  return typeof origin === 'string' && origin !== 'null' && allowed.includes(origin);
}
