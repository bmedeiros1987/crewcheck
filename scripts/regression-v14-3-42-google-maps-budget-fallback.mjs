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
  assert.equal(budgetModule.googleMapsMonthKey(fixedNow), '2026-07', 'competência deve respeitar America/Sao_Paulo');
  assert.equal(budgetModule.googleMapsMonthlyLimit(), 3, 'limite configurável deve ser aplicado');

  const first = await budgetModule.reserveGoogleMapsRequest('routes', 1, fixedNow);
  const second = await budgetModule.reserveGoogleMapsRequest('routes', 1, fixedNow);
  const third = await budgetModule.reserveGoogleMapsRequest('routes', 1, fixedNow);
  const denied = await budgetModule.reserveGoogleMapsRequest('routes', 1, fixedNow);
  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(third.allowed, true);
  assert.equal(third.used, 3);
  assert.equal(third.remaining, 0);
  assert.equal(third.blocked, true, 'ao alcançar o teto, novas chamadas Google devem ser bloqueadas');
  assert.equal(denied.allowed, false);
  assert.equal(denied.fallbackActive, true);
  assert.equal(denied.provider, 'TomTom');
  assert.equal(denied.kinds.routes, 3, 'contador por tipo não pode ultrapassar o limite');

  budgetModule.resetMapsBudgetForTests();
  process.env.DATABASE_URL = 'mysql://%';
  const initializationFailure = await budgetModule.reserveGoogleMapsRequest('routes', 1, fixedNow);
  assert.equal(initializationFailure.allowed, false, 'banco configurado e indisponível deve falhar fechado');
  assert.equal(initializationFailure.blocked, true);
  assert.equal(initializationFailure.blockedReason, 'persistence_initialization_failure');
  assert.equal(initializationFailure.provider, 'TomTom');
  process.env.DATABASE_URL = '';
  const latchedAfterFailure = await budgetModule.reserveGoogleMapsRequest('routes', 1, fixedNow);
  assert.equal(latchedAfterFailure.allowed, false, 'bloqueio local deve prevalecer mesmo após mudança do estado do pool');
  assert.equal(latchedAfterFailure.blockedReason, 'persistence_initialization_failure');

  budgetModule.resetMapsBudgetForTests();
  process.env.DATABASE_URL = '';
  const blocked = await budgetModule.markGoogleMapsQuotaBlocked('provider_quota_429', fixedNow);
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.blockedReason, 'provider_quota_429');
  assert.equal((await budgetModule.reserveGoogleMapsRequest('routes', 1, fixedNow)).allowed, false, 'erro de cota externo deve bloquear novas tentativas naquele mês');

  assert.equal(budgetModule.googleMapsQuotaFailure(429, {}), true);
  assert.equal(budgetModule.googleMapsQuotaFailure(403, { error: { status: 'RESOURCE_EXHAUSTED' } }), true);
  assert.equal(budgetModule.googleMapsQuotaFailure(403, { status: 'OVER_QUERY_LIMIT' }), true);
  assert.equal(budgetModule.googleMapsQuotaFailure(500, { error: 'backend error' }), false);

  budgetModule.writeGoogleRouteCache('Origem A', 'Destino B', 'driving', { ok: true, provider: 'Google Routes', durationSeconds: 900 });
  const cached = budgetModule.readGoogleRouteCache('Origem A', 'Destino B', 'driving');
  assert.equal(cached?.ok, true);
  assert.equal(cached?.cache, 'fresh');
  assert.equal(cached?.provider, 'Google Routes');
  assert.equal(budgetModule.readGoogleRouteCache('Origem A', 'Destino B', 'transit'), null, 'modos diferentes não podem compartilhar a mesma rota');
} finally {
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const server = read('server.mjs');
const home = read('client/src/pages/Home.tsx');
const envExample = read('.env.example');
const release = read('client/public/release.json');
const routeSnippet = read('scripts/v14342/route-policy.snippet');
const conciergeSnippet = read('scripts/v14342/concierge-route.snippet');
const budgetSource = read('server/v14342/maps-budget.mjs');
const adminControl = read('client/src/components/v14316/AdminControlCenter.tsx');
const controlCss = read('client/src/components/v14316/control-center.css');
const applySource = read('scripts/v14342/apply.mjs');
const chain = read('scripts/v139/apply.mjs');
const calendar = read('client/src/lib/googleCalendarSync.ts');
const viteConfig = read('vite.config.ts');

assert.doesNotThrow(() => new Function(routeSnippet), 'snippet da política de rotas deve ser JavaScript válido');
assert.doesNotThrow(() => new Function(conciergeSnippet), 'snippet do Concierge deve ser JavaScript válido');
const v14342Index = chain.indexOf("await import('../v14342/apply.mjs');");
const v14343Index = chain.indexOf("await import('../v14343/apply.mjs');");
assert.ok(v14342Index >= 0, 'v14.3.42 deve participar da preparação canônica');
assert.ok(v14343Index > v14342Index, 'v14.3.43 deve suceder v14.3.42 sem remover a política de mapas');
assert.ok(chain.includes("await import('../v14341/compatibility.mjs');"), 'compatibilidade semântica v14.3.41 deve ser preservada');
assert.ok(server.includes("from './server/v14342/maps-budget.mjs'"), 'servidor deve importar o controlador de cota');
assert.ok(server.includes("if (url.pathname === '/api/maps/provider/status')"), 'status seguro de mapas deve estar registrado');
assert.ok(server.includes("'GOOGLE_ROUTES_API_KEY', 'GOOGLE_MAPS_SERVER_KEY'"), 'chave específica do Routes deve ser priorizada');
assert.ok(server.includes("providerOrder: ['Google Routes', 'TomTom']"), 'ordem pública deve registrar Google antes de TomTom');
assert.ok(server.includes("fallbackFrom: 'Google Routes'"), 'fallback deve informar origem sem expor segredo');
assert.ok(server.includes('fallbackReason: reason'), 'motivo do fallback deve ser rastreável');
assert.ok(server.includes('await reserveGoogleMapsRequest'), 'chamada Google deve reservar cota antes da requisição');
assert.ok(server.includes('readGoogleRouteCache'), 'rotas repetidas devem consultar cache');
assert.ok(budgetSource.includes('INSERT IGNORE INTO crewcheck_external_api_usage'), 'primeira reserva persistente deve criar a linha antes do lock');
assert.ok(budgetSource.includes('FOR UPDATE'), 'contador persistente deve ser serializado por competência');
assert.ok(budgetSource.indexOf('INSERT IGNORE INTO crewcheck_external_api_usage') < budgetSource.indexOf('FOR UPDATE'), 'linha mensal deve existir antes do bloqueio transacional');
assert.ok(budgetSource.includes('function persistentDatabaseConfigured()'), 'ausência de banco deve ser distinguida de banco configurado e indisponível');
assert.ok(budgetSource.includes("blockMemory(monthKey, 'persistence_initialization_failure')"), 'falha de inicialização persistente deve fechar a cota');
assert.ok(budgetSource.includes("blockMemory(monthKey, 'persistence_reservation_failure')"), 'falha transacional deve fechar a cota em vez de liberar contador local');
assert.ok(budgetSource.includes('if (latch.blocked) return { allowed: false'), 'bloqueio local deve prevalecer antes de consultar o banco');
assert.ok(budgetSource.includes('let connection = null;'), 'aquisição da conexão deve participar do tratamento de falha');
assert.ok(budgetSource.includes('connection = await db.getConnection();'), 'conexão deve ser adquirida dentro do bloco protegido');
assert.ok(budgetSource.includes('connection?.release();'), 'liberação da conexão deve ser condicional');
assert.ok(budgetSource.includes('const latch = blockMemory(monthKey, safeReason);'), 'bloqueio de cota deve existir antes da tentativa de persistência');

const handlerStart = server.indexOf('async function handleRoutePreview(');
const handlerEnd = server.indexOf('async function handleMapsProviderStatus(', handlerStart);
const handler = server.slice(handlerStart, handlerEnd);
assert.ok(handlerStart >= 0 && handlerEnd > handlerStart, 'handler de rota preparado não localizado');
const sessionCheck = handler.indexOf('cc1371Verify(cc1371RequestToken(req))');
const authRejection = handler.indexOf('cc1371AuthRequired() && !session');
const googleKeyRead = handler.indexOf('const googleKey = mapsServerKey()');
const googleRouteCall = handler.indexOf('await googleRoutePreview');
assert.ok(sessionCheck >= 0 && authRejection > sessionCheck, 'rota deve validar a sessão CrewCheck');
assert.ok(authRejection < googleKeyRead && authRejection < googleRouteCall, 'requisição anônima deve ser rejeitada antes de ler o provedor ou consumir cota');
assert.ok(handler.includes("sendJson(res, 401"), 'rota pública sem sessão deve receber 401 explícito');
assert.ok(handler.includes("req.method !== 'GET'"), 'rota deve aceitar somente GET');
assert.ok(handler.indexOf('await googleRoutePreview') < handler.indexOf('await tomtomRoutePreview'), 'Google deve ser tentado antes da TomTom');

const statusStart = server.indexOf('async function handleMapsProviderStatus(');
const statusEnd = server.indexOf('async function handleReverseGeocode(', statusStart);
const statusHandler = server.slice(statusStart, statusEnd);
assert.ok(statusHandler.includes('alarmRequestIdentity(req)'), 'diagnóstico de custo deve identificar o administrador');
assert.ok(statusHandler.includes('if (!identity.admin)'), 'diagnóstico mensal não pode ficar público');
assert.ok(statusHandler.includes('sendJson(res, 403'), 'usuário comum deve receber bloqueio explícito');
assert.ok(!statusHandler.includes('API_KEY'), 'status nunca pode serializar nomes ou valores de chaves');

for (const marker of [
  "authFetch<MapsProviderStatus>('/api/maps/provider/status'",
  'Controle mensal do Google Maps',
  'data-maps-budget-status=',
  'role="progressbar"',
  'budget.remaining.toLocaleString',
  "budget.persistence === 'database'",
  'TomTom ativo automaticamente',
]) assert.ok(adminControl.includes(marker), `controle visual Admin ausente: ${marker}`);
assert.ok(!/GOOGLE_(?:ROUTES|MAPS)_API_KEY|TOMTOM_API_KEY/.test(adminControl), 'interface Admin não pode conter nomes ou valores de segredos');
for (const cssMarker of ['.cc-maps-budget-track', '.cc-maps-budget-facts', '@media(max-width:620px)']) {
  assert.ok(controlCss.includes(cssMarker), `responsividade do controle de mapas ausente: ${cssMarker}`);
}

const conciergeStart = server.indexOf('async function conciergeTravelEstimate(');
const conciergeEnd = server.indexOf('function conciergeLeaveDateLabel(', conciergeStart);
const concierge = server.slice(conciergeStart, conciergeEnd);
assert.ok(concierge.indexOf('await googleRoutePreview') < concierge.indexOf('await tomtomRoutePreview'), 'Concierge deve usar a mesma ordem Google → TomTom');

for (const marker of [
  'GOOGLE_ROUTES_API_KEY=',
  'CREWCHECK_GOOGLE_MAPS_MONTHLY_LIMIT=2500',
  'CREWCHECK_GOOGLE_MAPS_CACHE_TTL_MS=120000',
  'CREWCHECK_ROUTING_PROVIDER=google',
  'VITE_GOOGLE_CLIENT_ID=',
]) assert.ok(envExample.includes(marker), `variável documentada ausente: ${marker}`);

assert.ok(calendar.includes('VITE_GOOGLE_CLIENT_ID'), 'Calendar deve ler o Client ID incorporado no build');
assert.ok(calendar.includes('https://www.googleapis.com/auth/calendar.events.owned'), 'escopo mínimo de eventos próprios deve permanecer');
assert.ok(!calendar.includes('https://www.googleapis.com/auth/calendar.calendarlist.readonly'), 'escopo amplo de lista de calendários não pode reaparecer');
assert.ok(viteConfig.includes('runtimeEnv.VITE_GOOGLE_CLIENT_ID'), 'Vite deve aceitar o nome público recomendado');
assert.ok(viteConfig.includes('runtimeEnv.GOOGLE_CLIENT_ID'), 'Vite deve aceitar o nome já configurado no Render');
assert.ok(viteConfig.includes('"import.meta.env.VITE_GOOGLE_CLIENT_ID"'), 'Client ID deve ser incorporado somente no campo público esperado pelo cliente');
assert.ok(!viteConfig.includes('GOOGLE_CLIENT_SECRET'), 'segredo OAuth nunca pode ser incorporado no bundle');
assert.ok(home.includes("const DEFAULT_VERSION = '14.3.43';"), 'a preparação final deve terminar na versão Web/PWA 14.3.43');
assert.ok(home.includes('mapsBudget?: {'), 'cliente deve aceitar o diagnóstico de cota');
assert.ok(release.includes('14.3.43'), 'release final deve anunciar 14.3.43');
assert.ok(applySource.includes("next.indexOf('type RoutePreviewInfo = {')"), 'patch do tipo deve usar a forma produzida pela preparação, sem depender dos últimos campos');
assert.ok(applySource.includes('if (source.includes(replacement.trim())) return source;'), 'substituições de servidor devem ser idempotentes');
assert.ok(applySource.includes("if (!next.includes('mapsBudget?: {'))"), 'tipo de rota deve ter proteção contra duplicidade');

for (const protectedPath of ['client/src/lib/pdfParser.ts', 'server/rosterParser.mjs', 'client/src/lib/canonicalRoster.ts', 'client/src/lib/financialRules.ts']) {
  assert.ok(!applySource.includes(`update('${protectedPath}'`), `patch de mapas não pode alterar motor protegido: ${protectedPath}`);
}

console.log('v14.3.42 Google Maps budget/fallback: authenticated route preview, monthly cap, database-outage latch, visible Admin control, serialized fail-closed persistence, cache, quota block, Google-first order, TomTom fallback, minimal Calendar scope, final v14.3.43 chain and protected engine validated.');
