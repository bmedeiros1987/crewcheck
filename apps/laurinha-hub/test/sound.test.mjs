import test from 'node:test';
import assert from 'node:assert/strict';
import { startHub, makeFakeHa, mediaPlayerState, makeLibraryFixture } from './helpers.mjs';

const ECHO = 'media_player.echo_show_15_laurinha';
const GROUP = 'media_player.todo_lugar';

function withLibrary(fixture, extra = {}) {
  return { LAURINHA_MEDIA_ROOT: fixture.root, LAURINHA_MANIFEST: fixture.manifestPath, ...extra };
}

// ---- play / pause --------------------------------------------------------
test('play/pause: Alexa usa media_play e media_pause do dominio media_player', async () => {
  const fakeHa = makeFakeHa({ states: { [ECHO]: mediaPlayerState(ECHO) } });
  const hub = await startHub({ fakeHa });
  try {
    await hub.post('/api/sound/output', { output: 'echo_show_15_laurinha' });

    const play = await hub.post('/api/sound/play');
    assert.equal(play.status, 200);
    assert.deepEqual(fakeHa.calls.at(-1), {
      domain: 'media_player', service: 'media_play', data: { entity_id: ECHO },
    });

    await hub.post('/api/sound/pause');
    assert.deepEqual(fakeHa.calls.at(-1), {
      domain: 'media_player', service: 'media_pause', data: { entity_id: ECHO },
    });

    await hub.post('/api/sound/next');
    assert.equal(fakeHa.calls.at(-1).service, 'media_next_track');
    await hub.post('/api/sound/previous');
    assert.equal(fakeHa.calls.at(-1).service, 'media_previous_track');
    await hub.post('/api/sound/stop');
    assert.equal(fakeHa.calls.at(-1).service, 'media_stop');
  } finally {
    await hub.close();
  }
});

test('MP3 local na Alexa e recusado antes de tentar, com alternativa', async () => {
  const fixture = makeLibraryFixture();
  const fakeHa = makeFakeHa({ states: { [ECHO]: mediaPlayerState(ECHO) } });
  const hub = await startHub({ fakeHa, env: withLibrary(fixture) });
  try {
    const res = await hub.post('/api/sound/play', {
      output: 'echo_show_15_laurinha', source: 'library', trackId: 't0',
    });
    assert.equal(res.status, 422);
    assert.equal(res.json.error.code, 'output_cannot_play_local');
    assert.match(res.json.error.message, /nao toca musica da biblioteca/i);
    assert.deepEqual(res.json.error.details.alternatives, [{ id: 'tv', label: 'TV' }]);
    assert.equal(fakeHa.calls.length, 0, 'nao pode chamar play_media para MP3 local na Alexa');
  } finally {
    await hub.close();
    fixture.cleanup();
  }
});

test('MP3 local na TV nao toca o Home Assistant: devolve a URL do stream', async () => {
  const fixture = makeLibraryFixture();
  const fakeHa = makeFakeHa();
  const hub = await startHub({ fakeHa, env: withLibrary(fixture) });
  try {
    const res = await hub.post('/api/sound/play', { output: 'tv', source: 'library', trackId: 't0' });
    assert.equal(res.status, 200);
    assert.equal(res.json.playback.mode, 'tv_local');
    assert.equal(res.json.playback.track.title, 'Ninar');
    assert.equal(res.json.playback.track.url, 'http://192.168.0.32:8188/api/media/track/t0');
    assert.equal(res.json.state, 'playing');
    assert.equal(fakeHa.calls.length, 0, 'TV local nao deve chamar o HA');

    const pause = await hub.post('/api/sound/pause');
    assert.equal(pause.json.state, 'paused');
    assert.equal(fakeHa.calls.length, 0);
  } finally {
    await hub.close();
    fixture.cleanup();
  }
});

test('fila da TV pertence ao Hub e anda com next/previous', async () => {
  const fixture = makeLibraryFixture();
  const hub = await startHub({ env: withLibrary(fixture) });
  try {
    await hub.post('/api/sound/play', { output: 'tv', source: 'library', queue: ['t0'] });
    const queue = await hub.get('/api/sound/queue');
    assert.equal(queue.json.owner, 'hub');
    assert.equal(queue.json.items.length, 1);
    assert.equal(queue.json.items[0].current, true);

    const next = await hub.post('/api/sound/next');
    assert.equal(next.json.playback.queueIndex, 0, 'fila de 1 item volta para ela mesma');
  } finally {
    await hub.close();
    fixture.cleanup();
  }
});

