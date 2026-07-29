import fs from 'node:fs';
import {
  loadFreshNearbyCurrentGeo,
  loadNearbyPlacesOrigin,
  saveNearbyPlacesOrigin,
} from '../client/src/lib/nearbyPlacesOrigin.ts';

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`[v14.3.55] Arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
}

function expect(condition, message) {
  if (!condition) throw new Error(`[v14.3.55] ${message}`);
}

function versionAtLeast(actual, expected) {
  const left = String(actual || '').split('.').map(Number);
  const right = String(expected || '').split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if ((left[index] || 0) > (right[index] || 0)) return true;
    if ((left[index] || 0) < (right[index] || 0)) return false;
  }
  return true;
}

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get(key, fallback = '') { return values.has(key) ? String(values.get(key)) : fallback; },
    set(key, value) { values.set(key, String(value)); },
    value(key) { return values.get(key); },
  };
}

const now = new Date('2026-07-29T15:00:00.000Z');
const legacyGyn = memoryStorage({
  'crewcheck:places-mode': 'layover',
  'crewcheck:places-location': 'Goiânia - GO',
});
const migrated = loadNearbyPlacesOrigin(legacyGyn, { now });
expect(migrated.mode === 'current', 'Origem legada sem carimbo continua em modo pernoite.');
expect(migrated.location === '', 'Goiânia legada não foi removida da origem da busca.');
expect(legacyGyn.value('crewcheck:places-location') === '', 'Storage antigo de Goiânia não foi limpo.');

const recentLayover = memoryStorage();
saveNearbyPlacesOrigin(recentLayover, 'layover', 'Hotel em Salvador/BA', new Date('2026-07-29T14:30:00.000Z'));
const preservedLayover = loadNearbyPlacesOrigin(recentLayover, { now });
expect(preservedLayover.mode === 'layover' && preservedLayover.location === 'Hotel em Salvador/BA', 'Pernoite escolhido recentemente deixou de ser respeitado.');

const expiredLayover = memoryStorage();
saveNearbyPlacesOrigin(expiredLayover, 'layover', 'Goiânia - GO', new Date('2026-07-27T10:00:00.000Z'));
const expiredResult = loadNearbyPlacesOrigin(expiredLayover, { now });
expect(expiredResult.mode === 'current' && expiredResult.location === '', 'Pernoite vencido continua influenciando Farmácias.');

const explicitCurrent = memoryStorage({
  'crewcheck:places-mode': 'layover',
  'crewcheck:places-location': 'Goiânia - GO',
});
saveNearbyPlacesOrigin(explicitCurrent, 'current', '', now);
expect(explicitCurrent.value('crewcheck:places-mode') === 'current', 'Seleção da posição atual não ficou persistida.');
expect(explicitCurrent.value('crewcheck:places-location') === '', 'Seleção atual não limpou a cidade anterior.');

const freshGeo = memoryStorage({
  crewcheck_last_geo: '-15.793889,-47.882778',
  crewcheck_last_geo_meta: JSON.stringify({
    lat: -15.793889,
    lng: -47.882778,
    accuracy: 12,
    capturedAt: '2026-07-29T14:50:00.000Z',
  }),
});
expect(loadFreshNearbyCurrentGeo(freshGeo, { now })?.lat === -15.793889, 'GPS recente e coerente não foi aceito.');
const geoWithoutTimestamp = memoryStorage({ crewcheck_last_geo: '-16.686900,-49.264800' });
expect(loadFreshNearbyCurrentGeo(geoWithoutTimestamp, { now }) === null, 'Coordenada antiga sem horário ainda é enviada ao Concierge.');

const home = read('client/src/pages/Home.tsx');
const server = read('server.mjs');
const applyChain = read('scripts/v139/apply.mjs');
const patch = read('scripts/v14355/apply.mjs');
const packageJson = JSON.parse(read('package.json'));

expect(home.includes("from '@/lib/nearbyPlacesOrigin';"), 'Home não usa a política canônica de origem.');
expect(home.includes('const currentLocation = loadFreshNearbyCurrentGeo(storage);'), 'Concierge no app não lê o GPS fresco.');
expect(home.includes('latitude: currentLocation.lat'), 'Latitude atual não é enviada ao Concierge.');
expect(home.includes("saveNearbyPlacesOrigin(storage, 'current');"), 'Botão de localização atual não persiste a escolha.');
expect(home.includes("chooseLocationMode('layover')"), 'Escolha de pernoite não recebe carimbo explícito.');
expect(!home.includes("storage.set('crewcheck:places-location', '');"), 'Limpeza direta antiga ainda ignora o modo canônico.');

expect(server.includes('const canonicalLocation = normalizeConciergeLocationV14335({'), 'Servidor não normaliza a posição enviada pelo app.');
expect(server.includes('body.location = canonicalLocation;'), 'Servidor não substitui cidade/rótulo antigo pela posição normalizada.');
expect(server.includes("source: 'app'"), 'Servidor não identifica a origem da posição atual.');
expect(server.indexOf('body.location = canonicalLocation;') < server.indexOf('{ ...body.location, source:'), 'Localização é salva antes de remover a cidade antiga.');
expect(applyChain.includes("await import('../v14355/apply.mjs');"), 'v14.3.55 não está na preparação canônica.');
expect(versionAtLeast(packageJson.version, '14.3.55'), `Versão atual ${packageJson.version} é anterior à 14.3.55.`);
expect(Boolean(packageJson.scripts?.['regression:v14.3.55:nearby-location']), 'Regressão v14.3.55 não foi registrada.');

for (const protectedPath of [
  'client/src/lib/pdfParser.ts',
  'client/src/lib/canonicalRoster.ts',
  'client/src/lib/financialRules.ts',
  'client/src/lib/complianceEngine.ts',
]) {
  expect(!patch.includes(`update('${protectedPath}'`), `Patch alterou motor protegido: ${protectedPath}.`);
}

console.log('[v14.3.55] OK — Farmácias, Locais próximos e Concierge usam a posição atual sem Goiânia persistida.');
