import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const backdrop = read('android-wrapper/wear/src/main/java/com/crewcheck/watch/PremiumBackdropView.java');
const main = read('android-wrapper/wear/src/main/java/com/crewcheck/watch/MainActivity.java');

// Pass 6 is presentation-only: every native page keeps the same shared backdrop.
assert.match(main, /PremiumBackdropView backdrop = new PremiumBackdropView\(this\)/);
assert.match(main, /PAGE_COUNT = 6/);
assert.match(main, /MODE_NOW = 0/);
assert.match(main, /MODE_JOURNEY = 1/);
assert.match(main, /MODE_NOTIFICATIONS = 2/);
assert.match(main, /MODE_SCHEDULE = 3/);
assert.match(main, /MODE_CREWLIFE = 4/);
assert.match(main, /MODE_CONCIERGE = 5/);

// The round-first atmosphere must remain calm, static and cheap to render.
assert.match(backdrop, /private static final int BASE = Color\.rgb\(3, 8, 20\)/);
assert.match(backdrop, /onSizeChanged\(/, 'gradients and geometry must be cached when size changes');
assert.match(backdrop, /edgeVignette/);
assert.match(backdrop, /bezelOval/);
assert.match(backdrop, /focusGlow/);
assert.match(backdrop, /lowerGlow/);
assert.match(backdrop, /quietArc/);
assert.match(backdrop, /setImportantForAccessibility\(IMPORTANT_FOR_ACCESSIBILITY_NO\)/);
assert.match(backdrop, /setFocusable\(false\)/);
assert.match(backdrop, /setClickable\(false\)/);

const drawBody = backdrop.slice(backdrop.indexOf('protected void onDraw'));
assert.doesNotMatch(drawBody, /new RadialGradient/,
  'onDraw must not allocate radial shaders on every frame');
assert.doesNotMatch(drawBody, /new LinearGradient/,
  'onDraw must not allocate linear shaders on every frame');
assert.doesNotMatch(drawBody, /new RectF/,
  'onDraw must not allocate geometry on every frame');
assert.doesNotMatch(backdrop, /ValueAnimator|ObjectAnimator|AnimationDrawable|postInvalidate|invalidate\(\)/,
  'decorative animation would add noise and battery cost');

const arcDraws = [...drawBody.matchAll(/canvas\.drawArc\(/g)].length;
assert.equal(arcDraws, 4, 'pass 6 keeps only four restrained bezel accents');
assert.match(drawBody, /canvas\.drawCircle\(width \* 0\.50f, height \* 0\.50f, vignetteRadius, edgeVignette\)/,
  'edge vignette must protect circular-edge contrast');
assert.match(drawBody, /canvas\.drawOval\(bezelOval, bezel\)/,
  'subtle bezel must visually contain the canvas');

// Keep the backdrop independent from roster parsing/business decisions.
assert.doesNotMatch(backdrop, /WatchContextSnapshot|journeyId|presentationTime|premiumAccess|SecureSnapshotStore/);

console.log('[ui-lab-crewwatch-pass6] round-first static atmosphere OK');
