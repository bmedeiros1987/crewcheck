import assert from 'node:assert/strict';
import fs from 'node:fs';

// Measured live in the browser (both themes) before this fix: .cz-primary ("Entrar no
// CrewCheck") had at least three disagreeing background/color declarations across
// auth-compact.css, index.css, auth-premium-v2.css and a generic [class*="primary"] color
// rule in theme-v14-3-17/18.css that also matches "cz-primary" by substring. None of them
// reliably reached the rendered button: in dark mode background and text both computed to
// rgb(245,249,252)-family values (contrast ratio 1.00 - the primary call-to-action on Login
// was effectively invisible). The fix adds one final override with enough specificity
// (.cz-auth compounded with the [data-version] attribute it already carries, plus
// .cz-login-card and .cz-primary = 4 components) to beat every competing rule, an explicit
// literal text color (not a token, since the competing token-based rules are exactly what
// disagreed), and appearance:none so the native <button> chrome cannot paint over it.
const css = fs.readFileSync('client/src/styles/auth-p1-entry-polish.css', 'utf8');

assert.match(
  css,
  /\.cz-auth\[data-version\]\s+\.cz-login-card\s+\.cz-primary\s*,\s*\n\.cz-auth\[data-version\]\s+\.cz-login-card\s+\.cz-primary:disabled\s*\{/,
  'final override for the Login primary button (background/text contrast) is missing or its selector regressed to a lower-specificity form that will lose the cascade again',
);

const overrideBlockMatch = css.match(/\.cz-auth\[data-version\]\s+\.cz-login-card\s+\.cz-primary,[\s\S]*?\n\}/);
assert.ok(overrideBlockMatch, 'could not isolate the Login primary button override block');
const block = overrideBlockMatch[0];

assert.match(block, /appearance:\s*none\s*!important/, 'must reset native <button> appearance, or the OS/browser chrome can paint over the declared background regardless of any color rule');
assert.match(block, /color:\s*#ffffff\s*!important/, 'text color must be pinned to a literal white, not a token shared with the competing rules that caused the bug');
assert.match(block, /background-image:\s*none\s*!important/, 'must clear any inherited gradient background-image, or a legacy gradient rule can still show through underneath the flat background-color');

console.log('Auth primary button contrast regression: ok');
