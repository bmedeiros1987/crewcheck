import fs from 'node:fs';
import assert from 'node:assert/strict';

const main = fs.readFileSync('client/src/main.tsx', 'utf8');
const css = fs.readFileSync('client/src/styles/auth-mobile-scroll-p0.css', 'utf8');

assert.match(main, /auth-mobile-scroll-p0\.css/, 'main.tsx must load the P0 auth scroll hardening');
assert.match(css, /height:\s*100dvh/, 'auth root must be constrained to the dynamic viewport');
assert.match(css, /max-height:\s*100dvh/, 'auth root must not expand beyond the dynamic viewport');
assert.match(css, /overflow-y:\s*auto/, 'auth root must remain vertically scrollable');
assert.match(css, /touch-action:\s*pan-y/, 'touch scrolling must remain available on mobile');
assert.match(css, /-webkit-overflow-scrolling:\s*touch/, 'momentum scrolling must remain enabled on WebKit');
assert.match(css, /@supports not \(height: 100dvh\)/, 'legacy viewport fallback must remain present');
assert.match(css, /padding-bottom:\s*max\(112px/, 'mobile CTA must retain safe bottom breathing room');
assert.match(css, /scroll-padding-bottom:\s*max\(144px/, 'scroll target must stay above browser chrome and safe area');
assert.doesNotMatch(css, /overflow-y:\s*hidden|touch-action:\s*none/, 'P0 hardening must never disable vertical scrolling');

console.log('[auth-mobile-scroll-p0] constrained scroll container contract OK');
