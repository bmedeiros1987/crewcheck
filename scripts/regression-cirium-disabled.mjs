import assert from 'node:assert/strict';
import { ciriumConfiguration, diagnoseCirium, diagnoseCiriumFlight } from '../server/cirium-diagnostic.mjs';

// The offline runner starts with env: {}. These are exclusively synthetic.
process.env.CIRIUM_SKY_API_TOKEN = 'fixture-token';
process.env.CIRIUM_SKY_SECRET = 'fixture-alias';
process.env.CIRIUM_APP_ID = 'fixture-id';
process.env.CIRIUM_APP_KEY = 'fixture-key';
let calls = 0;
const fetchImpl = async () => { calls++; throw new Error('Network forbidden'); };
for (const flag of [undefined, '', 'false', '1', 'TRUE', 'True', 'yes', ' true ', 'true ', ' true', '\ttrue\n']) {
  if (flag === undefined) delete process.env.CIRIUM_DIAGNOSTIC_ENABLED;
  else process.env.CIRIUM_DIAGNOSTIC_ENABLED = flag;
  assert.deepEqual(ciriumConfiguration(), { mode: 'disabled', provider: 'cirium-sky', configured: false });
  assert.equal((await diagnoseCirium({ fetchImpl })).state, 'disabled');
  assert.equal((await diagnoseCiriumFlight({ date: '2026-10-10', fetchImpl })).state, 'disabled');
}
assert.equal(calls, 0, 'credentials alone must never cause an upstream query');
process.env.CIRIUM_DIAGNOSTIC_ENABLED = 'true';
assert.equal(ciriumConfiguration().mode, 'sky');
process.env.CIRIUM_SKY_API_TOKEN = '';
process.env.CIRIUM_SKY_SECRET = '';
assert.equal(ciriumConfiguration().mode, 'flex');
delete process.env.CIRIUM_DIAGNOSTIC_ENABLED;
assert.equal((await diagnoseCirium({ fetchImpl })).state, 'disabled', 'turning opt-in off must block Flex too');
assert.equal(calls, 0);
const syntheticEnvironment = process.env;
try {
  process.env = new Proxy({}, { get(_target, name) {
    assert.equal(name, 'CIRIUM_DIAGNOSTIC_ENABLED', 'disabled configuration must not read credentials');
    return undefined;
  } });
  assert.equal(ciriumConfiguration().mode, 'disabled');
} finally {
  process.env = syntheticEnvironment;
}
console.log('Cirium disabled-by-default regression OK; no upstream calls');
