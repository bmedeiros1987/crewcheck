const clean = value => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600);
export const companyTransportFold = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function companyTransportIntent(text = '') {
  const value = companyTransportFold(text).replace(/^(\/\w+)@\w+(?=\s|$)/, '$1');
  const command = /^\/transporte_empresa(?:\s|$)/.test(value);
  const vehicle = /\b(?:onibus|vans?|transporte)\b/.test(value);
  const corporate = /\b(?:empresa|latam|corporativo|intersites)\b/.test(value);
  const bareMenu = /^(?:ver )?(?:onibus|van|vans|onibus (?:e|ou) vans?)[?!.]?$/.test(value);
  if (!command && !(vehicle && corporate) && !bareMenu) return null;
  const route = value.match(/\bde (.+?) (?:para|ate) (.+?)(?=\s+(?:em|no dia|embarque|desembarque|operadora)\b|[,;?!.]|$)/) || value.match(/\b([a-z]{3})\s*(?:→|->)\s*([a-z]{3})\b/);
  const field = name => value.match(new RegExp('\\b' + name + '\\s*:?\\s+(.+?)(?=\\s+(?:em|no dia|embarque|desembarque|operadora)\\b|[,;?!.]|$)'))?.[1]?.trim() || '';
  const serviceDate = value.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1] || '';
  return { origin: route?.[1]?.trim() || '', destination: route?.[2]?.trim() || '', serviceDate,
    boardingPoint: field('embarque'), alightingPoint: field('desembarque'), operator: field('operadora'),
    requestedVehicle: /\bvans?\b/.test(value) && !/\bonibus\b/.test(value) ? 'van' : /\bonibus\b/.test(value) && !/\bvans?\b/.test(value) ? 'bus' : null };
}
