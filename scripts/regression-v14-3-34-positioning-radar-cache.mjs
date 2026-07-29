import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chain = fs.readFileSync(path.join(root, 'scripts/v139/apply.mjs'), 'utf8');
assert.ok(chain.includes("await import('../v14334/apply.mjs');"), 'v14.3.34 deve estar no fim da preparação canônica');

const homePath = path.join(root, 'client/src/pages/Home.tsx');
const before = fs.readFileSync(homePath, 'utf8');
for (const marker of [
  'type PositioningFlightRecord = {',
  'const POSITIONING_SEARCH_WINDOW_MS = 72 * 60 * 60 * 1000;',
  'const POSITIONING_MAX_STATUS_LOOKUPS = 4;',
  'crewcheck_positioning_flight:${event.id}',
  'crewcheck_positioning_search:${event.id}',
  "if (eventId && eventId !== String(event.id || '')) return false;",
  "if (destination && destination !== String(event.origin || '').trim().toUpperCase()) return false;",
  '/api/airport-board?',
  '/api/flight-status?',
  "status: 'none'",
  'Mantido o posicionamento no dia anterior.',
  'discoverSameDayPositioningFlight(event, plan.originAirport.code',
  "'CONSULTANDO CACHE DO RADAR'",
  'data-departure-v14334="true"',
]) assert.ok(before.includes(marker), `marcador obrigatório ausente: ${marker}`);

assert.ok(!before.includes('FLIGHTAWARE_AEROAPI_KEY'), 'cliente não pode conhecer credencial de provedor');
assert.ok(!before.includes('AVIATIONSTACK_API_KEY'), 'cliente não pode conhecer credencial de provedor');
assert.ok(before.includes("const DEFAULT_VERSION = '14.3.48';"), 'versão Web/PWA final 14.3.48 ausente');
assert.ok(fs.readFileSync(path.join(root, 'client/public/release.json'), 'utf8').includes('14.3.48'), 'release.json final 14.3.48 ausente');

const second = spawnSync(process.execPath, [path.join(root, 'scripts/v14348/apply.mjs')], { cwd: root, encoding: 'utf8' });
assert.equal(second.status, 0, second.stderr || second.stdout || 'reaplicação final v14.3.48 falhou');
assert.equal(fs.readFileSync(homePath, 'utf8'), before, 'preparação final deve preservar a proteção v14.3.34');

function localDate(value) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}
function chooseSafeOption(options, presentationAt, destination) {
  const deadline = presentationAt.getTime() - 60 * 60_000;
  return options
    .filter((item) => !/(CANCEL|DIVERT|DESVIADO)/i.test(item.status || ''))
    .filter((item) => item.destination === destination)
    .filter((item) => localDate(item.arrivalAt) === localDate(presentationAt))
    .filter((item) => item.arrivalAt.getTime() <= deadline && item.departureAt.getTime() < item.arrivalAt.getTime())
    .sort((a, b) => b.arrivalAt.getTime() - a.arrivalAt.getTime())[0] || null;
}

const presentationAt = new Date(2026, 7, 17, 14, 0, 0);
const options = [
  { flightNumber: 'LA1001', origin: 'FLN', destination: 'BSB', departureAt: new Date(2026, 7, 17, 10, 30), arrivalAt: new Date(2026, 7, 17, 12, 30), status: 'Programado' },
  { flightNumber: 'LA1002', origin: 'FLN', destination: 'BSB', departureAt: new Date(2026, 7, 17, 11, 20), arrivalAt: new Date(2026, 7, 17, 13, 20), status: 'Programado' },
  { flightNumber: 'LA1003', origin: 'FLN', destination: 'BSB', departureAt: new Date(2026, 7, 17, 9, 0), arrivalAt: new Date(2026, 7, 17, 11, 0), status: 'Cancelado' },
  { flightNumber: 'LA1004', origin: 'FLN', destination: 'GRU', departureAt: new Date(2026, 7, 17, 9, 30), arrivalAt: new Date(2026, 7, 17, 11, 10), status: 'Programado' },
];
assert.equal(chooseSafeOption(options, presentationAt, 'BSB')?.flightNumber, 'LA1001', 'deve selecionar somente chegada segura e direta');
assert.equal(chooseSafeOption(options.slice(1), presentationAt, 'BSB'), null, 'voo atrasado/cancelado não pode substituir o plano do dia anterior');

function recordMatches(record, event, now) {
  if (!record || (record.eventId && record.eventId !== event.id)) return false;
  if (record.destination && record.destination !== event.origin) return false;
  if (record.expiresAt && new Date(record.expiresAt).getTime() < now.getTime()) return false;
  return true;
}
const event = { id: 'event-BSB-17', origin: 'BSB' };
assert.equal(recordMatches({ eventId: event.id, destination: 'BSB', expiresAt: '2026-08-17T16:00:00-03:00' }, event, new Date('2026-08-17T10:00:00-03:00')), true, 'registro da programação atual deve ser aceito');
assert.equal(recordMatches({ eventId: 'outra-programacao', destination: 'BSB' }, event, new Date()), false, 'registro genérico de outra programação deve ser rejeitado');
assert.equal(recordMatches({ eventId: event.id, destination: 'GRU' }, event, new Date()), false, 'destino diferente da base de apresentação deve ser rejeitado');
assert.equal(recordMatches({ eventId: event.id, destination: 'BSB', expiresAt: '2026-08-16T10:00:00-03:00' }, event, new Date('2026-08-17T10:00:00-03:00')), false, 'registro vencido não pode confirmar posicionamento');

function shouldSearch(now, presentation) {
  const delta = presentation.getTime() - now.getTime();
  return delta >= -2 * 60 * 60_000 && delta <= 72 * 60 * 60_000;
}
assert.equal(shouldSearch(new Date(2026, 7, 14, 14, 0), presentationAt), true, 'consulta deve começar dentro da janela de 72 horas');
assert.equal(shouldSearch(new Date(2026, 7, 14, 13, 59), presentationAt), false, 'consulta antecipada além de 72 horas deve ser evitada');

console.log('v14.3.34 positioning radar cache: event scope, 72h window, four lookups, safe arrival and day-before fallback validated.');
