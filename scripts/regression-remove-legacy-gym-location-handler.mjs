import assert from 'node:assert/strict';
import fs from 'node:fs';

const file = 'server/v14316/telegramLocation.mjs';
const source = fs.readFileSync(file, 'utf8');

assert.match(source, /export async function handleTelegramLocationAndPlaces\(\)/);
assert.match(source, /return false;/);
assert.doesNotMatch(source, /asksForGyms|nearbyGyms|crewcheck_telegram_locations/);
assert.doesNotMatch(source, /1800|7200|30 minutos|academias? próximas?/i);

console.log('[regression:canonical-location] handler legado não intercepta localização nem academias.');