test('fila de saida Alexa e declarada como do aparelho, sem inventar conteudo', async () => {
  const fakeHa = makeFakeHa({ states: { [GROUP]: mediaPlayerState(GROUP) } });
  const hub = await startHub({ fakeHa });
  try {
    await hub.post('/api/sound/output', { output: 'todo_lugar' });
    const queue = await hub.get('/api/sound/queue');
    assert.equal(queue.json.owner, 'device');
    assert.deepEqual(queue.json.items, []);
    assert.match(queue.json.note, /Todo lugar/);
  } finally {
    await hub.close();
  }
});

test('play_media rejeitado pelo aparelho vira play_media_rejected', async () => {
  const fakeHa = makeFakeHa({
    states: { [ECHO]: mediaPlayerState(ECHO) },
    serviceStatus: 500,
  });
  const hub = await startHub({
    fakeHa,
    fileConfig: { tunein: [{ id: 'radio_disney', label: 'Radio Disney', contentId: 's12345' }] },
  });
  try {
    const res = await hub.post('/api/sound/play', {
      output: 'echo_show_15_laurinha', source: 'tunein', stationId: 'radio_disney',
    });
    assert.equal(res.status, 422);
    assert.equal(res.json.error.code, 'play_media_rejected');
  } finally {
    await hub.close();
  }
});

test('TuneIn valido chama play_media com o content id configurado', async () => {
  const fakeHa = makeFakeHa({ states: { [ECHO]: mediaPlayerState(ECHO) } });
  const hub = await startHub({
    fakeHa,
    fileConfig: { tunein: [{ id: 'radio_disney', label: 'Radio Disney', contentId: 's12345' }] },
  });
  try {
    const res = await hub.post('/api/sound/play', {
      output: 'echo_show_15_laurinha', source: 'tunein', stationId: 'radio_disney',
    });
    assert.equal(res.status, 200);
    const call = fakeHa.calls.find((entry) => entry.service === 'play_media');
    assert.deepEqual(call.data, {
      entity_id: ECHO, media_content_id: 's12345', media_content_type: 'music',
    });
  } finally {
    await hub.close();
  }
});

test('estacao TuneIn nao configurada e recusada em vez de adivinhada', async () => {
  const fakeHa = makeFakeHa({ states: { [ECHO]: mediaPlayerState(ECHO) } });
  const hub = await startHub({ fakeHa });
  try {
    const res = await hub.post('/api/sound/play', {
      output: 'echo_show_15_laurinha', source: 'tunein', stationId: 'inventada',
    });
    assert.equal(res.status, 400);
    assert.equal(fakeHa.calls.length, 0);
  } finally {
    await hub.close();
  }
});

// ---- volume --------------------------------------------------------------
test('volume: level 0-100 vira volume_level 0-1 no Home Assistant', async () => {
  const fakeHa = makeFakeHa({ states: { [ECHO]: mediaPlayerState(ECHO) } });
  const hub = await startHub({ fakeHa });
  try {
    await hub.post('/api/sound/output', { output: 'echo_show_15_laurinha' });
    const res = await hub.post('/api/sound/volume', { level: 35 });
    assert.equal(res.status, 200);
    assert.deepEqual(fakeHa.calls.at(-1), {
      domain: 'media_player', service: 'volume_set', data: { entity_id: ECHO, volume_level: 0.35 },
    });
  } finally {
    await hub.close();
  }
});

test('volume: fora da faixa e grampeado, nao rejeitado', async () => {
  const fakeHa = makeFakeHa({ states: { [ECHO]: mediaPlayerState(ECHO) } });
  const hub = await startHub({ fakeHa });
  try {
    await hub.post('/api/sound/output', { output: 'echo_show_15_laurinha' });
    await hub.post('/api/sound/volume', { level: 999 });
    assert.equal(fakeHa.calls.at(-1).data.volume_level, 1);
    await hub.post('/api/sound/volume', { level: -20 });
    assert.equal(fakeHa.calls.at(-1).data.volume_level, 0);
  } finally {
    await hub.close();
  }
});

