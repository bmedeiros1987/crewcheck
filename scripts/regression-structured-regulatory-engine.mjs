import assert from 'node:assert/strict';
import {
  RegulatoryError,
  createRegulatoryEngine,
  modelStandbyActivation,
  resolveProfileAt,
} from '../server/regulatory/engine.mjs';
import { OFFICIAL_REGULATORY_CORPUS } from '../server/regulatory/official-corpus.mjs';

const pilotHistory = [
  { effectiveFrom: '2025-01-01', effectiveTo: '2026-06-30', company: 'LATAM', role: 'pilot', fleetGroup: 'narrow_body', contractualBase: 'SAO', contractualAirport: 'GRU' },
  { effectiveFrom: '2026-07-01', company: 'LATAM', role: 'pilot', fleetGroup: 'wide_body', contractualBase: 'SAO', contractualAirport: 'GRU', virtualBase: 'POA' },
];

assert.equal(resolveProfileAt(pilotHistory, '2026-03-10').fleetGroup, 'narrow_body');
assert.equal(resolveProfileAt(pilotHistory, '2026-08-10').fleetGroup, 'wide_body');
assert.throws(
  () => resolveProfileAt([{ effectiveFrom: '2026-01-01', company: 'LATAM', role: 'pilot' }], '2026-03-10'),
  (error) => error instanceof RegulatoryError && error.code === 'MISSING_PROFILE_DATA' && error.missingFields.includes('fleetGroup'),
);
assert.throws(
  () => resolveProfileAt([
    { effectiveFrom: '2026-01-01', company: 'LATAM', role: 'cabin', contractualBase: 'SAO', contractualAirport: 'GRU' },
    { effectiveFrom: '2026-02-01', company: 'LATAM', role: 'cabin', contractualBase: 'RIO', contractualAirport: 'GIG' },
  ], '2026-03-10'),
  (error) => error instanceof RegulatoryError && error.code === 'AMBIGUOUS_PROFILE',
);

const engine = createRegulatoryEngine({ corpus: OFFICIAL_REGULATORY_CORPUS });

const cabin90 = engine.answer({
  intent: { kind: 'standby_callout_window' },
  at: '2026-03-10T10:00:00-03:00',
  profileHistory: [{ effectiveFrom: '2025-12-01', company: 'LATAM', role: 'cabin', contractualBase: 'BSB', contractualAirport: 'BSB' }],
  facts: { contractualBaseAirportCount: 1 },
});
assert.equal(cabin90.status, 'answered');
assert.equal(cabin90.result.minutes, 90);
assert.equal(cabin90.authority.documentType, 'ACT');
assert.equal(cabin90.sources[0].clause, '3.3.11');
assert.equal(cabin90.sources[0].page, 19);
assert.ok(cabin90.sources[0].uri);
assert.deepEqual(cabin90.actions.map((action) => action.kind), ['view_source', 'show_calculation']);

const pilot150 = engine.answer({
  intent: { kind: 'standby_callout_window' },
  at: '2026-03-10T10:00:00-03:00',
  profileHistory: pilotHistory,
  facts: { contractualBaseAirportCount: 2 },
});
assert.equal(pilot150.result.minutes, 150);
assert.equal(pilot150.sources[0].page, 22);
assert.match(pilot150.explanation, /Piloto.*NarrowBody/i);

const actOverCct = createRegulatoryEngine({ corpus: [...OFFICIAL_REGULATORY_CORPUS, {
  id: 'cct-test', document: { id: 'cct-test-doc', type: 'CCT', title: 'CCT oficial de teste', official: true, effectiveFrom: '2025-01-01', uri: 'urn:test:cct', identifier: 'CCT-TEST' },
  subject: 'standby_callout_window', value: { defaultMinutes: 70, multiAirportMinutes: 70 },
  scope: { companies: ['LATAM'], roles: ['cabin'] }, citation: { clause: '10', page: 2 },
}] }).answer({
  intent: { kind: 'standby_callout_window' }, at: '2026-03-10',
  profileHistory: [{ effectiveFrom: '2025-12-01', company: 'LATAM', role: 'cabin', contractualBase: 'BSB', contractualAirport: 'BSB' }],
  facts: { contractualBaseAirportCount: 1 },
});
assert.equal(actOverCct.result.minutes, 90);
assert.equal(actOverCct.authority.documentType, 'ACT');

assert.throws(
  () => engine.answer({
    intent: { kind: 'standby_callout_window' },
    at: '2026-03-10',
    profileHistory: [{ effectiveFrom: '2025-12-01', company: 'LATAM', role: 'cabin', contractualBase: 'SAO', contractualAirport: 'GRU' }],
    facts: {},
  }),
  (error) => error instanceof RegulatoryError && error.code === 'MISSING_DECISIVE_FACT' && error.questions.length === 1,
);

const virtualBase = engine.answer({
  intent: { kind: 'base_context_alert' },
  at: '2026-08-10',
  profileHistory: pilotHistory,
  facts: { operationAirport: 'POA' },
});
assert.equal(virtualBase.result.isContractualBase, false);
assert.equal(virtualBase.result.isVirtualBase, true);
assert.match(virtualBase.explanation, /não equivale.*base contratual/i);

const activated = modelStandbyActivation({
  standby: { id: 'hsb-1', kind: 'HSB', startsAt: '2026-03-10T06:00:00-03:00', endsAt: '2026-03-10T12:00:00-03:00' },
  activation: { id: 'flight-1', kind: 'flight', reportAt: '2026-03-10T09:30:00-03:00', startsAt: '2026-03-10T10:00:00-03:00' },
});
assert.equal(activated.complianceReference.kind, 'HSB');
assert.equal(activated.operationalReference.kind, 'flight');
assert.equal(activated.complianceReference.activationId, 'flight-1');

const mandatoryLawCorpus = [...OFFICIAL_REGULATORY_CORPUS, {
  id: 'law-test', document: { id: 'law-test-doc', type: 'LAW', title: 'Lei imperativa de teste', official: true, effectiveFrom: '2025-01-01', uri: 'urn:test:law' },
  subject: 'standby_callout_window', effect: 'maximum', mandatory: true, value: { minutes: 80 },
  scope: { companies: ['LATAM'], roles: ['cabin'] }, citation: { article: '1', page: 1 },
}];
const mandatoryEngine = createRegulatoryEngine({ corpus: mandatoryLawCorpus });
const mandatory = mandatoryEngine.answer({
  intent: { kind: 'standby_callout_window' }, at: '2026-03-10',
  profileHistory: [{ effectiveFrom: '2025-12-01', company: 'LATAM', role: 'cabin', contractualBase: 'BSB', contractualAirport: 'BSB' }],
  facts: { contractualBaseAirportCount: 1 },
});
assert.equal(mandatory.result.minutes, 80);
assert.equal(mandatory.authority.documentType, 'LAW');

assert.throws(
  () => createRegulatoryEngine({ corpus: [{ id: 'bad', document: { id: 'x', type: 'ACT', title: 'Sem fonte', official: false, effectiveFrom: '2025-01-01' }, subject: 'standby_callout_window', value: { minutes: 90 }, scope: {} }] }),
  (error) => error instanceof RegulatoryError && error.code === 'INVALID_CORPUS',
);
assert.throws(
  () => engine.answer({ intent: { kind: 'invent_apz' }, at: '2026-03-10', profileHistory: pilotHistory, facts: {} }),
  (error) => error instanceof RegulatoryError && error.code === 'UNSUPPORTED_INTENT',
);

console.log('Structured regulatory engine: temporal profile, scope, hierarchy, citations, fail-closed, HSB activation and deterministic concierge OK');
