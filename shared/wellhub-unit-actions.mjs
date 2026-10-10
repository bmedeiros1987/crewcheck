import { isOfficialWellhubUrl, WELLHUB_UBER_FALLBACK_URL } from './wellhub-links.mjs';
import { wellhubSnapshotFreshness } from './wellhub-access.mjs';
export const WELLHUB_UNIT_PAGE_ORIGIN = 'https://crewcheck.onrender.com';
export function wellhubUnitPageUrl(id) {
  return typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,99}$/.test(id)
    ? `${WELLHUB_UNIT_PAGE_ORIGIN}/academias/unidade/${encodeURIComponent(id)}` : '';
}
export function wellhubUnitActions(partner, { clientId = '', destination = null, now = new Date() } = {}) {
  const official = isOfficialWellhubUrl(partner?.sourceUrl) ? partner.sourceUrl : '';
  const query = [partner?.name, partner?.address, partner?.city, partner?.state].filter(Boolean).join(', ');
  const maps = new URL('https://www.google.com/maps/search/');
  maps.searchParams.set('api', '1'); maps.searchParams.set('query', query);
  const mapUrl = official && partner?.address && maps.href.length <= 2048 ? maps.href : '';
  const validPoint = official && destination?.kind === 'public-unit' && destination.unitId === partner.id
    && destination.sourceUrl === official && destination.city === partner.city && destination.state === partner.state
    && wellhubSnapshotFreshness(destination, now).snapshotStatus === 'valid'
    && wellhubSnapshotFreshness(partner, now).snapshotStatus === 'valid'
    && typeof destination.latitude === 'number' && Number.isFinite(destination.latitude)
    && destination.latitude >= -34 && destination.latitude <= 6
    && typeof destination.longitude === 'number' && Number.isFinite(destination.longitude)
    && destination.longitude >= -75 && destination.longitude <= -32;
  const configured = typeof clientId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(clientId);
  if (!validPoint || !configured) return {
    ficheUrl: official ? wellhubUnitPageUrl(partner.id) : '', officialUrl: official, mapUrl,
    uberUrl: WELLHUB_UBER_FALLBACK_URL, uberWebUrl: WELLHUB_UBER_FALLBACK_URL,
    autoDestination: false, uberLabel: 'Uber · informar destino',
    uberNotice: 'Destino não preenchido automaticamente. Informe e confira o endereço, o preço e a origem na Uber antes de confirmar.',
  };
  // Only reviewed public destination data. Never include user location, pickup,
  // account identity, product, payment, booking or a private return URL.
  const url = new URL('https://m.uber.com/looking');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('drop[0]', JSON.stringify({ latitude: destination.latitude, longitude: destination.longitude,
    addressLine1: partner.name, addressLine2: partner.address }));
  const web = new URL(url); web.pathname = '/';
  return { ficheUrl: wellhubUnitPageUrl(partner.id), officialUrl: official, mapUrl, uberUrl: url.href, uberWebUrl: web.href,
    autoDestination: true, uberLabel: 'Uber · conferir destino',
    uberNotice: 'Destino público da unidade preenchido. Confira unidade, endereço, origem e preço na Uber; somente você confirma a corrida. No Android, o destino pode aparecer depois de definir a origem.' };
}
function replaceUnitSources(text, partners, alias) {
  const raw = String(text || '');
  if (!/^Academias · /u.test(raw) || raw.length > 3900) return { text: raw, entities: [] };
  const known = new Map(partners.filter(p => isOfficialWellhubUrl(p.sourceUrl) && wellhubUnitPageUrl(p.id)).map(p => [p.sourceUrl, p]));
  let output = '', cursor = 0; const entities = [];
  for (const match of raw.matchAll(/^Fonte oficial: (https:\/\/[^\s]+)$/gmu)) {
    const partner = known.get(match[1]); if (!partner) continue;
    output += raw.slice(cursor, match.index);
    const url = wellhubUnitPageUrl(partner.id);
    if (alias) { const label = 'Ficha e ações'; entities.push({ type: 'text_link', offset: output.length, length: label.length, url }); output += label; }
    else output += `Ficha e ações: ${url}`;
    cursor = match.index + match[0].length;
  }
  output += raw.slice(cursor);
  // Preserve the original complete message when a plain-link replacement grows
  // beyond the canonical budget. Never truncate a warning or add a second send.
  return output.length <= 3900 ? { text: output, entities } : { text: raw, entities: [] };
}
export const wellhubTelegramMessage = (text, partners) => replaceUnitSources(text, partners, true);
export const wellhubPlainMessage = (text, partners) => replaceUnitSources(text, partners, false).text;
