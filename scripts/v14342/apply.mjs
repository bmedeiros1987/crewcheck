import fs from 'node:fs';

const VERSION = '14.3.42';
const VERSION_DIGITS = VERSION.replace(/\./g, '');

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

const mapsImport = `import { googleMapsBudgetStatus, reserveGoogleMapsRequest, markGoogleMapsQuotaBlocked, googleMapsQuotaFailure, readGoogleRouteCache, writeGoogleRouteCache } from './server/v14342/maps-budget.mjs';`;

const routeBlock = String.raw`async function googleRoutePreview(origin, destination, requestedMode, key) {
  const cached = readGoogleRouteCache(origin, destination, requestedMode);
  if (cached) return { ...cached, mapsBudget: await googleMapsBudgetStatus(), providerOrder: ['Google Routes', 'TomTom'] };
  const budget = await reserveGoogleMapsRequest('routes', 1);
  if (!budget.allowed) return { ok: false, configured: true, budgetDenied: true, mapsBudget: budget, message: 'Limite mensal do Google Maps atingido; ativando TomTom.' };
  const travelMode = requestedMode === 'transit' ? 'TRANSIT' : 'DRIVE';
  const result = await fetchRouteJson('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'routes.duration,routes.staticDuration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.localizedValues',
    },
    body: JSON.stringify({
      origin: { address: origin },
      destination: { address: destination },
      travelMode,
      ...(travelMode === 'DRIVE' ? { routingPreference: 'TRAFFIC_AWARE' } : {}),
      computeAlternativeRoutes: false,
      languageCode: 'pt-BR',
      units: 'METRIC',
    }),
  });
  if (googleMapsQuotaFailure(result.status, result.payload)) {
    const blocked = await markGoogleMapsQuotaBlocked(`provider_quota_${result.status || 'unknown'}`);
    return { ok: false, configured: true, quotaFailure: true, mapsBudget: blocked, message: 'Cota do Google Maps indisponível; ativando TomTom.' };
  }
  const route = result.payload?.routes?.[0];
  if (!result.ok || !route) return { ok: false, configured: true, googleFailure: true, mapsBudget: await googleMapsBudgetStatus(), message: 'Google Routes não respondeu; ativando contingência.' };
  const durationSeconds = routeDurationSeconds(route.duration);
  const baselineDurationSeconds = routeDurationSeconds(route.staticDuration);
  const trafficDelaySeconds = Math.max(0, durationSeconds - baselineDurationSeconds);
  const value = {
    ok: true,
    configured: true,
    provider: 'Google Routes',
    providerOrder: ['Google Routes', 'TomTom'],
    fallback: false,
    liveTraffic: travelMode === 'DRIVE',
    trafficAware: travelMode === 'DRIVE',
    distanceMeters: route.distanceMeters || 0,
    distanceText: route.localizedValues?.distance?.text || formatMeters(route.distanceMeters),
    durationText: route.localizedValues?.duration?.text || formatDuration(route.duration),
    durationInTrafficText: route.localizedValues?.duration?.text || formatDuration(route.duration),
    durationSeconds,
    baselineDurationSeconds,
    trafficDelaySeconds,
    trafficDelayText: trafficDelaySeconds ? formatDuration(`${trafficDelaySeconds}s`) : 'Sem atraso relevante',
    incidents: [],
    hasRoadClosure: false,
    polyline: route.polyline?.encodedPolyline || '',
    updatedAt: new Date().toISOString(),
    refreshAfterSeconds: 120,
    message: travelMode === 'DRIVE' ? 'Rota Google calculada com trânsito quando disponível.' : 'Rota de transporte público calculada pelo Google dentro do CrewCheck.',
    mapsBudget: await googleMapsBudgetStatus(),
  };
  writeGoogleRouteCache(origin, destination, requestedMode, value);
  return value;
}
async function handleRoutePreview(req, res, url) {
  const googleKey = mapsServerKey();
  const tomtomKey = tomtomServerKey();
  const origin = String(url.searchParams.get('origin') || '').trim();
  const destination = String(url.searchParams.get('destination') || '').trim();
  const requestedMode = String(url.searchParams.get('mode') || 'driving').toLowerCase();
  if (!origin || !destination) return sendJson(res, 400, { ok: false, message: 'Origem e destino são necessários.' });
  if (!googleKey && !tomtomKey) return sendJson(res, 200, { ok: false, configured: false, message: 'Rota ao vivo aguarda uma chave Google Routes ou TomTom.' });
  try {
    let googleResult = null;
    if (googleKey) googleResult = await googleRoutePreview(origin, destination, requestedMode, googleKey);
    if (googleResult?.ok) return sendJson(res, 200, { ...googleResult, learningEligible: requestedMode !== 'transit' });

    let route = null;
    if (requestedMode !== 'transit' && tomtomKey) route = await tomtomRoutePreview(origin, destination, tomtomKey);
    if (route) {
      const reason = googleResult?.budgetDenied ? 'monthly_limit' : googleResult?.quotaFailure ? 'provider_quota' : googleKey ? 'google_unavailable' : 'google_not_configured';
      return sendJson(res, 200, {
        ...route,
        provider: 'TomTom',
        providerOrder: ['Google Routes', 'TomTom'],
        fallback: true,
        fallbackFrom: 'Google Routes',
        fallbackReason: reason,
        mapsBudget: googleResult?.mapsBudget || await googleMapsBudgetStatus(),
        learningEligible: true,
        message: reason === 'monthly_limit' || reason === 'provider_quota'
          ? 'Limite do Google Maps atingido; rota atualizada automaticamente pela TomTom.'
          : 'Google Routes indisponível; rota atualizada automaticamente pela TomTom.',
      });
    }
    return sendJson(res, 200, {
      ok: false,
      configured: true,
      providerOrder: ['Google Routes', 'TomTom'],
      mapsBudget: googleResult?.mapsBudget || await googleMapsBudgetStatus(),
      message: requestedMode === 'transit' && googleResult?.budgetDenied
        ? 'Limite mensal do Google Maps atingido. Transporte público ficará disponível no próximo ciclo; abra o Google Maps para navegação externa.'
        : 'Rota ao vivo indisponível agora. Use Abrir no Google Maps.',
    });
  } catch {
    return sendJson(res, 200, { ok: false, configured: true, mapsBudget: await googleMapsBudgetStatus(), message: 'Rota ao vivo indisponível agora. Use Abrir no Google Maps.' });
  }
}
async function handleMapsProviderStatus(req, res) {
  const budget = await googleMapsBudgetStatus();
  const googleConfigured = Boolean(mapsServerKey());
  const tomtomConfigured = Boolean(tomtomServerKey());
  return sendJson(res, 200, {
    ok: googleConfigured || tomtomConfigured,
    primary: googleConfigured && !budget.blocked ? 'Google Routes' : tomtomConfigured ? 'TomTom' : 'Indisponível',
    fallback: 'TomTom',
    googleConfigured,
    tomtomConfigured,
    budget,
    message: budget.blocked
      ? 'Google Maps pausado até a próxima competência; TomTom ativo automaticamente.'
      : `Google Maps principal: ${budget.used} de ${budget.limit} solicitações usadas neste mês.`,
  });
}`;

