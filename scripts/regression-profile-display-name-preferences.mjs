import assert from 'node:assert/strict';
import { fixture } from './regression-profile-display-name-shared-cache.mjs';

const f = fixture(), tab = f.tab();
f.offline();
const outcome = await tab.client.savePlatformProfile({ locale: 'es-ES', timezone: 'Pacific/Kiritimati' })
  .then(saved => ({ saved }), error => ({ error }));
const reopened = await tab.client.getPlatformProfile();
console.log(JSON.stringify({ saved: outcome.saved?.ok, localOnly: outcome.saved?.localOnly, rejected: Boolean(outcome.error), reopenedLocale: reopened.profile.locale, remoteLocale: f.remote().locale }));
assert.ok(outcome.error, 'preferences not saved in the account must reject so the existing UI cannot announce account success');
assert.equal(outcome.saved, undefined);
assert.equal(reopened.profile.locale, 'en-US');
assert.equal(reopened.profile.timezone, 'UTC');
assert.equal(f.cached().displayName, 'Old Name', 'a preference draft must not enter the confirmed name cache');
assert.equal(f.cached().locale, 'en-US');
assert.equal(tab.events.filter(event => event.type === 'crewcheck:profile-name-confirmed').length, 0);
console.log('PASS preferences confirmation: offline save rejects; last confirmed values remain; no false account-success receipt.');

const online = fixture(), onlineTab = online.tab();
const saved = await onlineTab.client.savePlatformProfile({ locale: 'es-ES', timezone: 'Pacific/Kiritimati' });
assert.equal(saved.ok, true);
assert.equal(saved.localOnly, undefined);
assert.equal(online.remote().locale, 'es-ES');
assert.equal(online.cached().locale, 'es-ES');
online.offline();
assert.equal((await onlineTab.client.getPlatformProfile()).profile.locale, 'es-ES', 'a remotely persisted preference stays available when cache storage succeeds');
assert.equal(online.cached().displayName, 'Old Name');
console.log('PASS online preferences: remote persistence and confirmed offline cache remain supported.');
