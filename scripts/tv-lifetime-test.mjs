import assert from 'node:assert/strict';
import { createDeviceService } from '../server/tv/devices.mjs';

function fixture() {
  let now = Date.parse('2026-09-22T12:00:00Z');
  let state = {pairings: {}, devices: {}};
  const store = {async transaction(fn) {
    const next = structuredClone(state);
    const result = await fn(next);
    state = next;
    return result;
  }};
  const service = createDeviceService({store, now: () => now, pairingOrigin: 'https://example.test'});
  return {
    service,
    get state(){ return state; },
    advance(ms){ now += ms; },
  };
}

for (const platform of ['lg-webos','android-tv']) {
  const env = fixture();
  const pair = await env.service.begin(platform, true);
  await env.service.approve('free-account', pair.userCode, 'family');
  const credential = await env.service.poll(pair.deviceCode);
  assert.equal(credential.trusted, true, platform + ' must support trusted pairing');
  assert.equal(credential.expiresAt, null, platform + ' trusted pairing must have no time expiry');

  env.advance(366 * 86400000);
  assert.equal((await env.service.authorize(credential.token)).userId, 'free-account');
  assert.equal((await env.service.heartbeat(credential.token)).expiresAt, null);

  await assert.rejects(env.service.revoke('another-account', credential.deviceId), error => error.status === 404);
  await env.service.revoke('free-account', credential.deviceId);
  await assert.rejects(env.service.authorize(credential.token), error => error.status === 401);
  assert.equal(env.state.devices[credential.deviceId].tokenHash, '');
}

const upgradeEnv = fixture();
const upgradePair = await upgradeEnv.service.begin('lg-webos', false);
await upgradeEnv.service.approve('free-account', upgradePair.userCode, 'private');
const upgradeCredential = await upgradeEnv.service.poll(upgradePair.deviceCode);
assert.equal(upgradeCredential.trusted, false);
const upgraded = await upgradeEnv.service.updateTrust('free-account', upgradeCredential.deviceId, true);
assert.equal(upgraded.trusted, true);
assert.equal(upgraded.expiresAt, null);
upgradeEnv.advance(366 * 86400000);
assert.equal((await upgradeEnv.service.authorize(upgradeCredential.token)).deviceId, upgradeCredential.deviceId);

const temporaryEnv = fixture();
const temporary = await temporaryEnv.service.begin('android-tv', false);
await temporaryEnv.service.approve('free-account', temporary.userCode, 'family');
const session = await temporaryEnv.service.poll(temporary.deviceCode);
temporaryEnv.advance(86400001);
await assert.rejects(temporaryEnv.service.authorize(session.token), error => error.status === 401);

console.log('PASS: LG webOS and Android TV trusted pairing survives beyond a year, existing temporary TVs can be upgraded, explicit revocation still works, and temporary pairing still expires.');
