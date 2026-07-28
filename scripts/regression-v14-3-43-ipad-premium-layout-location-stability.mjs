import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const paths = {
  home: 'client/src/pages/Home.tsx',
  app: 'client/src/App.tsx',
  index: 'client/index.html',
  css: 'client/src/index.css',
  runtime: 'client/src/lib/crewcheckPremiumRuntime.ts',
  release: 'client/public/release.json',
};
const before = Object.fromEntries(Object.entries(paths).map(([key, value]) => [key, read(value)]));
const chain = read('scripts/v139/apply.mjs');
const applySource = read('scripts/v14343/apply.mjs');
const cssSource = read('scripts/v14343/premium-layout.css');
const locationSnippet = read('scripts/v14343/location-access.snippet');

assert.ok(chain.trimEnd().endsWith("await import('../v14343/apply.mjs');"), 'v14.3.43 deve encerrar a preparação canônica');
assert.ok(before.home.includes("const DEFAULT_VERSION = '14.3.43';"), 'Home deve anunciar v14.3.43');
assert.ok(before.home.includes('data-layout-v14343="premium-contained"'), 'shell deve identificar o layout contido');

for (const marker of [
  'function CrewLocationAccess(',
  '<CrewLocationAccess compact/>',
  '<CrewLocationAccess/><GoogleMapsRoutePreview',
  "window.addEventListener('crewcheck:location-updated'",
  'setLocationRevision((value) => value + 1)',
  '[origin, destination, mapsMode, locationRevision]',
  "storage.set('crewcheck_location_permission', 'granted')",
  'Serviços de Localização → Sites do Safari',
]) assert.ok(before.home.includes(marker), `controle de localização ausente: ${marker}`);

assert.equal((before.home.match(/<CrewLocationAccess compact\/>/g) || []).length, 1, 'menu deve conter um único controle compacto de localização');
assert.equal((before.home.match(/<CrewLocationAccess\/>/g) || []).length, 1, 'Saída Inteligente deve conter um único controle de localização');
assert.ok(!before.home.includes("navigator.geolocation?.getCurrentPosition((pos) => storage.set('crewcheck_last_geo'"), 'monitor meteorológico não pode disparar GPS silenciosamente');
assert.ok(before.home.includes('A localização é solicitada somente por ação explícita do usuário'), 'política de gesto explícito deve ficar documentada no código');
assert.ok(locationSnippet.includes("permission.addEventListener?.('change', applyPermission)"), 'mudanças da permissão devem ser acompanhadas');
assert.ok(locationSnippet.includes("removeEventListener?.('change', applyPermission)"), 'listener de permissão deve ser removido corretamente');

const routePreviewStart = before.home.indexOf('async function fetchRoutePreviewInfo(');
const routePreviewEnd = before.home.indexOf('async function fetchNearbyPlaces(', routePreviewStart);
const routePreview = before.home.slice(routePreviewStart, routePreviewEnd);
assert.ok(routePreviewStart >= 0 && routePreviewEnd > routePreviewStart, 'cliente da prévia de rota não localizado');
assert.ok(routePreview.includes('authFetch<RoutePreviewInfo>'), 'prévia protegida deve usar authFetch e enviar bearer quando não houver cookie');
assert.ok(!routePreview.includes('await fetch(`/api/maps/route-preview'), 'prévia de rota não pode usar fetch direto sem Authorization');
assert.ok(applySource.includes("patchBlock(next, 'async function fetchRoutePreviewInfo('"), 'preparação deve corrigir a autenticação da prévia de rota');

for (const marker of [
  '.cz-menu-panel',
  'width: min(92vw, 520px) !important',
  'grid-template-columns: minmax(0, 1fr) !important',
  '.cz-menu-section button',
  'grid-template-columns: 42px minmax(0, 1fr) 20px !important',
  '@media (min-width: 721px) and (max-width: 1366px)',
  '@media (max-width: 720px)',
  '.cc-location-access',
  '.cz-hotels-grid',
  '.cz-gyms-grid',
  'repeat(auto-fit, minmax(min(100%, 270px), 1fr))',
]) assert.ok(cssSource.includes(marker), `proteção visual ausente: ${marker}`);
assert.ok(!cssSource.includes('word-break: break-all'), 'o menu não pode quebrar títulos letra por letra');
assert.ok(before.css.includes('CrewCheck v14.3.43 — premium layout hardening'), 'CSS premium final deve estar aplicado');
assert.equal((before.css.match(/CrewCheck v14\.3\.43 — premium layout hardening/g) || []).length, 1, 'CSS final não pode ser duplicado');

