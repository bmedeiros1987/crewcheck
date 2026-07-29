import fs from 'node:fs';

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`[v14.3.52] Arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
}

function expect(condition, message) {
  if (!condition) throw new Error(`[v14.3.52] ${message}`);
}

function versionAtLeast(actual, minimum) {
  const left = String(actual || '').split('.').map((value) => Number(value) || 0);
  const right = String(minimum || '').split('.').map((value) => Number(value) || 0);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if ((left[index] || 0) > (right[index] || 0)) return true;
    if ((left[index] || 0) < (right[index] || 0)) return false;
  }
  return true;
}

process.env.CREWCHECK_V14352_SKIP_APPLY = '1';
const transforms = await import('./v14352/apply.mjs');

const serverFixture = `function mapsServerKey() {
  return envAny(['GOOGLE_ROUTES_API_KEY', 'GOOGLE_MAPS_SERVER_KEY', 'GOOGLE_MAPS_API_KEY', 'VITE_GOOGLE_MAPS_API_KEY']);
}
function placesServerKey() {
  return envAny(['GOOGLE_PLACES_API_KEY', 'GOOGLE_PLACES_SERVER_KEY', 'GOOGLE_MAPS_SERVER_KEY', 'GOOGLE_MAPS_API_KEY', 'VITE_GOOGLE_MAPS_API_KEY']);
}
function tomtomServerKey() {
  return envAny(['TOMTOM_API_KEY']);
}
async function route() {
  const googleKey = mapsServerKey();
  const googleConfigured = Boolean(mapsServerKey());
  return { googleKey, googleConfigured };
}`;
const serverOnce = transforms.patchServerMaps(serverFixture);
const serverTwice = transforms.patchServerMaps(serverOnce);
expect(serverOnce === serverTwice, 'Separação das chaves do servidor não é idempotente.');
expect(serverOnce.includes('function googleRoutesServerKey()'), 'Chave exclusiva de Routes não foi criada.');
expect(serverOnce.includes('const googleKey = googleRoutesServerKey();'), 'Routes ainda usa a chave de geocodificação.');
expect(!serverOnce.includes('VITE_GOOGLE_MAPS_API_KEY'), 'Servidor ainda aceita chave pública VITE_.');

const envFixture = `# Maps
GOOGLE_MAPS_API_KEY=
GOOGLE_MAPS_SERVER_KEY=
TOMTOM_API_KEY=
OPENROUTESERVICE_API_KEY=
`;
const envOnce = transforms.patchMapsEnvironment(envFixture);
const envTwice = transforms.patchMapsEnvironment(envOnce);
expect(envOnce === envTwice, '.env de mapas não é idempotente.');
expect(envOnce.includes('GOOGLE_ROUTES_API_KEY='), 'Chave de Routes não foi documentada.');
expect(envOnce.includes('GOOGLE_PLACES_API_KEY='), 'Chave de Places não foi documentada.');
expect(envOnce.includes('VITE_GOOGLE_MAPS_API_KEY='), 'Chave pública de Embed/Static não foi documentada.');

const home = read('client/src/pages/Home.tsx');
const server = read('server.mjs');
const envExample = read('.env.example');
const applyChain = read('scripts/v139/apply.mjs');
const patch = read('scripts/v14352/apply.mjs');
const packageJson = JSON.parse(read('package.json'));

expect(
  home.includes("if (!key || !origin || !destination) return '';"),
  'Embed de rota ainda tenta iframe legado sem chave explícita.',
);
expect(
  home.includes("if (!key || !query) return '';"),
  'Embed de busca ainda tenta iframe legado sem chave explícita.',
);
expect(
  home.includes('data-maps-fallback="external-navigation"'),
  'Fallback explícito do Google Maps não foi aplicado.',
);
expect(
  home.includes('O planejamento continua ativo.'),
  'Fallback não preserva contexto operacional em pt-BR.',
);
expect(
  home.includes("route === null ? 'Atualizando…' : 'Consulte no Google Maps'"),
  'Atraso de trânsito ainda pode ficar indefinidamente em “Calculando”.',
);
expect(
  home.includes('Você ainda pode abrir o trajeto no Google Maps.'),
  'Falha de rede/autenticação não possui saída amigável.',
);
expect(
  !home.includes("route?.trafficDelayText || 'Calculando'"),
  'Texto prioritário antigo “Calculando” ainda está ativo.',
);

expect(server.includes('function googleRoutesServerKey()'), 'Servidor não separou a chave de Google Routes.');
expect(
  server.includes("return envAny(['GOOGLE_MAPS_SERVER_KEY', 'GOOGLE_MAPS_API_KEY']);"),
  'Geocodificação não usa chave server-only própria.',
);
expect(
  server.includes("return envAny(['GOOGLE_PLACES_API_KEY', 'GOOGLE_PLACES_SERVER_KEY', 'GOOGLE_MAPS_SERVER_KEY', 'GOOGLE_MAPS_API_KEY']);"),
  'Places não usa chave server-only própria.',
);
expect(!server.includes('VITE_GOOGLE_MAPS_API_KEY'), 'Servidor ainda referencia chave pública do navegador.');

for (const key of [
  'GOOGLE_ROUTES_API_KEY=',
  'GOOGLE_MAPS_SERVER_KEY=',
  'GOOGLE_PLACES_API_KEY=',
  'VITE_GOOGLE_MAPS_API_KEY=',
  'TOMTOM_API_KEY=',
]) {
  expect(envExample.includes(key), `.env.example não documenta ${key}`);
}

expect(
  applyChain.includes("await import('../v14352/apply.mjs');"),
  'v14.3.52 não está na preparação canônica.',
);
expect(
  versionAtLeast(packageJson.version, '14.3.52'),
  `Versão mínima esperada 14.3.52; recebida ${packageJson.version}.`,
);
expect(
  Boolean(packageJson.scripts?.['regression:v14.3.52:p0-maps-ptbr']),
  'Script de regressão v14.3.52 não registrado.',
);

for (const protectedPath of [
  'client/src/lib/pdfParser.ts',
  'client/src/lib/canonicalRoster.ts',
  'client/src/lib/rosterContinuity.ts',
  'client/src/lib/financialRules.ts',
  'client/src/lib/complianceEngine.ts',
]) {
  expect(
    !patch.includes(`update('${protectedPath}'`),
    `Patch não deve alterar motor protegido: ${protectedPath}.`,
  );
}

console.log('[v14.3.52] OK — chaves Google separadas, fallback de rota finito e textos prioritários em pt-BR.');
