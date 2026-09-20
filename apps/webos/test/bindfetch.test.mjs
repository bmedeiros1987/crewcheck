import test from 'node:test';
import assert from 'node:assert/strict';
import {loadModule, jsonResponse} from './load.mjs';

const {bindFetch} = await loadModule('packages/tv-core/src/net.ts');
const {HubClient} = await loadModule('packages/tv-core/src/hub.ts');
const {TvSession} = await loadModule('packages/tv-core/src/session.ts');

/**
 * O fetch do navegador exige o objeto global como receptor: guardado como
 * propriedade e chamado via `this.request(...)`, ele lanca Illegal invocation.
 * O fetch do Node nao checa isso, entao um teste comum passa e o defeito so
 * aparece na TV. Este dublê reproduz a exigencia do navegador.
 */
function strictFetch(onCall = () => jsonResponse({ok: true})) {
  const state = {calls: 0};
  const fn = function (url, init) {
    // eslint-disable-next-line no-invalid-this
    if (this !== undefined && this !== globalThis) {
      const error = new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
      error.name = 'TypeError';
      throw error;
    }
    state.calls += 1;
    return Promise.resolve(onCall(url, init));
  };
  fn.state = state;
  return fn;
}

test('regressao: o dublê estrito realmente reproduz o erro do navegador', () => {
  const holder = {request: strictFetch()};
  assert.throws(() => holder.request('http://x'), /Illegal invocation/);
});

test('regressao: HubClient chama fetch com receptor valido', async () => {
  const impl = strictFetch();
  const hub = new HubClient('http://192.168.0.32:8188', {request: impl});
  const result = await hub.health();
  assert.equal(result.ok, true, `HubClient quebrou o receptor do fetch: ${JSON.stringify(result)}`);
  assert.equal(impl.state.calls, 1);
});

test('regressao: TvSession chama fetch com receptor valido', async () => {
  const impl = strictFetch(() => jsonResponse({hello: 'world'}));
  const session = new TvSession(
    {getItem: () => null, setItem: () => {}, removeItem: () => {}},
    impl,
    'https://crewcheck.online',
  );
  const value = await session.call('snapshot');
  assert.deepEqual(value, {hello: 'world'});
  assert.equal(impl.state.calls, 1);
});

test('bindFetch preserva comportamento e tolera entrada estranha', async () => {
  const impl = strictFetch();
  const bound = bindFetch(impl);
  const response = await bound('http://192.168.0.32:8188/health');
  assert.equal(response.status, 200);
  // Nao pode lancar com entrada invalida: e chamado no construtor.
  assert.doesNotThrow(() => bindFetch(undefined));
  assert.doesNotThrow(() => bindFetch(null));
  assert.equal(bindFetch('nao e funcao'), 'nao e funcao');
});
