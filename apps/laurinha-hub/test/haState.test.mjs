import test from 'node:test';
import assert from 'node:assert/strict';
import { startHub, makeFakeHa, mediaPlayerState, FAKE_TOKEN } from './helpers.mjs';

const ECHO = 'media_player.echo_show_15_laurinha';

test('estado do HA: mapeia titulo, volume e estado para a UI da TV', async () => {
  const fakeHa = makeFakeHa({ states: { [ECHO]: mediaPlayerState(ECHO) } });
  const hub = await startHub({ fakeHa });
  try {
    await hub.post('/api/sound/output', { output: 'echo_show_15_laurinha' });
    const res = await hub.get('/api/sound/state');

    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.state, 'playing');
    assert.equal(res.json.title, 'Cantiga da Vovo');
    assert.equal(res.json.artist, 'Laurinha');
    assert.equal(res.json.volumePercent, 40);
    assert.equal(res.json.output.id, 'echo_show_15_laurinha');
    assert.equal(res.json.output.entityId, ECHO);
    assert.equal(res.json.error, null);
    assert.equal(res.json.haReachable, true);
  } finally {
    await hub.close();
  }
});

test('estado do HA: o token vai no header Authorization e em lugar nenhum mais', async () => {
  const fakeHa = makeFakeHa({ states: { [ECHO]: mediaPlayerState(ECHO) } });
  const hub = await startHub({ fakeHa });
  try {
    await hub.post('/api/sound/output', { output: 'echo_show_15_laurinha' });
    const res = await hub.get('/api/sound/state');
    assert.ok(!res.text.includes(FAKE_TOKEN), 'estado vazou o token');
    assert.ok(hub.seenAuth.some((value) => value === `Bearer ${FAKE_TOKEN}`),
      'o Hub deveria autenticar no HA com Bearer');
  } finally {
    await hub.close();
  }
});

test('estado do HA: entidade inexistente vira erro amigavel, nao 500', async () => {
  const hub = await startHub({ fakeHa: makeFakeHa({ states: {} }) });
  try {
    await hub.post('/api/sound/output', { output: 'echo_dot_de_bruno' });
    const res = await hub.get('/api/sound/state');
    assert.equal(res.status, 200, 'GET state sempre devolve algo renderizavel');
    assert.equal(res.json.ok, false);
    assert.equal(res.json.error.code, 'entity_not_found');
    assert.match(res.json.error.message, /Echo Dot do Bruno/);
  } finally {
    await hub.close();
  }
});

test('estado do HA: 401 do Home Assistant nao expoe o token na mensagem', async () => {
  const hub = await startHub({ fakeHa: makeFakeHa({ behavior: 'unauthorized' }) });
  try {
    await hub.post('/api/sound/output', { output: 'todo_lugar' });
    const res = await hub.get('/api/sound/state');
    assert.equal(res.json.ok, false);
    assert.equal(res.json.error.code, 'ha_unauthorized');
    assert.ok(!res.text.includes(FAKE_TOKEN));
  } finally {
    await hub.close();
  }
});
