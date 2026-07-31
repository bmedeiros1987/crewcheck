import fs from 'node:fs';
import assert from 'node:assert/strict';

const helper = fs.readFileSync('scripts/v14365/health-nearby.snippet', 'utf8');
const pharmacies = fs.readFileSync('scripts/v14365/pharmacies-reply.snippet', 'utf8');
const hospitals = fs.readFileSync('scripts/v14365/hospitals-reply.snippet', 'utf8');
const loader = fs.readFileSync('scripts/v139/apply.mjs', 'utf8');

assert.match(helper, /places:searchNearby/, 'saúde deve usar Nearby Search');
assert.match(helper, /locationRestriction/, 'busca deve restringir por coordenadas');
assert.match(helper, /rankPreference:\s*'DISTANCE'/, 'resultados devem ser ordenados por distância');
assert.match(helper, /filterConciergePlacesByLocationV14335\(places, current, 35\)/, 'resultados fora de 35 km devem ser descartados');
assert.doesNotMatch(helper, /Goiânia|GYN|GO['"`]/, 'helper não pode conter fallback fixo de Goiânia');

assert.match(pharmacies, /conciergeSearchNearbyHealthPlaces\(\['pharmacy'\]/, 'Farmácias deve consumir o helper canônico');
assert.match(hospitals, /conciergeSearchNearbyHealthPlaces\(\['hospital'\]/, 'Hospitais deve consumir o helper canônico');
assert.doesNotMatch(pharmacies, /conciergeSearchPlaces\(/, 'Farmácias não pode usar busca textual com fallback de cidade');
assert.doesNotMatch(hospitals, /conciergeSearchPlaces\(/, 'Hospitais não pode usar busca textual com fallback de cidade');
assert.match(loader, /v14365\/apply\.mjs/, 'patch deve participar da preparação canônica');

console.log('[regression:v14.3.65] Farmácias e Hospitais usam localização canônica restrita: OK');
