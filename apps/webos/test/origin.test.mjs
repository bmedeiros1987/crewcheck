import test from 'node:test';
import assert from 'node:assert/strict';
import {loadModule} from './load.mjs';

const net = await loadModule('packages/tv-core/src/net.ts');
const {TvSession} = await loadModule('packages/tv-core/src/session.ts');

test('P0-1: o Hub na LAN e uma origem aceita', () => {
  assert.equal(net.classifyOrigin('http://192.168.0.32:8188').kind, 'private-lan');
  assert.equal(net.classifyOrigin('http://10.0.0.5:8188').kind, 'private-lan');
  assert.equal(net.classifyOrigin('http://172.16.4.4').kind, 'private-lan');
  assert.equal(net.classifyOrigin('http://127.0.0.1:8188').kind, 'loopback');
  assert.equal(net.classifyOrigin('https://crewcheck.online').kind, 'https');
});

test('P0-1: HTTP fora da rede local continua recusado', () => {
  for (const origin of ['http://8.8.8.8', 'http://exemplo.com', 'http://172.32.0.1', 'ftp://x', 'nao-e-url', '']) {
    const verdict = net.classifyOrigin(origin);
    assert.equal(verdict.kind, 'rejected', `${origin} deveria ser recusada`);
    assert.ok(verdict.reason, 'recusa precisa explicar o motivo');
  }
});

test('P0-1: origem invalida NAO lanca no construtor (era a tela preta)', () => {
  let session;
  assert.doesNotThrow(() => {
    session = new TvSession({getItem: () => null, setItem: () => {}, removeItem: () => {}}, fetch, 'http://8.8.8.8');
  });
  assert.ok(session.configError, 'a sessao precisa reportar o problema em vez de lancar');
  assert.match(session.configError, /rede local/i);
});

test('P0-1: origem vazia ou lixo tambem nao lanca', () => {
  const storage = {getItem: () => null, setItem: () => {}, removeItem: () => {}};
  for (const origin of ['', 'lixo', 'javascript:alert(1)']) {
    assert.doesNotThrow(() => new TvSession(storage, fetch, origin), `origem ${origin} lancou`);
  }
});

test('P0-1: sessao com origem invalida recusa chamadas em vez de sair na rede', async () => {
  let called = false;
  const session = new TvSession(
    {getItem: () => null, setItem: () => {}, removeItem: () => {}},
    async () => { called = true; return new Response('{}'); },
    'http://8.8.8.8',
  );
  await assert.rejects(() => session.call('snapshot'), /config_error/);
  assert.equal(called, false, 'nao pode tocar a rede com configuracao invalida');
});

test('P0-1: origem valida normaliza e segue funcionando', () => {
  const session = new TvSession({getItem: () => null, setItem: () => {}, removeItem: () => {}}, fetch, 'https://crewcheck.online/');
  assert.equal(session.configError, null);
});
