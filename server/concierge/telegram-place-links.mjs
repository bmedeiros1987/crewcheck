import { randomUUID } from 'node:crypto';
import { pharmacyResultsText } from './place-results.mjs';

// Only canonical destination-only URLs produced by the places projection qualify.
export function validatedPlaceRoute(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.host !== 'www.google.com' || url.pathname !== '/maps/dir/' || url.username || url.password || url.hash) return '';
    const entries = [...url.searchParams];
    if (entries.length !== 2 || url.searchParams.get('api') !== '1') return '';
    const destination = url.searchParams.get('destination') || '';
    const parts = destination.split(',');
    if (parts.length !== 2 || parts.some(p => !p.trim() || !Number.isFinite(Number(p)))) return '';
    const [lat, lon] = parts.map(Number);
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return '';
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
  } catch { return ''; }
}

export function telegramPlaceReply(results, humanize = text => text) {
  const routes = [];
  const nonce = randomUUID();
  const places = results.places.map((place, index) => {
    const url = validatedPlaceRoute(place.routeUrl);
    const marker = url ? `CC_ROUTE_${nonce}_${index}` : '';
    if (marker) routes.push({ marker: `↗ Rota: ${marker}`, url });
    return { ...place, routeUrl: marker };
  });
  let text = String(humanize(pharmacyResultsText({ ...results, places })));
  const entities = [];
  for (const { marker, url } of routes) {
    const at = text.indexOf(marker);
    if (at < 0) continue;
    text = text.slice(0, at) + '↗ Ver rota' + text.slice(at + marker.length);
    entities.push({ type: 'text_link', offset: at + 2, length: 'Ver rota'.length, url });
  }
  // JS string indices are UTF-16, as required by Telegram. Never split a surrogate.
  text = text.slice(0, 3900);
  if (/[\uD800-\uDBFF]$/.test(text)) text = text.slice(0, -1);
  return { reply: text, entities: entities.filter(e => e.offset + e.length <= text.length) };
}
