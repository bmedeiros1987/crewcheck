import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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
const serverPath = path.join(root, 'server.mjs');
const homePath = path.join(root, 'client/src/pages/Home.tsx');
const envPath = path.join(root, '.env.example');
const releasePath = path.join(root, 'client/public/release.json');
const serverBefore = read('server.mjs');
const homeBefore = read('client/src/pages/Home.tsx');
const envBefore = read('.env.example');
const releaseBefore = read('client/public/release.json');
const routeSnippet = read('scripts/v14342/route-policy.snippet');
const conciergeSnippet = read('scripts/v14342/concierge-route.snippet');
const budgetSource = read('server/v14342/maps-budget.mjs');
const applySource = read('scripts/v14342/apply.mjs');
const chain = read('scripts/v139/apply.mjs');
const calendar = read('client/src/lib/googleCalendarSync.ts');
const viteConfig = read('vite.config.ts');

assert.doesNotThrow(() => new Function(routeSnippet), 'snippet da política de rotas deve ser JavaScript válido');
assert.doesNotThrow(() => new Function(conciergeSnippet), 'snippet do Concierge deve ser JavaScript válido');
assert.ok(chain.includes("await import('../v14342/apply.mjs');"), 'v14.3.42 deve encerrar a preparação canônica');
assert.ok(serverBefore.includes("from './server/v14342/maps-budget.mjs'"), 'servidor deve importar o controlador de cota');
assert.ok(serverBefore.includes("if (url.pathname === '/api/maps/provider/status')"), 'status seguro de mapas deve estar registrado');
assert.ok(serverBefore.includes("'GOOGLE_ROUTES_API_KEY', 'GOOGLE_MAPS_SERVER_KEY'"), 'chave específica do Routes deve ser priorizada');
assert.ok(serverBefore.includes("providerOrder: ['Google Routes', 'TomTom']"), 'ordem pública deve registrar Google antes de TomTom');
assert.ok(serverBefore.includes("fallbackFrom: 'Google Routes'"), 'fallback deve informar origem sem expor segredo');
assert.ok(serverBefore.includes('fallbackReason: reason'), 'motivo do fallback deve ser rastreável');
assert.ok(serverBefore.includes('await reserveGoogleMapsRequest'), 'chamada Google deve reservar cota antes da requisição');
assert.ok(serverBefore.includes('readGoogleRouteCache'), 'rotas repetidas devem consultar cache');
assert.ok(budgetSource.includes('INSERT IGNORE INTO crewcheck_external_api_usage'), 'primeira reserva persistente deve criar a linha antes do lock');
assert.ok(budgetSource.includes('FOR UPDATE'), 'contador persistente deve ser serializado por competência');
assert.ok(budgetSource.indexOf('INSERT IGNORE INTO crewcheck_external_api_usage') < budgetSource.indexOf('FOR UPDATE'), 'linha mensal deve existir antes do bloqueio transacional');

const handlerStart = serverBefore.indexOf('async function handleRoutePreview(');
const handlerEnd = serverBefore.indexOf('async function handleMapsProviderStatus(', handlerStart);
const handler = serverBefore.slice(handlerStart, handlerEnd);
assert.ok(handlerStart >= 0 && handlerEnd > handlerStart, 'handler de rota preparado não localizado');
assert.ok(handler.indexOf('await googleRoutePreview') < handler.indexOf('await tomtomRoutePreview'), 'Google deve ser tentado antes da TomTom');

const statusStart = serverBefore.indexOf('async function handleMapsProviderStatus(');
const statusEnd = serverBefore.indexOf('async function handleReverseGeocode(', statusStart);
const statusHandler = serverBefore.slice(statusStart, statusEnd);
assert.ok(statusHandler.includes('alarmRequestIdentity(req)'), 'diagnóstico de custo deve identificar o administrador');
assert.ok(statusHandler.includes('if (!identity.admin)'), 'diagnóstico mensal não pode ficar público');
assert.ok(statusHandler.includes('sendJson(res, 403'), 'usuário comum deve receber bloqueio explícito');
assert.ok(!statusHandler.includes('API_KEY'), 'status nunca pode serializar nomes ou valores de chaves');

