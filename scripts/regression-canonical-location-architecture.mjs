import assert from 'node:assert/strict';
import fs from 'node:fs';

const legacyPath = new URL('../server/v14316/telegramLocation.mjs', import.meta.url);
const canonicalPath = new URL('../server/v14335/concierge-location.mjs', import.meta.url);
const legacy = fs.readFileSync(legacyPath, 'utf8');
const canonical = fs.readFileSync(canonicalPath, 'utf8');

assert.match(canonical, /normalizeConciergeLocation/);
assert.match(canonical, /conciergeLocationState/);
assert.match(canonical, /TELEGRAM_LEGACY_LOCATION_SOURCES/);

const duplicateTtlPatterns = [
  /ageSeconds\s*<=\s*1800/,
  /ageSeconds\s*<=\s*7200/,
];

for (const pattern of duplicateTtlPatterns) {
  assert.ok(
    pattern.test(legacy),
    `inventário: política legada ainda localizada para remoção controlada (${pattern})`,
  );
}

assert.match(legacy, /asksForGyms/);
assert.match(legacy, /latestLocation\(chatId\)/);

console.log('[regression:canonical-location-architecture] inventário legado detectado e contrato canônico presente.');
