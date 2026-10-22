import test from 'node:test';
import assert from 'node:assert/strict';
import { startHub, makeFakeHa, BRIDGE_KEY } from './helpers.mjs';
import { resolveAllowedOrigin } from '../src/httpUtil.mjs';

/**
 * Um app webOS empacotado nao roda em http://: o Chromium da TV manda
 * `Origin: null` ou `file://...`. Se o Hub so aceitasse a lista de origens,
 * a TV nao conseguiria chamar nada - e o erro apareceria so no aparelho.
 */

test('CORS: app empacotado manda Origin null e e aceito', async () => {
  const hub = await startHub();
  try {
    const res = await hub.get('/api/sound/state', { origin: 'null' });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), 'null');
    assert.equal(res.headers.get('vary'), 'Origin');
  } finally {
    await hub.close();
  }
});

test('CORS: origem file:// tambem e aceita', async () => {
  const hub = await startHub();
  try {
    const res = await hub.get('/api/sound/state', { origin: 'file://' });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), 'file://');
  } finally {
    await hub.close();
  }
});

test('CORS: preflight OPTIONS responde 204 com metodos e headers necessarios', async () => {
  const hub = await startHub();
  try {
    const res = await fetch(`${hub.base}/api/sound/play`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'null',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'x-laurinha-key,content-type',
      },
    });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), 'null');
    assert.match(res.headers.get('access-control-allow-methods'), /POST/);
    // Sem este header a TV nao consegue mandar a bridge key.
    assert.match(res.headers.get('access-control-allow-headers'), /X-Laurinha-Key/i);
  } finally {
    await hub.close();
  }
});

test('CORS: sem lista configurada, qualquer origem http da rede local passa', async () => {
  const hub = await startHub();
  try {
    const res = await hub.get('/health', { key: null, origin: 'http://192.168.0.171' });
    assert.equal(res.headers.get('access-control-allow-origin'), 'http://192.168.0.171');
  } finally {
    await hub.close();
  }
});

test('CORS: com lista configurada, origem de fora e recusada com 403', async () => {
  const hub = await startHub({ env: { LAURINHA_TV_ORIGINS: 'http://192.168.0.171' } });
  try {
    const permitida = await hub.get('/api/sound/state', { origin: 'http://192.168.0.171' });
    assert.equal(permitida.status, 200);
    assert.equal(permitida.headers.get('access-control-allow-origin'), 'http://192.168.0.171');

    const recusada = await hub.get('/api/sound/state', { origin: 'http://evil.example' });
    assert.equal(recusada.status, 403);
    assert.equal(recusada.json.error.code, 'origin_not_allowed');
    assert.equal(recusada.headers.get('access-control-allow-origin'), null);
  } finally {
    await hub.close();
  }
});

test('CORS: LAURINHA_ALLOW_PACKAGED_APP=0 fecha o acesso do app empacotado', async () => {
  const hub = await startHub({
    env: { LAURINHA_TV_ORIGINS: 'http://192.168.0.171', LAURINHA_ALLOW_PACKAGED_APP: '0' },
  });
  try {
    const res = await hub.get('/api/sound/state', { origin: 'null' });
    assert.equal(res.status, 403);
  } finally {
    await hub.close();
  }
});

test('CORS: requisicao sem Origin (curl, health check) continua funcionando', async () => {
  const hub = await startHub();
  try {
    const res = await hub.get('/health', { key: null });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
  } finally {
    await hub.close();
  }
});

test('CORS: midia tambem carrega os headers (a TV busca o MP3 por XHR/audio)', async () => {
  const hub = await startHub();
  try {
    const res = await fetch(`${hub.base}/api/media/track/t0`, {
      headers: { Origin: 'null', 'X-Laurinha-Key': BRIDGE_KEY },
    });
    // 404 porque nao ha biblioteca neste teste; o que importa e o header CORS.
    assert.equal(res.headers.get('access-control-allow-origin'), 'null');
  } finally {
    await hub.close();
  }
});

test('resolveAllowedOrigin: tabela de decisao', () => {
  const semLista = { cors: { origins: [], allowPackagedApp: true } };
  const comLista = { cors: { origins: ['http://192.168.0.171'], allowPackagedApp: true } };
  const fechado = { cors: { origins: ['http://192.168.0.171'], allowPackagedApp: false } };

  assert.equal(resolveAllowedOrigin(undefined, semLista), '*');
  assert.equal(resolveAllowedOrigin('null', semLista), 'null');
  assert.equal(resolveAllowedOrigin('file:///app/index.html', semLista), 'file:///app/index.html');
  assert.equal(resolveAllowedOrigin('http://qualquer.coisa', semLista), 'http://qualquer.coisa');

  assert.equal(resolveAllowedOrigin('http://192.168.0.171', comLista), 'http://192.168.0.171');
  assert.equal(resolveAllowedOrigin('http://outro', comLista), null);
  assert.equal(resolveAllowedOrigin('null', comLista), 'null');
  assert.equal(resolveAllowedOrigin('null', fechado), null);
});
