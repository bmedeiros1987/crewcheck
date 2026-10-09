import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { amilCoverage, amilConfirmedProviders, amilUnknownMessage } from '../shared/amil-coverage.mjs';
import { pharmacyReferenceReply } from '../server/concierge/pharmacy-reference.mjs';
const now = new Date('2026-10-09T12:00:00Z');
// Synthetic evidence exercises the contract; these are not real accredited units.
const selection = { planCode: 'S450', productCode: 'fixture-QP', networkCode: 'fixture-network', serviceCode: 'PS', specialty: 'PRONTO SOCORRO ADULTO', city: 'Santa Maria', state: 'DF' };
const unit = { id: 'fixture-unit-1', name: 'Hospital Fixture Unidade Sul', address: 'Rua Fixture 1', city: 'Santa Maria', state: 'DF', coverageEvidence: { ...selection, unitId: 'fixture-unit-1', unitName: 'Hospital Fixture Unidade Sul', unitAddress: 'Rua Fixture 1', sourceUrl: 'https://amil.com.br/fixture-only', verifiedAt: '2026-10-09', decision: 'included' } };
assert.equal(amilCoverage(unit, selection, now).status, 'confirmed_in_network');
for (const changed of [{ planCode: 'S750' }, { productCode: 'fixture-QC' }, { networkCode: 'other-network' }, { serviceCode: 'M' }, { specialty: 'PRONTO SOCORRO INFANTIL' }, { specialty: '' }, { state: 'RS' }, { city: 'Santa Maria do Sul' }]) {
  assert.equal(amilCoverage(unit, { ...selection, ...changed }, now).status, 'unknown');
}
for (const change of [{ id: 'fixture-unit-2' }, { name: 'Hospital Fixture Unidade Norte' }, { address: 'Rua Fixture 2' }]) assert.equal(amilCoverage({ ...unit, ...change }, selection, now).status, 'unknown');
assert.equal(amilCoverage(unit, { ...selection, productCode: '' }, now).reason, 'ambiguous_plan');
assert.equal(amilCoverage(unit, { ...selection, planCode: '' }, now).reason, 'missing_plan_details');
assert.equal(amilCoverage({ ...unit, coverageEvidence: undefined }, selection, now).reason, 'source_unavailable');
assert.equal(amilCoverage({ ...unit, coverageEvidence: { ...unit.coverageEvidence, sourceUrl: 'https://amil.com.br.example.com/rede' } }, selection, now).reason, 'source_unavailable');
assert.equal(amilCoverage({ ...unit, coverageEvidence: { ...unit.coverageEvidence, verifiedAt: '2025-06-12' } }, selection, now).reason, 'stale');
assert.equal(amilCoverage({ ...unit, coverageEvidence: { ...unit.coverageEvidence, decision: 'excluded' } }, selection, now).status, 'confirmed_excluded');
assert.deepEqual(amilConfirmedProviders([unit], { ...selection, planCode: 'S750' }, now), []);
assert.deepEqual(amilConfirmedProviders([{ name: 'Random Maps Hospital', covered: true }], selection, now), []);
assert.deepEqual(amilConfirmedProviders([], selection, now), []);
assert.match(amilUnknownMessage('S750'), /não significa ausência de cobertura/);
assert.equal(amilCoverage({ ...unit, name: '', coverageEvidence: { ...unit.coverageEvidence, unitName: '' } }, selection, now).status, 'unknown');
for (const verifiedAt of ['', '2026-10-10']) assert.equal(amilCoverage({ ...unit, coverageEvidence: { ...unit.coverageEvidence, verifiedAt } }, selection, now).reason, 'stale');
assert.equal(amilCoverage({ ...unit, coverageEvidence: { ...unit.coverageEvidence, planCode: 'S750' } }, { ...selection, planCode: 'S750' }, now).status, 'confirmed_in_network');
for (const [planCode, productCode, networkCode] of [['S450', 'Amil S450 QP', 'AMIL S450 COPART ADM'], ['S750', 'Amil S750 QP', 'Amil S750 COLAB']]) {
  const variant = { ...selection, planCode, productCode, networkCode: productCode };
  const provider = { ...unit, coverageEvidence: { ...unit.coverageEvidence, ...variant } };
  assert.equal(amilCoverage(provider, variant, now).status, 'confirmed_in_network');
  assert.equal(amilCoverage(provider, { ...variant, networkCode }, now).status, 'unknown');
  assert.equal(amilCoverage(provider, { ...variant, productCode: networkCode }, now).status, 'unknown');
}
for (const code of ['S450', 'S750', 'Amil S450', ' AMIL S750 ', 's 450', '   ']) {
  for (const field of ['productCode', 'networkCode']) {
    const ambiguous = { ...selection, [field]: code };
    const matching = { ...unit, coverageEvidence: { ...unit.coverageEvidence, ...ambiguous } };
    assert.equal(amilCoverage(matching, ambiguous, now).reason, 'ambiguous_plan');
    assert.deepEqual(amilConfirmedProviders([matching], ambiguous, now), []);
  }
}
const located = amilConfirmedProviders([{ ...unit, mapsQuery: 'Wrong northern branch RS' }], selection, now)[0];
assert.equal(located.mapsQuery, 'Hospital Fixture Unidade Sul, Rua Fixture 1, Santa Maria, DF');
const snapshot = { email: 'fixture@example.invalid', roster: [] };
const profile = { email: snapshot.email, channel: 'app' };
let lookups = 0, writes = 0;
const deps = { stays: () => [], lookup: () => { lookups++; }, nearby: () => { lookups++; }, save: () => { writes++; } };
const reply = await pharmacyReferenceReply('hospitais perto de Hotel Fixture', profile, snapshot, deps, now);
assert.equal(reply.handled, true); assert.match(reply.reply, /Guia Amil/); assert.equal(lookups, 0); assert.equal(writes, 0);
const visitor = await pharmacyReferenceReply('hospitais', { email: 'other@example.invalid' }, snapshot, deps, now);
assert.match(visitor.reply, /confirmar a conta/); assert.equal(lookups, 0);
// Execute the real emergency result producer: it must not read medical data,
// search Maps or send an invented compatibility list, even without a plan.
const emergency = fs.readFileSync('server/v1391/emergency.mjs', 'utf8');
const block = emergency.slice(emergency.indexOf('async function sendOpenCareResults('), emergency.indexOf('async function registeredHotelsReply('));
let messages = [];
const context = vm.createContext({ amilUnknownMessage, emergencyMedical: () => { throw Error('private medical read'); }, openNearbyPlaces: () => { throw Error('generic lookup'); } });
vm.runInContext(block, context);
const result = await context.sendOpenCareResults(null, 'fixture@example.invalid', 123, 'hospital', null, async (_chat, message) => messages.push(message));
assert.equal(result.coverageStatus, 'unknown'); assert.equal(messages.length, 1); assert.match(messages[0], /SAMU 192/);
if (process.argv.includes('--prepared')) {
  const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
  assert.match(home, /category === 'hospital' \? \[\] : await fetchNearbyPlaces/);
  assert.match(home, /category === 'hospital' \? \[\] : \[\.\.\.manualPlaces/);
  assert.match(home, /requestSelection !== amilSelectionRef.current/);
  assert.match(home, /amilConfirmedProviders\(response.providers, options\)/);
  assert.match(home, /category !== 'hospital' && selected/);
  assert.match(home, /visibleAmilProviders = amilConfirmedProviders/);
  assert.match(home, /encodeURIComponent\(\[provider.name, provider.address, provider.city, provider.state\].join/);
  assert.doesNotMatch(home, /encodeURIComponent\(provider.mapsQuery/);
  // Execute the actual search with a deferred fixture response. A later
  // variant/service/account change must discard that response, not relabel it.
  let searchBlock = home.slice(home.indexOf('  async function search() {'), home.indexOf('  function saveManualPlace()', home.indexOf('  async function search() {'))).replace('let found: NearbyPlace[];', 'let found;').replace('as NearbyPlace[]', '');
  for (const reason of ['variant', 'service', 'account']) {
    let resolveResponse, applied = 0;
    const deferred = new Promise(resolve => { resolveResponse = resolve; });
    const sequence = { current: 0 }, key = { current: 'fixture-original' };
    const searchContext = vm.createContext({ category: 'hospital', location: '', locationMode: 'layover', coordinates: null, amilSearchSequence: sequence, amilSelectionRef: key,
      setLoading: () => {}, searchTerm: '', setPlaces: () => {}, setSelected: () => {}, fetchAmilProviders: () => deferred,
      amilPlan: 'S450', amilProduct: 'fixture-QP', amilNetwork: 'fixture-network', amilService: 'PS', amilSpecialty: 'PRONTO SOCORRO ADULTO', amilState: 'DF', amilCity: 'Santa Maria', amilQuery: '', amilCare: 'adult_emergency',
      setAmilProviders: () => { applied++; }, setAmilMessage: () => {}, setAmilTotal: () => {}, setAmilSourcePage: () => {}, toast: { message: () => {} }, categoryMeta: { plural: 'Hospitais' } });
    vm.runInContext(searchBlock, searchContext);
    const pending = searchContext.search();
    if (reason === 'account') sequence.current++; else key.current = `fixture-changed-${reason}`;
    resolveResponse({ providers: [unit], total: 1 });
    await pending; assert.equal(applied, 0, reason);
  }
  const server = fs.readFileSync('server.mjs', 'utf8');
  const fallback = server.slice(server.indexOf('async function conciergeHospitalsReply('), server.indexOf('\n}\n', server.indexOf('async function conciergeHospitalsReply(')) + 3);
  assert.match(fallback, /return amilUnknownMessage/); assert.doesNotMatch(fallback, /SearchNearby|SearchPlaces/);
}
console.log('PASS Amil exact product/network/unit/service/region, freshness, unknown, no Maps promotion, account and emergency fixtures');
