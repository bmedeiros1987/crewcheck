import fs from 'node:fs';

const path = 'scripts/v14342/route-policy.snippet';
if (!fs.existsSync(path)) throw new Error('[maps-runtime-probe] route policy ausente');
const source = fs.readFileSync(path, 'utf8');

function expect(value, message) {
  if (!value) throw new Error(`[maps-runtime-probe] ${message}`);
}

expect(source.includes("requestUrl.searchParams.get('probe') !== '1'"), 'probe deve ser opt-in e nunca rodar automaticamente');
expect(source.includes("probeAvailable: true"), 'status deve anunciar disponibilidade do probe sem executá-lo');
expect(source.includes("sanitizedMapsProbe('TomTom'"), 'TomTom deve ser medido separadamente');
expect(source.includes("sanitizedMapsProbe('Google Routes'"), 'Google Routes deve ser medido separadamente');
expect(source.includes("'auth_or_restriction'"), 'Google 401/403 deve ser classificado sem expor payload bruto');
expect(source.includes("failureClass: 'quota'"), 'quota deve ser distinguida de indisponibilidade genérica');
expect(source.includes('Number.isFinite(distanceMeters) && distanceMeters > 0'), 'rota só pode ser válida com distância real positiva');
expect(source.includes('Number.isFinite(durationSeconds) && durationSeconds > 0'), 'rota só pode ser válida com duração real positiva');
expect(!source.includes('runtimeProbe: {\n      executed: true,\n      origin:'), 'probe não deve devolver origem/endereço detalhado desnecessariamente');
expect(!source.includes('apiKey') && !source.includes('api_key'), 'contrato sanitizado não pode expor chaves');

console.log('[maps-runtime-probe] OK — probe Admin é explícito, sanitizado e exige rota real positiva.');
