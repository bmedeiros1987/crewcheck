import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const http=await readFile('server/tv/http.mjs','utf8');
const core=await readFile('packages/tv-core/src/index.ts','utf8');

assert.match(http,/auth\.privacy === 'private' \? tvAirportCode\(data\.roster\.base\) : null/);
assert.match(http,/snapshot\.privacy !== 'private'/);
assert.match(http,/role: 'stay'/);
assert.match(http,/\/api\/weather\/airport\?airport=/);
assert.match(http,/weather_timeout/);
assert.match(http,/snapshot\.weatherContexts = weatherContexts/);
assert.match(http,/snapshot\.weather = primary \?/);
assert.match(http,/\.filter\(Boolean\)/);
assert.doesNotMatch(http,/throw new Error\('weather_/);
assert.match(core,/base: privacy === "private"/);
assert.match(core,/weatherContexts\?: TvWeatherContext\[\]/);
assert.match(core,/airline: tvAirlineName\(roster, events\)/);
assert.match(core,/function tvAirlineName/);

console.log('PASS: TV weather context is optional, bounded and base/stay location remains private.');
