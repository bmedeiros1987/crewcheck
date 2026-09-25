import assert from 'node:assert/strict';
import fs from 'node:fs';

const FACE = 'android-wrapper/watchface/src/main/res/raw/watchface.xml';
const face = fs.readFileSync(FACE, 'utf8');
const labels = fs.readFileSync('android-wrapper/watchface/src/main/res/values/strings.xml', 'utf8');
const info = fs.readFileSync('android-wrapper/watchface/src/main/res/xml/watch_face_info.xml', 'utf8');
const preview = fs.readFileSync('android-wrapper/watchface/src/main/res/drawable-nodpi/preview.png');

assert.match(face, /<WatchFace width="450" height="450">/, 'watch face must stay on the 450x450 round canvas');
assert.match(face, /<Scene backgroundColor="#FF000000">/, 'premium face must use true OLED black');
assert.match(labels, /CrewCheck Flight Deck/, 'face name must match the premium flight-deck identity');
assert.match(face, /Flight-deck cardinal markers/, 'instrument identity markers must remain explicit');

// ---------------------------------------------------------------------------------------
// Watch Face Format v1 — regras do XSD oficial (github.com/google/watchface,
// third_party/wff/specification/documents/1) que este arquivo já violou.
// ---------------------------------------------------------------------------------------

const timeTexts = [...face.matchAll(/<TimeText\b[\s\S]*?<\/TimeText>/g)].map((m) => m[0]);
assert.ok(timeTexts.length >= 2, 'active and ambient clocks must both exist');

// clock/timeText.xsd, timeFormatType: só hora, minuto e segundo. "EEE dd MMM" não é um
// formato de TimeText; data é PartText com [DAY_OF_WEEK_S] / [DAY_Z] / [MONTH_S].
const TIME_FORMAT = /^(((h{1,2}):m{1,2}:s{1,2}|(h{1,2}):m{1,2})|(h{1,2})|m{1,2}|s{1,2})$/;
for (const block of timeTexts) {
  const format = block.match(/\bformat="([^"]*)"/)?.[1];
  assert.ok(format && TIME_FORMAT.test(format), `TimeText format "${format}" is not valid WFF v1 (hour/minute/second only)`);
}

// clock/timeText.xsd é xs:sequence: Variant* ANTES da Font. Na ordem inversa o documento
// não valida e a troca ativo/ambiente dos relógios fica por conta do parser.
for (const block of timeTexts) {
  const variant = block.indexOf('<Variant');
  const font = block.search(/<(Font|BitmapFont)\b/);
  if (variant >= 0 && font >= 0) {
    assert.ok(variant < font, 'inside TimeText, <Variant> must come before <Font> (WFF v1 xs:sequence)');
  }
}

assert.match(face, /\[DAY_OF_WEEK_S\][\s\S]*\[DAY_Z\][\s\S]*\[MONTH_S\]/, 'date must be rendered from calendar data sources');

// Relógio é o herói: numeral cheio no interativo, traço fino no ambiente.
assert.match(face, /size="92" weight="BOLD"[^>]*color="#FFFFFFFF"/, 'active clock must dominate the face');
assert.match(face, /size="84" weight="THIN"[^>]*color="#FFDDE3EC"/, 'ambient clock must stay restrained');

// ---------------------------------------------------------------------------------------
// Tela redonda: nenhuma forma pode ser cortada pela moldura.
//
// Retângulo de cantos arredondados = retângulo interno (encolhido pelo raio) + disco de
// raio r. Como o círculo é convexo, ele cabe inteiro na tela se e só se os quatro cantos do
// retângulo interno estiverem a no máximo (R - r - folga) do centro. É exato, inclusive
// nos cantos — que é onde a doca anterior era cortada.
// ---------------------------------------------------------------------------------------

const CENTER = 225;
const RADIUS = 225;
const CLEARANCE = 4;

function assertInsideRound(label, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  let worst = -Infinity;
  for (const cx of [x + radius, x + w - radius]) {
    for (const cy of [y + radius, y + h - radius]) {
      worst = Math.max(worst, Math.hypot(cx - CENTER, cy - CENTER) + radius);
    }
  }
  assert.ok(
    worst <= RADIUS - CLEARANCE,
    `${label} (x=${x} y=${y} ${w}x${h} r=${r}) reaches ${worst.toFixed(1)}px from center; ` +
      `round screen edge is ${RADIUS}px (needs ${CLEARANCE}px clearance)`,
  );
}

const drawBlocks = [...face.matchAll(/<PartDraw\b[\s\S]*?<\/PartDraw>/g)].map((m) => m[0]);
assert.ok(drawBlocks.length > 0, 'expected PartDraw surfaces');
for (const block of drawBlocks) {
  const px = Number(block.match(/<PartDraw\s+x="([\d.]+)"/)[1]);
  const py = Number(block.match(/<PartDraw\s+x="[\d.]+"\s+y="([\d.]+)"/)[1]);
  const shape = block.match(
    /<RoundRectangle\s+x="([\d.]+)"\s+y="([\d.]+)"\s+width="([\d.]+)"\s+height="([\d.]+)"\s+cornerRadiusX="([\d.]+)"/,
  );
  assert.ok(shape, `PartDraw at x=${px} y=${py} must draw a RoundRectangle (only shape this gate measures)`);
  const [, sx, sy, sw, sh, sr] = shape.map(Number);
  assertInsideRound(`PartDraw at x=${px} y=${py}`, px + sx, py + sy, sw, sh, sr);
}

