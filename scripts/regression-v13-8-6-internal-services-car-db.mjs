import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [home, css, platformClient, databaseClient, server, platform, pkg, learning] = await Promise.all([
  readFile(new URL('../client/src/pages/Home.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../client/src/index.css', import.meta.url), 'utf8'),
  readFile(new URL('../client/src/lib/platformClient.ts', import.meta.url), 'utf8'),
  readFile(new URL('../client/src/lib/databaseClient.ts', import.meta.url), 'utf8'),
  readFile(new URL('../server.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../server/platform.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../package.json', import.meta.url), 'utf8'),
  readFile(new URL('../client/src/lib/financialStatementLearning.ts', import.meta.url), 'utf8'),
]);

const metadata = JSON.parse(pkg);
assert.match(metadata.version, /^13\.(?:8\.(?:[6-9]|[1-9][0-9]+)|9\.\d+)$/);
assert.equal(metadata.scripts['regression:v13.8.6:internal'], 'node scripts/regression-v13-8-6-internal-services-car-db.mjs');

for (const category of ['gym', 'hospital', 'pharmacy', 'laundry']) {
  assert.ok(home.includes(category + ':'), 'Categoria interna ausente no cliente: ' + category);
  assert.ok(server.includes(category + ':'), 'Categoria interna ausente no servidor: ' + category);
}
assert.ok(home.includes('/api/places/search?'));
assert.ok(server.includes("url.pathname === '/api/places/search'"));
assert.ok(home.includes('Ver no app'));
assert.ok(home.includes('O Google Maps é opcional'));
assert.ok(home.includes('cz-place-detail-card'));
assert.ok(home.includes('buildGoogleMapsEmbedDirectionsUrl(location, selectedDestination'));
assert.ok(!home.includes("openFitnessSearch("));

assert.ok(home.includes('SAÍDA PREVISTA'));
assert.ok(home.includes('Sair às'));
assert.ok(home.includes('Escolha o trajeto completo'));
assert.ok(!home.includes('<Clock/>Chegar<strong>{event.presentation}</strong>'));

for (const fragment of ['Nível / piso', 'Vaga', 'Ponto de referência', 'Observações', 'Rota a pé', 'WhatsApp', 'Telegram', 'Outros apps', 'Apagar marcação']) {
  assert.ok(home.includes(fragment), 'Meu Carro incompleto: ' + fragment);
}
assert.ok(home.includes('getParkingPosition'));
assert.ok(home.includes('saveParkingPosition'));
assert.ok(home.includes('deleteParkingPosition'));
assert.ok(platformClient.includes("'/api/platform/parking'"));
assert.ok(platform.includes("url.pathname === '/api/platform/parking'"));
assert.ok(platform.includes('crewcheck_platform_parking_positions'));

assert.ok(platform.includes('PLATFORM_CORE_TABLES'));
assert.ok(platform.includes('PLATFORM_OPTIONAL_TABLES'));
assert.ok(platform.includes('platformSchemaReport'));
assert.ok(platform.includes("url.pathname === '/api/platform/database/health'"));
assert.ok(platform.includes("code: 'DATABASE_OFFLINE'"));
assert.ok(!platform.includes("code: 'DATABASE_REQUIRED'"));
assert.ok(databaseClient.includes('/api/platform/database/health'));
assert.ok(databaseClient.includes('localOnly: true'));
assert.ok(platformClient.includes('LOCAL_STAYS_KEY'));
assert.ok(platformClient.includes('LOCAL_GYM_KEY'));
assert.ok(platformClient.includes('queued: true'));

assert.ok(home.includes("if (!autoCheckIn || category !== 'gym' || !navigator.geolocation) return;"));
assert.ok(learning.includes('derivedRate'));
assert.ok(learning.includes('statedRateMatchesTotal'));

for (const selector of ['.cz-brand-row', '.cz-place-category-tabs', '.cz-place-detail-card', '.cz-parking-form', '.cz-import-actions']) {
  assert.ok(css.includes(selector), 'Estilo premium ausente: ' + selector);
}
assert.ok(css.includes('CrewCheck v13.8.6'));
assert.ok(home.includes('Wellhub é um benefício corporativo que conecta empresas a academias parceiras; não é uma academia'));
assert.ok(css.includes('--cc1386-violet'));
assert.ok(css.includes('border-radius:34px'));

console.log('CrewCheck v13.8.6 internal services, car, departure and database regression OK');
