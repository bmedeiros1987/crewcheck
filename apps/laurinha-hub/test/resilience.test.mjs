import test from 'node:test';
import assert from 'node:assert/strict';
import { startHub, makeFakeHa, mediaPlayerState, FAKE_TOKEN, BRIDGE_KEY } from './helpers.mjs';

const ECHO = 'media_player.echo_show_15_laurinha';

// ---- timeout do Home Assistant -----------------------------------------
test('timeout HA: GET state degrada com ha_timeout e mantem a TV renderizavel', async () => {
  const hub = await startHub({ fakeHa: makeFakeHa({ behavior: 'timeout' }) });
  try {
    await hub.post('/api/sound/output', { output: 'todo_lugar' });
    const res = await hub.get('/api/sound/state');
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, false);
    assert.equal(res.json.haReachable, false);
    assert.equal(res.json.error.code, 'ha_timeout');
    assert.match(res.json.error.message, /demorou/i);
    // Mesmo degradado, a UI recebe o essencial para desenhar a tela.
    assert.equal(res.json.output.id, 'todo_lugar');
    assert.ok(Array.isArray(res.json.outputs) && res.json.outputs.length > 0);
  } finally {
    await hub.close();
  }
});

test('timeout HA: POST devolve 504 em vez de pendurar a TV', async () => {
  const hub = await startHub({ fakeHa: makeFakeHa({ behavior: 'timeout' }) });
  try {
    await hub.post('/api/sound/output', { output: 'todo_lugar' });
    const res = await hub.post('/api/sound/pause');
    assert.equal(res.status, 504);
    assert.equal(res.json.ok, false);
    assert.equal(res.json.error.code, 'ha_timeout');
  } finally {
    await hub.close();
  }
});

// ---- token ausente ------------------------------------------------------
test('token ausente: HA_TOKEN vazio responde hub_not_configured, nao 500', async () => {
  const hub = await startHub({ env: { HA_TOKEN: '' } });
  try {
    await hub.post('/api/sound/output', { output: 'todo_lugar' });
    const state = await hub.get('/api/sound/state');
    assert.equal(state.json.ok, false);
    assert.equal(state.json.error.code, 'hub_not_configured');

    const pause = await hub.post('/api/sound/pause');
    assert.equal(pause.status, 503);
    assert.equal(pause.json.error.code, 'hub_not_configured');
    assert.match(pause.json.error.hint, /HA_TOKEN/);
  } finally {
    await hub.close();
  }
});

test('bridge key ausente na requisicao: escrita bloqueada, leitura liberada', async () => {
  const hub = await startHub();
  try {
    const write = await hub.post('/api/sound/pause', {}, { key: null });
    assert.equal(write.status, 401);
    assert.equal(write.json.error.code, 'unauthorized');

    const read = await hub.get('/api/sound/state', { key: null });
    assert.equal(read.status, 200);
  } finally {
    await hub.close();
  }
});

test('bridge key errada e recusada', async () => {
  const hub = await startHub();
  try {
    const res = await hub.post('/api/sound/pause', {}, { key: 'chave-errada-mas-do-mesmo-tamanho-xx' });
    assert.equal(res.status, 401);
  } finally {
    await hub.close();
  }
});

test('LAURINHA_REQUIRE_KEY_FOR_READS=1 tambem protege leitura', async () => {
  const hub = await startHub({ env: { LAURINHA_REQUIRE_KEY_FOR_READS: '1' } });
  try {
    assert.equal((await hub.get('/api/sound/state', { key: null })).status, 401);
    assert.equal((await hub.get('/api/sound/state', { key: BRIDGE_KEY })).status, 200);
  } finally {
    await hub.close();
  }
});

// ---- entidade indisponivel ---------------------------------------------
test('entity unavailable: pause responde 409 com nome amigavel', async () => {
  const fakeHa = makeFakeHa({
    states: { [ECHO]: mediaPlayerState(ECHO, { state: 'unavailable' }) },
  });
  const hub = await startHub({ fakeHa });
  try {
    await hub.post('/api/sound/output', { output: 'echo_show_15_laurinha' });
    const res = await hub.post('/api/sound/pause');
    assert.equal(res.status, 409);
    assert.equal(res.json.error.code, 'entity_unavailable');
    assert.match(res.json.error.message, /Echo Show 15 da Laurinha/);
    assert.equal(fakeHa.calls.length, 0, 'nao deveria chamar servico com entidade indisponivel');
  } finally {
    await hub.close();
  }
});

test('entity unavailable: GET state marca estado unavailable com erro embutido', async () => {
  const fakeHa = makeFakeHa({ states: { [ECHO]: mediaPlayerState(ECHO, { state: 'unavailable' }) } });
  const hub = await startHub({ fakeHa });
  try {
    await hub.post('/api/sound/output', { output: 'echo_show_15_laurinha' });
    const res = await hub.get('/api/sound/state');
    assert.equal(res.json.state, 'unavailable');
    assert.equal(res.json.error.code, 'entity_unavailable');
  } finally {
    await hub.close();
  }
});

// ---- redacao ------------------------------------------------------------
test('nenhuma resposta de erro carrega o token, nem no hint', async () => {
  for (const behavior of ['timeout', 'offline', 'unauthorized']) {
    const hub = await startHub({ fakeHa: makeFakeHa({ behavior }) });
    try {
      await hub.post('/api/sound/output', { output: 'todo_lugar' });
      const bodies = [
        (await hub.get('/api/sound/state')).text,
        (await hub.post('/api/sound/pause')).text,
        (await hub.get('/health', { key: null })).text,
        (await hub.get('/api/home/state')).text,
      ];
      for (const body of bodies) {
        assert.ok(!body.includes(FAKE_TOKEN), `token vazou com behavior=${behavior}`);
        assert.ok(!body.includes(BRIDGE_KEY), `bridge key vazou com behavior=${behavior}`);
      }
    } finally {
      await hub.close();
    }
  }
});

test('o log do Hub tambem nao imprime o token', async () => {
  const hub = await startHub({ fakeHa: makeFakeHa({ behavior: 'offline' }) });
  try {
    await hub.post('/api/sound/output', { output: 'todo_lugar' });
    await hub.get('/api/sound/state');
    const everything = [...hub.captured.info, ...hub.captured.warn, ...hub.captured.error].join('\n');
    assert.ok(!everything.includes(FAKE_TOKEN), 'token apareceu no log');
  } finally {
    await hub.close();
  }
});
