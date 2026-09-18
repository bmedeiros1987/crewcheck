/** Only the TV approval route is eligible; arbitrary redirect destinations fail closed. */
export function tvPairLoginLocation(pathname: string, search: string): string {
  if (pathname !== '/tv-pair') return '/login';
  const code = new URLSearchParams(search).get('code')?.trim().toUpperCase() || '';
  const destination = '/tv-pair' + (/^[A-F0-9]{10}$/.test(code) ? '?code=' + code : '');
  return '/login?returnTo=' + encodeURIComponent(destination);
}
export function tvPairReturnLocation(search: string): string {
  const value = new URLSearchParams(search).get('returnTo') || '';
  return /^\/tv-pair(?:\?code=[A-F0-9]{10})?$/.test(value) ? value : '/';
}
