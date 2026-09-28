import assert from 'node:assert/strict';
import fs from 'node:fs';

await import('./v139/apply.mjs');
await import(`./v1409/apply.mjs?repeat=${Date.now()}`);

const read = (file) => fs.readFileSync(file, 'utf8');
const main = read('client/src/main.tsx');
const css = read('client/src/components/v1409/layout-lock.css');
const cockpitSnippet = read('scripts/v1406/cockpit.snippet');
const cockpitApply = read('scripts/v1406/apply.mjs');
const generatedHome = read('client/src/pages/Home.tsx');
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

assert.match(cockpitSnippet, /return <>/);
assert.match(cockpitSnippet, /<SmartCard event=\{event\} setView=\{setView\}\/>\s*<\/>;/, 'fragmento do Cockpit deve ser fechado antes do fim da função');
assert.doesNotMatch(cockpitSnippet, /<SmartCard event=\{event\} setView=\{setView\}\/>;\s*\n\}/, 'SmartCard não pode encerrar o retorno sem fechar o fragmento');
assert.match(cockpitSnippet, /data-finance-v1406="true"/);
assert.match(cockpitSnippet, /data-finance-v1408="true"/);
assert.match(cockpitApply, /!home\.includes\('data-finance-v1406'\) && !home\.includes\('data-finance-v1408'\)/);
assert.match(generatedHome, /<SmartCard event=\{event\} setView=\{setView\}\/>\s*<\/>;/, 'Home gerado deve conter JSX válido no Cockpit');

console.log('CrewCheck v14.0.9 direct layout lock and build syntax regression OK.');