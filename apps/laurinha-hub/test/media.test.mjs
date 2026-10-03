import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startHub, makeLibraryFixture, BRIDGE_KEY } from './helpers.mjs';

function withLibrary(fixture) {
  return { LAURINHA_MEDIA_ROOT: fixture.root, LAURINHA_MANIFEST: fixture.manifestPath };
}

// ---- MP3 -----------------------------------------------------------------
test('MP3: o Hub serve o arquivo com audio/mpeg e Accept-Ranges', async () => {
  const fixture = makeLibraryFixture();
  const hub = await startHub({ env: withLibrary(fixture) });
  try {
    const res = await hub.raw('/api/media/track/t0');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'audio/mpeg');
    assert.equal(res.headers.get('accept-ranges'), 'bytes');
    const body = Buffer.from(await res.arrayBuffer());
    assert.equal(body.length, fs.statSync(fixture.mp3Path).size);
  } finally {
    await hub.close();
    fixture.cleanup();
  }
});

test('MP3: Range devolve 206 com a fatia pedida (a TV precisa disso para avancar)', async () => {
  const fixture = makeLibraryFixture();
  const hub = await startHub({ env: withLibrary(fixture) });
  try {
    const res = await hub.raw('/api/media/track/t0', { headers: { Range: 'bytes=10-19' } });
    assert.equal(res.status, 206);
    const total = fs.statSync(fixture.mp3Path).size;
    assert.equal(res.headers.get('content-range'), `bytes 10-19/${total}`);
    const body = Buffer.from(await res.arrayBuffer());
    assert.equal(body.length, 10);
  } finally {
    await hub.close();
    fixture.cleanup();
  }
});

test('MP3: Range invalido devolve 416, nao o arquivo inteiro', async () => {
  const fixture = makeLibraryFixture();
  const hub = await startHub({ env: withLibrary(fixture) });
  try {
    const res = await hub.raw('/api/media/track/t0', { headers: { Range: 'bytes=999999-' } });
    assert.equal(res.status, 416);
  } finally {
    await hub.close();
    fixture.cleanup();
  }
});

test('MP3: faixa inexistente responde 404 amigavel', async () => {
  const fixture = makeLibraryFixture();
  const hub = await startHub({ env: withLibrary(fixture) });
  try {
    const res = await hub.get('/api/media/track/t999');
    assert.equal(res.status, 404);
    assert.equal(res.json.error.code, 'media_not_found');
  } finally {
    await hub.close();
    fixture.cleanup();
  }
});

// ---- fotos ---------------------------------------------------------------
test('fotos: o Hub serve a imagem com o content-type correto', async () => {
  const fixture = makeLibraryFixture();
  const hub = await startHub({ env: withLibrary(fixture) });
  try {
    const res = await hub.raw('/api/media/photo/p0');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
    const body = Buffer.from(await res.arrayBuffer());
    assert.equal(body.length, fs.statSync(fixture.photoPath).size);
  } finally {
    await hub.close();
    fixture.cleanup();
  }
});

test('fotos: album e capa aparecem na biblioteca com URL utilizavel', async () => {
  const fixture = makeLibraryFixture();
  const hub = await startHub({ env: withLibrary(fixture) });
  try {
    const res = await hub.get('/api/sound/library');
    const album = res.json.albums[0];
    assert.equal(album.name, 'Verao');
    assert.equal(album.photoCount, 1);
    assert.equal(album.coverUrl, 'http://192.168.0.32:8188/api/media/photo/p0');
    assert.equal(res.json.photos.total, 1);
    assert.deepEqual(res.json.frameMode.secondsPerPhoto, 12);
  } finally {
    await hub.close();
    fixture.cleanup();
  }
});

// ---- confinamento --------------------------------------------------------
test('midia fora da raiz da biblioteca nao e servida, mesmo listada no manifesto', async () => {
  const fixture = makeLibraryFixture();
  const outside = path.join(path.dirname(fixture.root), `fora-${Date.now()}.mp3`);
  fs.writeFileSync(outside, Buffer.alloc(32, 1));

  // Manifesto adulterado apontando para fora da raiz.
  const manifest = JSON.parse(fs.readFileSync(fixture.manifestPath, 'utf8'));
  manifest.music.tracks.push({ id: 1, title: 'Fora', path: outside });
  fs.writeFileSync(fixture.manifestPath, JSON.stringify(manifest));

  const hub = await startHub({ env: withLibrary(fixture) });
  try {
    const res = await hub.get('/api/media/track/t1');
    assert.equal(res.status, 404, 'arquivo fora da raiz nao pode ser servido');
    assert.equal(res.json.error.code, 'media_not_found');
  } finally {
    await hub.close();
    fixture.cleanup();
    fs.rmSync(outside, { force: true });
  }
});

test('travessia de caminho no id nao escapa da biblioteca', async () => {
  const fixture = makeLibraryFixture();
  const hub = await startHub({ env: withLibrary(fixture) });
  try {
    for (const evil of ['..%2F..%2Fetc%2Fpasswd', '%2Fetc%2Fpasswd', '..', 't0%00']) {
      const res = await hub.get(`/api/media/track/${evil}`);
      assert.equal(res.status, 404, `id "${evil}" deveria ser recusado`);
    }
  } finally {
    await hub.close();
    fixture.cleanup();
  }
});

test('biblioteca ausente e reportada sem derrubar o Hub', async () => {
  const hub = await startHub({ env: { LAURINHA_MEDIA_ROOT: '/caminho/que/nao/existe' } });
  try {
    const health = await hub.get('/health', { key: null });
    assert.equal(health.json.library.trackCount, 0);
    assert.match(health.json.library.error, /nao existe/i);

    const library = await hub.get('/api/sound/library');
    assert.equal(library.status, 200);
    assert.equal(library.json.tracks.total, 0);
  } finally {
    await hub.close();
  }
});

test('midia exige bridge key quando a leitura e protegida', async () => {
  const fixture = makeLibraryFixture();
  const hub = await startHub({
    env: { ...withLibrary(fixture), LAURINHA_REQUIRE_KEY_FOR_READS: '1' },
  });
  try {
    const semChave = await fetch(`${hub.base}/api/media/track/t0`);
    assert.equal(semChave.status, 401);
    const comChave = await fetch(`${hub.base}/api/media/track/t0`, {
      headers: { 'X-Laurinha-Key': BRIDGE_KEY },
    });
    assert.equal(comChave.status, 200);
  } finally {
    await hub.close();
    fixture.cleanup();
  }
});
