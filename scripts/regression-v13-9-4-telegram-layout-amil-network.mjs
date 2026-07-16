import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const server = read('server.mjs');
const platform = read('server/platform.mjs');
const home = read('client/src/pages/Home.tsx');
const roster = read('client/src/components/v1391/RosterLaunchView.tsx');
const css = read('client/src/components/v1394/v1394.css');
const dataset = JSON.parse(read('server/data/amil-network-s450-s750.json'));
const metadata = JSON.parse(read('package.json'));

assert.equal(metadata.version, '13.9.4');
assert.match(server, /\/api\/telegram\/diagnostic/);
assert.match(server, /telegramWebhookUrl\(\)/);
assert.match(server, /\/api\/telegram\/webhook/);
assert.match(server, /getWebhookInfo/);
assert.match(server, /handleReverseGeocode/);
assert.match(server, /\/api\/maps\/reverse-geocode/);
assert.match(platform, /amilSnapshotSearch/);
assert.match(platform, /adult_emergency/);
assert.match(platform, /adult_hospital/);
assert.match(home, /cc-telegram-diagnostic/);
assert.match(home, /cc-amil-filter-grid/);
assert.match(home, /eventRouteOriginLabel/);
assert.match(home, /onOriginLabel=\{setOriginLabel\}/);
assert.match(roster, /cc-roster-event-v1394/);
assert.doesNotMatch(roster, /className=\{`cz-roster-card/);
assert.match(css, /data-menu-active="true"/);
assert.match(css, /@media\(max-width:900px\)/);
assert.match(css, /cc-roster-flight-schedule/);

assert.equal(dataset.schemaVersion, 1);
assert.equal(dataset.sources.length, 30);
assert.ok(dataset.providers.length >= 1400, `expected >= 1400 providers, got ${dataset.providers.length}`);
assert.deepEqual(dataset.plans, ['S450', 'S750']);
assert.deepEqual(dataset.missingPublishedStates, ['AM']);
assert.ok(dataset.sources.every((source) => source.url.startsWith('https://') && /^[a-f0-9]{64}$/.test(source.sha256)));
assert.ok(dataset.providers.every((provider) => provider.id && provider.name && provider.state && provider.plans));
assert.ok(dataset.providers.some((provider) => provider.state === 'DF' && provider.name === 'HOSPITAL BRASILIA' && provider.plans.S450.includes('PS')));
assert.ok(dataset.providers.some((provider) => provider.category === 'diagnostic' && provider.plans.S750.includes('DIAGNOSTICO')));

const secretPattern = /\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/;
for (const [path, value] of [['server.mjs', server], ['Home.tsx', home], ['v1394.css', css]]) {
  assert.doesNotMatch(value, secretPattern, `Telegram token must not be committed in ${path}`);
}

console.log(`CrewCheck v13.9.4 regression OK: ${dataset.providers.length} covered provider records from ${dataset.sources.length} PDFs.`);
