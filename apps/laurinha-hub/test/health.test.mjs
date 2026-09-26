import test from 'node:test';
import assert from 'node:assert/strict';
import { startHub, makeFakeHa, makeLibraryFixture, FAKE_TOKEN } from './helpers.mjs';

test('health: responde 200 e descreve a configuracao sem vazar segredo', async () => {
  const fixture = makeLibraryFixture();
  const hub = await startHub({
    env: { LAURINHA_MEDIA_ROOT: fixture.root, LAURINHA_MANIFEST: fixture.manifestPath },
  });
  try {
    const res = await hub.get('/health', { key: null });
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.service, 'laurinha-hub');
    assert.equal(res.json.haConfigured, true);
    assert.equal(res.json.bridgeKeyConfigured, true);
    assert.equal(res.json.library.trackCount, 1);
    assert.equal(res.json.ha.reachable, true);

    // O corpo inteiro nao pode conter o token nem a bridge key.
    assert.ok(!res.text.includes(FAKE_TOKEN), 'health vazou o token do HA');
    assert.ok(!res.text.includes('S3CR3T'), 'health vazou parte do token');
    assert.ok(!/bridge_K3Y/.test(res.text), 'health vazou a bridge key');
  } finally {
    await hub.close();
    fixture.cleanup();
  }
});

test('health: e publico, nao exige bridge key', async () => {
  const hub = await startHub();
  try {
    const res = await hub.get('/health', { key: null });
    assert.equal(res.status, 200);
  } finally {
    await hub.close();
  }
});

test('health: marca ok=false e 503 quando o Home Assistant nao responde', async () => {
  const hub = await startHub({ fakeHa: makeFakeHa({ behavior: 'offline' }) });
  try {
    const res = await hub.get('/health', { key: null });
    assert.equal(res.status, 503);
    assert.equal(res.json.ok, false);
    assert.equal(res.json.ha.reachable, false);
    assert.equal(res.json.ha.error.code, 'ha_unreachable');
    assert.ok(!res.text.includes(FAKE_TOKEN));
  } finally {
    await hub.close();
  }
});

test('health: sem token de HA reporta haConfigured=false em vez de quebrar', async () => {
  const hub = await startHub({ env: { HA_TOKEN: '' } });
  try {
    const res = await hub.get('/health', { key: null });
    assert.equal(res.status, 200);
    assert.equal(res.json.haConfigured, false);
    assert.equal(res.json.ha.reachable, null);
  } finally {
    await hub.close();
  }
});
