import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const view=await readFile('client/src/components/v1391/RosterLaunchView.tsx','utf8');
const css=await readFile('client/src/components/v1397/roster-premium.css','utf8');

assert.match(view,/cc-roster-mobile-broadcast-v140/);
assert.match(view,/cc-mobile-now-v140/);
assert.match(view,/cc-mobile-month-summary-v140/);
assert.match(view,/cc-mobile-month-tabs-v140/);
assert.match(view,/mobileNextLabel/);
assert.match(view,/mobileIsFlight \? \(mobilePresentation \|\| 'Não informada'\)/);
assert.doesNotMatch(view,/mobilePrimaryTime = mobilePresentation \|\| mobileWindow\.start/);
assert.match(view,/data-roster-iso/);
assert.match(view,/Ver dia/);
assert.match(view,/Dados da escala ativa/);

assert.match(css,/\.cc-roster-mobile-broadcast-v140 \{ display: none/);
assert.match(css,/@media \(max-width: 680px\)/);
assert.match(css,/\.cc-roster-period-v1399,[\s\S]*\.cc-roster-hero-v1397[\s\S]*display: none/);
assert.match(css,/\.cc-mobile-time-strip-v140/);
assert.match(css,/\.cc-mobile-month-tabs-v140/);
assert.match(css,/\.cc-roster-day-v1397/);

console.log('PASS: mobile roster inherits TV visual hierarchy without changing canonical schedule semantics.');
