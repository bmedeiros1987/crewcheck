import assert from 'node:assert/strict';
import fs from 'node:fs';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');

assert.ok(home.includes('const routeDistanceMeters = Number(route?.distanceMeters);'), 'distância deve ser lida sem fallback zero');
assert.ok(home.includes('const hasValidRouteDistance = Number.isFinite(routeDistanceMeters) && routeDistanceMeters > 0;'), 'rota válida exige distância finita e positiva');
assert.ok(home.includes('const distanceKm = hasValidRouteDistance ? routeDistanceMeters / 1000 : null;'), 'ausência de rota deve virar null, nunca zero');
assert.ok(!home.includes('const distanceKm = Number(route?.distanceMeters || 0) / 1000;'), 'fallback 0,0 km não pode regressar');
assert.ok(home.includes("route ? 'Rota indisponível' : 'Calculando rota'"), 'UI deve distinguir carregando de indisponível');
assert.ok(home.includes("? 'Calculando rota'"), 'trânsito deve manter estado de carregamento explícito');
assert.ok(home.includes("'Trânsito indisponível'"), 'falha de trânsito deve ser apresentada sem inventar ETA');
assert.ok(home.includes("route?.trafficDelayText || (route ? 'Sem dado' : 'Calculando')"), 'atraso de trânsito não deve ficar eternamente como calculando após falha');

console.log('[p0-maps-route-tristate] OK — rota ausente, carregando e válida permanecem semanticamente distintas.');
