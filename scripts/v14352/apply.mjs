import fs from 'node:fs';

const VERSION = '14.3.52';
const VERSION_DIGITS = VERSION.replace(/\./g, '');

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v14352] Arquivo ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function variants(value) {
  return [...new Set([value, value.replace(/\n/g, '\r\n')])];
}

function withEol(value, eol) {
  return value.trimEnd().replace(/\n/g, eol);
}

function replaceRequired(source, before, after, label) {
  if (variants(after.trim()).some((candidate) => source.includes(candidate))) return source;
  const matched = variants(before).find((candidate) => source.includes(candidate));
  if (!matched) throw new Error(`[v14352] Bloco ausente: ${label}`);
  const eol = matched.includes('\r\n') ? '\r\n' : '\n';
  return source.replace(matched, withEol(after, eol));
}

function replaceOneOfRequired(source, beforeValues, after, sentinel, label) {
  if (source.includes(sentinel)) return source;
  for (const before of beforeValues) {
    const matched = variants(before).find((candidate) => source.includes(candidate));
    if (!matched) continue;
    const eol = matched.includes('\r\n') ? '\r\n' : '\n';
    return source.replace(matched, withEol(after, eol));
  }
  throw new Error(`[v14352] Bloco ausente: ${label}`);
}

function patchBlock(source, startMarker, endMarker, label, transform) {
  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start + startMarker.length) : -1;
  if (start < 0 || end < 0) throw new Error(`[v14352] Bloco não localizado: ${label}. start=${start} end=${end}`);
  const before = source.slice(start, end);
  const after = transform(before);
  return after === before ? source : `${source.slice(0, start)}${after}${source.slice(end)}`;
}

export function patchServerMaps(source) {
  let next = replaceOneOfRequired(
    source,
    [
      `function mapsServerKey() {
  return envAny(['GOOGLE_ROUTES_API_KEY', 'GOOGLE_MAPS_SERVER_KEY', 'GOOGLE_MAPS_API_KEY', 'VITE_GOOGLE_MAPS_API_KEY']);
}`,
      `function mapsServerKey() {
  return envAny(['GOOGLE_MAPS_SERVER_KEY', 'GOOGLE_MAPS_API_KEY', 'VITE_GOOGLE_MAPS_API_KEY']);
}`,
    ],
    `function googleRoutesServerKey() {
  return envAny(['GOOGLE_ROUTES_API_KEY', 'GOOGLE_MAPS_SERVER_KEY', 'GOOGLE_MAPS_API_KEY']);
}
function mapsServerKey() {
  return envAny(['GOOGLE_MAPS_SERVER_KEY', 'GOOGLE_MAPS_API_KEY']);
}`,
    'function googleRoutesServerKey()',
    'separação das chaves Google no servidor',
  );

  next = next.replaceAll(
    'const googleKey = mapsServerKey();',
    'const googleKey = googleRoutesServerKey();',
  );
  next = next.replace(
    'const googleConfigured = Boolean(mapsServerKey());',
    'const googleConfigured = Boolean(googleRoutesServerKey());',
  );
  next = next.replace(
    `function placesServerKey() {
  return envAny(['GOOGLE_PLACES_API_KEY', 'GOOGLE_PLACES_SERVER_KEY', 'GOOGLE_MAPS_SERVER_KEY', 'GOOGLE_MAPS_API_KEY', 'VITE_GOOGLE_MAPS_API_KEY']);
}`,
    `function placesServerKey() {
  return envAny(['GOOGLE_PLACES_API_KEY', 'GOOGLE_PLACES_SERVER_KEY', 'GOOGLE_MAPS_SERVER_KEY', 'GOOGLE_MAPS_API_KEY']);
}`,
  );

  if (next.includes('const googleKey = mapsServerKey();')) {
    throw new Error('[v14352] Rota Google ainda usa a chave genérica de geocodificação.');
  }
  const serverKeyBlock = next.slice(
    next.indexOf('function googleRoutesServerKey()'),
    next.indexOf('function tomtomServerKey()'),
  );
  if (serverKeyBlock.includes('VITE_GOOGLE_MAPS_API_KEY')) {
    throw new Error('[v14352] Chave pública do navegador não pode ser usada pelo servidor.');
  }
  return next;
}