const conciergeStart = serverBefore.indexOf('async function conciergeTravelEstimate(');
const conciergeEnd = serverBefore.indexOf('function conciergeLeaveDateLabel(', conciergeStart);
const concierge = serverBefore.slice(conciergeStart, conciergeEnd);
assert.ok(concierge.indexOf('await googleRoutePreview') < concierge.indexOf('await tomtomRoutePreview'), 'Concierge deve usar a mesma ordem Google → TomTom');

for (const marker of [
  'GOOGLE_ROUTES_API_KEY=',
  'CREWCHECK_GOOGLE_MAPS_MONTHLY_LIMIT=2500',
  'CREWCHECK_GOOGLE_MAPS_CACHE_TTL_MS=120000',
  'CREWCHECK_ROUTING_PROVIDER=google',
  'VITE_GOOGLE_CLIENT_ID=',
]) assert.ok(envBefore.includes(marker), `variável documentada ausente: ${marker}`);

assert.ok(calendar.includes('VITE_GOOGLE_CLIENT_ID'), 'Calendar deve ler o Client ID incorporado no build');
assert.ok(calendar.includes('https://www.googleapis.com/auth/calendar.events'), 'escopo de eventos deve permanecer');
assert.ok(calendar.includes('https://www.googleapis.com/auth/calendar.calendarlist.readonly'), 'escopo de lista de calendários deve permanecer');
assert.ok(viteConfig.includes('runtimeEnv.VITE_GOOGLE_CLIENT_ID'), 'Vite deve aceitar o nome público recomendado');
assert.ok(viteConfig.includes('runtimeEnv.GOOGLE_CLIENT_ID'), 'Vite deve aceitar o nome já configurado no Render');
assert.ok(viteConfig.includes('"import.meta.env.VITE_GOOGLE_CLIENT_ID"'), 'Client ID deve ser incorporado somente no campo público esperado pelo cliente');
assert.ok(!viteConfig.includes('GOOGLE_CLIENT_SECRET'), 'segredo OAuth nunca pode ser incorporado no bundle');
assert.ok(homeBefore.includes("const DEFAULT_VERSION = '14.3.42';"), 'versão Web/PWA 14.3.42 ausente');
assert.ok(homeBefore.includes('mapsBudget?: {'), 'cliente deve aceitar o diagnóstico de cota');
assert.ok(releaseBefore.includes('14.3.42'), 'release.json deve anunciar 14.3.42');

for (const protectedPath of ['client/src/lib/pdfParser.ts', 'server/rosterParser.mjs', 'client/src/lib/canonicalRoster.ts', 'client/src/lib/financialRules.ts']) {
  assert.ok(!applySource.includes(`update('${protectedPath}'`), `patch de mapas não pode alterar motor protegido: ${protectedPath}`);
}

const apply = spawnSync(process.execPath, [path.join(root, 'scripts/v14342/apply.mjs')], { cwd: root, encoding: 'utf8' });
assert.equal(apply.status, 0, apply.stderr || apply.stdout || 'segunda aplicação v14.3.42 falhou');
assert.equal(fs.readFileSync(serverPath, 'utf8'), serverBefore, 'patch de mapas deve ser idempotente no servidor');
assert.equal(fs.readFileSync(homePath, 'utf8'), homeBefore, 'patch de mapas deve ser idempotente na interface');
assert.equal(fs.readFileSync(envPath, 'utf8'), envBefore, 'patch de mapas deve ser idempotente no template de ambiente');
assert.equal(fs.readFileSync(releasePath, 'utf8'), releaseBefore, 'patch de mapas deve ser idempotente no release');

console.log('v14.3.42 Google Maps budget/fallback: monthly cap, serialized persistence, cache, quota block, Google-first order, admin status, TomTom fallback, Render Calendar Client ID and protected engine validated.');
