import assert from 'node:assert/strict';
import { radarOccurrenceKey, sameRadarOccurrence } from '../server/radar-occurrence-identity.mjs';

const domesticRosterContext = { source: 'roster', operationCountry: 'BR' };

const la = {
  carrier: 'LA',
  flightNumber: '3730',
  departureDate: '2026-08-12',
  origin: 'BSB',
  destination: 'FOR',
  scheduledDeparture: '2026-08-12T09:15:00-03:00',
};

const jj = {
  carrier: 'JJ',
  flightNumber: '3730',
  departureDate: '2026-08-12',
  origin: 'BSB',
  destination: 'FOR',
  scheduledDeparture: '2026-08-12T09:15:00-03:00',
};

assert.equal(sameRadarOccurrence(la, jj, domesticRosterContext), true, 'LA/JJ domestic roster aliases must reconcile to one occurrence');
assert.equal(radarOccurrenceKey(la, domesticRosterContext), radarOccurrenceKey(jj, domesticRosterContext));

assert.equal(
  sameRadarOccurrence(la, { ...jj, departureDate: '2026-08-13', scheduledDeparture: '2026-08-13T09:15:00-03:00' }, domesticRosterContext),
  false,
  'same flight number on another local departure date must remain a distinct occurrence',
);

assert.equal(
  sameRadarOccurrence(la, { ...jj, destination: 'GRU' }, domesticRosterContext),
  false,
  'different route must remain a distinct occurrence',
);

assert.equal(
  sameRadarOccurrence(la, jj, { source: 'radar_search', operationCountry: '' }),
  false,
  'ad-hoc Radar search must not globally collapse LA/JJ without the domestic roster context',
);

assert.equal(
  sameRadarOccurrence(la, { ...jj, scheduledDeparture: '2026-08-12T10:15:00-03:00' }, domesticRosterContext),
  false,
  'different published departure time must remain distinct when both times are available',
);

console.log('Radar occurrence identity regression OK');
