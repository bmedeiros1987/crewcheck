import assert from 'node:assert/strict';
import {
  conciergeLocationState,
  filterConciergePlacesByLocation,
  normalizeConciergeLocation,
} from '../server/v14335/concierge-location.mjs';

const now = new Date('2026-07-30T21:30:00.000Z');
const airportPoints = {
  GYN: { latitude: -16.632, longitude: -49.221, city: 'Goiânia' },
  FLN: { latitude: -27.6703, longitude: -48.5525, city: 'Florianópolis' },
};

assert.equal(normalizeConciergeLocation({
  latitude: -16.632,
  longitude: -49.221,
  source: 'telegram',
  label: 'Goiânia/GO',
}, { now, airportPoints }), null, 'localização legada sem horário não pode ser renovada');

assert.equal(normalizeConciergeLocation({
  latitude: -27.6703,
  longitude: -48.5525,
  source: 'desconhecida',
  updatedAt: now.toISOString(),
}, { now, airportPoints }), null, 'origem desconhecida não pode ser aceita');

const florianopolis = normalizeConciergeLocation({
  latitude: -27.6703,
  longitude: -48.5525,
  source: 'telegram',
  updatedAt: now.toISOString(),
  label: 'Goiânia/GO',
  city: 'Goiânia',
  state: 'GO',
  nearestAirport: 'GYN',
}, { now, airportPoints });

assert.ok(florianopolis);
assert.equal(florianopolis.label, 'Florianópolis/SC');
assert.equal(florianopolis.city, '');
assert.equal(florianopolis.state, '');
assert.equal(florianopolis.nearestAirport, 'FLN');
assert.equal(conciergeLocationState(florianopolis, { now, airportPoints }).status, 'fresh');

const expired = conciergeLocationState({
  latitude: -27.6703,
  longitude: -48.5525,
  source: 'telegram',
  updatedAt: '2026-07-30T10:00:00.000Z',
}, { now, airportPoints });
assert.equal(expired.status, 'stale');
assert.match(expired.message, /Compartilhe novamente/);

assert.deepEqual(filterConciergePlacesByLocation([{ name: 'antigo' }], null), [], 'sem localização válida não deve listar locais de cidade anterior');

console.log('[regression:canonical-location] localização sem timestamp, origem desconhecida e Goiânia persistida bloqueadas.');
