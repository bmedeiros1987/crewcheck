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
  'overflow-y: auto',
  'overscroll-behavior-y: contain',
  '-webkit-overflow-scrolling: touch',
  'scroll-padding-block:',
  'padding-bottom: max(96px, env(safe-area-inset-bottom))',
  'scroll-padding-bottom: max(128px, env(safe-area-inset-bottom))',
];

for (const marker of required) {
  if (!(main + css).includes(marker)) throw new Error(`Missing P-1 Auth entry marker: ${marker}`);
}

if (!css.includes('Passenger-safe cabin crops supplied by the product owner.')) {
  throw new Error('Passenger-safe auth cabin background contract missing');
}

if (/\.cz-auth\s*\{[^}]*overflow:\s*hidden/s.test(css)) {
  throw new Error('Auth root must remain vertically scrollable when the mobile keyboard reduces the viewport');
}

if (!css.includes('Demo remains an explicit choice, never an auth-error fallback')) {
  throw new Error('Demo-mode visual demotion contract missing');
}

if (/\.cz-login-card label\s*\{[^}]*grid-template-columns:\s*\d+px\s+\d+px/s.test(css)) {
  throw new Error('Auth labels must not be constrained to two fixed-width columns');
}

for (const match of css.matchAll(/([^{}]+)\{/g)) {
  const prelude = String(match[1] || '').trim();
  if (!prelude || prelude.startsWith('@')) continue;
  for (const selector of prelude.split(',')) {
    if (!selector.includes('.cz-wallpaper')) continue;
    if (!/\.cz-auth\b[\s>+~]+\.cz-wallpaper\b/s.test(selector)) {
      throw new Error(`Auth cabin wallpaper selectors must be scoped through .cz-auth: ${selector.trim()}`);
    }
  }
}

if (/html\[data-crew-theme='dark'\]\s+\.cz-wallpaper/m.test(css)) {
  throw new Error('Dark-mode auth cabin wallpaper selectors must remain scoped through .cz-auth');
}

if (!/\.cz-auth\s+\.cz-wallpaper\s*\{[^}]*display:\s*block\s*!important/s.test(css)) {
  throw new Error('Auth cabin wallpaper must remain visible on the auth page');
}

// index.css has a legacy ".cz-login-card label div svg { position:absolute; right:15px;
// top:29px }" rule (2 classes + 3 elements = higher specificity than a bare
// ".cz-password-toggle svg") that decenters the show/hide-password eye icon - measured
// live: ~18px vertical, ~5px horizontal offset from the button's true center. The override
// must be scoped through .cz-login-card too (2 classes) to actually win the cascade, not
// just declare the right properties.
const passwordToggleIconMatch = css.match(/\.cz-login-card \.cz-password-toggle svg\s*\{([^}]*)\}/s);
if (!passwordToggleIconMatch) {
  throw new Error('Password-toggle icon centering override missing (or under-specific: must be scoped through .cz-login-card to beat the legacy "label div svg" rule)');
}
const passwordToggleIconBlock = passwordToggleIconMatch[1];
if (!/position:\s*static\s*!important/.test(passwordToggleIconBlock)) {
  throw new Error('Password-toggle icon must reset position to static, or the legacy absolute offset keeps applying');
}

console.log('P-1 Auth entry polish regression OK');