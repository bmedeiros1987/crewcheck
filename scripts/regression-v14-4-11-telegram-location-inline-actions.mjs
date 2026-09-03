import fs from 'node:fs';
import assert from 'node:assert/strict';

const loader = fs.readFileSync('scripts/v14410/apply.mjs', 'utf8');
const patch = fs.readFileSync('scripts/v14411/apply.mjs', 'utf8');

assert.match(loader, /await import\('\.\.\/v14411\/apply\.mjs'\);/, 'v14.4.11 precisa participar da preparação canônica');
assert.match(patch, /function conciergeLocationActionsKeyboard\(\)/, 'teclado inline de localização ausente');
assert.match(patch, /callback_data: 'cc_location:hospitals'/, 'ação inline de hospitais ausente');
assert.match(patch, /callback_data: 'cc_location:pharmacies'/, 'ação inline de farmácias ausente');
assert.match(patch, /callback_data: 'cc_location:gyms'/, 'ação inline de academias ausente');
assert.match(patch, /conciergeHospitalsReply/, 'callback não reutiliza a busca canônica de hospitais');
assert.match(patch, /conciergePharmaciesReply/, 'callback não reutiliza a busca canônica de farmácias');
assert.match(patch, /conciergeGymsReply/, 'callback não reutiliza a busca canônica de academias');
assert.match(patch, /reply_markup: conciergeLocationActionsKeyboard\(\)/, 'confirmação de localização ainda não usa inline keyboard');
assert.match(patch, /Quando ela expirar, peço uma atualização/, 'texto humano de expiração não aplicado');
assert.doesNotMatch(patch, /para \/saida, \/hospitais, \/farmacias e \/academias/, 'copy técnica com comandos não pode permanecer na confirmação nova');
assert.match(patch, /if \(!data\.startsWith\('cc_nav:'\) && !data\.startsWith\('cc_location:'\)\) return false;/, 'callback de localização não está integrado ao dispatcher existente');

console.log('PASS v14.4.11 Telegram location inline actions');
