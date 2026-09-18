import fs from 'node:fs';
import assert from 'node:assert/strict';
import { matchesCiriumRouteCodes } from './v14409/route-match-hardening.mjs';

assert.equal(matchesCiriumRouteCodes(
  { departureAirportFsCode: 'GRU', arrivalAirportFsCode: 'BSB' },
  { origin: 'GRU', destination: 'BSB' },
), true, 'rota exata deve ser aceita');

assert.equal(matchesCiriumRouteCodes(
  { departureAirportFsCode: 'GRU', arrivalAirportFsCode: 'GIG' },
  { origin: 'GRU', destination: 'BSB' },
), false, 'mesmo número em destino diferente deve ser rejeitado');

assert.equal(matchesCiriumRouteCodes(
  { departureAirportFsCode: 'CGH', arrivalAirportFsCode: 'BSB' },
  { origin: 'GRU', destination: 'BSB' },
), false, 'origem divergente deve ser rejeitada');

assert.equal(matchesCiriumRouteCodes(
  { departureAirportFsCode: 'GRU', arrivalAirportFsCode: '' },
  { origin: 'GRU', destination: 'BSB' },
), false, 'campo de destino ausente não satisfaz filtro explícito');

assert.equal(matchesCiriumRouteCodes(
  { departureAirportFsCode: 'GRU', arrivalAirportFsCode: 'BSB' },
  {},
), true, 'sem filtro de rota a ocorrência continua elegível');

const server = fs.readFileSync('server.mjs', 'utf8');
const start = server.indexOf('async function providerCirium(');
const end = server.indexOf('\nfunction configuredProviders()', start + 1);
assert.ok(start >= 0 && end > start, 'providerCirium materializado no server.mjs');
const scope = server.slice(start, end);

assert.ok(scope.includes('const routeFiltered = Boolean(wantedOrigin || wantedDestination);'), 'filtro explícito de rota existe');
assert.ok(scope.includes('return (!wantedOrigin || departure === wantedOrigin) && (!wantedDestination || arrival === wantedDestination);'), 'match exige igualdade quando filtro existe');
assert.ok(scope.includes("const row = routeFiltered ? routeMatch : (rows.find((item) => item?.status !== 'C') || rows[0]);"), 'fallback arbitrário só existe quando nenhuma rota foi solicitada');
assert.ok(!scope.includes('!departure || departure === wantedOrigin'), 'origem ausente não pode mais satisfazer filtro');
assert.ok(!scope.includes('!arrival || arrival === wantedDestination'), 'destino ausente não pode mais satisfazer filtro');
assert.ok(!scope.includes('const row = routeMatch || rows.find'), 'fallback inseguro antigo foi removido');

console.log('CrewCheck v14.4.09 Cirium route-match fail-closed regression OK');
