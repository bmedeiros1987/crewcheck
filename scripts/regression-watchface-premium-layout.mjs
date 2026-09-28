import assert from 'node:assert/strict';
import fs from 'node:fs';

const face = fs.readFileSync('android-wrapper/watchface/src/main/res/raw/watchface.xml', 'utf8');
const labels = fs.readFileSync('android-wrapper/watchface/src/main/res/values/strings.xml', 'utf8');

assert.match(face, /<WatchFace width="450" height="450">/, 'watch face must stay on the 450x450 round canvas');
assert.match(face, /<Scene backgroundColor="#FF000000">/, 'premium face must use true OLED black');
assert.match(face, /#FF0C1726/, 'premium instrument surfaces must be present');
assert.match(face, /#FF22D3EE/, 'CrewCheck cyan accent must remain present');
assert.match(face, /#FF60A5FA/, 'CrewCheck blue accent must remain present');
assert.match(face, /#FFA78BFA/, 'CrewCheck violet accent must remain present');
assert.match(face, /Flight-deck cardinal markers/, 'instrument identity markers must remain explicit');
assert.match(face, /<PartDraw x="56" y="88" width="338" height="126">/, 'clock hero stage must remain centered');
assert.match(labels, /CrewCheck Flight Deck/, 'face name must match the premium flight-deck identity');

// Clock must remain the visual hero.
assert.match(face, /size="88" weight="BOLD"[^>]*color="#FFFFFFFF"/, 'active clock must dominate the face');
assert.match(face, /size="80" weight="THIN"[^>]*color="#FFDDE3EC"/, 'ambient clock must stay restrained');
assert.match(face, /format="EEE dd MMM"/, 'date must remain directly readable');

// Preserve the installed complication contract while adding one genuinely useful free glance.
for (const provider of [
  'CrewCheckComplicationService',
  'GateComplicationService',
  'CrewLifeComplicationService',
  'RoutineComplicationService',
]) {
  assert.ok(face.includes(provider), `existing CrewCheck provider must survive: ${provider}`);
}
assert.match(face, /defaultSystemProvider="WATCH_BATTERY"/, 'battery must remain available');
assert.match(face, /defaultSystemProvider="STEP_COUNT"/, 'steps must be available without the phone app');

const slots = [...face.matchAll(/<ComplicationSlot\b/g)].length;
assert.equal(slots, 6, 'premium face should expose next step, gate, battery, CrewLife, routine and steps');

for (const id of [1, 2, 3, 4, 5, 6]) {
  assert.match(face, new RegExp(`slotId="${id}"`), `slot ${id} must exist`);
}

// Premium hierarchy: one wide operational hero card plus three compact bottom metrics.
assert.match(
  face,
  /<PartDraw x="40" y="224" width="370" height="104">[\s\S]*?<RoundRectangle[^>]*width="370" height="104"[^>]*cornerRadiusX="32" cornerRadiusY="32">[\s\S]*?<Fill color="#FF0C1726" \/>/,
  'next-step hero surface must stay wide, centered and visibly card-like',
);
for (const x of [48, 173, 298]) {
  assert.match(
    face,
    new RegExp(`<PartDraw x="${x}" y="342" width="104" height="64">`),
    `bottom metric surface at x=${x} must stay aligned`,
  );
}

assert.doesNotMatch(face, /TOQUE PARA ABRIR/i, 'premium face should not waste round-screen space on instructional footer copy');
assert.doesNotMatch(face, /WE DO CARE ABOUT US/i, 'watch face should keep branding restrained');

// Nonessential surfaces must clear in ambient to protect OLED and privacy.
const ambientHidden = [...face.matchAll(/<Variant mode="AMBIENT" target="alpha" value="0" \/>/g)].length;
assert.ok(ambientHidden >= 14, 'nonessential chrome and health/routine metrics should disappear in ambient mode');

console.log('[watchface-premium-layout] OLED hierarchy + operational hero + six glance surfaces OK');
