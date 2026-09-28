import fs from 'node:fs';

const VERSION = '14.3.67';
const VERSION_CODE = 140367;

function update(path, transform) {
  if (!fs.existsSync(path)) throw new Error(`[v14367] Arquivo ausente: ${path}`);
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[v14367] Ponto não localizado: ${label}`);
  return source.replace(before, after);
}

update('client/src/lib/aimsParser.ts', (source) => {
  let next = source;
  next = replaceRequired(
    next,
    "'PFB','PIN','PMW'",
    "'PFB','PHB','PIN','PMW'",
    'PHB na lista de aeroportos AIMS',
  );
  next = replaceRequired(
    next,
    '/^(ASB|RES|HSB|HSBE|RCFI|CRM|CRMB|CRMBSB|CBF|EMER|MT|C\\d{2,3}F)$/',
    '/^(ASB|RES|HSB|HSBE|RCFI|CRM|CRMB|CRMBSB|CBF|EMER|MCK|MCK320|MCK_SS|MT|C\\d{2,3}F)$/',
    'MCK como atividade operacional de solo',
  );
  return next;
});

update('client/src/lib/airports.ts', (source) => {
  if (source.includes("PHB: 'Parnaíba'")) return source;
  return replaceRequired(source, "  PMW: 'Palmas',", "  PHB: 'Parnaíba',\n  PMW: 'Palmas',", 'cidade PHB');
});

// A release canônica precisa manter todas as superfícies de identidade na mesma versão.
// Isso evita que regressões de políticas antigas interpretem release.json novo como divergência.
update('package.json', (source) => {
  const data = JSON.parse(source);
  data.version = VERSION;
  data.description = `CrewCheck v${VERSION} - MCK ground training and PHB airport recognition`;
  return `${JSON.stringify(data, null, 2)}\n`;
});

update('client/src/pages/Home.tsx', (source) => source
  .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
  .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: MCK em solo e PHB/Parnaíba reconhecidos';`));

update('client/src/App.tsx', (source) => source
  .replace(/crewcheck_last_loaded_version',\s*'[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`)
  .replace(/crewcheck-client-cleanup:[^']+/g, `crewcheck-client-cleanup:${VERSION}`));

update('server.mjs', (source) => source.replace(/(app\s*:\s*'CrewCheck',\s*version\s*:\s*)'[^']+'/g, `$1'${VERSION}'`));
update('server/platform.mjs', (source) => source.replace(/(app\s*:\s*'CrewCheck',\s*version\s*:\s*)'[^']+'/g, `$1'${VERSION}'`));

// O APK/AAB preparado deve anunciar a mesma release do cliente Web.
// Alteramos somente identidade/versionamento; nenhuma regra operacional Android é tocada.
update('android-wrapper/app/build.gradle', (source) => source
  .replace(/versionCode\s+\d+/, `versionCode ${VERSION_CODE}`)
  .replace(/versionName\s+['"][^'"]+['"]/, `versionName "${VERSION}"`));

update('client/public/release.json', () => `${JSON.stringify({
  version: VERSION,
  channel: 'web',
  updatePolicy: 'automatic-safe',
  notes: 'Escala reconhece MCK como treinamento em solo e PHB como Parnaíba/PI.',
}, null, 2)}\n`);

// A regressão v14.3.48 protege a política de voz, não deve congelar release.json em 14.3.48.
// v14.3.57 já moderniza esse gate para currentVersion durante a preparação canônica.
// Mantemos compatibilidade apenas para árvores antigas em que o gate literal ainda exista.
update('scripts/regression-v14-3-48-elevenlabs-dual-voice.mjs', (source) => {
  const modern = "assert.ok(read('client/public/release.json').includes(currentVersion), 'release.json deve anunciar a versão atual');";
  if (source.includes(modern)) return source;
  const stale = "assert.ok(read('client/public/release.json').includes('14.3.48'), 'release.json deve anunciar v14.3.48');";
  const compatible = "const releaseVersion = String(JSON.parse(read('client/public/release.json'))?.version || '');\nassert.match(releaseVersion, /^\\d+\\.\\d+\\.\\d+$/, 'release.json deve anunciar uma versão semver válida');\nassert.ok(releaseVersion.localeCompare('14.3.48', undefined, { numeric: true, sensitivity: 'base' }) >= 0, 'release.json não pode regredir abaixo de v14.3.48');";
  if (source.includes(compatible)) return source;
  if (!source.includes(stale)) throw new Error('[v14367] Gate de release.json da regressão de voz não reconhecido.');
  return source.replace(stale, compatible);
});

console.log(`[v14367] CrewCheck ${VERSION}: MCK em solo e PHB/Parnaíba reconhecidos.`);
