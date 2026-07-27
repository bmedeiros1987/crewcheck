import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const VERSION = '14.3.42';
const VERSION_DIGITS = VERSION.replace(/\./g, '');
const CANONICAL_PATH = '/icons/crewcheck-brand-512.png';

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v14342] Arquivo ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

execFileSync(process.execPath, ['scripts/generate-canonical-brand-assets.mjs'], { stdio: 'inherit' });

update('client/src/pages/Home.tsx', (source) => source
  .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
  .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: identidade visual única derivada da logo aprovada do menu';`)
  .replace(/\/icons\/crewcheck-icon-v3\.png\?v=\d+/g, `${CANONICAL_PATH}?v=${VERSION_DIGITS}`)
  .replace(/\/icons\/crewcheck-icon-v2\.png\?v=\d+/g, `${CANONICAL_PATH}?v=${VERSION_DIGITS}`));

update('client/src/lib/brand.ts', (source) => source
  .replace(/iconPath:\s*'\/icons\/crewcheck-[^']+\.png'/, `iconPath: '${CANONICAL_PATH}'`));

update('client/index.html', (source) => source
  .replace(/\/icons\/crewcheck-icon-v[23]\.png(?:\?v=\d+)?/g, `${CANONICAL_PATH}?v=${VERSION_DIGITS}`)
  .replace(/\/icons\/crewcheck-brand-512\.png\?v=\d+/g, `${CANONICAL_PATH}?v=${VERSION_DIGITS}`)
  .replace(/data-crewcheck-release="[^"]+"/g, `data-crewcheck-release="${VERSION}"`)
  .replace(/name="crewcheck-release" content="[^"]+"/g, `name="crewcheck-release" content="${VERSION}"`)
  .replace(/crewcheck-cache-reset-[0-9-]+/g, `crewcheck-cache-reset-${VERSION.replace(/\./g, '-')}`)
  .replace(/currentRelease\s*=\s*'[^']+'/g, `currentRelease = '${VERSION}'`)
  .replace(/manifest\.json\?v=\d+/g, `manifest.json?v=${VERSION_DIGITS}`)
  .replace(/sw\.js\?v=\d+/g, `sw.js?v=${VERSION_DIGITS}`), { optional: true });

update('client/public/manifest.json', (source) => {
  const manifest = JSON.parse(source);
  manifest.version = VERSION;
  manifest.start_url = `/?source=pwa&v=${VERSION}`;
  manifest.icons = (manifest.icons || []).map((icon) => ({ ...icon, src: `${CANONICAL_PATH}?v=${VERSION_DIGITS}` }));
  manifest.shortcuts = (manifest.shortcuts || []).map((shortcut) => ({
    ...shortcut,
    icons: (shortcut.icons || []).map((icon) => ({ ...icon, src: `${CANONICAL_PATH}?v=${VERSION_DIGITS}` })),
  }));
  return `${JSON.stringify(manifest, null, 2)}\n`;
});

update('android-wrapper/app/build.gradle', (source) => source
  .replaceAll('crewcheck-icon-v2.png', 'crewcheck-brand-512.png')
  .replaceAll('crewcheck-icon-v3.png', 'crewcheck-brand-512.png')
  .replace(/versionCode\s+\d+/, 'versionCode 140342')
  .replace(/versionName\s+["'][^"']+["']/, `versionName "${VERSION}"`));

update('client/src/App.tsx', (source) => source
  .replace(/crewcheck_last_loaded_version',\s*'[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`), { optional: true });
update('client/src/pages/AuthPage.tsx', (source) => source
  .replace(/14\.3\.\d+/g, VERSION)
  .replace(/\/icons\/crewcheck-icon-v[23]\.png(?:\?v=\d+)?/g, `${CANONICAL_PATH}?v=${VERSION_DIGITS}`), { optional: true });
update('client/public/sw.js', (source) => source
  .replace(/crewcheck-v[0-9.]+-shell/g, `crewcheck-v${VERSION}-shell`)
  .replace(/crewcheck-v[0-9.]+-runtime/g, `crewcheck-v${VERSION}-runtime`)
  .replace(/\/icons\/crewcheck-icon-v[23]\.png(?:\?v=\d+)?/g, `${CANONICAL_PATH}?v=${VERSION_DIGITS}`), { optional: true });

const generated = [
  'client/public/icons/crewcheck-brand-512.png',
  'client/public/icons/crewcheck-play-store-512.png',
  'client/public/brand/crewcheck-menu-approved-512.png',
  'client/public/brand/crewcheck-brand-metadata.json',
];
for (const path of generated) if (!fs.existsSync(path)) throw new Error(`[v14342] Ativo canônico não gerado: ${path}`);

fs.writeFileSync('client/public/release.json', `${JSON.stringify({
  version: VERSION,
  build: VERSION_DIGITS,
  channel: 'web',
  updatePolicy: 'automatic',
  notes: 'A mesma logo aprovada do menu agora é a fonte do cabeçalho, PWA, Android, exportações e ativo 512×512 da Play Store.',
}, null, 2)}\n`, 'utf8');

console.log(`[v14342] CrewCheck ${VERSION}: logo aprovada do menu unificada em todos os canais e Play Store 512×512.`);
