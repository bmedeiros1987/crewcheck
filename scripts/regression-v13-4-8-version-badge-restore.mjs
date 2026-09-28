import fs from 'node:fs';

const source = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');

const required = [
  "const DEFAULT_VERSION = '13.4.8';",
  "Todos os sistemas funcionais · Versão {DEFAULT_VERSION}",
  "Versão CrewCheck {DEFAULT_VERSION}",
  "Versão {DEFAULT_VERSION}.",
  "data-version={DEFAULT_VERSION}",
];

for (const token of required) {
  if (!source.includes(token)) throw new Error(`Missing visible version token: ${token}`);
}

const forbidden = [
  "const DEFAULT_VERSION = '13.4.7';",
];

for (const token of forbidden) {
  if (source.includes(token)) throw new Error(`Forbidden old version token still present: ${token}`);
}

console.log('v13.4.8 visible version badge regression OK');
