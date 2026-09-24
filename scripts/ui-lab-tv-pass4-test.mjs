import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const cssPath = path.join(root, 'apps/tv-player/src/ui-lab-tv-pass4.css');
const loaderPath = path.join(root, 'apps/tv-player/src/displayPreferences.tsx');

const css = fs.readFileSync(cssPath, 'utf8');
const loader = fs.readFileSync(loaderPath, 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(`UI Lab TV pass 4: ${message}`);
}

assert(loader.includes("import './ui-lab-tv-pass4.css';"), 'visual layer must be statically imported by the TV player');
assert(css.includes('CrewCheck UI Lab · TV pass 4'), 'scope banner is missing');
assert(css.includes('.tv-app .header-status'), 'sync/trust status treatment is missing');
assert(css.includes('.tv-app button:focus'), 'D-pad focus treatment is missing');
assert(css.includes('.tv-app .program-card'), 'program-card legibility treatment is missing');
assert(css.includes('.tv-app .detail-module'), 'program detail treatment is missing');
assert(css.includes('@media (max-width:1280px), (max-height:720px)'), '720p readability guard is missing');
assert(css.includes('@media (prefers-reduced-motion:reduce)'), 'reduced-motion guard is missing');

const forbidden = [
  ['display:grid', 'CSS Grid'],
  ['display: grid', 'CSS Grid'],
  ['backdrop-filter', 'backdrop-filter'],
  ['clamp(', 'clamp()'],
  ['color-mix(', 'color-mix()'],
  [':focus-visible', ':focus-visible'],
  ['content-visibility', 'content-visibility'],
];
for (const [needle, label] of forbidden) {
  assert(!css.includes(needle), `${label} is outside the Chromium 53-safe contract`);
}

const suppression = /(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:[;\s}]|$))/i;
assert(!suppression.test(css), 'presentation layer must not suppress visible operational content');

const uiImports = [...loader.matchAll(/^import\s+['"]\.\/ui-lab-tv-pass4\.css['"];?$/gm)];
assert(uiImports.length === 1, 'visual layer must be imported exactly once');

console.log('PASS UI Lab TV pass 4 — 10-foot readability, D-pad focus, 720p and reduced-motion contracts');
