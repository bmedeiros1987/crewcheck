import assert from 'node:assert/strict';
import { normalizeConciergeLocation } from '../server/v14335/concierge-location.mjs';

const now = new Date('2026-07-31T02:57:00.000Z');
const base = {
  latitude: -15.793889,
  longitude: -47.882778,
  updatedAt: '2026-07-31T02:56:30.000Z',
};

const live = normalizeConciergeLocation({ ...base, source: 'live' }, { now });
assert.ok(live, 'localização em tempo real do Telegram deve ser aceita');
assert.equal(live.source, 'telegram');

const staticLocation = normalizeConciergeLocation({ ...base, source: 'static' }, { now });
assert.ok(staticLocation, 'localização estática do Telegram deve ser aceita');
assert.equal(staticLocation.source, 'telegram');

assert.equal(normalizeConciergeLocation({ ...base, source: 'desconhecida' }, { now }), null);
assert.equal(normalizeConciergeLocation({ ...base, source: 'live', updatedAt: '' }, { now }), null);

console.log('[regression:telegram-live-location] modos live/static normalizados para telegram sem aceitar origem desconhecida.');