export function patchClientMaps(source) {
  let next = replaceRequired(
    source,
    `function buildGoogleMapsEmbedDirectionsUrl(origin: string, destination: string, travelmode: 'driving' | 'walking' | 'transit' = 'driving'): string {
  const key = mapsBrowserKey();
  if (!origin || !destination) return '';
  if (key) return \`https://www.google.com/maps/embed/v1/directions?key=\${encodeURIComponent(key)}&origin=\${encodeURIComponent(origin)}&destination=\${encodeURIComponent(destination)}&mode=\${travelmode}\`;
  const dirFlag = travelmode === 'walking' ? 'w' : travelmode === 'transit' ? 'r' : 'd';
  return \`https://www.google.com/maps?output=embed&saddr=\${encodeURIComponent(origin)}&daddr=\${encodeURIComponent(destination)}&dirflg=\${dirFlag}\`;
}`,
    `function buildGoogleMapsEmbedDirectionsUrl(origin: string, destination: string, travelmode: 'driving' | 'walking' | 'transit' = 'driving'): string {
  const key = mapsBrowserKey();
  if (!key || !origin || !destination) return '';
  return \`https://www.google.com/maps/embed/v1/directions?key=\${encodeURIComponent(key)}&origin=\${encodeURIComponent(origin)}&destination=\${encodeURIComponent(destination)}&mode=\${travelmode}\`;
}`,
    'Google Maps Embed com chave pública explícita',
  );

  next = replaceRequired(
    next,
    `function buildGoogleMapsEmbedSearchUrl(query: string): string {
  const key = mapsBrowserKey();
  if (!query) return '';
  if (key) return \`https://www.google.com/maps/embed/v1/search?key=\${encodeURIComponent(key)}&q=\${encodeURIComponent(query)}\`;
  return \`https://www.google.com/maps?q=\${encodeURIComponent(query)}&output=embed\`;
}`,
    `function buildGoogleMapsEmbedSearchUrl(query: string): string {
  const key = mapsBrowserKey();
  if (!key || !query) return '';
  return \`https://www.google.com/maps/embed/v1/search?key=\${encodeURIComponent(key)}&q=\${encodeURIComponent(query)}\`;
}`,
    'Google Maps Embed Search com chave pública explícita',
  );

  next = patchBlock(
    next,
    'async function fetchRoutePreviewInfo(',
    'async function fetchNearbyPlaces(',
    'fallback da prévia de rota',
    (block) => replaceRequired(
      block,
      `  } catch {}
  return null;`,
      `  } catch {
    return {
      ok: false,
      configured: false,
      message: 'A rota interna não está disponível agora. Você ainda pode abrir o trajeto no Google Maps.',
    };
  }
  return {
    ok: false,
    configured: false,
    message: 'A rota interna não respondeu agora. Você ainda pode abrir o trajeto no Google Maps.',
  };`,
      'mensagem amigável quando a rota interna falhar',
    ),
  );

  next = patchBlock(
    next,
    'function GoogleMapsRoutePreview(',
    'function isAdmin()',
    'Google Maps e fallback em pt-BR',
    (block) => {
      let patched = replaceRequired(
        block,
        `  const trafficText = route?.trafficAware ? safe(route.durationInTrafficText || route.durationText, 'Tempo atualizado') : 'Ao abrir no Google Maps';
  const updatedLabel = route?.updatedAt ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(route.updatedAt)) : 'aguardando';`,
        `  const routeReady = route?.ok === true;
  const trafficText = routeReady && route?.trafficAware
    ? safe(route.durationInTrafficText || route.durationText, 'Tempo atualizado')
    : route === null ? 'Atualizando…' : 'Disponível no Google Maps';
  const routeDelayText = routeReady
    ? safe(route?.trafficDelayText, 'Sem atraso relevante')
    : route === null ? 'Atualizando…' : 'Consulte no Google Maps';
  const updatedLabel = routeReady && route?.updatedAt
    ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(route.updatedAt))
    : route === null ? 'Atualizando…' : 'Sem leitura interna';
  const routeProviderLabel = route?.provider || (route === null ? 'atualizando rota' : 'navegação externa disponível');`,
        'status de rota em pt-BR',
      );
      patched = replaceRequired(
        patched,
        `{route?.provider || 'melhor fonte disponível'}`,
        `{routeProviderLabel}`,
        'fonte legível da rota',
      );
      patched = replaceRequired(
        patched,
        `<div><small>Distância</small><strong>{route?.distanceText || 'Abrir Maps'}</strong></div>`,
        `<div><small>Distância</small><strong>{route?.distanceText || (route === null ? 'Atualizando…' : 'Abrir Google Maps')}</strong></div>`,
        'distância sem anglicismo abreviado',
      );
      patched = replaceRequired(
        patched,
        `<div><small>Atraso do trânsito</small><strong>{route?.trafficDelayText || 'Calculando'}</strong></div>`,
        `<div><small>Atraso do trânsito</small><strong>{routeDelayText}</strong></div>`,
        'estado finito do atraso',
      );
      patched = replaceRequired(
        patched,
        `<div className="cz-map-fallback"><MapIcon/><strong>Mapa estático aguardando configuração.</strong><span>Abra a rota no Google Maps para visualizar caminho e trânsito pelo Maps.</span></div>`,
        `<div className="cz-map-fallback" data-maps-fallback="external-navigation"><MapIcon/><strong>Prévia interna do mapa indisponível.</strong><span>O planejamento continua ativo. Abra a rota no Google Maps para ver mapa, trânsito e navegação.</span></div>`,
        'fallback amigável do mapa',
      );
      return patched;
    },
  );

  return next;
}

