import assert from 'node:assert/strict';
import fs from 'node:fs';

const main = fs.readFileSync('client/src/main.tsx', 'utf8');
const css = fs.readFileSync('client/src/styles/opening-splash-identity.css', 'utf8');

assert.match(main, /opening-splash-identity\.css/, 'opening splash CSS must be loaded by the app entrypoint');
assert.match(css, /\.cc1270-loader \.cc1270-loader-brand/, 'animation must target the canonical CrewCheck splash logo');
assert.match(css, /cc-splash-brand-in/, 'brand entrance animation must exist');
assert.match(css, /cc-splash-route/, 'single route/sweep identity animation must exist');
assert.match(css, /prefers-reduced-motion:\s*reduce/, 'reduced-motion users must get a static splash');
assert.match(css, /animation:\s*none\s*!important/, 'reduced-motion must override the historical !important animation lock');
assert.match(css, /data-theme='dark'/, 'dark theme must have an explicit splash treatment');
assert.match(css, /data-crew-theme='dark'/, 'legacy dark-theme selector must stay visually compatible during theme migration');
assert.doesNotMatch(css, /infinite/, 'opening identity motion must not loop indefinitely');

console.log('opening splash identity regression: OK');
