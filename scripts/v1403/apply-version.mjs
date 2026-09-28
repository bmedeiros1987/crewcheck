import fs from 'node:fs';

const VERSION = '14.0.4';
const VERSION_CODE = '140004';
const read = (path) => fs.readFileSync(path, 'utf8');
const write = (path, content) => fs.writeFileSync(path, content, 'utf8');

for (const metadataPath of ['package.json', 'package-lock.json']) {
  if (!fs.existsSync(metadataPath)) continue;
  const metadata = JSON.parse(read(metadataPath));
  metadata.version = VERSION;
  if (metadataPath === 'package.json') {
    metadata.name = 'crewcheck-v14-0-4-telegram-natural-intents-grammar';
    metadata.description = 'CrewCheck v14.0.4 - Telegram com perguntas naturais, gramática revisada e saída inteligente protegida';
    metadata.scripts = metadata.scripts || {};
    metadata.scripts['regression:v14.0.3:telegram-human'] = 'node scripts/regression-v14-0-3-telegram-human-concierge.mjs';
    metadata.scripts['regression:v14.0.4:telegram-language'] = 'node scripts/regression-v14-0-4-telegram-language.mjs';
  }
  if (metadata.packages?.['']) {
    metadata.packages[''].name = 'crewcheck-v14-0-4-telegram-natural-intents-grammar';
    metadata.packages[''].version = VERSION;
  }
  write(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
}

const homePath = 'client/src/pages/Home.tsx';
if (fs.existsSync(homePath)) {
  let home = read(homePath);
  home = home.replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`);
  home = home.replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, "const CREWCHECK_UI_CORE_NOTE = 'v14.0.4: Telegram com linguagem natural, gramática revisada e saída inteligente protegida';");
  write(homePath, home);
}

const manifestPath = 'client/public/manifest.json';
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(read(manifestPath));
  manifest.version = VERSION;
  const startUrl = String(manifest.start_url || '/');
  manifest.start_url = /([?&]v=)[^&]+/.test(startUrl)
    ? startUrl.replace(/([?&]v=)[^&]+/, `$1${VERSION}`)
    : `${startUrl}${startUrl.includes('?') ? '&' : '?'}v=${VERSION}`;
  write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

const androidPath = 'android-wrapper/app/build.gradle';
if (fs.existsSync(androidPath)) {
  let android = read(androidPath);
  android = android.replace(/versionCode\s+\d+\b/, `versionCode ${VERSION_CODE}`);
  android = android.replace(/versionName\s+'[^']+'/, `versionName '${VERSION}'`);
  write(androidPath, android);
}

const serverPath = 'server.mjs';
let server = read(serverPath);
server = server.replace(/version\s*:\s*'(?:13\.9\.\d+|14\.0\.\d+)'/g, `version:'${VERSION}'`);
write(serverPath, server);

console.log(`CrewCheck v${VERSION}: metadados publicados.`);
