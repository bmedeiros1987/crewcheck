import assert from 'node:assert/strict';
import fs from 'node:fs';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');

assert.ok(home.includes('const routeDistanceMeters = Number(route?.distanceMeters);'), 'Saída Inteligente deve ler a distância sem fallback zero');
assert.ok(home.includes('const hasValidRouteDistance = Number.isFinite(routeDistanceMeters) && routeDistanceMeters > 0;'), 'rota válida exige distância finita e positiva');
assert.ok(home.includes('const distanceKm = hasValidRouteDistance ? routeDistanceMeters / 1000 : null;'), 'ausência de rota da Saída Inteligente deve virar null');
assert.ok(home.includes("route ? 'Rota indisponível' : 'Calculando rota'"), 'UI deve distinguir carregando de indisponível');
assert.ok(home.includes("const trafficText = !route"), 'trânsito deve possuir estado de carregamento explícito');
assert.ok(home.includes("'Trânsito indisponível'"), 'falha de trânsito deve ser apresentada sem inventar ETA');

const protectedBlockStart = home.indexOf('const routeDistanceMeters = Number(route?.distanceMeters);');
const protectedBlockEnd = home.indexOf('const updatedLabel', protectedBlockStart);
const protectedBlock = home.slice(protectedBlockStart, protectedBlockEnd > protectedBlockStart ? protectedBlockEnd : protectedBlockStart + 2200);
assert.ok(!/const distanceKm = Number\(route\?\.distanceMeters\s*\|\|\s*0\)\s*\/\s*1000;/.test(protectedBlock), 'bloco protegido não pode converter rota ausente em 0,0 km');

console.log('[p0-maps-route-tristate] OK — Saída Inteligente distingue rota ausente, carregando e válida sem mascarar falha como 0,0 km.');
