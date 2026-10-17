import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';

const compiled = await build({ entryPoints: ['client/src/lib/crewcheckPushActivation.ts'], bundle: true, platform: 'node', format: 'cjs', write: false });
const module = { exports: {} };
vm.runInNewContext(compiled.outputFiles[0].text, { module, exports: module.exports });
const { activateCrewCheckPush } = module.exports;
for (const permission of ['default', 'denied', 'granted']) {
  const counts = { permission: 0, subscribe: 0, save: 0, bind: 0 };
  const owner = 'owner_fixture';
  const dependencies = {
    enabled: true, ownerId: owner, currentOwner: () => owner, registration: {},
    withSubscriptionLock: async run => run(),
    permission: async () => { counts.permission++; return permission; },
    beginWorker: async () => 1,
    subscribe: async () => { counts.subscribe++; return { toJSON: () => ({ fixture: true }) }; },
    save: async () => { counts.save++; return { ownerId: owner, installationId: 'fixture_device', consentRevision: 1 }; },
    bindWorker: async () => { counts.bind++; return true; },
    cancelWorker: async () => { throw Error('Unexpected cleanup'); },
    revokeInstallation: async () => { throw Error('Unexpected revoke'); },
  };
  for (const blocked of [{ enabled: false }, { ownerId: null }]) {
    assert.equal((await activateCrewCheckPush({ ...dependencies, ...blocked }, 'fixture_key', true)).status, 'blocked');
  }
  assert.equal((await activateCrewCheckPush(dependencies, 'fixture_key', false)).status, 'blocked');
  assert.equal(counts.permission, 0, 'disabled/unowned/unconfirmed cannot request permission');
  const result = await activateCrewCheckPush(dependencies, 'fixture_key', true);
  assert.equal(result.status, permission === 'granted' ? 'registered' : 'permission_not_granted');
  assert.equal(result.received, null);
  assert.deepEqual(counts, { permission: 1, subscribe: permission === 'granted' ? 1 : 0, save: permission === 'granted' ? 1 : 0, bind: permission === 'granted' ? 1 : 0 });
}
console.log('PASS actual activation permission matrix: default/denied cannot subscribe; granted requires explicit authenticated enabled activation; mocked permission/provider, no real grant or send');
