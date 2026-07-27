import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  conciergeLocationState,
  normalizeConciergeLocation,
  nearestConciergeLocationLabel,
  filterConciergePlacesByLocation,
  CONCIERGE_LOCATION_TTL_MS,
} from '../server/v14335/concierge-location.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chain = fs.readFileSync(path.join(root, 'scripts/v139/apply.mjs'), 'utf8');
assert.ok(chain.includes("await import('../v14335/apply.mjs');"), 'v14.3.35 deve estar no fim da preparação canônica');
assert.equal(CONCIERGE_LOCATION_TTL_MS, 6 * 60 * 60 * 1000, 'localização deve expirar em 6 horas');

const airportPoints = {
  FLN: { lat: -27.6705, lon: -48.5525, city: 'Florianópolis' },
  GYN: { lat: -16.6319, lon: -49.2207, city: 'Goiânia' },
};
const now = new Date('2026-07-27T12:00:00-03:00');
const florianopolis = { latitude: -27.5954, longitude: -48.5480, updatedAt: now.toISOString(), source: 'telegram' };
const nearest = nearestConciergeLocationLabel(florianopolis, airportPoints);
assert.equal(nearest.airport, 'FLN', 'coordenadas de Florianópolis devem usar FLN como referência próxima');
assert.equal(nearest.label, 'Florianópolis/SC', 'fallback local deve identificar Florianópolis/SC');

const normalized = normalizeConciergeLocation(florianopolis, { now, airportPoints });
assert.equal(normalized?.label, 'Florianópolis/SC', 'localização normalizada deve exibir Florianópolis/SC');
assert.equal(normalized?.source, 'telegram', 'fonte deve permanecer Telegram');
const fresh = conciergeLocationState(normalized, { now: new Date(now.getTime() + 5 * 60 * 60_000), airportPoints });
assert.equal(fresh.fresh, true, 'localização com 5 horas deve permanecer válida');
const stale = conciergeLocationState(normalized, { now: new Date(now.getTime() + 6 * 60 * 60_000 + 1), airportPoints });
assert.equal(stale.fresh, false, 'localização acima de 6 horas deve expirar');
assert.match(stale.message, /expirou/i, 'localização vencida deve pedir novo compartilhamento');

const places = [
  { name: 'Farmácia local', location: { latitude: -27.596, longitude: -48.549 } },
  { name: 'Farmácia distante', location: { latitude: -16.68, longitude: -49.25 } },
];
const filtered = filterConciergePlacesByLocation(places, normalized);
assert.deepEqual(filtered.map((place) => place.name), ['Farmácia local'], 'resultado de Goiânia deve ser descartado quando a localização é Florianópolis');
assert.ok(filtered[0].distanceKm < 1, 'farmácia local deve permanecer próxima');

const serverPath = path.join(root, 'server.mjs');
const homePath = path.join(root, 'client/src/pages/Home.tsx');
const serverBefore = fs.readFileSync(serverPath, 'utf8');
const homeBefore = fs.readFileSync(homePath, 'utf8');
for (const marker of [
  "from './server/v14335/concierge-location.mjs';",
  'function conciergeLocationContextV14335(',
  'function conciergeLocationLineV14335(',
  'filterConciergePlacesByLocationV14335(places, freshLocation)',
  'async function conciergePharmaciesReply(snapshot)',
  'A busca usa somente a localização recente enviada no Telegram',
  'Localização atualizada: ${normalized.label}.',
  'Depois desse período pedirei um novo compartilhamento',
  'locationMaxAgeHours: 6',
  'return conciergePharmaciesReply(snapshot);',
  "['ASB', 'HSB', 'HSBE', 'MT', 'CRM', 'CBF', 'EMER']",
]) assert.ok(serverBefore.includes(marker), `proteção de localização ausente: ${marker}`);

assert.ok(!serverBefore.includes("snapshot?.preferences?.location ? 'Localização recebida."), 'resposta antiga não pode aceitar localização sem validade');
assert.ok(serverBefore.includes("textQuery: freshLocation ? String(query || '').trim()"), 'coordenadas recentes devem retirar cidade antiga do texto da busca');
assert.ok(homeBefore.includes("const DEFAULT_VERSION = '14.3.35';"), 'versão web 14.3.35 ausente');
assert.ok(fs.readFileSync(path.join(root, 'client/public/release.json'), 'utf8').includes('14.3.35'), 'release.json 14.3.35 ausente');

const second = spawnSync(process.execPath, [path.join(root, 'scripts/v14335/apply.mjs')], { cwd: root, encoding: 'utf8' });
assert.equal(second.status, 0, second.stderr || second.stdout || 'segunda aplicação v14.3.35 falhou');
assert.equal(fs.readFileSync(serverPath, 'utf8'), serverBefore, 'patch de localização deve ser idempotente no servidor');
assert.equal(fs.readFileSync(homePath, 'utf8'), homeBefore, 'patch de versão deve ser idempotente no cliente');

console.log('v14.3.35 Telegram real location: Florianópolis/SC, TTL 6h, stale guard, pharmacy radius and no Goiânia fallback validated.');