const conciergeTravelBlock = String.raw`async function conciergeTravelEstimate(location, airport) {
  const point = WEATHER_AIRPORT_POINTS[String(airport || '').toUpperCase()];
  if (!location || !point) return null;
  const distanceKm = conciergeHaversineKm({ lat: Number(location.latitude), lon: Number(location.longitude) }, point);
  const origin = `${Number(location.latitude)},${Number(location.longitude)}`;
  const destination = `${point.lat},${point.lon}`;
  const googleKey = mapsServerKey();
  const tomtomKey = tomtomServerKey();
  try {
    const google = googleKey ? await googleRoutePreview(origin, destination, 'driving', googleKey) : null;
    if (google?.ok) return { distanceKm: Number(google.distanceMeters || 0) / 1000 || distanceKm, minutes: Math.max(1, Math.round(Number(google.durationSeconds || 0) / 60)), trafficAware: true, distanceText: google.distanceText || formatMeters(google.distanceMeters), durationText: google.durationText || formatDuration(`${google.durationSeconds || 0}s`), provider: 'Google Routes', mapsBudget: google.mapsBudget };
    const tomtom = tomtomKey ? await tomtomRoutePreview(origin, destination, tomtomKey) : null;
    if (tomtom?.ok) return { distanceKm: Number(tomtom.distanceMeters || 0) / 1000 || distanceKm, minutes: Math.max(1, Math.round(Number(tomtom.durationSeconds || 0) / 60)), trafficAware: true, distanceText: tomtom.distanceText || formatMeters(tomtom.distanceMeters), durationText: tomtom.durationText || formatDuration(`${tomtom.durationSeconds || 0}s`), provider: 'TomTom', fallback: true, mapsBudget: google?.mapsBudget || await googleMapsBudgetStatus() };
  } catch {}
  return { distanceKm, minutes: Math.max(20, Math.round((distanceKm / 38) * 60 + 18)), trafficAware: false, distanceText: `${distanceKm.toFixed(0)} km`, durationText: 'estimativa de referência', provider: 'estimativa' };
}`;

