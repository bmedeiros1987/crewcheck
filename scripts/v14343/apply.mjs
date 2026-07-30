import fs from 'node:fs';
import { replaceReleaseWatchers } from '../lib/release-watcher.mjs';

const VERSION = '14.3.43';
const VERSION_DIGITS = VERSION.replace(/\./g, '');
const locationAccess = fs.readFileSync(new URL('./location-access.snippet', import.meta.url), 'utf8').trim();
const premiumCss = fs.readFileSync(new URL('./premium-layout.css', import.meta.url), 'utf8').trim();

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v14343] Arquivo ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function patchBlock(source, startMarker, endMarker, label, transform) {
  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start + startMarker.length) : -1;
  if (start < 0 || end < 0) throw new Error(`[v14343] Bloco não localizado: ${label}. start=${start} end=${end}`);
  const before = source.slice(start, end);
  const after = transform(before);
  return after === before ? source : `${source.slice(0, start)}${after}${source.slice(end)}`;
}

const locationRefreshEffect = `  useEffect(() => {
    const onLocationUpdated = (incoming: Event) => {
      const detail = (incoming as CustomEvent).detail || {};
      const direct = detail.coordinates || null;
      const stored = coordinatePair(storage.get('crewcheck_last_geo', ''));
      const lat = Number(direct?.lat ?? stored?.lat);
      const lng = Number(direct?.lng ?? stored?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const next = coordsLabel(lat, lng);
      setOrigin(next);
      setOriginLabel('Localização atual');
      onOriginLabel?.('Localização atual');
      setLocationRevision((value) => value + 1);
    };
    window.addEventListener('crewcheck:location-updated', onLocationUpdated as EventListener);
    return () => window.removeEventListener('crewcheck:location-updated', onLocationUpdated as EventListener);
  }, []);`;

