import fs from 'node:fs';

const main = fs.readFileSync('client/src/main.tsx', 'utf8');
const css = fs.readFileSync('client/src/styles/auth-p1-entry-polish.css', 'utf8');

const required = [
  'auth-p1-entry-polish.css',
  '--auth-entry-width: 460px',
  '.cz-auth-mode-feedback',
  '.cz-secondary',
  '@media (max-width: 560px)',
  'grid-template-columns: 20px minmax(0, 1fr)',
];

for (const marker of required) {
  if (!(main + css).includes(marker)) throw new Error(`Missing P-1 Auth entry marker: ${marker}`);
}

if (!css.includes('Demo remains an explicit choice, never an auth-error fallback')) {
  throw new Error('Demo-mode visual demotion contract missing');
}

if (/\.cz-login-card label\s*\{[^}]*grid-template-columns:\s*\d+px\s+\d+px/s.test(css)) {
  throw new Error('Auth labels must not be constrained to two fixed-width columns');
}

console.log('P-1 Auth entry polish regression OK');
