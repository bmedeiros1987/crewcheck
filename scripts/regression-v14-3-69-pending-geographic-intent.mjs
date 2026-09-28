import assert from 'node:assert/strict';
import {
  PENDING_GEOGRAPHIC_INTENT_TTL_MS,
  consumePendingGeographicIntent,
  createPendingGeographicIntent,
  normalizePendingGeographicIntent,
  pendingGeographicIntentState,
  sanitizePendingGeographicIntentFilters,
} from '../server/v14369/pending-geographic-intent.mjs';

const NOW = new Date('2026-08-01T12:00:00.000Z');

assert.equal(PENDING_GEOGRAPHIC_INTENT_TTL_MS, 10 * 60 * 1000, 'TTL padrão deve ser 10 minutos');
assert.equal(normalizePendingGeographicIntent('Hospitais'), 'hospitais');
assert.equal(normalizePendingGeographicIntent('Farmácias'), 'farmacias');
assert.equal(normalizePendingGeographicIntent('intencao-arbitraria'), '', 'intents não reconhecidos devem ser rejeitados');

const filters = sanitizePendingGeographicIntentFilters({
  plano: 'S750',
  categoria: 'pronto-socorro',
  pagina: 2,
  ativo: true,
  nested: { unsafe: true },
  token: 'x'.repeat(500),
});
assert.deepEqual(filters.plano, 'S750');
assert.deepEqual(filters.categoria, 'pronto-socorro');
assert.equal(filters.pagina, 2);
assert.equal(filters.ativo, true);
assert.equal(filters.nested, undefined, 'objetos aninhados não devem ser persistidos');
assert.equal(filters.token.length, 160, 'strings devem ser limitadas');

assert.equal(
  createPendingGeographicIntent('Hospitais', { chatId: 'chat-123', now: NOW }),
  null,
  'criação sem userId deve ser rejeitada',
);
assert.equal(
  createPendingGeographicIntent('Hospitais', { userId: 'user-456', now: NOW }),
  null,
  'criação sem chatId deve ser rejeitada',
);

const pending = createPendingGeographicIntent('Hospitais', {
  filters: { plano: 'S450', tipo: ['PA', 'PS'] },
  chatId: 'chat-123',
  userId: 'user-456',
  now: NOW,
});
assert.ok(pending, 'intenção válida deve ser criada');
assert.equal(pending.intent, 'hospitais');
assert.equal(pending.createdAt, '2026-08-01T12:00:00.000Z');
assert.equal(pending.expiresAt, '2026-08-01T12:10:00.000Z');

const fresh = pendingGeographicIntentState(pending, {
  chatId: 'chat-123',
  userId: 'user-456',
  now: new Date('2026-08-01T12:09:59.000Z'),
});
assert.equal(fresh.status, 'fresh');
assert.equal(fresh.usable, true);
assert.equal(fresh.intent.intent, 'hospitais');
assert.equal(fresh.intent.filters.plano, 'S450');

const expired = pendingGeographicIntentState(pending, {
  chatId: 'chat-123',
  userId: 'user-456',
  now: new Date('2026-08-01T12:10:01.000Z'),
});
assert.equal(expired.status, 'expired');
assert.equal(expired.usable, false);

const missingExpectedChat = pendingGeographicIntentState(pending, {
  userId: 'user-456',
  now: NOW,
});
assert.equal(missingExpectedChat.status, 'scope-missing');
assert.equal(missingExpectedChat.usable, false, 'consulta sem chatId não pode consumir intenção');

const missingExpectedUser = pendingGeographicIntentState(pending, {
  chatId: 'chat-123',
  now: NOW,
});
assert.equal(missingExpectedUser.status, 'scope-missing');
assert.equal(missingExpectedUser.usable, false, 'consulta sem userId não pode consumir intenção');

const missingRecordChat = pendingGeographicIntentState({ ...pending, chatId: '' }, {
  chatId: 'chat-123',
  userId: 'user-456',
  now: NOW,
});
assert.equal(missingRecordChat.status, 'scope-missing');
assert.equal(missingRecordChat.usable, false, 'registro sem chatId não pode ser reutilizado');

const missingRecordUser = pendingGeographicIntentState({ ...pending, userId: '' }, {
  chatId: 'chat-123',
  userId: 'user-456',
  now: NOW,
});
assert.equal(missingRecordUser.status, 'scope-missing');
assert.equal(missingRecordUser.usable, false, 'registro sem userId não pode ser reutilizado');

const wrongChat = pendingGeographicIntentState(pending, {
  chatId: 'chat-999',
  userId: 'user-456',
  now: NOW,
});
assert.equal(wrongChat.status, 'scope-mismatch');
assert.equal(wrongChat.usable, false, 'intenção não pode migrar entre chats');

const wrongUser = pendingGeographicIntentState(pending, {
  chatId: 'chat-123',
  userId: 'user-999',
  now: NOW,
});
assert.equal(wrongUser.status, 'scope-mismatch');
assert.equal(wrongUser.usable, false, 'intenção não pode migrar entre usuários');

const consumedWithoutScope = consumePendingGeographicIntent(pending, { now: NOW });
assert.equal(consumedWithoutScope.consumed, false, 'consumo sem escopo deve falhar fechado');
assert.equal(consumedWithoutScope.status, 'scope-missing');

const consumed = consumePendingGeographicIntent(pending, {
  chatId: 'chat-123',
  userId: 'user-456',
  now: NOW,
});
assert.equal(consumed.consumed, true);
assert.equal(consumed.status, 'consumed');
assert.equal(consumed.next, null, 'consumo deve exigir remoção explícita do armazenamento pelo chamador');

const replaced = createPendingGeographicIntent('Farmácias', {
  filters: { abertoAgora: true },
  chatId: 'chat-123',
  userId: 'user-456',
  now: new Date('2026-08-01T12:02:00.000Z'),
});
assert.equal(replaced.intent, 'farmacias', 'a camada de persistência deve poder sobrescrever a intenção anterior pela mais recente');
assert.notEqual(replaced.createdAt, pending.createdAt);

console.log('CrewCheck v14.3.69 pending geographic intent regression OK');
