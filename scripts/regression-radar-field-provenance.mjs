import assert from 'node:assert/strict';
import { buildRadarFieldProvenance } from '../server/radar-field-provenance.mjs';

const context = { source: 'roster', operationCountry: 'BR' };
const base = {
  flightNumber: '3730',
  departureDate: '2026-08-12',
  origin: 'BSB',
  destination: 'FOR',
  scheduledDeparture: '2026-08-12T08:00:00-03:00',
};

{
  const result = buildRadarFieldProvenance([
    {
      ...base,
      provider: 'cirium-sky',
      carrier: 'LA',
      operatingCarrier: 'JJ',
      registration: 'PT-XPB',
      status: 'Monitorando',
      statusProvided: false,
      arrivalGate: '5',
      updatedAt: '2026-08-12T10:00:00Z',
    },
    {
      ...base,
      provider: 'provider-a',
      carrier: 'JJ',
      status: 'Programado',
      statusProvided: true,
      gate: '44',
      terminal: '1',
      updatedAt: '2026-08-12T09:59:00Z',
    },
  ], context, { providerPriority: ['provider-a', 'cirium-sky'] });

  assert.equal(result.fields.registration.value, 'PT-XPB');
  assert.equal(result.fields.registration.provider, 'cirium-sky');
  assert.equal(result.fields.status.value, 'Programado');
  assert.equal(result.fields.status.provider, 'provider-a');
  assert.equal(result.fields.departureGate.value, '44');
  assert.equal(result.fields.departureTerminal.value, '1');
  assert.equal(result.occurrenceKey.startsWith('LATAM_BR|3730|2026-08-12|BSB|FOR|'), true);
}

{
  const result = buildRadarFieldProvenance([
    {
      ...base,
      provider: 'cirium-sky',
      carrier: 'LA',
      arrivalGate: '5',
      arrivalTerminal: '2',
      status: 'Monitorando',
      statusProvided: false,
    },
  ], context);

  assert.equal(result.fields.departureGate, undefined);
  assert.equal(result.fields.departureTerminal, undefined);
  assert.equal(result.fields.status, undefined);
}

{
  const result = buildRadarFieldProvenance([
    {
      ...base,
      provider: 'provider-with-freshness',
      carrier: 'LA',
      status: 'Programado',
      statusProvided: true,
      updatedAt: '2026-08-12T09:58:00Z',
      latencyMs: 900,
    },
    {
      ...base,
      provider: 'provider-fast-no-freshness',
      carrier: 'JJ',
      status: 'Em voo',
      statusProvided: true,
      latencyMs: 30,
    },
  ], context);

  assert.equal(result.fields.status.provider, 'provider-with-freshness');
  assert.equal(result.fields.status.observedAt, '2026-08-12T09:58:00.000Z');
  assert.equal(result.fields.status.coverageState, 'provided_with_freshness');
}

{
  const result = buildRadarFieldProvenance([
    {
      ...base,
      provider: 'provider-a',
      carrier: 'LA',
      gate: '44',
    },
    {
      ...base,
      departureDate: '2026-08-13',
      scheduledDeparture: '2026-08-13T08:00:00-03:00',
      provider: 'provider-b',
      carrier: 'JJ',
      gate: '5',
    },
  ], context);

  assert.equal(result.fields.departureGate.value, '44');
  assert.deepEqual(result.matchedProviders, ['provider-a']);
}

console.log('radar field provenance regression: ok');
