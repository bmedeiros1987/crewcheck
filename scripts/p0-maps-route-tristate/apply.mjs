import fs from 'node:fs';

const file = 'client/src/pages/Home.tsx';
if (!fs.existsSync(file)) throw new Error('[p0-maps-route-tristate] Home.tsx não encontrado.');

let source = fs.readFileSync(file, 'utf8');

function replaceDeclaration(name, replacement) {
  if (source.includes(replacement)) return;
  const pattern = new RegExp(`^\\s*const ${name} = .*;$`, 'm');
  if (!pattern.test(source)) throw new Error(`[p0-maps-route-tristate] declaração ${name} não localizada.`);
  source = source.replace(pattern, replacement);
}

if (!source.includes('const routeDistanceMeters = Number(route?.distanceMeters);')) {
  replaceDeclaration('distanceKm', '  const routeDistanceMeters = Number(route?.distanceMeters);\n  const hasValidRouteDistance = Number.isFinite(routeDistanceMeters) && routeDistanceMeters > 0;\n  const distanceKm = hasValidRouteDistance ? routeDistanceMeters / 1000 : null;');
}

if (!source.includes("const trafficText = !route")) {
  const trafficPattern = /^\s*const trafficText = .*;$/m;
  if (!trafficPattern.test(source)) throw new Error('[p0-maps-route-tristate] métrica de trânsito não localizada.');
  source = source.replace(trafficPattern, `  const trafficText = !route
    ? 'Calculando rota'
    : route.trafficAware
      ? safe(route.durationInTrafficText || route.durationText, 'Tempo atualizado')
      : hasValidRouteDistance
        ? safe(route.durationText, 'Tempo disponível')
        : 'Trânsito indisponível';`);
}

if (!source.includes('const uberReference = distanceKm !== null')) {
  const uberPattern = /^\s*const uberReference = .*;$/m;
  if (!uberPattern.test(source)) throw new Error('[p0-maps-route-tristate] referência Uber não localizada.');
  source = source.replace(uberPattern, `  const uberReference = distanceKm !== null ? \`R$ \${Math.max(8, distanceKm * 2.1 + 6).toFixed(0)} a R$ \${Math.max(12, distanceKm * 3.1 + 9).toFixed(0)}\` : '';`);
}

const distanceKpiPattern = /<div><small>Distância<\/small><strong>\{[^\n]*?<\/strong><\/div>/;
if (!source.includes("hasValidRouteDistance ? safe(route?.distanceText")) {
  if (!distanceKpiPattern.test(source)) throw new Error('[p0-maps-route-tristate] KPI de distância não localizado.');
  source = source.replace(distanceKpiPattern, `<div><small>Distância</small><strong>{hasValidRouteDistance ? safe(route?.distanceText, (distanceKm !== null ? distanceKm.toFixed(1).replace('.', ',') : '—') + ' km') : route ? 'Rota indisponível' : 'Calculando rota'}</strong></div>`);
}

const delayKpiPattern = /<div><small>Atraso do trânsito<\/small><strong>\{[^\n]*?<\/strong><\/div>/;
if (!source.includes("route?.trafficDelayText || (route ? 'Sem dado' : 'Calculando')") && delayKpiPattern.test(source)) {
  source = source.replace(delayKpiPattern, `<div><small>Atraso do trânsito</small><strong>{route?.trafficDelayText || (route ? 'Sem dado' : 'Calculando')}</strong></div>`);
}

for (const required of [
  'const routeDistanceMeters = Number(route?.distanceMeters);',
  'const hasValidRouteDistance = Number.isFinite(routeDistanceMeters) && routeDistanceMeters > 0;',
  'const distanceKm = hasValidRouteDistance ? routeDistanceMeters / 1000 : null;',
  "const trafficText = !route",
  "'Trânsito indisponível'",
  "? 'Rota indisponível' : 'Calculando rota'",
]) {
  if (!source.includes(required)) throw new Error(`[p0-maps-route-tristate] contrato ausente: ${required}`);
}
if (/const distanceKm = Number\(route\?\.distanceMeters\s*\|\|\s*0\)\s*\/\s*1000;/.test(source)) {
  throw new Error('[p0-maps-route-tristate] ausência de rota ainda está sendo convertida em zero.');
}

fs.writeFileSync(file, source, 'utf8');
console.log('[p0-maps-route-tristate] rota indisponível não é mais tratada como 0,0 km; carregando/indisponível/válida permanecem distintos.');