update('client/src/pages/Home.tsx', (source) => {
  let next = source
    .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
    .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: padrão premium responsivo, localização explícita e estabilidade no iPad';`);

  if (!next.includes('function CrewLocationAccess(')) {
    const anchor = 'function MenuDrawer(';
    if (!next.includes(anchor)) throw new Error('[v14343] MenuDrawer não localizado para inserir permissão de localização.');
    next = next.replace(anchor, `${locationAccess}\n\n${anchor}`);
  }

  next = patchBlock(next, 'function MenuDrawer(', 'function Cockpit(', 'menu premium', (block) => {
    if (block.includes('<CrewLocationAccess compact/>')) return block;
    const anchor = '      </header>\n      <div className="cz-menu-scroll"';
    if (!block.includes(anchor)) throw new Error('[v14343] Cabeçalho/rolagem do menu não localizado.');
    return block.replace(anchor, '      </header>\n      <CrewLocationAccess compact/>\n      <div className="cz-menu-scroll"');
  });

  next = patchBlock(next, 'function GoogleMapsRoutePreview(', 'function isAdmin()', 'rota e localização', (block) => {
    let patched = block;
    if (!patched.includes('const [locationRevision, setLocationRevision]')) {
      const anchor = "  const [originLabel, setOriginLabel] = useState(() => eventRouteOriginLabel(event));";
      if (!patched.includes(anchor)) throw new Error('[v14343] Estado da origem da rota não localizado.');
      patched = patched.replace(anchor, `${anchor}\n  const [locationRevision, setLocationRevision] = useState(0);`);
    }
    if (!patched.includes("window.addEventListener('crewcheck:location-updated'")) {
      const firstEffect = patched.indexOf('  useEffect(() => {');
      if (firstEffect < 0) throw new Error('[v14343] Efeito da rota não localizado.');
      patched = `${patched.slice(0, firstEffect)}${locationRefreshEffect}\n${patched.slice(firstEffect)}`;
    }
    patched = patched.replace(
      '  }, [origin, destination, mapsMode]);',
      '  }, [origin, destination, mapsMode, locationRevision]);',
    );
    return patched;
  });

  next = patchBlock(next, 'function Departure(', 'function MonthlyMapView', 'Saída Inteligente', (block) => {
    if (block.includes('<CrewLocationAccess/>')) return block;
    const previewPattern = /<GoogleMapsRoutePreview\b/;
    if (!previewPattern.test(block)) throw new Error('[v14343] Prévia Google Maps não localizada na Saída Inteligente.');
    return block.replace(previewPattern, '<CrewLocationAccess/><GoogleMapsRoutePreview');
  });

  next = patchBlock(next, 'async function fetchRoutePreviewInfo(', 'async function fetchNearbyPlaces(', 'autenticação da prévia de rota', (block) => {
    if (block.includes('authFetch<RoutePreviewInfo>')) return block;
    const directFetch = "    const response = await fetch(`/api/maps/route-preview?${params.toString()}`, { cache: 'no-store' });\n    const payload = await response.json().catch(() => null);";
    const authenticatedFetch = "    const payload = await authFetch<RoutePreviewInfo>(`/api/maps/route-preview?${params.toString()}`, { cache: 'no-store' });";
    if (!block.includes(directFetch)) throw new Error('[v14343] Chamada direta da prévia de rota não localizada.');
    return block.replace(directFetch, authenticatedFetch);
  });

  next = next.replace(
    "      () => reject(new Error('Não consegui acessar sua localização. Ative a permissão e tente novamente.')),",
    "      (error) => reject(new Error(error?.code === 1 ? 'Localização bloqueada. No iPad, permita o acesso nos ajustes do site e tente novamente.' : 'Não consegui acessar sua localização agora. Tente novamente.')),",
  );

  next = next.replace(
    /\s*try \{ navigator\.geolocation\?\.getCurrentPosition\(\(pos\) => storage\.set\('crewcheck_last_geo', `\$\{pos\.coords\.latitude\},\$\{pos\.coords\.longitude\}`\), \(\) => \{\}, \{ enableHighAccuracy: false, timeout: 2500 \}\); \} catch \{\}/,
    '\n    // A localização é solicitada somente por ação explícita do usuário para evitar prompts e ciclos no iPad.',
  );

  next = next.replace(
    '<main className="cz-app" data-version={DEFAULT_VERSION} data-view={view}>',
    '<main className="cz-app" data-version={DEFAULT_VERSION} data-view={view} data-layout-v14343="premium-contained">',
  );
  return next;
});

