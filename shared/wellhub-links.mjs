export function isOfficialWellhubUrl(value) {
  try { const url=new URL(value); return url.protocol==='https:' && ['wellhub.com','www.wellhub.com'].includes(url.hostname) && !url.username && !url.password && !url.port && url.pathname.startsWith('/pt-br/search/'); } catch { return false; }
}
// No verified unit coordinates or integration client ID are present. Never
// turn a display address into a false prefilled destination or send user GPS.
export const WELLHUB_UBER_FALLBACK_URL = 'https://m.uber.com/';
