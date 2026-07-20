import assert from 'node:assert/strict';
import fs from 'node:fs';

await import('./v139/apply.mjs');
await import(`./v1407/apply.mjs?repeat=${Date.now()}`);

const read = (file) => fs.readFileSync(file, 'utf8');
const metadata = JSON.parse(read('package.json'));
const android = read('android-wrapper/app/build.gradle');
const home = read('client/src/pages/Home.tsx');
const auth = read('client/src/pages/AuthPage.tsx');
const audit = read('client/src/components/v1407/layout-audit.css');
const polish = read('client/src/components/v1407/component-polish.css');
const premium = read('client/src/components/v1399/premium.css');
const presentation = read('client/src/components/v1391/PresentationStayManagerView.tsx');
const sw = read('client/public/sw.js');

assert.equal(metadata.version, '14.0.7');
assert.match(metadata.name, /v14-0-7-premium-layout-audit/);
assert.match(android, /versionCode 140007\b/);
assert.match(android, /versionName '14\.0\.7'/);
assert.match(sw, /crewcheck-v14\.0\.7-shell/);
assert.match(auth, /data-version="14\.0\.7"/);
assert.match(home, /v1407\/layout-audit\.css/);
assert.match(home, /v1407\/component-polish\.css/);
assert.equal((home.match(/v1407\/layout-audit\.css/g) || []).length, 1);
assert.equal((home.match(/v1407\/component-polish\.css/g) || []).length, 1);

assert.doesNotMatch(premium, /\[data-version="13\.9\.9"\]/);
assert.match(premium, /\[data-version\]/);
assert.match(presentation, /<span><strong>\{hotel\.name\}<\/strong><small>/);

assert.match(audit, /\.cz-alert-stack > article/);
assert.match(audit, /\.cz-alert-detail > div/);
assert.match(audit, /\.cz-money-card > div/);
assert.match(audit, /\.cz-smart-content/);
assert.match(audit, /\.cz-hotel-stay-card \.cz-detail-grid span/);
assert.match(audit, /\.cc139-choices > button/);
assert.match(audit, /\[data-view="routine"\]/);
assert.match(audit, /\[data-view="wakeup"\]/);
assert.match(audit, /\[data-view="presentation"\]/);
assert.match(audit, /padding-bottom: calc\(148px/);
assert.match(audit, /@media \(max-width: 720px\)/);
assert.match(audit, /@media \(max-width: 420px\)/);
assert.match(polish, /\.cc139-choices > button > span/);
assert.match(polish, /\[data-view="alerts"\]/);
assert.match(polish, /padding-bottom: calc\(158px/);

console.log('CrewCheck v14.0.7 premium layout audit regression OK.');
