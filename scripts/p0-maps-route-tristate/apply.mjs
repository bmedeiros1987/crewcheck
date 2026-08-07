import fs from 'node:fs';

const file = 'client/src/pages/Home.tsx';
if (!fs.existsSync(file)) throw new Error('[p0-maps-route-tristate] Home.tsx não encontrado.');

let source = fs.readFileSync(file, 'utf8');

if (!source.includes('const routeDistanceMeters = Number(route?.distanceMeters);')) {
  const oldDistanceMetric = '  const distanceKm = Number(route?.distanceMeters || 0) / 1000;';
  if (!source.includes(oldDistanceMetric)) throw new Error('[p0-maps-route-tristate] métrica de distância não localizada.');
  source = source.replace(oldDistanceMetric, [
    '  const routeDistanceMeters = Number(route?.distanceMeters);',
    '  const hasValidRouteDistance = Number.isFinite(routeDistanceMeters) && routeDistanceMeters > 0;',
    '  const distanceKm = hasValidRouteDistance ? routeDistanceMeters / 1000 : null;',
  ].join('\n'));
}

if (!source.includes("const trafficText = !route")) {
  const trafficPattern = /  const trafficText = [^\n]+;/;
  if (!trafficPattern.test(source)) throw new Error('[p0-maps-route-tristate] métrica de trânsito não localizada.');
  source = source.replace(trafficPattern, [
    "  const trafficText = !route",
    "    ? 'Calculando rota'",
    '    : route.trafficAware',
    "      ? safe(route.durationInTrafficText || route.durationText, 'Tempo atualizado')",
    '      : hasValidRouteDistance',
    "        ? safe(route.durationText, 'Tempo disponível')",
    "        : 'Trânsito indisponível';",
  ].join('\n'));
}

if (source.includes('const uberReference = distanceKm > 0 ?')) {
  source = source.replace('const uberReference = distanceKm > 0 ?', 'const uberReference = distanceKm !== null ?');
}

if (!source.includes("hasValidRouteDistance ? safe(route?.distanceText")) {
  const distanceKpiPattern = /<div><small>Distância<\/small><strong>\{route\?\.distanceText \|\| '[^']*'\}<\/strong><\/div>/;
  if (!distanceKpiPattern.test(source)) throw new Error('[p0-maps-route-tristate] KPI de distância não localizado.');
  source = source.replace(
    distanceKpiPattern,
    `<div><small>Distância</small><strong>{hasValidRouteDistance ? safe(route?.distanceText, \`${'${distanceKm!.toFixed(1).replace(\'.\', \',\')}'} km\`) : route ? 'Rota indisponível' : 'Calculando rota'}</strong></div>`,
  );
}

if (!source.includes("route?.trafficDelayText || (route ? 'Sem dado' : 'Calculando')")) {
  const delayPattern = /route\?\.trafficDelayText \|\| 'Calculando'/;
  if (delayPattern.test(source)) source = source.replace(delayPattern, "route?.trafficDelayText || (route ? 'Sem dado' : 'Calculando')");
}

for (const required of [
  'const routeDistanceMeters = Number(route?.distanceMeters);',
  'const hasValidRouteDistance = Number.isFinite(routeDistanceMeters) && routeDistanceMeters > 0;',
  'const distanceKm = hasValidRouteDistance ? routeDistanceMeters / 1000 : null;',
  "const trafficText = !route",
  "? 'Rota indisponível' : 'Calculando rota'",
  "route?.trafficDelayText || (route ? 'Sem dado' : 'Calculando')",
]) {
  if (!source.includes(required)) throw new Error(`[p0-maps-route-tristate] contrato ausente: ${required}`);
}
if (source.includes('const distanceKm = Number(route?.distanceMeters || 0) / 1000;')) {
  throw new Error('[p0-maps-route-tristate] ausência de rota ainda está sendo convertida em zero.');
}

fs.writeFileSync(file, source, 'utf8');
console.log('[p0-maps-route-tristate] rota indisponível não é mais tratada como 0,0 km; carregando/indisponível/válida permanecem distintos.');