update('client/src/App.tsx', (source) => {
  let next = source.replace(/crewcheck_last_loaded_version',\s*'[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`);
  const unsafeWorkerCleanup = "      if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(registrations.map((registration) => registration.unregister()))).catch(() => undefined);";
  const unsafeCacheCleanup = "      if ('caches' in window) caches.keys().then((names) => Promise.all(names.filter((name) => /crewcheck|workbox|vite/i.test(name)).map((name) => caches.delete(name)))).catch(() => undefined);";
  const safeCleanup = [
    `      const cleanupKey = 'crewcheck-client-cleanup:${VERSION}';`,
    "      if (window.localStorage.getItem(cleanupKey) !== 'done') {",
    "        window.localStorage.setItem(cleanupKey, 'done');",
    "        if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistration().then((registration) => registration?.update()).catch(() => undefined);",
    `        if ('caches' in window) caches.keys().then((names) => Promise.all(names.filter((name) => /crewcheck|workbox|vite/i.test(name) && !name.includes('v${VERSION}')).map((name) => caches.delete(name)))).catch(() => undefined);`,
    '      }',
  ].join('\n');
  if (next.includes(unsafeWorkerCleanup)) next = next.replace(unsafeWorkerCleanup, safeCleanup);
  if (next.includes(unsafeCacheCleanup)) next = next.replace(unsafeCacheCleanup, '');
  if (next.includes('registrations.map((registration) => registration.unregister())')) throw new Error('[v14343] Limpeza destrutiva do service worker ainda presente.');
  return next;
});

const releaseWatcher = `<script id="crewcheck-release-watch-v14343">
    (function () {
      var currentRelease = '${VERSION}';
      var checking = false;
      var cooldownMs = 30 * 60 * 1000;
      function normalized(value) { return String(value || '').trim(); }
      async function checkRelease() {
        if (checking) return;
        checking = true;
        try {
          var response = await fetch('/release.json?ts=' + Date.now(), { cache: 'no-store', credentials: 'same-origin' });
          if (!response.ok) return;
          var payload = await response.json().catch(function () { return {}; });
          var serverRelease = normalized(payload.version);
          if (!serverRelease || serverRelease === normalized(currentRelease)) return;
          var reloadKey = 'crewcheck-release-reload:' + serverRelease;
          var previousReload = Number(window.localStorage && window.localStorage.getItem(reloadKey) || 0);
          if (previousReload && Date.now() - previousReload < cooldownMs) return;
          if (window.localStorage) window.localStorage.setItem(reloadKey, String(Date.now()));
          if ('serviceWorker' in navigator) {
            var registration = await navigator.serviceWorker.getRegistration();
            if (registration) {
              await registration.update().catch(function () {});
              if (registration.waiting) registration.waiting.postMessage('SKIP_WAITING');
            }
          }
          window.setTimeout(function () { window.location.reload(); }, 180);
        } catch (error) {
        } finally {
          checking = false;
        }
      }
      window.addEventListener('load', checkRelease, { once: true });
      document.addEventListener('visibilitychange', function () { if (!document.hidden) checkRelease(); });
      window.setInterval(checkRelease, 300000);
    })();
  </script>`;

update('client/index.html', (source) => {
  let next = source;
  const legacyCleanupMarker = "var key = 'crewcheck-cache-reset-";
  const cleanupMarkerIndex = next.indexOf(legacyCleanupMarker);
  if (cleanupMarkerIndex >= 0) {
    const cleanupScriptStart = next.lastIndexOf('<script>', cleanupMarkerIndex);
    const cleanupScriptEnd = next.indexOf('</script>', cleanupMarkerIndex);
    if (cleanupScriptStart < 0 || cleanupScriptEnd < 0) throw new Error('[v14343] Script legado de limpeza PWA incompleto.');
    next = `${next.slice(0, cleanupScriptStart)}${next.slice(cleanupScriptEnd + '</script>'.length)}`;
  }
  next = next
    .replace(/data-crewcheck-release="[^"]+"/g, `data-crewcheck-release="${VERSION}"`)
    .replace(/name="crewcheck-release" content="[^"]+"/g, `name="crewcheck-release" content="${VERSION}"`)
    .replace(/manifest\.json\?v=\d+/g, `manifest.json?v=${VERSION_DIGITS}`)
    .replace(/sw\.js\?v=\d+/g, `sw.js?v=${VERSION_DIGITS}`)
    .replace(/var currentRelease = '[^']+';/g, `var currentRelease = '${VERSION}';`);
  next = replaceReleaseWatchers(next, releaseWatcher);
  if (next.includes('registration.unregister()') || next.includes('crewcheck-cache-reset-')) throw new Error('[v14343] Limpeza destrutiva do PWA ainda presente no HTML.');
  return next;
});

update('client/src/pages/AuthPage.tsx', (source) => source.replace(/14\.3\.\d+/g, VERSION), { optional: true });
update('client/public/sw.js', (source) => source
  .replace(/crewcheck-v[0-9.]+-shell/g, `crewcheck-v${VERSION}-shell`)
  .replace(/crewcheck-v[0-9.]+-runtime/g, `crewcheck-v${VERSION}-runtime`), { optional: true });
update('client/src/index.css', (source) => source.includes('CrewCheck v14.3.43 — premium layout hardening') ? source : `${source.trimEnd()}\n\n${premiumCss}\n`);
update('client/public/release.json', () => `${JSON.stringify({
  version: VERSION,
  channel: 'web',
  updatePolicy: 'automatic-safe',
  notes: 'Menu premium contido, cards responsivos, permissão explícita de localização e atualização segura no iPad.',
}, null, 2)}\n`);

console.log(`[v14343] CrewCheck ${VERSION}: menu premium de uma coluna, cards contidos, localização explícita e proteção contra reinício repetido no iPad.`);
