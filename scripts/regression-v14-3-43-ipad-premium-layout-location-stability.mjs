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
const successorSource = read('scripts/v14344/apply.mjs');
const mapsApplySource = read('scripts/v14342/apply.mjs');
const cssSource = read('scripts/v14343/premium-layout.css');
const locationSnippet = read('scripts/v14343/location-access.snippet');

const v14343Index = chain.indexOf("await import('../v14343/apply.mjs');");
const v14344Index = chain.indexOf("await import('../v14344/apply.mjs');");
assert.ok(v14343Index >= 0, 'v14.3.43 deve participar da preparação canônica');
assert.ok(v14344Index > v14343Index, 'v14.3.44 deve suceder a estabilidade v14.3.43 sem removê-la');
assert.ok(before.home.includes("const DEFAULT_VERSION = '14.4.08';"), 'a preparação final deve anunciar v14.4.08');
assert.ok(before.home.includes('data-layout-v14343="premium-contained"'), 'shell deve preservar o layout contido v14.3.43');
assert.ok(before.home.includes('data-layout-v14344="web-icon-menu"'), 'shell deve registrar o refinamento final v14.3.44');

for (const marker of [
  'function CrewLocationAccess(',
  "window.addEventListener('crewcheck:location-updated'",
  'setLocationRevision((value) => value + 1)',
  '[origin, destination, mapsMode, locationRevision]',
  "storage.set('crewcheck_location_permission', 'granted')",
  'Serviços de Localização → Sites do Safari',
]) assert.ok(before.home.includes(marker), `controle de localização ausente: ${marker}`);

const settingsStart = before.home.indexOf('function SettingsView(');
const settingsEnd = before.home.indexOf('function FeatureHub(', settingsStart);
const settings = before.home.slice(settingsStart, settingsEnd);
assert.ok(settings.includes('className="cc-location-settings"'), 'controle explícito de localização deve terminar em Configurações');
assert.ok(settings.includes('<CrewLocationAccess/>'), 'Configurações deve manter a ação explícita de localização');
assert.equal((before.home.match(/<CrewLocationAccess\/>/g) || []).length, 1, 'controle global de localização deve existir uma única vez na versão final');
assert.equal((before.home.match(/<CrewLocationAccess compact\/>/g) || []).length, 0, 'menu final não pode repetir o controle compacto');
assert.ok(!before.home.includes("navigator.geolocation?.getCurrentPosition((pos) => storage.set('crewcheck_last_geo'"), 'monitor meteorológico não pode disparar GPS silenciosamente');
assert.ok(before.home.includes('A localização é solicitada somente por ação explícita do usuário'), 'política de gesto explícito deve ficar documentada no código');
assert.ok(locationSnippet.includes("permission.addEventListener?.('change', applyPermission)"), 'mudanças da permissão devem ser acompanhadas');
assert.ok(locationSnippet.includes("removeEventListener?.('change', applyPermission)"), 'listener de permissão deve ser removido corretamente');
assert.ok(successorSource.includes("next.replace('<CrewLocationAccess/><GoogleMapsRoutePreview', '<GoogleMapsRoutePreview')"), 'sucessor deve retirar o painel global duplicado da Saída Inteligente');

const routePreviewStart = before.home.indexOf('async function fetchRoutePreviewInfo(');
const routePreviewEnd = before.home.indexOf('async function fetchNearbyPlaces(', routePreviewStart);
const routePreview = before.home.slice(routePreviewStart, routePreviewEnd);
assert.ok(routePreviewStart >= 0 && routePreviewEnd > routePreviewStart, 'cliente da prévia de rota não localizado');
assert.ok(routePreview.includes('authFetch<RoutePreviewInfo>'), 'prévia protegida deve usar authFetch e enviar bearer quando não houver cookie');
assert.ok(!routePreview.includes('await fetch(`/api/maps/route-preview'), 'prévia de rota não pode usar fetch direto sem Authorization');
assert.ok(mapsApplySource.includes('authenticatedRouteFetch'), 'preparação v14.3.42 deve corrigir a autenticação da prévia de rota');

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
assert.ok(before.css.includes('CrewCheck v14.3.43 — premium layout hardening'), 'CSS-base de estabilidade v14.3.43 deve permanecer aplicado');
assert.equal((before.css.match(/CrewCheck v14\.3\.43 — premium layout hardening/g) || []).length, 1, 'CSS-base v14.3.43 não pode ser duplicado');

