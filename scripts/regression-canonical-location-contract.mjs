import assert from 'node:assert/strict';
import {
  conciergeLocationState,
  filterConciergePlacesByLocation,
  normalizeConciergeLocation,
} from '../server/v14335/concierge-location.mjs';

const now = new Date('2026-07-31T12:00:00.000Z');
const base = {
  latitude: -27.59487,
  longitude: -48.54822,
  updatedAt: '2026-07-31T11:55:00.000Z',
};

for (const source of ['telegram', 'web', 'android', 'app', 'manual', 'live', 'static']) {
  const normalized = normalizeConciergeLocation({ ...base, source }, { now });
  assert.ok(normalized, `fonte confiável deve ser aceita: ${source}`);
  assert.equal(normalized.source, ['live', 'static'].includes(source) ? 'telegram' : source);
}

assert.equal(normalizeConciergeLocation({ ...base, source: 'desconhecida' }, { now }), null);
assert.equal(normalizeConciergeLocation({ ...base, source: 'telegram', updatedAt: '' }, { now }), null);
assert.equal(normalizeConciergeLocation({ ...base, source: 'telegram', latitude: 95 }, { now }), null);
assert.equal(normalizeConciergeLocation({ ...base, source: 'telegram', longitude: 190 }, { now }), null);
assert.equal(
  normalizeConciergeLocation({ ...base, source: 'telegram', updatedAt: '2026-07-31T12:10:01.000Z' }, { now }),
  null,
  'timestamp futuro além da tolerância deve ser rejeitado',
);

const fresh = conciergeLocationState({ ...base, source: 'telegram' }, { now });
assert.equal(fresh.status, 'fresh');
assert.equal(fresh.fresh, true);
assert.ok(fresh.location);

const stale = conciergeLocationState(
  { ...base, source: 'telegram', updatedAt: '2026-07-31T04:00:00.000Z' },
  { now },
);
assert.equal(stale.status, 'stale');
assert.equal(stale.fresh, false);

const places = filterConciergePlacesByLocation([
  { name: 'Perto', location: { latitude: -27.595, longitude: -48.548 } },
  { name: 'Mais longe', location: { latitude: -27.62, longitude: -48.58 } },
  { name: 'Muito longe', location: { latitude: -23.55, longitude: -46.63 } },
], base, 35);

assert.deepEqual(places.map((place) => place.name), ['Perto', 'Mais longe']);
assert.ok(places[0].distanceKm <= places[1].distanceKm);

console.log('[regression:canonical-location-contract] fontes, validade, coordenadas e distância validadas.');
