import fs from 'node:fs';

const VERSION = '14.3.42';
const VERSION_DIGITS = VERSION.replace(/\./g, '');
const routeBlock = fs.readFileSync(new URL('./route-policy.snippet', import.meta.url), 'utf8').trim();
const conciergeTravelBlock = fs.readFileSync(new URL('./concierge-route.snippet', import.meta.url), 'utf8').trim();
const mapsImport = "import { googleMapsBudgetStatus, reserveGoogleMapsRequest, markGoogleMapsQuotaBlocked, googleMapsQuotaFailure, readGoogleRouteCache, writeGoogleRouteCache } from './server/v14342/maps-budget.mjs';";

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v14342] Arquivo ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function replaceBetween(source, startMarker, endMarker, replacement, label) {
  if (source.includes(replacement.trim())) return source;
  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start + startMarker.length) : -1;
  if (start < 0 || end < 0) throw new Error(`[v14342] Bloco não localizado: ${label}. start=${start} end=${end}`);
  return `${source.slice(0, start)}${replacement.trimEnd()}\n\n${source.slice(end)}`;
}

update('server.mjs', (source) => {
  let next = source;
  if (!next.includes(mapsImport)) {
    const anchor = "import { handlePlatformRoute, consumePlatformUsage, refundPlatformUsage, handlePlatformVisitorTelegram } from './server/platform.mjs';";
    if (!next.includes(anchor)) throw new Error('[v14342] Import principal do servidor não localizado.');
    next = next.replace(anchor, `${anchor}\n${mapsImport}`);
  }

  const currentMapsKey = "return envAny(['GOOGLE_MAPS_SERVER_KEY', 'GOOGLE_MAPS_API_KEY', 'VITE_GOOGLE_MAPS_API_KEY']);";
  const mapsKeyWithRoutes = "return envAny(['GOOGLE_ROUTES_API_KEY', 'GOOGLE_MAPS_SERVER_KEY', 'GOOGLE_MAPS_API_KEY', 'VITE_GOOGLE_MAPS_API_KEY']);";
  const mapsKeysAlreadySeparated = next.includes('function googleRoutesServerKey()')
    && next.includes("return envAny(['GOOGLE_ROUTES_API_KEY', 'GOOGLE_MAPS_SERVER_KEY', 'GOOGLE_MAPS_API_KEY']);");
  if (!mapsKeysAlreadySeparated && !next.includes(mapsKeyWithRoutes)) {
    if (!next.includes(currentMapsKey)) throw new Error('[v14342] Leitura da chave Google Maps não localizada.');
    next = next.replace(currentMapsKey, mapsKeyWithRoutes);
  }

  next = replaceBetween(next, 'async function googleRoutePreview(', 'async function handleReverseGeocode(', routeBlock, 'política Google/TomTom');
  next = replaceBetween(next, 'async function conciergeTravelEstimate(', 'function conciergeLeaveDateLabel(', conciergeTravelBlock, 'rota do Concierge');

  const statusRoute = "if (url.pathname === '/api/maps/provider/status') return handleMapsProviderStatus(req, res);";
  if (!next.includes(statusRoute)) {
    const anchor = "if (url.pathname === '/api/maps/route-preview') return handleRoutePreview(req, res, url);";
    if (!next.includes(anchor)) throw new Error('[v14342] Registro da rota de mapas não localizado.');
    next = next.replace(anchor, `${anchor}\n  ${statusRoute}`);
  }
  return next;
});

