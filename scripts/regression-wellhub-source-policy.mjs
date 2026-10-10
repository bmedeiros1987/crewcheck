import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as wellhub from '../server/v14407/wellhub.mjs';
import * as concierge from '../server/v14410/wellhub-concierge.mjs';

const now = new Date('2026-10-10T18:05:00Z');
const previousFetch = globalThis.fetch;
let fetchCalls = 0;
globalThis.fetch = async () => { fetchCalls++; throw Error('No remote source access authorized'); };
try {
  // Requesting a modality/live=true must not start the legacy HTML collector.
  for (const activity of ['', 'Pilates', 'Cycle', 'Power Bike']) {
    const found = await wellhub.searchVerifiedWellhub({ plan: 'silver-plus', locationText: 'Brasília DF', activity, live: true, now });
    assert.ok(found.length > 0);
    assert.ok(found.every(p => p.state === 'DF' && p.liveVerified === false));
  }
  assert.equal(fetchCalls, 0, 'public HTML collecting needs source authorization');
} finally { globalThis.fetch = previousFetch; }

const found = await wellhub.searchVerifiedWellhub({ plan: 'silver-plus', locationText: 'DF', now });
assert.ok(found.every(p => p.refreshStatus === 'authorization-required' && p.accessConfirmationRequired === true));
assert.ok(found.every(p => p.verifiedAt === '2026-10-09' && p.snapshotValidUntil === '2027-01-07T00:00:00.000Z'));
const expired = await wellhub.searchVerifiedWellhub({ plan: 'silver-plus', locationText: 'DF', now: new Date('2027-02-01') });
assert.ok(expired.every(p => p.eligibilityStatus === 'unknown' && p.verifiedAt === '2026-10-09' && p.liveVerified === false));
const activity = await wellhub.searchVerifiedWellhub({ plan: 'silver-plus', locationText: 'DF', activity: 'Cycle', query: 'Ultra Asa Norte', now });
assert.equal(activity[0].eligibilityStatus, 'included', 'reviewed activity rules still work without HTML scraping');
assert.equal((await wellhub.searchVerifiedWellhub({ plan: 'silver-plus', locationText: 'DF', activity: 'Pilates', query: 'Ultra Asa Norte', now }))[0].eligibilityStatus, 'unknown');

let response;
await wellhub.handleWellhubSearchRoute({ method: 'GET' }, { writeHead: status => assert.equal(status, 200), end: value => { response = JSON.parse(value); } }, new URL('https://example.invalid/api/wellhub/search?location=DF&plan=silver-plus'));
assert.equal(response.automaticRefresh, false);
assert.equal(response.accessConfirmationRequired, true);
assert.equal(response.source, 'wellhub-public-directory');

const context = vm.createContext({ ...wellhub, ...concierge,
  searchVerifiedWellhub: input => wellhub.searchVerifiedWellhub({ ...input, now }),
  conciergeCurrentStay: () => null, conciergeNextProgram: () => null,
  conciergeLocationContextV14335: () => ({ fresh: true, location: { city: 'Brasília', state: 'DF' } }),
  WEATHER_AIRPORT_POINTS: {},
});
let snippet = fs.readFileSync('scripts/v14410/concierge-gyms.snippet', 'utf8');
if (process.argv.includes('--materialized')) {
  const source = fs.readFileSync('server.mjs', 'utf8');
  const start = source.indexOf('async function conciergeGymsReply(');
  assert.ok(start >= 0);
  snippet = source.slice(start, source.indexOf('\n}', start) + 2);
}
vm.runInContext(snippet + '\nthis.reply = conciergeGymsReply;', context);
const reply = await context.reply({ preferences: { gymPlan: 'wellhub', wellhubPlan: 'silver-plus' } }, '/academias');
assert.match(reply, /Catálogo parcial, sem atualização automática/);
assert.match(reply, /2026-10-09/);
assert.match(reply, /Confirme acesso e condições no app Wellhub/);
assert.doesNotMatch(reply, /atualizado agora|consulta em tempo real/i);
console.log('Wellhub source policy: no HTML collection, no false freshness, snapshot TTL and honest CrewCierge output: PASS');