update('server.mjs', (source) => {
  let next = source;
  if (!next.includes(mapsImport)) {
    const anchor = "import { handlePlatformRoute, consumePlatformUsage, refundPlatformUsage, handlePlatformVisitorTelegram } from './server/platform.mjs';";
    if (!next.includes(anchor)) throw new Error('[v14342] Import principal do servidor não localizado.');
    next = next.replace(anchor, `${anchor}\n${mapsImport}`);
  }
  next = replaceBetween(next, 'async function googleRoutePreview(', 'async function handleReverseGeocode(', routeBlock, 'Google/TomTom route policy');
  next = replaceBetween(next, 'async function conciergeTravelEstimate(', 'function conciergeLeaveDateLabel(', conciergeTravelBlock, 'rota do Concierge');
  if (!next.includes("if (url.pathname === '/api/maps/provider/status') return handleMapsProviderStatus(req, res);")) {
    const anchor = "if (url.pathname === '/api/maps/route-preview') return handleRoutePreview(req, res, url);";
    if (!next.includes(anchor)) throw new Error('[v14342] Registro da rota de mapas não localizado.');
    next = next.replace(anchor, `${anchor}\n  if (url.pathname === '/api/maps/provider/status') return handleMapsProviderStatus(req, res);`);
  }
  return next;
});

update('client/src/pages/Home.tsx', (source) => {
  let next = source
    .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
    .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: Google Maps principal, controle mensal e TomTom automático';`);
  if (!next.includes('mapsBudget?: {')) {
    const marker = '  distanceMeters?: number;\n};';
    if (!next.includes(marker)) throw new Error('[v14342] Tipo RoutePreviewInfo não localizado.');
    next = next.replace(marker, `  distanceMeters?: number;\n  fallback?: boolean;\n  fallbackReason?: string;\n  mapsBudget?: { monthKey?: string; used?: number; limit?: number; remaining?: number; percent?: number; blocked?: boolean; fallbackActive?: boolean; provider?: string; resetAt?: string; persistence?: string };\n};`);
  }
  return next;
});

update('.env.example', (source) => {
  let next = source
    .replace('CREWCHECK_ROUTING_PROVIDER=tomtom', 'CREWCHECK_ROUTING_PROVIDER=google')
    .replace('GOOGLE_MAPS_SERVER_KEY=\n', 'GOOGLE_MAPS_SERVER_KEY=\nGOOGLE_ROUTES_API_KEY=\nCREWCHECK_GOOGLE_MAPS_MONTHLY_LIMIT=2500\nCREWCHECK_GOOGLE_MAPS_CACHE_TTL_MS=120000\n');
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
update('client/public/release.json', () => `${JSON.stringify({ version: VERSION, channel: 'web', updatePolicy: 'automatic', notes: 'Google Maps/Routes principal com limite mensal de 2.500, cache e TomTom automático como fallback.' }, null, 2)}\n`);

console.log(`[v14342] CrewCheck ${VERSION}: Google Routes principal, cota mensal controlada e TomTom automático como fallback.`);
