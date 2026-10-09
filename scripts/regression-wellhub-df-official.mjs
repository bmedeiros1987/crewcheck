import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { loadVerifiedWellhubPartners, searchVerifiedWellhub, wellhubPlanAllows, WELLHUB_PLAN_ORDER, detectWellhubActivityFromText, isWellhubPlanServer, wellhubPlanLabelServer } from '../server/v14407/wellhub.mjs';
import * as concierge from '../server/v14410/wellhub-concierge.mjs';
import { wellhubSnapshotAccess } from '../shared/wellhub-access.mjs';

const now = new Date('2026-10-09T12:00:00Z');
const all = loadVerifiedWellhubPartners();
const df = all.filter(p => p.state === 'DF');
assert.equal(df.length, 15);
assert.equal(new Set(all.map(p => p.id)).size, all.length);
assert.ok(df.every(p => p.city === 'Brasília' && p.address && p.sourceUrl.startsWith('https://wellhub.com/pt-br/search/partners/') && p.verifiedAt === '2026-10-09'));
for (let user = 0; user < WELLHUB_PLAN_ORDER.length; user++) {
  for (let min = 0; min < WELLHUB_PLAN_ORDER.length; min++) {
    assert.equal(wellhubPlanAllows(WELLHUB_PLAN_ORDER[user], WELLHUB_PLAN_ORDER[min]), user >= min);
  }
}
const search = input => searchVerifiedWellhub({ plan: 'silver-plus', live: false, now, limit: 60, ...input });
for (const plan of ['Silver+', 'SILVER PLUS', ' silver-plus ']) {
  assert.equal(wellhubPlanAllows(plan, 'Basic+'), true);
  assert.equal(wellhubPlanAllows(plan, 'Gold'), false);
  assert.equal((await search({ plan, locationText: 'BSB', query: 'Bluefit BSB' })).length, 5);
}
for (const locationText of ['Brasília/DF', 'Brasilia DF', 'BSB', 'DF', 'Distrito Federal']) {
  const found = await search({ locationText });
  assert.equal(found.length, 15, locationText);
  assert.ok(found.every(p => p.state === 'DF'));
  assert.equal(found.filter(p => p.eligibilityStatus === 'included').length, 13);
}
assert.equal((await search({ locationText: '' })).length, 0);
assert.equal((await search({ locationText: 'Brasília SP' })).length, 0);
assert.equal((await search({ locationText: 'Cidade inexistente' })).length, 0);
assert.equal((await search({ locationText: 'Cidade inexistente DF' })).length, 0);
assert.equal((await search({ locationText: 'SIA DF' })).length, 0, 'SIA deve filtrar a região, não incluir Gama/Taguatinga');
assert.equal((await search({ locationText: 'Setor de Indústria e Abastecimento DF' })).length, 0);
for (const city of ['Águas Claras', 'Aguas Claras', 'Guará II', 'Taguatinga Sul', 'Ceilândia', 'Gama', 'Asa Norte']) {
  const found = concierge.filterWellhubPartnersForLocation(df, { city });
  assert.ok(found.length > 0, city);
  assert.ok(found.every(p => p.state === 'DF'));
}
assert.deepEqual(concierge.filterWellhubPartnersForLocation(all, { city: 'Gama', state: 'GO' }), []);
const silverBlue = await search({ plan: 'silver', query: 'Bluefit', locationText: 'DF' });
assert.deepEqual(silverBlue.map(p => p.id), ['bluefit-gama-df']);
assert.equal((await search({ query: 'Bluefit', locationText: 'DF' })).length, 5);
assert.equal((await search({ query: 'Panobianco', locationText: 'DF' })).length, 0);
assert.equal(wellhubSnapshotAccess(df.find(p => p.id === 'bodytech-sudoeste-df'), 'silver-plus', '', now), 'unknown');
assert.equal(wellhubSnapshotAccess(df.find(p => p.minimumPlan === 'unknown'), 'silver-plus', '', now), 'unknown');
const expired = await search({ locationText: 'DF', now: new Date('2027-02-01T00:00:00Z') });
assert.ok(expired.every(p => p.eligibilityStatus === 'unknown'));
assert.equal((await search({ query: 'Ultra Asa Norte', activity: 'musculação', locationText: 'DF' }))[0]?.eligibilityStatus, 'included');
assert.equal((await search({ query: 'Ultra Asa Norte', activity: 'Power Bike', locationText: 'DF' })).length, 0);
assert.equal((await search({ query: 'Ultra Asa Norte', activity: 'Pilates', locationText: 'DF' }))[0]?.eligibilityStatus, 'unknown');
assert.equal((await search({ query: 'Ultra Noroeste', plan: 'basic-plus', activity: 'musculação', locationText: 'DF' })).length, 0);
assert.equal((await search({ query: 'Ultra Noroeste', plan: 'basic-plus', activity: 'Yoga', locationText: 'DF' }))[0]?.eligibilityStatus, 'included');

// Exercise the real Concierge formatter with synthetic public location text;
// no account, GPS, persistent writes, login or outbound delivery is involved.
const snippet = fs.readFileSync('scripts/v14410/concierge-gyms.snippet', 'utf8');
const context = vm.createContext({ ...concierge, detectWellhubActivityFromText, isWellhubPlanServer, wellhubPlanLabelServer,
  searchVerifiedWellhub: input => search({ ...input, live: false }),
  conciergeCurrentStay: () => null, conciergeNextProgram: () => null,
  conciergeLocationContextV14335: () => ({ fresh: false }), WEATHER_AIRPORT_POINTS: {},
});
vm.runInContext(snippet + '\nthis.reply = conciergeGymsReply;', context);
const snapshot = { preferences: { gymPlan: 'wellhub', wellhubPlan: 'silver-plus' } };
const response = await context.reply(snapshot, 'academia Bodytech na cidade de Brasília/DF');
assert.match(response, /Acesso: não confirmado/);
assert.match(response, /12–25/);
assert.match(response, /10h às 16h/);
assert.match(response, /Diamond/);
assert.match(response, /SQSW 302/);
assert.match(response, /2026-10-09/);
assert.match(response, /https:\/\/wellhub.com/);
assert.doesNotMatch(response, /Acesso: ✓/);
const missing = await context.reply(snapshot, 'academia Panobianco na cidade de Brasília/DF');
assert.match(missing, /Isso não significa que não exista parceria ou acesso/);
assert.match(missing, /https:\/\/wellhub.com\/pt-br\/search\//);
assert.match(await context.reply(snapshot, '/academias'), /Não tenho uma cidade\/UF confirmada/);
const unknownActivity = await context.reply(snapshot, 'academia Corpo e Saúde na cidade de Brasília/DF', {});
assert.match(unknownActivity, /https:\/\/wellhub.com/);
const snapshotPilates = { preferences: { ...snapshot.preferences, gymActivity: 'Pilates' } };
const unconfirmed = await context.reply(snapshotPilates, 'academia Ultra na cidade de Brasília/DF');
assert.match(unconfirmed, /modalidade não confirmada/);
assert.match(unconfirmed, /Acesso: não confirmado/);
assert.doesNotMatch(unconfirmed, /modalidade confirmada na página oficial/);
console.log('Wellhub DF official catalog, cumulative hierarchy, geography, conditions, unknown/stale and honest fallback: PASS');
