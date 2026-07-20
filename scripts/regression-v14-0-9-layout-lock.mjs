import assert from 'node:assert/strict';
import fs from 'node:fs';

await import('./v139/apply.mjs');
await import(`./v1409/apply.mjs?repeat=${Date.now()}`);

const read = (file) => fs.readFileSync(file, 'utf8');
const main = read('client/src/main.tsx');
const css = read('client/src/components/v1409/layout-lock.css');
const metadata = JSON.parse(read('package.json'));
const android = read('android-wrapper/app/build.gradle');
const manifest = JSON.parse(read('client/public/manifest.json'));
const sw = read('client/public/sw.js');

assert.equal(metadata.version, '14.0.9');
assert.equal(manifest.version, '14.0.9');
assert.match(android, /versionCode 140009\b/);
assert.match(android, /versionName '14\.0\.9'/);
assert.match(sw, /crewcheck-v14\.0\.9-shell/);
assert.match(sw, /crewcheck-v14\.0\.9-runtime/);

assert.equal((main.match(/v1409\/layout-lock\.css/g) || []).length, 1, 'layout lock deve ser importado uma vez pelo entrypoint');
assert.ok(main.indexOf('premium-audit-v13-8-8.css') < main.indexOf('v1409/layout-lock.css'), 'layout lock deve carregar depois da auditoria legada');

assert.match(css, /html body #root \.cz-app :is\(button\.cc1408-finance-card, button\.cz-money-card\)/);
assert.match(css, /grid-template-columns: 50px minmax\(0, 1fr\) !important/);
assert.match(css, /> :is\(\.cc1408-finance-copy, div\)/);
assert.match(css, /article\.cz-smart-card\[data-smart-departure-v1406="true"\] \.cz-smart-content/);
assert.match(css, /"time"\s*\n\s*"badge"\s*\n\s*"route"\s*\n\s*"meta"/);
assert.match(css, /writing-mode: horizontal-tb !important/);
assert.match(css, /position: static !important/);
assert.match(css, /@media \(max-width: 480px\)/);
assert.match(css, /@media \(max-width: 360px\)/);

console.log('CrewCheck v14.0.9 direct layout lock regression OK.');
