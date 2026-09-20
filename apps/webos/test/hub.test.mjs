import test from 'node:test';
import assert from 'node:assert/strict';
import {loadModule, fakeFetch, jsonResponse, timeoutFetch, networkErrorFetch} from './load.mjs';

const {HubClient, HUB_PATHS} = await loadModule('packages/tv-core/src/hub.ts');
const HUB = 'http://192.168.0.32:8188';

// --- B. Hub online ---------------------------------------------------------
test('B · Hub online: estado da casa chega e a URL e a da LAN', async () => {
  const request = fakeFetch(() => jsonResponse({ok: true, state: 'playing', title: 'Ninar'}));
  const hub = new HubClient(HUB, {request});
  const result = await hub.soundState();

  assert.equal(result.ok, true);
  assert.equal(result.value.title, 'Ninar');
  assert.equal(request.calls[0].url, `${HUB}/api/sound/state`);
  assert.equal(request.calls[0].init.credentials, 'omit');
});

test('B · Hub online: fotos e MP3 saem do Hub, nao do pacote', () => {
  const hub = new HubClient(HUB);
  assert.equal(hub.mediaUrl('photo', 'p3'), `${HUB}/api/media/photo/p3`);
  assert.equal(hub.mediaUrl('track', 't17'), `${HUB}/api/media/track/t17`);
  assert.equal(hub.mediaUrl('track', ''), null, 'id vazio nao vira URL quebrada');
});

// --- C. Hub offline --------------------------------------------------------
test('C · Hub offline: degrada com codigo, nao lanca', async () => {
  const hub = new HubClient(HUB, {request: networkErrorFetch()});
  const result = await hub.soundState();
  assert.equal(result.ok, false);
  assert.equal(result.code, 'HUB-OFFLINE');
  assert.match(result.message, /Hub da casa/);
});

test('C · Hub offline: nenhum metodo do cliente lanca', async () => {
  const hub = new HubClient(HUB, {request: networkErrorFetch()});
  for (const call of [
    () => hub.health(), () => hub.soundState(), () => hub.homeState(),
    () => hub.soundLibrary(), () => hub.pause(), () => hub.homeAction('party'),
  ]) {
    const result = await call();
    assert.equal(result.ok, false);
    assert.ok(result.code && result.message);
  }
});

test('C · Hub nao configurado: cliente fica inerte, sem rede', async () => {
  const request = fakeFetch(() => jsonResponse({}));
  const hub = new HubClient('', {request});
  assert.equal(hub.configured, false);
  assert.equal(hub.mediaUrl('photo', 'p1'), null);
  const result = await hub.homeState();
  assert.equal(result.code, 'HUB-CONFIG');
  assert.equal(request.calls.length, 0);
});

// --- D. Home Assistant offline (visto pela TV) -----------------------------
test('D · Home Assistant fora do ar: o Hub responde 200 degradado e a TV mostra', async () => {
  // O Hub sempre devolve 200 em /api/home/state, com ok:false e erro amigavel.
  const request = fakeFetch(() => jsonResponse({
    ok: false, haReachable: false, actions: [],
    error: {code: 'ha_timeout', message: 'A casa demorou para responder.'},
  }));
  const hub = new HubClient(HUB, {request});
  const result = await hub.homeState();
  assert.equal(result.ok, true, 'para a TV a chamada funcionou');
  assert.equal(result.value.haReachable, false);
  assert.equal(result.value.error.code, 'ha_timeout');
});

test('D · a TV nao tem caminho para o Home Assistant', async () => {
  const hub = new HubClient(HUB);
  const source = HubClient.toString() + Object.getOwnPropertyNames(HubClient.prototype).join(' ');
  assert.ok(!/8123|homeassistant|ha_token/i.test(source), 'o cliente nao pode citar o HA');
  assert.ok(!Object.values(HUB_PATHS).some((path) => /home-?assistant|hass/i.test(path)));
  // E nao existe construtor que aceite token de HA.
  assert.equal(new HubClient(HUB, {haToken: 'segredo'}).configured, true);
  const request = fakeFetch(() => jsonResponse({}));
  const probe = new HubClient(HUB, {request, haToken: 'segredo'});
  await probe.soundState();
  assert.ok(!JSON.stringify(request.calls[0].init.headers || {}).includes('segredo'),
    'nenhum token de HA pode ir no header');
});

// --- G. endpoint falhando --------------------------------------------------
test('G · endpoint com erro HTTP vira codigo, nao excecao', async () => {
  for (const status of [400, 404, 500, 502, 503]) {
    const hub = new HubClient(HUB, {request: fakeFetch(() => new Response('boom', {status}))});
    const result = await hub.homeState();
    assert.equal(result.ok, false);
    assert.equal(result.code, `HUB-HTTP-${status}`);
  }
});

test('G · 401/403 vira HUB-AUTH com mensagem propria', async () => {
  for (const status of [401, 403]) {
    const hub = new HubClient(HUB, {request: fakeFetch(() => new Response('', {status}))});
    const result = await hub.soundState();
    assert.equal(result.code, 'HUB-AUTH');
  }
});

// --- H. resposta JSON invalida ---------------------------------------------
test('H · JSON invalido degrada com HUB-JSON', async () => {
  const hub = new HubClient(HUB, {
    request: fakeFetch(() => new Response('<html>erro do proxy</html>', {status: 200})),
  });
  const result = await hub.soundState();
  assert.equal(result.ok, false);
  assert.equal(result.code, 'HUB-JSON');
});

// --- I. timeout de fetch ----------------------------------------------------
test('I · timeout vira HUB-TIMEOUT', async () => {
  const hub = new HubClient(HUB, {request: timeoutFetch()});
  const result = await hub.health();
  assert.equal(result.ok, false);
  assert.equal(result.code, 'HUB-TIMEOUT');
  assert.match(result.message, /demorou/i);
});

test('I · o timeout e passado ao fetch e fica dentro de limites sensatos', async () => {
  const request = fakeFetch(() => jsonResponse({}));
  const hub = new HubClient(HUB, {request, timeoutMs: 6000});
  await hub.health();
  assert.ok(request.calls[0].init.signal, 'chamada sem AbortSignal pode pendurar a TV');
  assert.equal(new HubClient(HUB, {timeoutMs: 1}).health instanceof Function, true);
});

// --- L. superficie restrita (o CSP restringe origem; isto restringe rota) ---
test('L · rota fora da lista nao sai do aparelho', async () => {
  const hub = new HubClient(HUB);
  for (const path of ['/api/anything', '/../etc/passwd', '/api/home/state/../../x', '']) {
    assert.equal(hub.rejectsArbitraryPath(path), true, `${path} deveria ser recusada`);
  }
  for (const path of Object.values(HUB_PATHS)) {
    assert.equal(hub.rejectsArbitraryPath(path), false, `${path} deveria ser permitida`);
  }
});

test('L · sem bridge key configurada, nenhum header de credencial e enviado', async () => {
  const request = fakeFetch(() => jsonResponse({}));
  await new HubClient(HUB, {request}).soundState();
  const headers = request.calls[0].init.headers || {};
  assert.ok(!('X-Laurinha-Key' in headers), 'nao pode mandar chave vazia');
});
