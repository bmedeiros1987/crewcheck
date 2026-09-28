import assert from 'node:assert/strict';
import fs from 'node:fs';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');

assert.match(home, /type RadarSnapshot = \{[\s\S]*operationalDate\?: string;[\s\S]*origin\?: string;[\s\S]*destination\?: string;/, 'snapshot deve carregar identidade operacional completa');
assert.match(home, /function radarSnapshotMatchesEvent[\s\S]*snapshot\.flight[\s\S]*event\.flightNumber[\s\S]*snapshot\.operationalDate[\s\S]*radarEventOperationalDate\(event\)[\s\S]*snapshot\.origin[\s\S]*event\.origin[\s\S]*snapshot\.destination[\s\S]*event\.destination/, 'Radar deve exigir voo, data, origem e destino');
assert.match(home, /!radarSnapshotMatchesEvent\(parsed, event\)\) return null;/, 'cache incompatível deve falhar fechado');
assert.match(home, /flight: payload\.flight \|\| event\.flightNumber,[\s\S]*operationalDate: radarEventOperationalDate\(event\),[\s\S]*origin: event\.origin,[\s\S]*destination: event\.destination/, 'snapshot novo deve ser vinculado ao evento solicitado');

console.log('[v14.3.83] OK — portão/status só atravessam o cache quando a identidade operacional coincide.');
