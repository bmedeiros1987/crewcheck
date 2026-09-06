import assert from 'node:assert/strict';
import { awesomeApiSharedCapabilities, fetchFxLatest, lookupCep } from '../server/shared/awesomeapi.mjs';

// This gate is intentionally self-contained: no real provider key or network access is required.
const originalFetch = globalThis.fetch;
const originalKey = process.env.AWESOMEAPI_API_KEY;
const originalAlias = process.env.AWESOME_API_KEY;

try {
  process.env.AWESOMEAPI_API_KEY = 'regression-secret';
  process.env.AWESOME_API_KEY = '';

  const capabilities = awesomeApiSharedCapabilities();
  assert.equal(capabilities.sharedWithVoyage, true);
  assert.equal(capabilities.secretsExposed, false);
  assert.ok(capabilities.capabilities.includes('CURRENCY'));
  assert.ok(capabilities.capabilities.includes('BRAZIL_CEP'));

  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), headers: options.headers || {} });
    if (String(url).includes('/json/last/')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            USDBRL: { code: 'USD', codein: 'BRL', name: 'USD/BRL', bid: '5.10', ask: '5.12', timestamp: '1788692400' },
            EURBRL: { code: 'EUR', codein: 'BRL', name: 'EUR/BRL', bid: '6.00', ask: '6.04', timestamp: '1788692400' }
          };
        }
      };
    }
    if (String(url).includes('/json/01001000')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            cep: '01001000', address_type: 'Praça', address_name: 'da Sé', address: 'Praça da Sé', state: 'SP',
            district: 'Sé', lat: '-23.5502784', lng: '-46.6342179', city: 'São Paulo', city_ibge: '3550308', ddd: '11'
          };
        }
      };
    }
    return { ok: false, status: 404, async json() { return {}; } };
  };

  const fx = await fetchFxLatest(['USD-BRL', 'EUR-BRL'], { forceRefresh: true });
  assert.equal(fx.ok, true);
  assert.equal(fx.quotes.length, 2);
  assert.equal(fx.quotes.find((quote) => quote.pair === 'USD-BRL').mid, 5.11);

  const cep = await lookupCep('01001-000', { forceRefresh: true });
  assert.equal(cep.ok, true);
  assert.equal(cep.address.cep, '01001000');
  assert.equal(cep.address.city, 'São Paulo');
  assert.equal(cep.address.state, 'SP');

  assert.ok(calls.length >= 2);
  for (const call of calls) {
    assert.ok(!call.url.includes('token='), 'API secret must not be placed in query string');
    assert.equal(call.headers['x-api-key'], 'regression-secret');
  }

  const invalid = await lookupCep('123');
  assert.equal(invalid.ok, false);
  assert.equal(invalid.code, 'INVALID_CEP');

  console.log('AwesomeAPI shared FX/CEP regression: PASS');
} finally {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.AWESOMEAPI_API_KEY;
  else process.env.AWESOMEAPI_API_KEY = originalKey;
  if (originalAlias === undefined) delete process.env.AWESOME_API_KEY;
  else process.env.AWESOME_API_KEY = originalAlias;
}
