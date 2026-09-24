import assert from 'node:assert/strict';
import fs from 'node:fs';

const facePath = 'android-wrapper/watchface/src/main/res/raw/watchface.xml';
const face = fs.readFileSync(facePath, 'utf8');

assert.match(face, /<WatchFace width="450" height="450">/, 'face must remain on the 450x450 round-first canvas');
assert.match(face, /backgroundColor="#FF020814"/, 'UI Lab pass 5 navy/black foundation must remain intact');

// Brand stays restrained: one visible signature and no repeated slogan treatment.
const visibleBrandSignatures = [...face.matchAll(/<!\[CDATA\[CrewCheck\]\]>/g)].length;
assert.equal(visibleBrandSignatures, 1, 'watch face should render exactly one CrewCheck signature');
assert.doesNotMatch(face, /WE DO CARE ABOUT US/i, 'watch face should avoid repeated branding/slogan noise');

// Time remains the primary information on the face.
assert.match(face, /size="90" weight="BOLD"[^>]*color="#FFFFFFFF"/, 'active clock must remain the visual hero');
assert.match(face, /size="82" weight="THIN"[^>]*color="#FFDCE5F0"/, 'ambient clock must remain restrained and legible');
assert.match(face, /format="EEE dd MMM"/, 'date must remain directly readable');

// Free face contract: useful without CrewWatch Premium installed.
assert.match(face, /defaultSystemProvider="STEP_COUNT"/);
assert.match(face, /defaultSystemProvider="WATCH_BATTERY"/);
assert.match(face, /defaultSystemProvider="NEXT_EVENT"/);
assert.doesNotMatch(face, /BatteryComplicationService/);
assert.doesNotMatch(face, /NextStepComplicationService/);
assert.doesNotMatch(face, /CrewLifeComplicationService/);
assert.doesNotMatch(face, /ConciergeComplicationService/);

const slots = [...face.matchAll(/<ComplicationSlot\b/g)].length;
assert.equal(slots, 3, 'pass 5 must keep the face glanceable: steps, battery and one wide event slot');

// Round-screen discipline: complications stay within the established safe composition.
assert.match(face, /x="76"\s+y="218"\s+width="136"\s+height="74"\s+slotId="1"/s);
assert.match(face, /x="238"\s+y="218"\s+width="136"\s+height="74"\s+slotId="2"/s);
assert.match(face, /x="60"\s+y="306"\s+width="330"\s+height="90"\s+slotId="3"/s);

// Decorative rings stay subtle and disappear in ambient mode.
const ringStrokes = [...face.matchAll(/<Stroke thickness="(\d+)"/g)].map((match) => Number(match[1]));
assert.equal(ringStrokes.length, 2, 'pass 5 uses exactly two instrument rings');
assert.ok(ringStrokes.every((thickness) => thickness <= 2), 'instrument rings must not overpower operational data');
const ambientHidden = [...face.matchAll(/<Variant mode="AMBIENT" target="alpha" value="0" \/>/g)].length;
assert.ok(ambientHidden >= 10, 'decorative/complication content should clear out in ambient mode');

console.log('[ui-lab-watchface-pass5] round-first hierarchy + free essentials + restrained branding OK');
