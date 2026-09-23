import assert from 'node:assert/strict';
import { createDeviceService } from '../server/tv/devices.mjs';

let now = Date.parse('2026-09-22T12:00:00Z');
let state = {pairings: {}, devices: {}};
const store = {async transaction(fn) {
  const next = structuredClone(state);
  const result = await fn(next);
  state = next;
  return result;
}};
const service = createDeviceService({store, now: () => now, pairingOrigin: 'https://example.test'});
const pair = await service.begin('android-tv', true);
await service.approve('free-account', pair.userCode, 'family');
const credential = await service.poll(pair.deviceCode);
assert.equal(credential.trusted, true);
assert.equal(credential.expiresAt, null);
now += 366 * 86400000;
assert.equal((await service.authorize(credential.token)).userId, 'free-account');
assert.equal((await service.heartbeat(credential.token)).expiresAt, null);
await assert.rejects(service.revoke('another-account', credential.deviceId), error => error.status === 404);
await service.revoke('free-account', credential.deviceId);
await assert.rejects(service.authorize(credential.token), error => error.status === 401);
assert.equal(state.devices[credential.deviceId].tokenHash, '');

const temporary = await service.begin('android-tv', false);
await service.approve('free-account', temporary.userCode, 'family');
const session = await service.poll(temporary.deviceCode);
now += 86400001;
await assert.rejects(service.authorize(session.token), error => error.status === 401);
console.log('PASS: permanent TV pairing survives a year, remains account-bound and revocable; temporary pairing still expires.');
