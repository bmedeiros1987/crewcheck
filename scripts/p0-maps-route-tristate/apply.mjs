import fs from 'node:fs';

const file = 'client/src/pages/Home.tsx';
if (!fs.existsSync(file)) throw new Error('[p0-maps-route-tristate] Home.tsx não encontrado.');

let source = fs.readFileSync(file, 'utf8');

function replaceSingleLineDeclaration(name, replacement) {
  if (source.includes(replacement)) return true;
  const pattern = new RegExp(`^\\s*const ${name} = .*;$`, 'm');
  if (!pattern.test(source)) return false;
  source = source.replace(pattern, replacement);
  return true;
}

function replaceDeclarationBefore(name, nextNames, replacement) {
  if (source.includes(replacement)) return true;
  const startPattern = new RegExp(`(^|\\n)([ \\t]*)const ${name}\\s*=`, 'm');
  const startMatch = startPattern.exec(source);
  if (!startMatch) return false;
  const start = startMatch.index + (startMatch[1] ? startMatch[1].length : 0);
  const searchFrom = start + startMatch[0].length - (startMatch[1] ? startMatch[1].length : 0);
  let end = -1;
  for (const nextName of nextNames) {
    const nextPattern = new RegExp(`\\n[ \\t]*const ${nextName}\\s*=`, 'm');
    const tail = source.slice(searchFrom);
    const nextMatch = nextPattern.exec(tail);
    if (!nextMatch) continue;
    const candidate = searchFrom + nextMatch.index;
    if (end < 0 || candidate < end) end = candidate;
  }
  if (end < 0) return false;
  source = source.slice(0, start) + replacement + source.slice(end);
  return true;
}

if (!source.includes('const routeDistanceMeters = Number(route?.distanceMeters);')) {
  const replaced = replaceSingleLineDeclaration('distanceKm', '  const routeDistanceMeters = Number(route?.distanceMeters);\n  const hasValidRouteDistance = Number.isFinite(routeDistanceMeters) && routeDistanceMeters > 0;\n  const distanceKm = hasValidRouteDistance ? routeDistanceMeters / 1000 : null;');
  if (!replaced) throw new Error('[p0-maps-route-tristate] declaração distanceKm não localizada.');
}

const trafficReplacement = `  const trafficText = !route
    ? 'Calculando rota'
    : route.trafficAware
      ? safe(route.durationInTrafficText || route.durationText, 'Tempo atualizado')
      : hasValidRouteDistance
        ? safe(route.durationText, 'Tempo disponível')
        : 'Trânsito indisponível';`;

if (!source.includes("const trafficText = !route")) {
  const replaced = replaceDeclarationBefore('trafficText', ['updatedLabel', 'uberReference'], trafficReplacement);
  if (!replaced) {
    const anchor = '  const distanceKm = hasValidRouteDistance ? routeDistanceMeters / 1000 : null;';
    if (!source.includes(anchor)) throw new Error('[p0-maps-route-tristate] âncora de distância não localizada para inserir trânsito.');
    source = source.replace(anchor, `${anchor}\n${trafficReplacement}`);
  }
}

if (!source.includes('const uberReference = distanceKm !== null')) {
  const uberReplacement = `  const uberReference = distanceKm !== null ? \`R$ \${Math.max(8, distanceKm * 2.1 + 6).toFixed(0)} a R$ \${Math.max(12, distanceKm * 3.1 + 9).toFixed(0)}\` : '';`;
  const replaced = replaceSingleLineDeclaration('uberReference', uberReplacement);
  if (!replaced) {
    const anchor = "        : 'Trânsito indisponível';";
    if (!source.includes(anchor)) throw new Error('[p0-maps-route-tristate] referência Uber e âncora de trânsito não localizadas.');
    source = source.replace(anchor, `${anchor}\n${uberReplacement}`);
  }
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

fs.writeFileSync(file, source, 'utf8');
console.log('[p0-maps-route-tristate] bloco da Saída Inteligente preserva carregando/indisponível/válida sem representar falha como 0,0 km.');