assert.ok(!before.app.includes('registrations.map((registration) => registration.unregister())'), 'App não pode desregistrar todo service worker a cada inicialização');
const coordinator = read('client/src/lib/pwaUpdateCoordinator.ts');
assert.ok(before.app.includes('installPwaUpdateCoordinator()'), 'App deve instalar o coordenador de atualizações');
assert.ok(coordinator.includes('await current.update()'), 'service worker deve ser atualizado sem desregistro');
assert.ok(coordinator.includes("document.visibilityState === 'hidden' || Date.now() - lastActivityAt >= idleMs"), 'ativação deve esperar inatividade');
assert.ok(coordinator.includes('if (!registration?.waiting || !isSafeToActivate()) return;'), 'worker não pode ser ativado durante uso');
assert.ok(coordinator.includes("navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)"), 'reload só pode nascer da troca real do service worker');
assert.ok(coordinator.includes("if (!controllerSeen)"), 'primeira aquisição de controller não pode recarregar instalação nova');
assert.ok(coordinator.includes("controllerSeen = true"), 'após a primeira aquisição, trocas futuras do worker devem ser reconhecidas');
assert.ok(coordinator.includes("if (!reloadPending || reloadStarted || !isSafeToActivate()) return;"), 'reload deve exigir atualização pendente, fronteira segura e trava de execução única');
assert.ok(coordinator.includes("RELOAD_GUARD_MS = 30_000"), 'reload deve possuir janela curta anti-loop sem bloquear versões futuras');
assert.ok(coordinator.includes("window.sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()))"), 'reload deve registrar a trava temporal antes de recarregar');
assert.ok(coordinator.includes('window.location.reload()'), 'worker novo já ativado deve alcançar o cliente aberto em fronteira segura');
assert.equal((coordinator.match(/window\.location\.reload\(\)/g) || []).length, 1, 'coordenador pode ter somente um ponto de reload, protegido pelo fluxo seguro');
assert.ok(!before.index.includes('crewcheck-release-watch-v14343') && !before.index.includes('crewcheck-release-watch-v14329'), 'watchers legados devem ser removidos');
assert.ok(!before.app.includes('caches.delete('), 'inicialização não pode apagar caches ativos');

for (const marker of [
  "version: '14.4.08'",
  "localStorage.setItem('crewcheck_location_permission', 'granted')",
  "window.dispatchEvent(new CustomEvent('crewcheck:location-updated'",
  "location: locationState === 'granted' ? true",
]) assert.ok(before.runtime.includes(marker), `runtime de permissão ausente: ${marker}`);

assert.ok(before.release.includes('14.4.08'), 'release final deve anunciar 14.4.08');
assert.ok(before.release.includes('automatic-safe'), 'política de atualização segura deve permanecer registrada');

for (const protectedPath of ['client/src/lib/pdfParser.ts', 'server/rosterParser.mjs', 'client/src/lib/canonicalRoster.ts', 'client/src/lib/financialRules.ts']) {
  assert.ok(!applySource.includes(`update('${protectedPath}'`), `patch visual não pode alterar motor protegido: ${protectedPath}`);
}

assert.ok(applySource.includes("next = patchBlock(next, 'function MenuDrawer('") || applySource.includes("patchBlock(next, 'function MenuDrawer('"), 'v14.3.43 deve continuar contendo a base do controle de localização');
const finalApply = spawnSync(process.execPath, [path.join(root, 'scripts/v14408/apply.mjs')], { cwd: root, encoding: 'utf8' });
assert.equal(finalApply.status, 0, finalApply.stderr || finalApply.stdout || 'reaplicação final v14.4.08 falhou');
for (const [key, relative] of Object.entries(paths)) {
  assert.equal(read(relative), before[key], `estado final v14.4.08 deve preservar a estabilidade v14.3.43 em ${relative}`);
}

console.log('v14.3.43 iPad premium stability preserved under final v14.4.08: contained touch layout, explicit Settings location, bearer-aware route preview, safe release reload, preserved service worker and protected engines validated.');