const slotBlocks = [...face.matchAll(/<ComplicationSlot\b[\s\S]*?<\/ComplicationSlot>/g)].map((m) => m[0]);
for (const block of slotBlocks) {
  const [, x, y, w, h] = block.match(/<ComplicationSlot\s+x="([\d.]+)"\s+y="([\d.]+)"\s+width="([\d.]+)"\s+height="([\d.]+)"/).map(Number);
  const r = Number(block.match(/<BoundingRoundBox[^>]*cornerRadius="([\d.]+)"/)?.[1] ?? 0);
  const id = block.match(/slotId="(\d+)"/)[1];
  assertInsideRound(`complication slot ${id}`, x, y, w, h, r);
}

// ---------------------------------------------------------------------------------------
// Contrato dos slots: quem já configurou o mostrador não pode perder um provider.
// ---------------------------------------------------------------------------------------

assert.equal(slotBlocks.length, 6, 'face exposes next step, gate, battery, CrewLife, routine and steps');
for (const id of [1, 2, 3, 4, 5, 6]) {
  assert.match(face, new RegExp(`slotId="${id}"`), `slot ${id} must exist`);
}
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

const slot = (id) => slotBlocks.find((b) => new RegExp(`slotId="${id}"`).test(b));
assert.match(slot(1), /supportedTypes="LONG_TEXT SHORT_TEXT EMPTY"/, 'next-step slot keeps its types');
assert.match(slot(1), /width="370"/, 'next-step card stays the wide operational hero');

// ---------------------------------------------------------------------------------------
// Ambiente: dado de saúde e rotina não fica aceso numa tela que quem está do lado vê.
// Cada texto de CrewLife (3), rotina (4) e passos (6) precisa sumir no ambiente.
// ---------------------------------------------------------------------------------------

const HIDDEN = '<Variant mode="AMBIENT" target="alpha" value="0" />';
for (const id of [3, 4, 6]) {
  const texts = [...slot(id).matchAll(/<PartText\b[\s\S]*?<\/PartText>/g)].map((m) => m[0]);
  assert.ok(texts.length > 0, `slot ${id} must render text`);
  for (const text of texts) {
    assert.ok(text.includes(HIDDEN), `slot ${id} text must disappear in ambient (privacy + OLED)`);
  }
}
// Superfícies e marcadores também: pixel aceso parado por horas marca o OLED.
for (const block of drawBlocks) {
  assert.ok(block.includes(HIDDEN), 'every drawn surface must clear in ambient');
}

// ---------------------------------------------------------------------------------------
// Paleta: um acento (ciano da marca) e o âmbar do portão. Quando cada quadro tinha a sua
// cor, nada se destacava — cor tem que ter função.
// ---------------------------------------------------------------------------------------

const PALETTE = new Set([
  '#FF000000', // fundo OLED
  '#FF1C1C1E', // superfície (mesma do app do relógio)
  '#FF3A3A3C', // marcadores neutros
  '#FF8E8E93', // rótulo / data no ambiente
  '#FFC7C7CC', // bateria
  '#FFFFFFFF', // valor
  '#FFDDE3EC', // relógio no ambiente
  '#FF22D3EE', // acento CrewCheck
  '#FFFBBF24', // portão
]);
for (const [, color] of face.matchAll(/color="(#[0-9A-Fa-f]{8})"/g)) {
  assert.ok(PALETTE.has(color.toUpperCase()), `color ${color} is outside the face palette`);
}
assert.doesNotMatch(face, /<Stroke\b/, 'surfaces are flat fills; outlines made every card compete');

assert.doesNotMatch(face, /TOQUE PARA ABRIR/i, 'premium face should not waste round-screen space on instructional footer copy');
assert.doesNotMatch(face, /WE DO CARE ABOUT US/i, 'watch face should keep branding restrained');

// ---------------------------------------------------------------------------------------
// Seletor de mostradores: sem watch_face_info + prévia, o mostrador aparece vazio na lista.
// ---------------------------------------------------------------------------------------

assert.match(info, /<Preview value="@drawable\/preview" \/>/, 'picker must have a preview');
assert.match(info, /<Editable value="true" \/>/, 'complications must stay user-editable');
assert.equal(preview.subarray(1, 4).toString('ascii'), 'PNG', 'preview must be a PNG');
assert.equal(preview.readUInt32BE(16), 450, 'preview width must match the 450 canvas');
assert.equal(preview.readUInt32BE(20), 450, 'preview height must match the 450 canvas');

console.log('[watchface-premium-layout] WFF v1 rules + round-screen clearance + ambient privacy + palette + picker preview OK');
