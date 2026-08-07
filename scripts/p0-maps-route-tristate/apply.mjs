import fs from 'node:fs';

const file = 'client/src/pages/Home.tsx';
if (!fs.existsSync(file)) throw new Error('[p0-maps-route-tristate] Home.tsx não encontrado.');

let source = fs.readFileSync(file, 'utf8');

const oldMetrics = `  const trafficText = route?.trafficAware ? safe(route.durationInTrafficText || route.durationText, 'Tempo atualizado') : 'Ao abrir no Google Maps';\n  const updatedLabel = route?.updatedAt ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(route.updatedAt)) : 'aguardando';\n  const distanceKm = Number(route?.distanceMeters || 0) / 1000;\n  const uberReference = distanceKm > 0 ? \`R$ \${Math.max(8, distanceKm * 2.1 + 6).toFixed(0)} a R$ \${Math.max(12, distanceKm * 3.1 + 9).toFixed(0)}\` : '';`;
const newMetrics = `  const routeDistanceMeters = Number(route?.distanceMeters);\n  const hasValidRouteDistance = Number.isFinite(routeDistanceMeters) && routeDistanceMeters > 0;\n  const distanceKm = hasValidRouteDistance ? routeDistanceMeters / 1000 : null;\n  const trafficText = !route\n    ? 'Calculando rota'\n    : route.trafficAware\n      ? safe(route.durationInTrafficText || route.durationText, 'Tempo atualizado')\n      : hasValidRouteDistance\n        ? safe(route.durationText, 'Tempo disponível')\n        : 'Trânsito indisponível';\n  const updatedLabel = route?.updatedAt ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(route.updatedAt)) : 'aguardando';\n  const uberReference = distanceKm !== null ? \`R$ \${Math.max(8, distanceKm * 2.1 + 6).toFixed(0)} a R$ \${Math.max(12, distanceKm * 3.1 + 9).toFixed(0)}\` : '';`;

if (!source.includes('const routeDistanceMeters = Number(route?.distanceMeters);')) {
  if (!source.includes(oldMetrics)) throw new Error('[p0-maps-route-tristate] bloco de métricas de rota não localizado.');
  source = source.replace(oldMetrics, newMetrics);
}

const oldDistance = `<div><small>Distância</small><strong>{route?.distanceText || 'Abrir Maps'}</strong></div>`;
const newDistance = `<div><small>Distância</small><strong>{hasValidRouteDistance ? safe(route?.distanceText, \`${'${distanceKm!.toFixed(1).replace(\'.\', \',\')}'} km\`) : route ? 'Rota indisponível' : 'Calculando rota'}</strong></div>`;
if (!source.includes("hasValidRouteDistance ? safe(route?.distanceText")) {
  if (!source.includes(oldDistance)) throw new Error('[p0-maps-route-tristate] KPI de distância não localizado.');
  source = source.replace(oldDistance, newDistance);
}

const oldDelay = `<div><small>Atraso do trânsito</small><strong>{route?.trafficDelayText || 'Calculando'}</strong></div>`;
const newDelay = `<div><small>Atraso do trânsito</small><strong>{route?.trafficDelayText || (route ? 'Sem dado' : 'Calculando')}</strong></div>`;
if (source.includes(oldDelay)) source = source.replace(oldDelay, newDelay);

for (const required of [
  'const routeDistanceMeters = Number(route?.distanceMeters);',
  'const hasValidRouteDistance = Number.isFinite(routeDistanceMeters) && routeDistanceMeters > 0;',
  "? 'Rota indisponível' : 'Calculando rota'",
  "? 'Sem dado' : 'Calculando'",
]) {
  if (!source.includes(required)) throw new Error(`[p0-maps-route-tristate] contrato ausente: ${required}`);
}
if (source.includes('const distanceKm = Number(route?.distanceMeters || 0) / 1000;')) {
  throw new Error('[p0-maps-route-tristate] ausência de rota ainda está sendo convertida em zero.');
}

fs.writeFileSync(file, source, 'utf8');
console.log('[p0-maps-route-tristate] rota indisponível não é mais tratada como 0,0 km; carregando/indisponível/válida permanecem distintos.');
