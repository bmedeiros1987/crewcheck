import test from 'node:test';
import assert from 'node:assert/strict';
import { startHub, makeFakeHa, mediaPlayerState } from './helpers.mjs';

const LIGHT = 'light.sala';
const SCENE_SCRIPT = 'script.laurinha_festa';
const GROUP = 'media_player.todo_lugar';

function lightState(state = 'on') {
  return { entity_id: LIGHT, state, attributes: { friendly_name: 'Luz da sala' } };
}
function scriptState() {
  return { entity_id: SCENE_SCRIPT, state: 'off', attributes: { friendly_name: 'Festa' } };
}

test('home state: acao nao configurada aparece como nao disponivel, sem palpite', async () => {
  const hub = await startHub({ fakeHa: makeFakeHa({ states: {} }) });
  try {
    const res = await hub.get('/api/home/state');
    assert.equal(res.status, 200);
    const ids = res.json.actions.map((action) => action.id);
    assert.deepEqual(ids, ['lights', 'sound', 'party', 'good_night', 'climate', 'alarm']);
    for (const action of res.json.actions) {
      assert.equal(action.configured, false);
      assert.equal(action.available, false);
      assert.match(action.reason, /nao configurada/i);
    }
    assert.deepEqual(res.json.entities, [], 'sem configuracao, nenhuma entidade e consultada');
  } finally {
    await hub.close();
  }
});

test('acao nao configurada responde 501 dizendo qual chave falta', async () => {
  const hub = await startHub();
  try {
    const res = await hub.post('/api/home/action', { action: 'party' });
    assert.equal(res.status, 501);
    assert.equal(res.json.error.code, 'action_not_configured');
    assert.match(res.json.error.hint, /homeActions\.party/);
  } finally {
    await hub.close();
  }
});

test('acao inexistente e recusada com a lista de acoes validas', async () => {
  const hub = await startHub();
  try {
    const res = await hub.post('/api/home/action', { action: 'abrir_cofre' });
    assert.equal(res.status, 400);
    assert.match(res.json.error.hint, /lights, sound, party, good_night, climate, alarm/);
  } finally {
    await hub.close();
  }
});

test('lights: executa o passo configurado com o parametro validado', async () => {
  const fakeHa = makeFakeHa({ states: { [LIGHT]: lightState() } });
  const hub = await startHub({
    fakeHa,
    fileConfig: {
      homeActions: {
        lights: {
          label: 'Luzes',
          stateEntities: [LIGHT],
          steps: [{
            service: 'light.turn_on',
            target: { entity_id: LIGHT },
            params: { brightness: { to: 'brightness_pct', min: 1, max: 100 } },
          }],
        },
      },
    },
  });
  try {
    const res = await hub.post('/api/home/action', { action: 'lights', params: { brightness: 250 } });
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.deepEqual(fakeHa.calls.at(-1), {
      domain: 'light', service: 'turn_on', data: { entity_id: LIGHT, brightness_pct: 100 },
    });
  } finally {
    await hub.close();
  }
});

test('parametro nao declarado pelo passo nao e repassado ao Home Assistant', async () => {
  const fakeHa = makeFakeHa({ states: { [LIGHT]: lightState() } });
  const hub = await startHub({
    fakeHa,
    fileConfig: {
      homeActions: {
        lights: { steps: [{ service: 'light.turn_on', target: { entity_id: LIGHT } }] },
      },
    },
  });
  try {
    await hub.post('/api/home/action', {
      action: 'lights',
      params: { brightness_pct: 5, transition: 99, entity_id: 'light.quarto_da_laurinha' },
    });
    assert.deepEqual(fakeHa.calls.at(-1).data, { entity_id: LIGHT },
      'parametros nao declarados nao podem chegar ao HA');
  } finally {
    await hub.close();
  }
});

