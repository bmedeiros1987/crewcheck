import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as wellhub from '../server/v14407/wellhub.mjs';
import * as concierge from '../server/v14410/wellhub-concierge.mjs';
import { conciergeLocationState, CONCIERGE_LOCATION_TTL_MS } from '../server/v14335/concierge-location.mjs';
import { wellhubSnapshotAccess } from '../shared/wellhub-access.mjs';

const now = new Date('2026-10-10T18:05:00Z');
const search = input => wellhub.searchVerifiedWellhub({ plan: 'silver-plus', now, live: false, limit: 60, ...input });
const all = wellhub.loadVerifiedWellhubPartners();
const ce = all.filter(p => p.city === 'Fortaleza' && p.state === 'CE');
assert.equal(ce.length, 4, 'Fortaleza must have four individually verified units');
assert.equal(new Set(all.map(p => p.id)).size, all.length);
assert.ok(ce.every(p => p.verifiedAt === '2026-10-10' && p.address && p.sourceUrl.startsWith('https://wellhub.com/pt-br/search/partners/')));
for (const locationText of ['Fortaleza', 'Fortaleza/CE', 'fortaleza ce', 'FORTALEZA CE']) {
  const found = await search({ locationText });
  assert.equal(found.length, 4, locationText);
  assert.ok(found.every(p => p.city === 'Fortaleza' && p.state === 'CE' && p.eligibilityStatus === 'included'));
}
for (const locationText of ['Fortaleza DF', 'Fortaleza SP', 'Cidade inexistente CE', '']) assert.equal((await search({ locationText })).length, 0);
assert.equal((await search({ locationText: 'Brasília/DF' })).some(p => p.state === 'CE'), false);
assert.equal((await search({ locationText: 'Fortaleza CE', query: 'Greenlife' })).length, 2);
assert.equal((await search({ locationText: 'Fortaleza CE', query: 'Greenlife Cambeba' })).length, 1);
assert.equal((await search({ locationText: 'Fortaleza CE', query: 'Greenlife Kennedy' })).length, 0, 'never infer a whole chain');
assert.equal((await search({ locationText: 'Fortaleza CE', plan: 'basic-plus' })).length, 3);
assert.equal((await search({ locationText: 'Fortaleza CE', plan: 'silver' })).length, 4);
assert.equal((await search({ locationText: 'Fortaleza CE', activity: 'Pilates' })).every(p => p.eligibilityStatus === 'unknown'), true, 'page-wide mentions do not prove activity tier');
assert.equal(wellhub.wellhubPlanAllows('Silver+', 'Gold'), false);
assert.ok(ce.every(p => wellhubSnapshotAccess(p, 'silver-plus', '', new Date('2027-02-01')) === 'unknown'));
assert.ok(ce.every(p => wellhubSnapshotAccess(p, 'silver-plus', '', new Date('2026-10-09')) === 'unknown'));
const maxforma = ce.find(p => p.id === 'maxforma-messejana-ce');
assert.equal(maxforma.minimumPlan, 'basic-plus');
assert.match(maxforma.accessNote, /Basic.*horários específicos.*Basic\+/);

// Real formatter and location TTL, synthetic location only; network and writes forbidden.
let queryCalls = [];
let location = { latitude: 0, longitude: 0, source: 'manual', city: 'Fortaleza', state: 'CE', updatedAt: now.toISOString() };
const context = vm.createContext({ ...wellhub, ...concierge,
  searchVerifiedWellhub: async input => { queryCalls.push(input); return search(input); },
  conciergeSaveSnapshotAsync: () => { throw Error('No profile writes'); },
  conciergeCurrentStay: () => null, conciergeNextProgram: () => ({ legs: [{ origin: 'BSB' }] }),
  conciergeLocationContextV14335: () => conciergeLocationState(location, { now }),
  WEATHER_AIRPORT_POINTS: { BSB: { city: 'Brasília' } },
  fetch: () => { throw Error('No network'); },
});
let snippet = fs.readFileSync('scripts/v14410/concierge-gyms.snippet', 'utf8');
if (process.argv.includes('--materialized')) {
  const source = fs.readFileSync('server.mjs', 'utf8');
  const start = source.indexOf('async function conciergeGymsReply(');
  assert.ok(start >= 0);
  snippet = source.slice(start, source.indexOf('\n}', start) + 2);
}
vm.runInContext(snippet + '\nthis.reply = conciergeGymsReply;', context);
const snapshot = { roster: { base: 'BSB' }, preferences: { gymPlan: 'wellhub', wellhubPlan: 'silver-plus' } };
for (const text of ['/academias', 'academias perto de mim', 'academia em Fortaleza/CE']) {
  const reply = await context.reply(snapshot, text);
  assert.match(reply, /seu plano Silver\+/);
  assert.equal((reply.match(/Acesso: ✓/g) || []).length, 4);
  assert.match(reply, /Greenlife Messejana/);
  assert.match(reply, /Greenlife Cambeba/);
  assert.match(reply, /Porão Academia Messejana/);
  assert.match(reply, /MaxForma Messejana/);
  assert.doesNotMatch(reply, /Brasília|\/DF|\/SP/);
  assert.equal(queryCalls.at(-1).locationText, 'Fortaleza CE');
}
location.updatedAt = new Date(now.getTime() - CONCIERGE_LOCATION_TTL_MS).toISOString();
assert.match(await context.reply(snapshot, '/academias'), /Greenlife Messejana/, 'existing TTL boundary remains valid');
location.updatedAt = new Date(now.getTime() - CONCIERGE_LOCATION_TTL_MS - 1).toISOString();
queryCalls = [];
assert.match(await context.reply(snapshot, '/academias'), /localização expirou/);
assert.equal(queryCalls.length, 0, 'expired location must not silently use BSB');
assert.match(await context.reply(snapshot, 'academia em Fortaleza/CE'), /Greenlife Messejana/, 'explicit city can recover stale GPS');
location = { ...location, updatedAt: now.toISOString(), city: '', state: '' };
queryCalls = [];
assert.match(await context.reply(snapshot, '/academias'), /ainda não consegui confirmar a cidade\/UF/);
assert.equal(queryCalls.length, 0);
location = { ...location, city: 'Fortaleza', state: 'CE' };
assert.match(await context.reply(snapshot, 'academia Greenlife Kennedy'), /Isso não significa que não exista parceria ou acesso/);
assert.match(await context.reply(snapshot, 'academia em Fortaleza/DF'), /Não há dados suficientes/);
assert.match(await context.reply(snapshot, 'academia em Brasília/DF'), /Brasília\/DF/);
console.log('Fortaleza: official units, Silver+ hierarchy, city/UF, chain filters, stale catalog and GPS vs BSB: PASS');
