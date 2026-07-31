import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('server/v139/index.mjs', 'utf8');

assert.match(source, /function isCanonicalHealthPlacesIntent/);
assert.match(source, /farmacias\|hospitais/);
assert.match(source, /!shouldUseCanonicalHealthPlaces && await handleEmergencyTelegram/);
assert.ok(!source.includes("if (!isLiveLocation && await handleEmergencyTelegram(update, sendTelegram)) return true;"));

console.log('[regression:v14.3.66] Farmácias e Hospitais não são mais interceptados pelo módulo legado de emergência.');
