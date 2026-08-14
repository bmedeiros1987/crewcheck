import assert from 'node:assert/strict';
import fs from 'node:fs';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const applySource = fs.readFileSync('scripts/p0-maps-embed-preview/apply.mjs', 'utf8');
const chain = fs.readFileSync('scripts/v139/apply.mjs', 'utf8');

const start = home.indexOf('function buildGoogleMapsEmbedDirectionsUrl(');
const end = home.indexOf('function buildGoogleMapsEmbedSearchUrl(', start);
assert.ok(start >= 0 && end > start, 'helper de direções embarcadas deve existir');
const helper = home.slice(start, end);

assert.ok(chain.includes("await import('../p0-maps-embed-preview/apply.mjs');"), 'hardening deve participar da preparação canônica');
assert.ok(helper.includes('https://www.google.com/maps?output=embed'), 'prévia deve usar incorporação de direções compatível sem chave');
assert.ok(helper.includes('saddr=') && helper.includes('daddr='), 'origem e destino devem permanecer explícitos');
assert.ok(helper.includes("travelmode === 'walking'") && helper.includes("travelmode === 'transit'"), 'modos terrestre, a pé e transporte público devem permanecer mapeados');
assert.ok(!helper.includes('/maps/embed/v1/directions?key='), 'prévia não pode depender da chave rejeitada do Embed API');
assert.ok(!helper.includes('mapsBrowserKey()'), 'prévia de direções não deve ser bloqueada por configuração de chave browser');
assert.ok(home.includes('buildGoogleMapsDirectionsUrl(origin, destination, mapsMode)'), 'CTA externo do Google Maps deve ser preservado');
assert.ok(home.includes('fetchRoutePreviewInfo(origin, destination, mapsMode)'), 'snapshot real TomTom/Google Routes deve permanecer independente do mapa');
assert.ok(!applySource.includes('pdfParser') && !applySource.includes('canonicalRoster') && !applySource.includes('financialRules') && !applySource.includes('rosterParser'), 'patch visual não pode tocar motores protegidos');

console.log('P0 Maps embedded preview regression passed: keyless route map, explicit endpoints, real route snapshot and protected engines preserved.');