test('modo festa: roda os passos e ajusta o som na saida configurada', async () => {
  const fakeHa = makeFakeHa({
    states: { [LIGHT]: lightState(), [SCENE_SCRIPT]: scriptState(), [GROUP]: mediaPlayerState(GROUP) },
  });
  const hub = await startHub({
    fakeHa,
    fileConfig: {
      homeActions: {
        party: {
          label: 'Modo Festa',
          stateEntities: [LIGHT],
          frameMode: true,
          sound: { output: 'todo_lugar', volume: 40 },
          steps: [
            { label: 'luzes decorativas', service: 'light.turn_on', target: { entity_id: LIGHT } },
            { label: 'cena da festa', service: 'script.turn_on', target: { entity_id: SCENE_SCRIPT } },
          ],
        },
      },
    },
  });
  try {
    const res = await hub.post('/api/home/action', { action: 'party', params: { volume: 55 } });
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.partial, false);
    assert.deepEqual(res.json.frameMode, { enable: true });
    assert.equal(res.json.steps.length, 3, 'dois passos + som ambiente');

    const services = fakeHa.calls.map((call) => `${call.domain}.${call.service}`);
    assert.ok(services.includes('light.turn_on'));
    assert.ok(services.includes('script.turn_on'));
    const volumeCall = fakeHa.calls.find((call) => call.service === 'volume_set');
    assert.equal(volumeCall.data.volume_level, 0.55, 'params.volume sobrepoe o volume configurado');
  } finally {
    await hub.close();
  }
});

test('modo festa: um passo falho nao aborta os outros e vira resultado parcial', async () => {
  const fakeHa = makeFakeHa({
    states: {
      [LIGHT]: lightState('unavailable'),
      [SCENE_SCRIPT]: scriptState(),
      [GROUP]: mediaPlayerState(GROUP),
    },
  });
  const hub = await startHub({
    fakeHa,
    fileConfig: {
      homeActions: {
        party: {
          label: 'Modo Festa',
          sound: { output: 'todo_lugar', volume: 30 },
          steps: [
            { label: 'luzes decorativas', service: 'light.turn_on', target: { entity_id: LIGHT } },
            { label: 'cena da festa', service: 'script.turn_on', target: { entity_id: SCENE_SCRIPT } },
          ],
        },
      },
    },
  });
  try {
    const res = await hub.post('/api/home/action', { action: 'party' });
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, false);
    assert.equal(res.json.partial, true);
    assert.match(res.json.message, /2 de 3 passos/);

    const luzes = res.json.steps.find((step) => step.step === 'luzes decorativas');
    assert.equal(luzes.ok, false);
    assert.equal(luzes.error.code, 'entity_unavailable');
    assert.equal(res.json.steps.find((step) => step.step === 'cena da festa').ok, true);
  } finally {
    await hub.close();
  }
});

test('acao com todos os passos falhando propaga o erro real', async () => {
  const fakeHa = makeFakeHa({ states: {} });
  const hub = await startHub({
    fakeHa,
    fileConfig: {
      homeActions: {
        good_night: { steps: [{ service: 'script.turn_on', target: { entity_id: 'script.boa_noite' } }] },
      },
    },
  });
  try {
    const res = await hub.post('/api/home/action', { action: 'good_night' });
    assert.equal(res.status, 502);
    assert.equal(res.json.error.code, 'entity_not_found');
  } finally {
    await hub.close();
  }
});

test('servico fora da lista permitida e bloqueado antes de sair do Hub', async () => {
  const fakeHa = makeFakeHa({ states: {} });
  const hub = await startHub({
    fakeHa,
    fileConfig: {
      homeActions: {
        alarm: {
          steps: [{
            service: 'homeassistant.stop',
            target: { entity_id: 'sun.sun' },
            requireAvailable: false,
          }],
        },
      },
    },
  });
  try {
    const res = await hub.post('/api/home/action', { action: 'alarm' });
    assert.equal(res.json.ok, false);
    assert.equal(fakeHa.calls.length, 0, 'servico proibido nunca pode chegar ao HA');
    const step = res.json.error?.code ? res.json.error : res.json.steps?.[0]?.error;
    assert.equal(step.code, 'service_not_allowed');
  } finally {
    await hub.close();
  }
});

test('home state: le as entidades configuradas em uma unica ida ao HA', async () => {
  const fakeHa = makeFakeHa({ states: { [LIGHT]: lightState('on') } });
  const hub = await startHub({
    fakeHa,
    fileConfig: {
      homeActions: { lights: { label: 'Luzes', stateEntities: [LIGHT], steps: [] } },
      homeSensors: ['sensor.inexistente'],
    },
  });
  try {
    const res = await hub.get('/api/home/state');
    assert.equal(res.json.ok, true);
    const luz = res.json.entities.find((entity) => entity.entityId === LIGHT);
    assert.equal(luz.state, 'on');
    assert.equal(luz.available, true);
    assert.equal(luz.name, 'Luz da sala');

    const ausente = res.json.entities.find((entity) => entity.entityId === 'sensor.inexistente');
    assert.equal(ausente.available, false);
    assert.match(ausente.reason, /nao existe/i);
  } finally {
    await hub.close();
  }
});
