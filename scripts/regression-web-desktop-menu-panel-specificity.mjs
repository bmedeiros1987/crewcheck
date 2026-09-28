import assert from 'node:assert/strict';
import fs from 'node:fs';

// client/src/components/v1399/premium.css contains a ".cz-menu-panel" rule scoped by an
// attribute selector (either "[data-version]" or "[data-version=\"13.9.9\"]" depending on
// which prepare-time script last touched it - both forms carry the same specificity: one
// attribute selector + one class = 2 selector components). client/src/styles/
// web-desktop-shell.css is meant to be the final desktop-shell override (imported last in
// main.tsx) but its plain ".cz-menu-panel" rule (1 component) has *lower* specificity, so
// even with !important on both sides, the old rule kept winning width/position - measured
// live: panel rendered at width:980px (not the intended 560px), ~188px off-screen to the
// left at a 1024px-wide desktop/tablet-landscape (pointer:fine) viewport. Fix: give the
// override selector one more component (.cz-app + [data-version] + .cz-menu-panel = 3)
// so it wins on specificity, not on load order.
const legacyPath = 'client/src/components/v1399/premium.css';
const legacyCss = fs.readFileSync(legacyPath, 'utf8');
assert.match(
  legacyCss,
  /\[data-version(="[^"]*")?\]\s*\.cz-menu-panel\s*\{[^}]*width\s*:/,
  'this regression assumes a legacy attribute-scoped .cz-menu-panel rule still exists somewhere; if it was fully removed, the desktop-shell override no longer needs the specificity boost below (this test can be relaxed)',
);

const shellPath = 'client/src/styles/web-desktop-shell.css';
const shellCss = fs.readFileSync(shellPath, 'utf8');
assert.ok(
  shellCss.includes('.cz-app[data-version] .cz-menu-panel {'),
  'the desktop-shell final override must out-specify the legacy [data-version] .cz-menu-panel rule, not just out-order it',
);
assert.equal(
  /(?<!\.cz-app\[data-version\]\s)\.cz-menu-panel\s*\{\s*\n\s*position: relative !important;\s*\n\s*right: auto !important;/.test(shellCss),
  false,
  'the panel override must not regress back to a plain .cz-menu-panel selector (loses the specificity fight)',
);

console.log('Web desktop menu-panel specificity regression: ok');
