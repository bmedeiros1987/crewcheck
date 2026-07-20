import assert from 'node:assert/strict';
import fs from 'node:fs';

const wrapper = fs.readFileSync(new URL('../server-observed.mjs', import.meta.url), 'utf8');

assert.match(wrapper, /\/health\/live/);
assert.match(wrapper, /\/health\/ready/);
assert.match(wrapper, /\/health\/dependencies/);
assert.match(wrapper, /\/health\/metrics/);
assert.match(wrapper, /x-request-id/i);
assert.match(wrapper, /crypto\.randomUUID/);
assert.match(wrapper, /memoryUsage/);
assert.match(wrapper, /http_request/);
assert.doesNotMatch(wrapper, /authorization:\s*req\.headers/i);
assert.doesNotMatch(wrapper, /cookie:\s*req\.headers/i);

console.log('CrewCheck scalability observability regression OK');
