import assert from 'node:assert/strict';
import fs from 'node:fs';

const legacyPath = new URL('../server/v14316/telegramLocation.mjs', import.meta.url);
const canonicalPath = new URL('../server/v14335/concierge-location.mjs', import.meta.url);
const legacy = fs.readFileSync(legacyPath, 'utf8');
const canonical = fs.readFileSync(canonicalPath, 'utf8');

assert.match(canonical, /normalizeConciergeLocation/);
assert.match(canonical, /conciergeLocationState/);
assert.match(canonical, /TELEGRAM_LEGACY_LOCATION_SOURCES/);

const forbiddenLegacyDecisionPatterns = [
  /ageSeconds\s*<=\s*1800/,
  /ageSeconds\s*<=\s*7200/,
  /asksForGyms/,
  /latestLocation\(chatId\)/,
];

for (const pattern of forbiddenLegacyDecisionPatterns) {
  assert.doesNotMatch(
    legacy,
    pattern,
    `módulo legado voltou a decidir localização/TTL (${pattern})`,
  );
}

assert.match(legacy, /compatibilityMirror:\s*true/);
assert.match(legacy, /saveLegacyLocationMirror/);
assert.match(legacy, /return false;/);
assert.match(legacy, /Concierge canônico é a única camada autorizada/);

console.log('[regression:canonical-location-architecture] handler legado é apenas espelho e decisão permanece canônica.');
