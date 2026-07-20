import assert from 'node:assert/strict';
import fs from 'node:fs';

await import('./v139/apply.mjs');
await import(`./v1408/apply.mjs?repeat=${Date.now()}`);

const read = (file) => fs.readFileSync(file, 'utf8');
const metadata = JSON.parse(read('package.json'));
const home = read('client/src/pages/Home.tsx');
const cockpit = read('scripts/v1406/cockpit.snippet');
const smartCard = read('scripts/v1406/smart-card.snippet');
const css = read('client/src/components/v1408/structure-hotfix.css');
const android = read('android-wrapper/app/build.gradle');
const sw = read('client/public/sw.js');

assert.equal(metadata.version, '14.0.8');
assert.match(metadata.name, /v14-0-8-layout-structure-hotfix/);
assert.match(android, /versionCode 140008\b/);
assert.match(android, /versionName '14\.0\.8'/);
assert.match(sw, /crewcheck-v14\.0\.8-shell/);

assert.equal((home.match(/v1408\/structure-hotfix\.css/g) || []).length, 1);
assert.equal((home.match(/v1407\/component-polish\.css/g) || []).length, 1);
assert.equal((home.match(/data-finance-v1408/g) || []).length, 1);
assert.equal((home.match(/data-import-card-v1408/g) || []).length, 1);

assert.match(cockpit, /cc1408-finance-grid/);
assert.match(cockpit, /cc1408-finance-copy/);
assert.match(cockpit, /cc1408-program-heading/);
assert.match(cockpit, /cc1408-empty-roster/);
assert.doesNotMatch(cockpit, /className="cz-money-card"/);
assert.doesNotMatch(cockpit, /className="cz-money-row"/);

assert.match(smartCard, /data-import-card-v1408/);
assert.match(smartCard, /cc1408-import-head/);
assert.match(smartCard, /cc1408-import-status/);
assert.doesNotMatch(smartCard, /event\.placeholder[\s\S]{0,400}className="cz-smart-card"/);

assert.match(css, /button\.cc1408-finance-card/);
assert.match(css, /grid-template-columns: 52px minmax\(0, 1fr\) 22px/);
assert.match(css, /button\.cc1408-import-card/);
assert.match(css, /grid-template-areas:[\s\S]*"format badge"/);
assert.match(css, /\.cc1408-program-heading/);
assert.match(css, /position: relative !important/);
assert.match(css, /@media \(max-width: 480px\)/);
assert.match(css, /@media \(max-width: 360px\)/);
assert.doesNotMatch(css, /writing-mode:\s*(vertical|sideways)/);

console.log('CrewCheck v14.0.8 isolated finance and import layout regression OK.');
