import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

const main = read('client/src/main.tsx');
const css = read('client/src/styles/ui-lab-life-pass2.css');
const life = read('client/src/components/v1434/CrewCheckLifeView.tsx');

const importToken = 'import "./styles/ui-lab-life-pass2.css";';
assert.ok(main.includes(importToken), 'CrewLife UI Lab pass 2 must be imported by main.tsx');
assert.ok(
  main.indexOf(importToken) > main.indexOf('import "./styles/ui-lab-foundation.css";'),
  'CrewLife pass 2 must load after the UI Lab foundation',
);

for (const token of [
  '.cc-life-hero',
  '.cc-life-recommendation',
  '.cc-life-auto-source',
  '.cc-life-metrics article',
  '.cc-life-integration-grid > article.connected',
  '.cc-life-form-grid input:focus-visible',
  '.cc-life-area-grid label:has(input:checked)',
  '@media (max-width: 640px)',
  '@media (prefers-reduced-motion: reduce)',
]) {
  assert.ok(css.includes(token), `missing CrewLife pass 2 visual contract: ${token}`);
}

for (const preserved of [
  'className="cc-life-shell"',
  'className="cc-life-recommendation',
  'className="cc-life-metrics"',
  'className="cc-life-block cc-life-integrations"',
  'Samsung Health conectado · automático',
  'Entrada manual',
  'Mostrar CrewLife no relógio',
]) {
  assert.ok(life.includes(preserved), `CrewLife presentation target disappeared: ${preserved}`);
}

for (const forbidden of [
  'display: none !important',
  'visibility: hidden !important',
  'pointer-events: none !important',
]) {
  assert.ok(!css.includes(forbidden), `CrewLife visual layer must not suppress usable content: ${forbidden}`);
}

assert.ok(
  !css.includes('AndroidCrewCheck') && !css.includes('localStorage') && !css.includes('crewcheck:life:'),
  'CrewLife pass 2 CSS must remain presentation-only',
);

console.log('CrewCheck UI Lab CrewLife pass 2 regression: PASS');