export function patchMapsEnvironment(source) {
  if (source.includes('# CrewCheck P0 — chaves de mapas separadas por superfície')) return source;
  let next = source;
  if (!next.includes('GOOGLE_ROUTES_API_KEY=')) {
    next = next.replace('GOOGLE_MAPS_SERVER_KEY=\n', 'GOOGLE_MAPS_SERVER_KEY=\nGOOGLE_ROUTES_API_KEY=\n');
  }
  if (!next.includes('GOOGLE_PLACES_API_KEY=')) {
    next = next.replace('GOOGLE_ROUTES_API_KEY=\n', 'GOOGLE_ROUTES_API_KEY=\nGOOGLE_PLACES_API_KEY=\nGOOGLE_PLACES_SERVER_KEY=\n');
  }
  if (!next.includes('VITE_GOOGLE_MAPS_API_KEY=')) {
    next = next.replace('GOOGLE_PLACES_SERVER_KEY=\n', 'GOOGLE_PLACES_SERVER_KEY=\nVITE_GOOGLE_MAPS_API_KEY=\n');
  }
  const anchor = 'GOOGLE_MAPS_API_KEY=';
  if (!next.includes(anchor)) throw new Error('[v14352] Seção de mapas não localizada no .env.example.');
  return next.replace(
    anchor,
    `# CrewCheck P0 — chaves de mapas separadas por superfície
# Server-only: Routes API, Geocoding API e Places API (New).
# A chave VITE_ é pública por projeto e deve aceitar somente os domínios Web/PWA.
${anchor}`,
  );
}

if (process.env.CREWCHECK_V14352_SKIP_APPLY !== '1') {
  update('server.mjs', patchServerMaps);
  update('client/src/pages/Home.tsx', (source) => {
    let next = source
      .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
      .replace(
        /const CREWCHECK_UI_CORE_NOTE = '[^']+';/,
        `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: chaves Google separadas, fallback de rota e textos prioritários em pt-BR';`,
      );
    return patchClientMaps(next);
  });
  update('.env.example', patchMapsEnvironment);

  update('client/src/App.tsx', (source) => source
    .replace(/crewcheck_last_loaded_version',\s*'[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`)
    .replace(/crewcheck-client-cleanup:[^']+/g, `crewcheck-client-cleanup:${VERSION}`), { optional: true });
  update('client/src/pages/AuthPage.tsx', (source) => source.replace(/14\.3\.\d+/g, VERSION), { optional: true });
  update('client/src/lib/crewcheckPremiumRuntime.ts', (source) => source.replace(/version:\s*'14\.3\.\d+'/, `version: '${VERSION}'`), { optional: true });
  update('client/index.html', (source) => source
    .replace(/data-crewcheck-release="[^"]+"/g, `data-crewcheck-release="${VERSION}"`)
    .replace(/name="crewcheck-release" content="[^"]+"/g, `name="crewcheck-release" content="${VERSION}"`)
    .replace(/var currentRelease = '[^']+';/g, `var currentRelease = '${VERSION}';`)
    .replace(/manifest\.json\?v=\d+/g, `manifest.json?v=${VERSION_DIGITS}`)
    .replace(/sw\.js\?v=\d+/g, `sw.js?v=${VERSION_DIGITS}`), { optional: true });
  update('client/public/sw.js', (source) => source
    .replace(/crewcheck-v[0-9.]+-shell/g, `crewcheck-v${VERSION}-shell`)
    .replace(/crewcheck-v[0-9.]+-runtime/g, `crewcheck-v${VERSION}-runtime`), { optional: true });
  update('client/public/release.json', () => `${JSON.stringify({
    version: VERSION,
    channel: 'web',
    updatePolicy: 'automatic-safe',
    notes: 'Google Routes, Geocoding, Places e Embed usam chaves separadas; falhas exibem fallback em pt-BR com navegação externa.',
  }, null, 2)}\n`, { optional: true });
  update('server/platform.mjs', (source) => source.replace(/const APP_VERSION = '\d+\.\d+\.\d+';/, `const APP_VERSION = '${VERSION}';`), { optional: true });
  update('server.mjs', (source) => source
    .replace(/(url\.pathname === '\/api\/(?:release|health)'[^\r\n]*\bversion\s*:\s*)'\d+\.\d+\.\d+'/g, `$1'${VERSION}'`), { optional: true });
  update('package.json', (source) => {
    const data = JSON.parse(source);
    data.version = VERSION;
    data.description = `CrewCheck v${VERSION} - separated Google Maps keys and friendly route fallback in pt-BR`;
    data.scripts ||= {};
    data.scripts['regression:v14.3.52:p0-maps-ptbr'] = 'node scripts/v139/apply.mjs && node scripts/regression-v14-3-52-p0-maps-ptbr.mjs';
    return `${JSON.stringify(data, null, 2)}\n`;
  });
  update('android-wrapper/app/build.gradle', (source) => source
    .replace(/versionCode\s+\d+/, 'versionCode 140352')
    .replace(/versionName\s+["'][^"']+["']/, `versionName "${VERSION}"`), { optional: true });

  console.log(`[v14352] CrewCheck ${VERSION}: chaves de mapas separadas e fallback amigável em pt-BR.`);
}
