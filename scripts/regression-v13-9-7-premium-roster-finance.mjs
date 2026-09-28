import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const roster = read('client/src/components/v1391/RosterLaunchView.tsx');
const css = read('client/src/components/v1397/roster-premium.css');
const home = read('client/src/pages/Home.tsx');
const apply = read('scripts/v1397/apply.mjs');

assert.match(roster, /cc-roster-premium-v1397/);
assert.match(roster, /Diárias desta programação/);
assert.match(roster, /Ganho por KM/);
assert.match(roster, /salaryByEvent/);
assert.match(roster, /perDiemForEvent/);
assert.match(home, /eventId: string;/);
assert.match(home, /eventId: event\.id,/);
assert.match(apply, /finance=\{financeSnapshot\(bundle\.roster\)\}/);
assert.doesNotMatch(css, /data-version=["']13\.9\.7/);
for (const mode of ['operating', 'extra', 'stay', 'rest', 'reserve', 'standby', 'training']) {
  assert.match(css, new RegExp(`data-mode=["']${mode}["']`));
}
assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(css, /@media \(max-width: 680px\)/);
assert.match(css, /html\[data-crew-theme="light"\]/);

console.log('CrewCheck v13.9.7 premium roster and per-program finance regression: OK');
