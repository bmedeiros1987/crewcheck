import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../server/v14316/telegramLocation.mjs', import.meta.url), 'utf8');

assert.ok(source.includes('compatibilityMirror: true'), 'espelho legado deve ser explicitamente identificado');
assert.ok(source.includes('return false;'), 'handler legado deve liberar o fluxo para o Concierge canônico');
assert.ok(!source.includes('asksForGyms'), 'handler legado não pode reconhecer comandos de academia');
assert.ok(!source.includes('nearbyGyms'), 'handler legado não pode consultar locais');
assert.ok(!source.includes('latestLocation'), 'handler legado não pode escolher localização');
assert.ok(!source.includes('ageSeconds <= 1800'), 'TTL legado de 30 minutos deve ser removido');
assert.ok(!source.includes('ageSeconds <= 7200'), 'TTL legado de 2 horas deve ser removido');
assert.ok(!source.includes('Vou usá-la nas próximas consultas'), 'handler legado não pode responder ao usuário');

console.log('[regression:canonical-location-no-legacy-gym-interceptor] academia e demais consumidores liberados para o resolvedor canônico.');