test('volume: delta parte do volume atual lido do HA', async () => {
  const fakeHa = makeFakeHa({ states: { [ECHO]: mediaPlayerState(ECHO) } }); // 0.4 -> 40%
  const hub = await startHub({ fakeHa });
  try {
    await hub.post('/api/sound/output', { output: 'echo_show_15_laurinha' });
    await hub.post('/api/sound/volume', { delta: -10 });
    assert.equal(fakeHa.calls.at(-1).data.volume_level, 0.3);
  } finally {
    await hub.close();
  }
});

test('volume: sem level nem delta responde 400 amigavel', async () => {
  const hub = await startHub({ fakeHa: makeFakeHa({ states: { [ECHO]: mediaPlayerState(ECHO) } }) });
  try {
    await hub.post('/api/sound/output', { output: 'echo_show_15_laurinha' });
    const res = await hub.post('/api/sound/volume', {});
    assert.equal(res.status, 400);
    assert.match(res.json.error.hint, /level/);
  } finally {
    await hub.close();
  }
});

// ---- scripts do HA -------------------------------------------------------
test('scripts HA: soundScripts sobrescreve o servico padrao', async () => {
  const fakeHa = makeFakeHa({ states: { [ECHO]: mediaPlayerState(ECHO) } });
  const hub = await startHub({
    fakeHa,
    fileConfig: {
      soundScripts: {
        pause: { entityId: 'script.laurinha_pausar' },
        volume: { entityId: 'script.laurinha_volume', variableName: 'volume' },
      },
    },
  });
  try {
    await hub.post('/api/sound/output', { output: 'echo_show_15_laurinha' });

    await hub.post('/api/sound/pause');
    const pauseCall = fakeHa.calls.at(-1);
    assert.equal(pauseCall.domain, 'script');
    assert.equal(pauseCall.service, 'turn_on');
    assert.equal(pauseCall.data.entity_id, 'script.laurinha_pausar');
    assert.equal(pauseCall.data.variables.entity_id, ECHO);

    await hub.post('/api/sound/volume', { level: 55 });
    const volumeCall = fakeHa.calls.at(-1);
    assert.equal(volumeCall.data.entity_id, 'script.laurinha_volume');
    assert.equal(volumeCall.data.variables.volume, 55);
  } finally {
    await hub.close();
  }
});

test('scripts HA: sem sobrescrita o Hub usa media_player, que existe sempre', async () => {
  const fakeHa = makeFakeHa({ states: { [ECHO]: mediaPlayerState(ECHO) } });
  const hub = await startHub({ fakeHa });
  try {
    await hub.post('/api/sound/output', { output: 'echo_show_15_laurinha' });
    await hub.post('/api/sound/pause');
    assert.equal(fakeHa.calls.at(-1).domain, 'media_player');
  } finally {
    await hub.close();
  }
});

// ---- biblioteca ----------------------------------------------------------
test('library: pagina resultados e descreve fontes com motivo', async () => {
  const fixture = makeLibraryFixture();
  const hub = await startHub({ env: withLibrary(fixture) });
  try {
    const res = await hub.get('/api/sound/library?limit=10');
    assert.equal(res.status, 200);
    assert.equal(res.json.tracks.total, 1);
    assert.equal(res.json.tracks.items[0].title, 'Ninar');
    assert.equal(res.json.playlists[0].name, 'Dormir');
    assert.equal(res.json.albums[0].name, 'Verao');
    assert.equal(res.json.albums[0].intervalSeconds, 12);

    const library = res.json.sources.find((source) => source.id === 'library');
    assert.equal(library.available, true, 'TV e a saida padrao e toca a biblioteca');

    const ma = res.json.sources.find((source) => source.id === 'music_assistant');
    assert.equal(ma.available, false);
    assert.match(ma.reason, /nao configurado/i);
  } finally {
    await hub.close();
    fixture.cleanup();
  }
});

test('library: busca por texto filtra as faixas', async () => {
  const fixture = makeLibraryFixture();
  const hub = await startHub({ env: withLibrary(fixture) });
  try {
    assert.equal((await hub.get('/api/sound/library?q=nin')).json.tracks.total, 1);
    assert.equal((await hub.get('/api/sound/library?q=zzz')).json.tracks.total, 0);
  } finally {
    await hub.close();
    fixture.cleanup();
  }
});
