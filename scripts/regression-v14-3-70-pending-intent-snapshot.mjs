import assert from 'node:assert/strict';
import {
  clearPendingGeographicIntent,
  consumePendingGeographicIntentFromSnapshot,
  pendingGeographicIntentFromSnapshot,
  withPendingGeographicIntent,
} from '../server/v14370/pending-geographic-intent-snapshot.mjs';

const NOW = new Date('2026-08-01T18:00:00.000Z');
const base = {
  preferences: {
    mode: 'formal',
    voiceProfile: 'default',
    location: { latitude: -15.8, longitude: -47.9, label: 'Brasília, DF' },
  },
};

const stored = withPendingGeographicIntent(base, 'Hospitais', {
  chatId: 'chat-123',
  userId: 'user-456',
  filters: { plano: 'S750', pagina: 1 },
  now: NOW,
});
assert.ok(stored, 'deve criar snapshot com intenção válida');
assert.equal(stored.preferences.mode, 'formal', 'não pode apagar preferências existentes');
assert.equal(stored.preferences.location.label, 'Brasília, DF', 'não pode alterar localização canônica');
assert.equal(stored.preferences.pendingGeographicIntent.intent, 'hospitais');

const fresh = pendingGeographicIntentFromSnapshot(stored, {
  chatId: 'chat-123',
  userId: 'user-456',
  now: new Date('2026-08-01T18:05:00.000Z'),
});
assert.equal(fresh.usable, true);
assert.equal(fresh.intent.filters.plano, 'S750');

const wrongScope = pendingGeographicIntentFromSnapshot(stored, {
  chatId: 'chat-999',
  userId: 'user-456',
  now: NOW,
});
assert.equal(wrongScope.usable, false);
assert.equal(wrongScope.status, 'scope-mismatch');

const consumed = consumePendingGeographicIntentFromSnapshot(stored, {
  chatId: 'chat-123',
  userId: 'user-456',
  now: NOW,
});
assert.equal(consumed.consumed, true);
assert.equal(consumed.intent.intent, 'hospitais');
assert.equal(consumed.snapshot.preferences.pendingGeographicIntent, undefined, 'consumo deve ser one-shot');
assert.equal(consumed.snapshot.preferences.mode, 'formal');
assert.equal(consumed.snapshot.preferences.location.label, 'Brasília, DF');

const expired = consumePendingGeographicIntentFromSnapshot(stored, {
  chatId: 'chat-123',
  userId: 'user-456',
  now: new Date('2026-08-01T18:11:00.000Z'),
});
assert.equal(expired.consumed, false);
assert.equal(expired.status, 'expired');
assert.equal(expired.snapshot.preferences.pendingGeographicIntent, undefined, 'intenção expirada deve ser removida');

const cleared = clearPendingGeographicIntent(stored);
assert.equal(cleared.preferences.pendingGeographicIntent, undefined);
assert.equal(cleared.preferences.voiceProfile, 'default');
assert.ok(base.preferences.pendingGeographicIntent === undefined, 'helper não deve mutar snapshot de entrada');

const invalid = withPendingGeographicIntent(base, 'intencao-arbitraria', {
  chatId: 'chat-123',
  userId: 'user-456',
  now: NOW,
});
assert.equal(invalid, null, 'intent fora da allowlist não pode ser persistida');

console.log('CrewCheck v14.3.70 pending intent snapshot regression OK');