update('client/src/pages/Home.tsx', (source) => {
  let next = source
    .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
    .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: Google Maps principal, controle mensal e TomTom automático';`);

  if (!next.includes('mapsBudget?: {')) {
    const typeStart = next.indexOf('type RoutePreviewInfo = {');
    const typeEnd = typeStart >= 0 ? next.indexOf('\n};', typeStart) : -1;
    if (typeStart < 0 || typeEnd < 0) throw new Error(`[v14342] Tipo RoutePreviewInfo não localizado. start=${typeStart} end=${typeEnd}`);
    const fields = `\n  fallback?: boolean;\n  fallbackReason?: string;\n  mapsBudget?: { monthKey?: string; used?: number; limit?: number; remaining?: number; percent?: number; blocked?: boolean; fallbackActive?: boolean; provider?: string; resetAt?: string; persistence?: string };`;
    next = `${next.slice(0, typeEnd)}${fields}${next.slice(typeEnd)}`;
  }

  const legacyRouteFetch = `    const response = await fetch(\`/api/maps/route-preview?\${params.toString()}\`, { cache: 'no-store' });
    const payload = await response.json().catch(() => null);
    if (payload && typeof payload === 'object') return payload as RoutePreviewInfo;`;
  const authenticatedRouteFetch = `    const payload = await authFetch<RoutePreviewInfo>(\`/api/maps/route-preview?\${params.toString()}\`, { cache: 'no-store' });
    if (payload && typeof payload === 'object') return payload;`;
  if (!next.includes(authenticatedRouteFetch)) {
    if (!next.includes(legacyRouteFetch)) throw new Error('[v14342] Cliente da prévia de rota não localizado para aplicar autenticação.');
    next = next.replace(legacyRouteFetch, authenticatedRouteFetch);
  }
  return next;
});

update('.env.example', (source) => {
  let next = source.replace('CREWCHECK_ROUTING_PROVIDER=tomtom', 'CREWCHECK_ROUTING_PROVIDER=google');
  if (!next.includes('GOOGLE_ROUTES_API_KEY=')) {
    next = next.replace('GOOGLE_MAPS_SERVER_KEY=\n', 'GOOGLE_MAPS_SERVER_KEY=\nGOOGLE_ROUTES_API_KEY=\n');
  }
  if (!next.includes('CREWCHECK_GOOGLE_MAPS_MONTHLY_LIMIT=')) {
    next = next.replace('GOOGLE_ROUTES_API_KEY=\n', 'GOOGLE_ROUTES_API_KEY=\nCREWCHECK_GOOGLE_MAPS_MONTHLY_LIMIT=2500\nCREWCHECK_GOOGLE_MAPS_CACHE_TTL_MS=120000\n');
  }
  if (!next.includes('VITE_GOOGLE_CLIENT_ID=')) {
    next = next.replace('# Google Calendar OAuth\n', '# Google Calendar OAuth\n# Client ID público incorporado no build Web/PWA. Requer novo deploy após alterar no Render.\nVITE_GOOGLE_CLIENT_ID=\n');
  }
  return next;
});

update('client/src/App.tsx', (source) => source.replace(/crewcheck_last_loaded_version',\s*'[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`), { optional: true });
update('client/src/pages/AuthPage.tsx', (source) => source.replace(/14\.3\.\d+/g, VERSION), { optional: true });
update('client/index.html', (source) => source
  .replace(/data-crewcheck-release="[^"]+"/g, `data-crewcheck-release="${VERSION}"`)
  .replace(/name="crewcheck-release" content="[^"]+"/g, `name="crewcheck-release" content="${VERSION}"`)
  .replace(/crewcheck-cache-reset-[0-9-]+/g, `crewcheck-cache-reset-${VERSION.replace(/\./g, '-')}`)
  .replace(/manifest\.json\?v=\d+/g, `manifest.json?v=${VERSION_DIGITS}`)
  .replace(/sw\.js\?v=\d+/g, `sw.js?v=${VERSION_DIGITS}`), { optional: true });
update('client/public/sw.js', (source) => source
  .replace(/crewcheck-v[0-9.]+-shell/g, `crewcheck-v${VERSION}-shell`)
  .replace(/crewcheck-v[0-9.]+-runtime/g, `crewcheck-v${VERSION}-runtime`), { optional: true });
update('client/public/release.json', () => `${JSON.stringify({
  version: VERSION,
  channel: 'web',
  updatePolicy: 'automatic',
  notes: 'Google Maps/Routes principal com limite mensal de 2.500, cache e TomTom automático como fallback.',
}, null, 2)}\n`);

console.log(`[v14342] CrewCheck ${VERSION}: Google Routes principal, cota mensal controlada e TomTom automático como fallback.`);
