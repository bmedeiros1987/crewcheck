import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

const main = read('client/src/main.tsx');
const css = read('client/src/styles/ui-lab-roster-pass3.css');
const home = read('client/src/pages/Home.tsx');

const importToken = 'import "./styles/ui-lab-roster-pass3.css";';
assert.ok(main.includes(importToken), 'Roster UI Lab pass 3 must be imported by main.tsx');
assert.ok(
  main.indexOf(importToken) > main.indexOf('import "./styles/ui-lab-life-pass2.css";'),
  'Roster pass 3 must load after CrewLife pass 2',
);

for (const token of [
  "[data-view='roster'] .cz-panel-head",
  "[data-view='roster'] .cz-roster-date",
  "[data-view='roster'] .cz-money-row",
  "[data-view='roster'] .cz-day-group",
  "[data-view='roster'] .cz-roster-card.compact",
  "[data-view='roster'] .cz-roster-linked-chips",
  "[data-view='roster'] .cz-inline-detail",
  "[data-view='roster'] .cz-detail-grid",
  "[data-view='roster'] .cz-complete-days",
  "[data-view='roster'] .cz-empty-real",
  '.cz-busy',
  '@media (max-width: 520px)',
  '@media (prefers-reduced-motion: reduce)',
]) {
  assert.ok(css.includes(token), `missing Roster pass 3 visual contract: ${token}`);
}

for (const preserved of [
  "view === 'roster' && <Roster",
  'function Roster({ roster, events, setView }',
  'normalizeRosterDays(roster)',
  'rosterDaySummary(day, dayEvents)',
  'RosterEventChips event={e}',
  'RosterInlineDetails event={e}',
  'Escala real não carregada',
  'Importar escala PDF',
]) {
  assert.ok(home.includes(preserved), `Roster presentation target disappeared: ${preserved}`);
}

for (const forbidden of [
  'display: none !important',
  'visibility: hidden !important',
  'pointer-events: none !important',
]) {
  assert.ok(!css.includes(forbidden), `Roster visual layer must not suppress usable content: ${forbidden}`);
}

for (const forbiddenLogic of [
  'parsePDF(',
  'normalizeRosterDays(',
  'buildCanonicalRosterEvents(',
  'localStorage',
  'sessionStorage',
  'authFetch(',
  'fetch(',
]) {
  assert.ok(!css.includes(forbiddenLogic), `Roster pass 3 CSS must remain presentation-only: ${forbiddenLogic}`);
}

assert.ok(
  css.includes("[data-view='roster']"),
  'Roster pass 3 must stay scoped to the roster view except the global busy state',
);

console.log('CrewCheck UI Lab Roster pass 3 regression: PASS');
