import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as wellhub from '../server/v14407/wellhub.mjs';
import * as concierge from '../server/v14410/wellhub-concierge.mjs';
import { wellhubSnapshotFreshness, wellhubSnapshotAccess, WELLHUB_SNAPSHOT_MAX_AGE_DAYS } from '../shared/wellhub-access.mjs';

const now = new Date('2026-10-10T18:05:00Z');
const previousFetch = globalThis.fetch;
let fetchCalls = 0;
globalThis.fetch = async () => { fetchCalls++; throw Error('No remote source access authorized'); };
try {
  // Requesting a modality/live=true must not start the legacy HTML collector.
  for (const live of [undefined, true, false, 'true', 'false']) {
    for (const activity of ['', 'Pilates', 'Cycle', 'Power Bike']) {
      const found = await wellhub.searchVerifiedWellhub({ plan: 'silver-plus', locationText: 'Brasília DF', activity, live, now });
      assert.ok(found.length > 0);
      assert.ok(found.every(p => p.state === 'DF' && p.liveVerified === false));
    }
  }
  assert.equal(fetchCalls, 0, 'public HTML collecting needs source authorization');
} finally { globalThis.fetch = previousFetch; }

const found = await wellhub.searchVerifiedWellhub({ plan: 'silver-plus', locationText: 'DF', now });
assert.ok(found.every(p => p.refreshStatus === 'authorization-required' && p.accessConfirmationRequired === true));
assert.ok(found.every(p => p.verifiedAt === '2026-10-09' && p.snapshotValidUntil === '2027-01-07T00:00:00.000Z' && p.snapshotStatus === 'valid'));
const expired = await wellhub.searchVerifiedWellhub({ plan: 'silver-plus', locationText: 'DF', now: new Date('2027-02-01') });
assert.ok(expired.every(p => p.eligibilityStatus === 'unknown' && p.verifiedAt === '2026-10-09' && p.liveVerified === false && p.snapshotStatus === 'expired'));
const future = await wellhub.searchVerifiedWellhub({ plan: 'silver-plus', locationText: 'DF', now: new Date('2026-10-08') });
assert.ok(future.every(p => p.eligibilityStatus === 'unknown' && p.snapshotStatus === 'future' && p.snapshotValidUntil === ''));
assert.equal(WELLHUB_SNAPSHOT_MAX_AGE_DAYS, 90);
for (const verifiedAt of ['', 'not-a-date', '2026-02-30', '+275760-09-13T00:00:00.000Z']) {
  const partner = { verifiedAt, minimumPlan: 'basic' };
  assert.deepEqual(wellhubSnapshotFreshness(partner, now), { snapshotStatus: 'invalid', snapshotValidUntil: '' });
  assert.equal(wellhubSnapshotAccess(partner, 'silver-plus', '', now), 'unknown');
}
const boundary = { verifiedAt: '2026-10-09' };
const until = new Date('2027-01-07T00:00:00Z');
assert.equal(wellhubSnapshotFreshness(boundary, until).snapshotStatus, 'valid');
assert.equal(wellhubSnapshotFreshness(boundary, new Date(until.getTime() + 1)).snapshotStatus, 'expired');
assert.equal(wellhubSnapshotFreshness(boundary, new Date('invalid')).snapshotStatus, 'invalid');
const activity = await wellhub.searchVerifiedWellhub({ plan: 'silver-plus', locationText: 'DF', activity: 'Cycle', query: 'Ultra Asa Norte', now });
assert.equal(activity[0].eligibilityStatus, 'included', 'reviewed activity rules still work without HTML scraping');
assert.equal((await wellhub.searchVerifiedWellhub({ plan: 'silver-plus', locationText: 'DF', activity: 'Pilates', query: 'Ultra Asa Norte', now }))[0].eligibilityStatus, 'unknown');

assert.deepEqual(activity[0].snapshotActivity, { name: 'Cycle', minimumPlan: 'silver' });
let response;
await wellhub.handleWellhubSearchRoute({ method: 'GET' }, { writeHead: status => assert.equal(status, 200), end: value => { response = JSON.parse(value); } }, new URL('https://example.invalid/api/wellhub/search?location=DF&plan=silver-plus'));
assert.equal(response.automaticRefresh, false);
assert.equal(response.accessConfirmationRequired, true);
assert.equal(response.source, 'wellhub-public-directory');

let replyNow = now;
let overridePartners;
const context = vm.createContext({ ...wellhub, ...concierge,
  searchVerifiedWellhub: input => overridePartners || wellhub.searchVerifiedWellhub({ ...input, now: replyNow }),
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
const snapshot = { preferences: { gymPlan: 'wellhub', wellhubPlan: 'silver-plus', gymActivity: 'Cycle' } };
const recorded = await context.reply(snapshot, 'academia Ultra Asa Norte');
assert.match(recorded, /Modalidade: Cycle.*mínimo: Silver/);
assert.doesNotMatch(recorded, /Modalidade não confirmada no cadastro/);
assert.match(recorded, /disponibilidade de modalidades atuais não confirmados/);
assert.match(recorded, /Cadastro consultado em: 2026-10-09/);
const unknownTier = await context.reply({ preferences: { ...snapshot.preferences, gymActivity: 'Power Bike' } }, 'academia Ultra Asa Norte');
assert.match(unknownTier, /Modalidade: Power Bike.*mínimo: plano não confirmado/);
assert.doesNotMatch(unknownTier, /Acesso: ✓/);
assert.match(recorded, /limite técnico de 90 dias.*não garante vigência no Wellhub/);
const unknown = await context.reply({ preferences: { ...snapshot.preferences, gymActivity: 'Pilates' } }, 'academia Ultra Asa Norte');
assert.match(unknown, /Modalidade não confirmada no cadastro/);
replyNow = new Date('2027-02-01');
const staleReply = await context.reply(snapshot, 'academia Ultra Asa Norte');
assert.match(staleReply, /Cadastro vencido.*acesso não confirmado/);
assert.match(staleReply, /Modalidade: Cycle/);
assert.doesNotMatch(staleReply, /Acesso: ✓/);
replyNow = new Date('2026-10-08');
const futureReply = await context.reply(snapshot, 'academia Ultra Asa Norte');
assert.match(futureReply, /data futura.*acesso não confirmado/);
assert.doesNotMatch(futureReply, /Acesso: ✓/);
assert.match(futureReply, /data futura não validada/);
for (const verifiedAt of ['', 'not-a-date', '2026-02-30']) {
  const invalid = { ...activity[0], verifiedAt };
  overridePartners = [{ ...invalid, ...wellhubSnapshotFreshness(invalid, now), eligibilityStatus: wellhubSnapshotAccess(invalid, 'silver-plus', 'Cycle', now) }];
  const invalidReply = await context.reply(snapshot, '/academias');
  assert.match(invalidReply, /data inválida ou ausente.*acesso não confirmado/);
  assert.doesNotMatch(invalidReply, /Acesso: ✓/);
assert.match(invalidReply, /Cadastro consultado em: data inválida ou ausente/);
}
overridePartners = undefined;
console.log('Wellhub source policy: no HTML collection, no false freshness, snapshot TTL and honest CrewCierge output: PASS');
