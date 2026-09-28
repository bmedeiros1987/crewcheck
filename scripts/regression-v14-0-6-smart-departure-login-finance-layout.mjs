import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

await import('./v139/apply.mjs');
await import(`./v1406/apply.mjs?repeat=${Date.now()}`);

// Simula check + build + start em processos separados. O preparo precisa ser repetível.
for (let attempt = 0; attempt < 2; attempt += 1) {
  const result = spawnSync(process.execPath, ['scripts/v139/apply.mjs'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout || `Falha no preparo repetido ${attempt + 1}.`);
}

const read = (file) => fs.readFileSync(file, 'utf8');
const metadata = JSON.parse(read('package.json'));
const android = read('android-wrapper/app/build.gradle');
const home = read('client/src/pages/Home.tsx');
const auth = read('client/src/pages/AuthPage.tsx');
const compensation = read('client/src/lib/compensationPolicy.ts');
const css = read('client/src/components/v1406/premium-layout.css');
const serviceWorker = read('client/public/sw.js');
const calendar = read('client/src/lib/googleCalendarSync.ts');
const viteConfig = read('vite.config.ts');

assert.equal(metadata.version, '14.0.6');
assert.match(metadata.name, /v14-0-6-smart-departure/);
assert.match(android, /versionCode 140006\b/);
assert.match(android, /versionName '14\.0\.6'/);
assert.match(serviceWorker, /crewcheck-v14\.0\.6-shell/);

assert.doesNotMatch(viteConfig, /scripts\/v139\/apply\.mjs/);
assert.equal((calendar.match(/function isProductionGoogleOrigin\(\): boolean/g) || []).length, 1);
assert.equal((calendar.match(/from '\.\/googleCalendarOAuthBridge';/g) || []).length, 1);

assert.match(auth, /const \[showPassword, setShowPassword\]/);
assert.match(auth, /type=\{showPassword \? 'text' : 'password'\}/);
assert.match(auth, /<EyeOff\/> : <Eye\/>/);
assert.match(auth, /className="cz-password-toggle"/);
assert.match(auth, /className="cz-auth-link"/);
assert.match(auth, /role="status" aria-live="polite"/);
assert.doesNotMatch(auth, /<a onClick=\{\(\) => setMode/);

assert.match(home, /data-smart-departure-v1406/);
assert.match(home, /data-departure-v1406/);
assert.match(home, /data-finance-v1406/);
assert.match(home, /function smartDepartureEstimate/);
assert.match(home, /Math\.max\(45, travelMinutes \+ marginMinutes\)/);
assert.match(home, /durationInTrafficSeconds/);
assert.match(home, /Estimativa protegida/);
assert.match(home, /financial\.perdiem\.weekly/);
assert.match(home, /crewcheck_cockpit_finance_visible/);
assert.match(home, /<EyeOff\/> : <Eye\/>/);
assert.match(home, /Pagamento previsto na quinta-feira/);
assert.match(home, /Ceia após 00:00 de quarta entra no ciclo seguinte/);
assert.match(home, /<Cockpit bundle=\{bundle\}/);
assert.doesNotMatch(home, /event\.presentation !== '—' \? event\.presentation : 'Calcular'/);
assert.doesNotMatch(home, /<strong>Abrir<\/strong>/);
assert.doesNotMatch(home, /<strong>Financeiro<\/strong>/);

assert.match(compensation, /start\.setHours\(0, 0, 0, 0\)/);
assert.match(compensation, /end\.setHours\(23, 59, 59, 999\)/);
assert.match(compensation, /payment\.setDate\(start\.getDate\(\) \+ 8\)/);
assert.match(compensation, /quarta a terça, com pagamento na quinta-feira/);
assert.match(compensation, /Ceia registrada após 00:00 de quarta-feira: entra no ciclo seguinte/);

assert.match(css, /\.cz-depart-hero/);
assert.match(css, /grid-template-areas:/);
assert.match(css, /\.cz-smart-content/);
assert.match(css, /\.cz-money-visibility/);
assert.match(css, /\.cz-password-toggle/);
assert.match(css, /padding-bottom: calc\(132px/);
assert.match(css, /@media \(max-width: 420px\)/);
assert.match(css, /overflow-wrap: anywhere !important/);

console.log('CrewCheck v14.0.6 smart departure, auth, finance, responsive layout and repeated-build idempotency regression OK.');
