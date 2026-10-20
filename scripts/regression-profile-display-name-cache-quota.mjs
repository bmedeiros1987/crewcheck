import assert from 'node:assert/strict';
import { fixture } from './regression-profile-display-name-shared-cache.mjs';

// Independent review counterproof: real auth/platform clients, only profile writes fail.
// Reads and removal remain available, as with storage quota exhaustion.
const f = fixture({ blockedReads: false }), tab = f.tab();
f.blockStorage();
const saved = await tab.client.saveConfirmedDisplayName('Longer Confirmed Name');
f.offline();
const fallback = await tab.client.getPlatformProfile();
console.log(JSON.stringify({ saved: saved.displayName, remote: f.remote().displayName, cache: f.cached()?.displayName, offline: fallback.profile.displayName }));
assert.notEqual(fallback.profile.displayName, 'Old Name', 'a failed cache write must discard the old readable profile');
assert.equal(f.cached(), null, 'the old offline profile is removed when its replacement cannot be stored');
assert.equal(saved.displayName, 'Longer Confirmed Name', 'the remote receipt remains valid');
assert.equal(f.remote().displayName, saved.displayName);
assert.equal(fallback.localOnly, true, 'offline fallback is separate from the remote confirmation');
assert.equal(fallback.profile.displayName, 'Login A', 'no confirmed offline name is claimed after cache removal');
assert.equal(tab.events.filter(event => event.type === 'crewcheck:profile-name-confirmed').length, 1);
console.log('PASS cache quota: confirmed remote save preserved; old readable cache removed; offline fallback remains unconfirmed.');
