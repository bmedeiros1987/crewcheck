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
  "url('/assets/auth/crewcheck-cabin-red-01.webp')",
  "url('/assets/auth/crewcheck-cabin-red-02.webp')",
  'prefers-reduced-motion: reduce',
  '.cz-auth .cz-wallpaper',
];

for (const marker of required) {
  if (!(main + css).includes(marker)) throw new Error(`Missing P-1 Auth entry marker: ${marker}`);
}

if (!css.includes('Passenger-safe cabin crops supplied by the product owner.')) {
  throw new Error('Passenger-safe auth cabin background contract missing');
}

if (!css.includes('Demo remains an explicit choice, never an auth-error fallback')) {
  throw new Error('Demo-mode visual demotion contract missing');
}

if (/\.cz-login-card label\s*\{[^}]*grid-template-columns:\s*\d+px\s+\d+px/s.test(css)) {
  throw new Error('Auth labels must not be constrained to two fixed-width columns');
}

if (/(^|\n)\.cz-wallpaper(?:\s|:|\{)/m.test(css)) {
  throw new Error('Auth cabin wallpaper selectors must be scoped through .cz-auth');
}

if (/html\[data-crew-theme='dark'\]\s+\.cz-wallpaper/m.test(css)) {
  throw new Error('Dark-mode auth cabin wallpaper selectors must remain scoped through .cz-auth');
}

if (!/\.cz-auth\s+\.cz-wallpaper\s*\{[^}]*display:\s*block\s*!important/s.test(css)) {
  throw new Error('Auth cabin wallpaper must remain visible on the auth page');
}

console.log('P-1 Auth entry polish regression OK');
