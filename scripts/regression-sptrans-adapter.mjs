import assert from 'node:assert/strict';
import { sptransConfig, sptransFindLines, sptransVehiclePositions, sptransArrivalForecast } from '../server/integrations/sptrans.mjs';

const env = { SPTRANS_OLHO_VIVO_TOKEN: 'test-token', SPTRANS_OLHO_VIVO_TIMEOUT_MS: '2000' };
assert.equal(sptransConfig({}).configured, false);
assert.equal(sptransConfig(env).configured, true);

const calls = [];
const fetchImpl = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  if (String(url).includes('/Login/Autenticar')) {
    return new Response('true', { status: 200, headers: { 'content-type': 'application/json', 'set-cookie': 'ASP.NET_SessionId=test; path=/; HttpOnly' } });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
};

await sptransFindLines('Airport', { environment: env, fetchImpl });
assert.match(calls[0].url, /\/Login\/Autenticar\?token=test-token/);
assert.equal(calls[0].init.method, 'POST');
assert.match(calls[1].url, /\/Linha\/Buscar\?termosBusca=Airport/);
assert.match(String(calls[1].init.headers.cookie), /ASP\.NET_SessionId=test/);

await sptransVehiclePositions(1273, { environment: env, fetchImpl });
assert.match(calls[3].url, /\/Posicao\?codigoLinha=1273/);

await sptransArrivalForecast({ stopCode: 340015329, lineCode: 1273 }, { environment: env, fetchImpl });
assert.match(calls[5].url, /codigoParada=340015329/);
assert.match(calls[5].url, /codigoLinha=1273/);

await assert.rejects(() => sptransFindLines('x', { environment: {}, fetchImpl }), (error) => error?.code === 'SPTRANS_NOT_CONFIGURED');
console.log('SPTrans adapter regression OK');
