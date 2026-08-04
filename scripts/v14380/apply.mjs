import fs from 'node:fs';

const VERSION = '14.3.80';
const HOME = 'client/src/pages/Home.tsx';

function update(filePath, transform, { optional = false } = {}) {
  if (!fs.existsSync(filePath)) {
    if (optional) return;
    throw new Error(`[v14380] Arquivo ausente: ${filePath}`);
  }
  const before = fs.readFileSync(filePath, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(filePath, after, 'utf8');
}

export function patchRosterCacheIntegrityV14380(source) {
  let patched = source;
  // Releases posteriores podem avançar o schema. O patch 14.3.80 continua na
  // cadeia canônica, portanto deve reconhecer um marcador P0 mais novo sem
  // reinserir a constante antiga ou rebaixar o cache.
  if (!/const ROSTER_CACHE_SCHEMA = 'p0-[^']+';/.test(patched)) {
    const needle = "function loadRoster(): BundleState {";
    if (!patched.includes(needle)) throw new Error('[v14380] loadRoster não localizado');
    patched = patched.replace(needle, "const ROSTER_CACHE_SCHEMA = 'p0-date-integrity-v1';\n\nfunction loadRoster(): BundleState {");
  }

  const oldParse = "      const payload = JSON.parse(raw);\n      const roster = payload?.roster ? payload.roster as CrewRoster : payload as CrewRoster;";
  const newParse = "      const payload = JSON.parse(raw);\n      // P0 fail-closed: versões anteriores serializavam o resultado do parser sem\n      // um marcador de compatibilidade. Depois de atualizar o cliente, esse JSON\n      // podia continuar exibindo uma escala produzida por lógica antiga.\n      if (payload?.cacheSchema !== ROSTER_CACHE_SCHEMA) continue;\n      const roster = payload?.roster ? payload.roster as CrewRoster : payload as CrewRoster;";
  if (!patched.includes(newParse)) {
    if (!patched.includes(oldParse)) throw new Error('[v14380] leitura do cache de roster não localizada');
    patched = patched.replace(oldParse, newParse);
  }

  const oldSession = "    sessionStorage.setItem('crewcheck_roster', JSON.stringify(roster));";
  const newSession = "    sessionStorage.setItem('crewcheck_roster', JSON.stringify({ roster, cacheSchema: ROSTER_CACHE_SCHEMA, sourceFileName: source, updatedAt: new Date().toISOString() }));";
  if (!patched.includes(newSession)) {
    if (!patched.includes(oldSession)) throw new Error('[v14380] persistência de sessão da escala não localizada');
    patched = patched.replace(oldSession, newSession);
  }

  const oldBundle = "    localStorage.setItem('crewcheck_latest_roster_bundle', JSON.stringify({ roster, compliance, sourceFileName: source, updatedAt: new Date().toISOString(), source: 'crewcheck-v13.8.0-canonical' }));";
  const newBundle = "    localStorage.setItem('crewcheck_latest_roster_bundle', JSON.stringify({ roster, compliance, sourceFileName: source, updatedAt: new Date().toISOString(), source: 'crewcheck-v14.3.80-p0-date-integrity', cacheSchema: ROSTER_CACHE_SCHEMA }));";
  const hasForwardCompatibleBundle = /localStorage\.setItem\('crewcheck_latest_roster_bundle',[\s\S]*?source: 'crewcheck-v14\.3\.\d+-p0-[^']+', cacheSchema: ROSTER_CACHE_SCHEMA/.test(patched);
  if (!patched.includes(newBundle) && !hasForwardCompatibleBundle) {
    if (!patched.includes(oldBundle)) throw new Error('[v14380] bundle persistente da escala não localizado');
    patched = patched.replace(oldBundle, newBundle);
  }

  const oldLast = "    localStorage.setItem('crewcheck_last_roster', JSON.stringify(roster));";
  const newLast = "    localStorage.setItem('crewcheck_last_roster', JSON.stringify({ roster, cacheSchema: ROSTER_CACHE_SCHEMA, sourceFileName: source, updatedAt: new Date().toISOString() }));";
  if (!patched.includes(newLast)) {
    if (!patched.includes(oldLast)) throw new Error('[v14380] fallback persistente da escala não localizado');
    patched = patched.replace(oldLast, newLast);
  }

  return patched;
}

export function patchRuntimeVersionV14380(source) {
  return source.replace(/(app\s*:\s*'CrewCheck',\s*version\s*:\s*)'[^']+'/g, `$1'${VERSION}'`);
}

if (process.env.CREWCHECK_V14380_SKIP_APPLY !== '1') {
  update(HOME, patchRosterCacheIntegrityV14380);
  update('client/src/pages/Home.tsx', (source) => source.replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`));
  update('client/public/release.json', () => `${JSON.stringify({ version: VERSION, channel: 'web', updatePolicy: 'automatic-safe', notes: 'P0: caches de escala de versões anteriores são descartados para impedir programação antiga após atualização.' }, null, 2)}\n`, { optional: true });
  update('package.json', (source) => {
    const data = JSON.parse(source);
    data.version = VERSION;
    data.description = `CrewCheck v${VERSION} - P0 roster date integrity`;
    data.scripts ||= {};
    data.scripts['regression:p0:roster-date-integrity'] = 'node scripts/v139/apply.mjs && node scripts/regression-p0-roster-date-integrity.mjs';
    return `${JSON.stringify(data, null, 2)}\n`;
  });
  update('android-wrapper/app/build.gradle', (source) => source.replace(/versionCode\s+\d+/, 'versionCode 140380').replace(/versionName\s+["'][^"']+["']/, `versionName "${VERSION}"`), { optional: true });
  update('server.mjs', patchRuntimeVersionV14380, { optional: true });
  update('server/platform.mjs', patchRuntimeVersionV14380, { optional: true });
  console.log(`[v14380] CrewCheck ${VERSION}: P0 fail-closed de cache de escala aplicado.`);
}
