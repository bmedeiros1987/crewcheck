import fs from 'node:fs';

const source = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');

const required = [
  'PRESENTATION_RULES_KEY',
  'PRESENTATION_OVERRIDES_KEY',
  'function PresentationManagerView',
  'Gerenciador de Apresentação',
  'Aprender hotel/local',
  'applyPresentationManagement',
  'managedPresentationForEvent',
  "view === 'presentation'",
];

for (const token of required) {
  if (!source.includes(token)) throw new Error(`Missing presentation manager token: ${token}`);
}

if (!source.includes('legs.map(applyPresentationManagement).sort')) {
  throw new Error('buildLegs must apply presentation management before sorting');
}

console.log('v13.4.1 presentation manager regression OK');
