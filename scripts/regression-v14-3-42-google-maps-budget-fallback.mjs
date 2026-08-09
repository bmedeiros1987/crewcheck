import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const previousEnv = Object.fromEntries([
  'DATABASE_URL', 'CREWCHECK_DATABASE_URL', 'MYSQL_URL',
  'CREWCHECK_GOOGLE_MAPS_MONTHLY_LIMIT', 'CREWCHECK_GOOGLE_MAPS_CACHE_TTL_MS',
].map((key) => [key, process.env[key]]));

process.env.DATABASE_URL = '';
process.env.CREWCHECK_DATABASE_URL = '';
process.env.MYSQL_URL = '';
process.env.CREWCHECK_GOOGLE_MAPS_MONTHLY_LIMIT = '3';
process.env.CREWCHECK_GOOGLE_MAPS_CACHE_TTL_MS = '60000';

const moduleUrl = new URL('../server/v14342/maps-budget.mjs', import.meta.url);
const budgetModule = await import(`${moduleUrl.href}?test=${Date.now()}`);
const fixedNow = new Date('2026-07-28T12:00:00-03:00');

try {
  budgetModule.resetMapsBudgetForTests();
  assert.equal(budgetModule.googleMapsMonthKey(fixedNow), '2026-07');
  assert.equal(budgetModule.googleMapsMonthlyLimit(), 3);

  await budgetModule.reserveGoogleMapsRequest('routes', 1, fixedNow);
  await budgetModule.reserveGoogleMapsRequest('routes', 1, fixedNow);
  const third = await budgetModule.reserveGoogleMapsRequest('routes', 1, fixedNow);
  const denied = await budgetModule.reserveGoogleMapsRequest('routes', 1, fixedNow);
  assert.equal(third.used, 3);
  assert.equal(third.blocked, true);
  assert.equal(denied.allowed, false);
  assert.equal(denied.fallbackActive, true);
  assert.equal(denied.provider, 'TomTom');

  budgetModule.resetMapsBudgetForTests();
  process.env.DATABASE_URL = 'mysql://%';
  const initializationFailure = await budgetModule.reserveGoogleMapsRequest('routes', 1, fixedNow);
  assert.equal(initializationFailure.allowed, false);
  assert.equal(initializationFailure.blockedReason, 'persistence_initialization_failure');
  process.env.DATABASE_URL = '';
  const latchedAfterFailure = await budgetModule.reserveGoogleMapsRequest('routes', 1, fixedNow);
  assert.equal(latchedAfterFailure.allowed, false);
  assert.equal(latchedAfterFailure.blockedReason, 'persistence_initialization_failure');

  budgetModule.resetMapsBudgetForTests();
  const blocked = await budgetModule.markGoogleMapsQuotaBlocked('provider_quota_429', fixedNow);
  assert.equal(blocked.blocked, true);
  assert.equal((await budgetModule.reserveGoogleMapsRequest('routes', 1, fixedNow)).allowed, false);
  assert.equal(budgetModule.googleMapsQuotaFailure(429, {}), true);
  assert.equal(budgetModule.googleMapsQuotaFailure(403, { error: { status: 'RESOURCE_EXHAUSTED' } }), true);
  assert.equal(budgetModule.googleMapsQuotaFailure(500, { error: 'backend error' }), false);
} finally {
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const server = read('server.mjs');
const home = read('client/src/pages/Home.tsx');
const routeSnippet = read('scripts/v14342/route-policy.snippet');
const conciergeSnippet = read('scripts/v14342/concierge-route.snippet');
const budgetSource = read('server/v14342/maps-budget.mjs');
const applySource = read('scripts/v14342/apply.mjs');
const chain = read('scripts/v139/apply.mjs');

assert.doesNotThrow(() => new Function(routeSnippet), 'política de rotas deve ser JavaScript válido');
assert.doesNotThrow(() => new Function(conciergeSnippet), 'rota do Concierge deve ser JavaScript válido');
assert.ok(chain.includes("await import('../v14342/apply.mjs');"), 'v14.3.42 deve participar da preparação canônica');
assert.ok(server.includes("from './server/v14342/maps-budget.mjs'"), 'servidor deve importar controle de cota');
assert.ok(server.includes("if (url.pathname === '/api/maps/provider/status')"), 'status seguro de mapas deve estar registrado');
assert.ok(server.includes("'GOOGLE_ROUTES_API_KEY', 'GOOGLE_MAPS_SERVER_KEY'"), 'Routes deve continuar com chave dedicada/priorizada no servidor');
assert.ok(server.includes('await reserveGoogleMapsRequest'), 'Google deve continuar sujeito ao controle de cota');
assert.ok(server.includes('readGoogleRouteCache'), 'cache de Google Routes deve permanecer');

const handlerStart = server.indexOf('async function handleRoutePreview(');
const handlerEnd = server.indexOf('async function handleMapsProviderStatus(', handlerStart);
const handler = server.slice(handlerStart, handlerEnd);
assert.ok(handlerStart >= 0 && handlerEnd > handlerStart, 'handler de rota preparado não localizado');
const authRejection = handler.indexOf('cc1371AuthRequired() && !session');
const tomtomCall = handler.indexOf('await tomtomRoutePreview');
const googleCall = handler.indexOf('await googleRoutePreview');
assert.ok(authRejection >= 0 && authRejection < tomtomCall && authRejection < googleCall, 'sessão deve ser validada antes de consultar provedores');
assert.ok(handler.includes("requestedMode !== 'transit' && tomtomKey"), 'TomTom deve ser elegível primeiro apenas para rota terrestre');
assert.ok(tomtomCall >= 0 && googleCall > tomtomCall, 'carro deve tentar TomTom antes do Google Routes');
assert.ok(handler.includes("providerOrder: ['TomTom', 'Google Routes']"), 'ordem terrestre deve ser TomTom → Google Routes');
assert.ok(handler.includes("fallbackFrom: 'TomTom'"), 'fallback Google deve registrar origem TomTom sem expor segredo');
assert.ok(handler.includes("requestedMode === 'transit' ? ['Google Routes']"), 'transporte público deve permanecer Google-only');
assert.ok(handler.includes("'Rota ao vivo indisponível agora. Use Abrir no Google Maps.'"), 'falha total deve permanecer explícita e humana');
assert.ok(!handler.includes('0.0 km') && !handler.includes('0,0 km'), 'handler não pode fabricar distância zero');

const statusStart = server.indexOf('async function handleMapsProviderStatus(');
const statusEnd = server.indexOf('async function handleReverseGeocode(', statusStart);
const statusHandler = server.slice(statusStart, statusEnd);
assert.ok(statusHandler.includes("primary: tomtomConfigured ? 'TomTom'"), 'Admin deve refletir TomTom como primário terrestre quando configurado');
assert.ok(statusHandler.includes("fallback: tomtomConfigured && googleConfigured"), 'Admin deve refletir Google como contingência quando ambos estiverem disponíveis');
assert.ok(!statusHandler.includes('API_KEY'), 'status não pode serializar nomes/valores de segredos');

const conciergeStart = server.indexOf('async function conciergeTravelEstimate(');
const conciergeEnd = server.indexOf('function conciergeLeaveDateLabel(', conciergeStart);
const concierge = server.slice(conciergeStart, conciergeEnd);
assert.ok(conciergeStart >= 0 && conciergeEnd > conciergeStart, 'rota do Concierge preparada não localizada');
assert.ok(concierge.indexOf('await tomtomRoutePreview') < concierge.indexOf('await googleRoutePreview'), 'Concierge deve seguir TomTom → Google Routes');
assert.ok(concierge.includes('return null;'), 'sem provedor real o Concierge deve falhar fechado');
assert.ok(!concierge.includes('estimativa de referência'), 'Concierge não pode mascarar falha de rota com ETA heurístico');
assert.ok(!concierge.includes('distanceKm / 38'), 'fallback de velocidade fixa não pode reaparecer');
assert.ok(!concierge.includes('conciergeHaversineKm'), 'distância em linha reta não pode substituir rota terrestre');

assert.ok(budgetSource.includes('INSERT IGNORE INTO crewcheck_external_api_usage'));
assert.ok(budgetSource.includes('FOR UPDATE'));
assert.ok(budgetSource.includes("blockMemory(monthKey, 'persistence_initialization_failure')"));
assert.ok(budgetSource.includes("blockMemory(monthKey, 'persistence_reservation_failure')"));
assert.ok(applySource.includes('authenticatedRouteFetch'), 'cliente deve continuar usando rota autenticada');
assert.ok(home.includes('authFetch<RoutePreviewInfo>'), 'Home deve continuar usando authFetch para route-preview');

for (const protectedPath of ['client/src/lib/pdfParser.ts', 'server/rosterParser.mjs', 'client/src/lib/canonicalRoster.ts', 'client/src/lib/financialRules.ts']) {
  assert.ok(!applySource.includes(`update('${protectedPath}'`), `patch de mapas não pode alterar motor protegido: ${protectedPath}`);
}

console.log('v14.3.42 routing policy: TomTom-first driving, Google fallback/transit, fail-closed Concierge and protected canonical roster validated.');
