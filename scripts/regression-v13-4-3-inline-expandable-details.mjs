import fs from 'node:fs';

const source = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');

const required = [
  'function RosterInlineDetails',
  'cz-inline-detail',
  'expandedId === e.id',
  'RosterInlineDetails event={e}',
  "setView('presentation')",
  'Fonte apresentação',
  'inlineDurationLabel',
  'function programDateLabel(event: ZeroLeg)',
];

for (const token of required) {
  if (!source.includes(token)) throw new Error(`Missing inline detail token: ${token}`);
}

const forbidden = [
  'setSelected(e)',
  '{selected && <section className="cz-detail-modal"',
];

for (const token of forbidden) {
  if (source.includes(token)) throw new Error(`Old modal behavior still present: ${token}`);
}

console.log('v13.4.3 inline expandable details regression OK');
