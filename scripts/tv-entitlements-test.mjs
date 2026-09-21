import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tvAccessPolicy, tvUserGateFact, publicTvEntitlements } from '../server/tv/entitlements.mjs';

const free=tvAccessPolicy({plan:'free'});
assert.equal(free.premium,false);
assert.equal(free.providers.radar,false);
assert.equal(free.providers.traffic,false);
assert.equal(free.providers.weather,false);
assert.equal(free.features.roster,true);
assert.equal(free.features.userGate,true);
assert.equal(free.features.basicFinance,true);

const freePublicWeather=tvAccessPolicy({plan:'free',tvNoCostProviders:{weather:true}});
assert.equal(freePublicWeather.providers.weather,true,'explicitly no-cost weather may be enabled');
assert.equal(freePublicWeather.providers.radar,false);
assert.equal(freePublicWeather.providers.traffic,false);

const premium=tvAccessPolicy({billing:{plan:'premium_monthly',premiumAccess:true}});
assert.equal(premium.premium,true);
assert.equal(premium.providers.radar,true);
assert.equal(premium.providers.traffic,true);
assert.equal(premium.providers.weather,true);
assert.equal(publicTvEntitlements(premium).paidProviderAccess,true);

const now=Date.parse('2026-09-21T12:00:00Z');
const userGate=tvUserGateFact({
  tvUserFacts:{gate:{
    source:'user',
    label:'32',
    remoteStand:true,
    updatedAt:'2026-09-21T11:50:00Z',
    expiresAt:'2026-09-21T14:00:00Z',
  }},
},now);
assert.equal(userGate?.value.label,'32');
assert.equal(userGate?.value.remoteStand,true);
assert.equal(userGate?.source,'user');

assert.equal(tvUserGateFact({tvUserFacts:{gate:{
  source:'cirium',label:'32',updatedAt:'2026-09-21T11:50:00Z',expiresAt:'2026-09-21T14:00:00Z',
}}},now),null,'provider facts must never masquerade as free user updates');

assert.equal(tvUserGateFact({tvUserFacts:{gate:{
  source:'user',label:'32',updatedAt:'2026-09-21T11:50:00Z',
}}},now),null,'manual gate requires explicit validity');

const http=await readFile('server/tv/http.mjs','utf8');
assert.match(http,/const access = tvAccessPolicy\(data\)/);
assert.match(http,/const userGate = tvUserGateFact\(data/);
assert.match(http,/userGate \|\| \(access\.providers\.radar && nextFlight/);
assert.match(http,/access\.providers\.traffic && nextFlight && routeOrigin/);
assert.match(http,/access\.providers\.weather && audience/);
assert.match(http,/snapshot\.entitlements = publicTvEntitlements\(access\)/);

console.log('PASS: Free TV is core-data-first, accepts explicit user gate facts and cannot trigger paid radar/traffic/weather providers.');
