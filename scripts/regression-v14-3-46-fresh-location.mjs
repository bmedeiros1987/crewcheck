import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const paths = {
  home: 'client/src/pages/Home.tsx',
  server: 'server.mjs',
  serverIndex: 'server/v139/index.mjs',
  telegramLocation: 'server/v14316/telegramLocation.mjs',
  runtime: 'client/src/lib/crewcheckPremiumRuntime.ts',
  release: 'client/public/release.json',
  pkg: 'package.json',
};
const before = Object.fromEntries(Object.entries(paths).map(([key, value]) => [key, read(value)]));
const chain = read('scripts/v139/apply.mjs');
const applySource = read('scripts/v14346/apply.mjs');
const freshSnippet = read('scripts/v14346/fresh-location.snippet');
const telegramHandlerSnippet = read('scripts/v14335/location-handler.snippet');
const locationAccessSnippet = read('scripts/v14343/location-access.snippet');

const v14345Index = chain.indexOf("await import('../v14345/apply.mjs');");
const v14346Index = chain.indexOf("await import('../v14346/apply.mjs');");
assert.ok(v14345Index >= 0, 'correção da escala v14.3.45 deve permanecer na cadeia');
assert.ok(v14346Index > v14345Index, 'localização v14.3.46 deve suceder a escala sem alterá-la');
assert.ok(chain.trimEnd().endsWith("await import('../v14346/apply.mjs');"), 'v14.3.46 deve encerrar a preparação canônica');

for (const marker of [
  'CURRENT_GEO_MAX_AGE_MS = 30 * 60_000',
  "CURRENT_GEO_META_KEY = 'crewcheck_last_geo_meta'",
  'requestNativeCurrentGeoPosition()',
  'native.requestCurrentLocation(callbackId)',
  'maximumAge: 0',
  'loadFreshCurrentGeo()',
  "storage.set('crewcheck_last_geo', '')",
]) assert.ok(freshSnippet.includes(marker), `proteção de posição fresca ausente: ${marker}`);
assert.ok(!/-16\.(?:6|7)|-49\.(?:2|3)/.test(freshSnippet), 'captura atual não pode conter fallback geográfico de Goiânia');

for (const marker of [
  "const DEFAULT_VERSION = '14.3.46';",
  'function loadFreshCurrentGeo(',
  'const saved = loadFreshCurrentGeo();',
  "source: 'browser-watch'",
  "window.addEventListener('crewcheck:location-updated'",
]) assert.ok(before.home.includes(marker), `Home sem atualização fresca: ${marker}`);
assert.ok(!before.home.includes(`const saved = storage.get('crewcheck_last_geo', '');\n  if (saved) return saved;`), 'Saída Inteligente não pode reutilizar coordenada sem validade');
assert.ok(locationAccessSnippet.includes("storage.set('crewcheck_manual_route_origin', '')"), 'atualizar GPS deve remover origem manual antiga');
assert.ok(locationAccessSnippet.includes('reverseGeocodePosition(position.lat, position.lng)'), 'nova posição deve atualizar também o rótulo da cidade');

assert.ok(telegramHandlerSnippet.includes('{ silent = false }'), 'handler canônico deve aceitar atualização silenciosa');
assert.ok(telegramHandlerSnippet.includes('if (!silent)'), 'edições de localização ao vivo não podem gerar spam');
assert.ok(before.server.includes('const snapshotHandled = await handleTelegramLocation('), 'Telegram deve atualizar o snapshot canônico primeiro');
assert.ok(before.server.includes('{ silentLocation: true }'), 'persistência auxiliar deve ocorrer sem mensagem duplicada');
assert.ok(!before.server.includes('message?.location && await handleV139Telegram(update, sendTelegramMessage)) return true'), 'handler auxiliar não pode interceptar a localização antes do snapshot');
assert.ok(before.serverIndex.includes('options = {}'), 'ponte Telegram deve aceitar opções');
assert.ok(before.serverIndex.includes('silent: Boolean(options?.silentLocation)'), 'ponte Telegram deve propagar o modo silencioso');
assert.ok(before.telegramLocation.includes('if (options.silent) return true;'), 'persistência auxiliar deve silenciar a confirmação duplicada');

assert.ok(before.runtime.includes("version: '14.3.46'"), 'runtime deve anunciar v14.3.46');
assert.ok(before.runtime.includes("localStorage.setItem('crewcheck_last_geo_meta'"), 'runtime deve registrar horário e precisão da posição');
assert.ok(before.release.includes('14.3.46'), 'release final deve anunciar v14.3.46');
assert.equal(JSON.parse(before.pkg).version, '14.3.46', 'package deve anunciar v14.3.46');

for (const protectedPath of [
  'client/src/lib/pdfParser.ts',
  'server/rosterParser.mjs',
  'client/src/lib/canonicalRoster.ts',
  'client/src/lib/financialRules.ts',
  'client/src/lib/regulatoryEngine.ts',
]) assert.ok(!applySource.includes(`update('${protectedPath}'`), `hotfix de localização não pode alterar motor protegido: ${protectedPath}`);

const second = spawnSync(process.execPath, [path.join(root, 'scripts/v14346/apply.mjs')], { cwd: root, encoding: 'utf8' });
assert.equal(second.status, 0, second.stderr || second.stdout || 'segunda aplicação v14.3.46 falhou');
for (const [key, relative] of Object.entries(paths)) {
  assert.equal(read(relative), before[key], `v14.3.46 deve ser idempotente em ${relative}`);
}

console.log('v14.3.46 fresh location: no-cache Web/Android GPS, 30-minute persisted-coordinate TTL, manual Goiânia reset, canonical Telegram synchronization, silent live updates and protected engines validated.');