assert.ok(!before.app.includes('registrations.map((registration) => registration.unregister())'), 'App não pode desregistrar todo service worker a cada inicialização');
assert.ok(before.app.includes("const cleanupKey = 'crewcheck-client-cleanup:14.3.43'"), 'limpeza deve ocorrer uma vez por versão');
assert.ok(before.app.includes('registration?.update()'), 'atualização deve preservar o service worker ativo');
assert.ok(before.app.includes("!name.includes('v14.3.43')"), 'cache da versão atual não pode ser apagado no boot');
assert.ok(!before.index.includes('registration.unregister()'), 'HTML inicial não pode desregistrar o service worker');
assert.ok(!before.index.includes('crewcheck-cache-reset-'), 'script legado de limpeza destrutiva deve ser removido do HTML');
assert.ok(applySource.includes('legacyCleanupMarker'), 'aplicação deve remover explicitamente a limpeza destrutiva antiga');

const watcherStart = before.index.indexOf('<script id="crewcheck-release-watch-v14343">');
const watcherEnd = watcherStart >= 0 ? before.index.indexOf('</script>', watcherStart) : -1;
assert.ok(watcherStart >= 0 && watcherEnd > watcherStart, 'watcher seguro de release não localizado');
const watcher = before.index.slice(watcherStart, watcherEnd);
assert.ok(watcher.includes('cooldownMs = 30 * 60 * 1000'), 'watcher deve ter circuit breaker de 30 minutos');
assert.ok(watcher.includes('window.localStorage.setItem(reloadKey'), 'reload deve ser marcado persistentemente antes de ocorrer');
assert.ok(!watcher.includes('window.sessionStorage'), 'guard de atualização no iPad não pode depender apenas da sessão');
assert.equal((watcher.match(/window\.location\.reload\(\)/g) || []).length, 1, 'watcher deve permitir no máximo um ponto de reload controlado');
assert.ok(!before.index.includes('crewcheck-release-watch-v14329'), 'watcher antigo deve ser removido');

for (const marker of [
  "version: '14.3.43'",
  "localStorage.setItem('crewcheck_location_permission', 'granted')",
  "window.dispatchEvent(new CustomEvent('crewcheck:location-updated'",
  "location: locationState === 'granted' ? true",
]) assert.ok(before.runtime.includes(marker), `runtime de permissão ausente: ${marker}`);

assert.ok(before.release.includes('14.3.43'), 'release.json deve anunciar 14.3.43');
assert.ok(before.release.includes('automatic-safe'), 'política de atualização segura deve estar registrada');

for (const protectedPath of ['client/src/lib/pdfParser.ts', 'server/rosterParser.mjs', 'client/src/lib/canonicalRoster.ts', 'client/src/lib/financialRules.ts']) {
  assert.ok(!applySource.includes(`update('${protectedPath}'`), `patch visual não pode alterar motor protegido: ${protectedPath}`);
}

const apply = spawnSync(process.execPath, [path.join(root, 'scripts/v14343/apply.mjs')], { cwd: root, encoding: 'utf8' });
assert.equal(apply.status, 0, apply.stderr || apply.stdout || 'segunda aplicação v14.3.43 falhou');
for (const [key, relative] of Object.entries(paths)) {
  assert.equal(read(relative), before[key], `patch v14.3.43 deve ser idempotente em ${relative}`);
}

console.log('v14.3.43 iPad premium stability: one-column drawer, contained cards, explicit location, bearer-aware route preview, safe release reload, removed legacy PWA cleanup, preserved service worker and protected engines validated.');
