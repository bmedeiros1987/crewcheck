import fs from 'node:fs';

const VERSION = '14.0.0';
const VERSION_CODE = '140000';
const CACHE_VERSION = '14000';
const NAME = 'crewcheck-v14-premium-system-audit';
const read = (path) => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value, 'utf8');

await import('./generate-brand-icon.mjs');

for (const path of ['package.json', 'package-lock.json']) {
  if (!fs.existsSync(path)) continue;
  const metadata = JSON.parse(read(path));
  metadata.name = NAME;
  metadata.version = VERSION;
  if (path === 'package.json') metadata.description = 'CrewCheck v14 - auditoria visual Premium, tema automático e Relatórios de Bordo restaurados';
  if (metadata.packages?.['']) {
    metadata.packages[''].name = NAME;
    metadata.packages[''].version = VERSION;
  }
  write(path, `${JSON.stringify(metadata, null, 2)}\n`);
}

const homePath = 'client/src/pages/Home.tsx';
if (fs.existsSync(homePath)) {
  let home = read(homePath);
  home = home.replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`);
  home = home.replace(
    /const CREWCHECK_UI_CORE_NOTE = '[^']+';/,
    "const CREWCHECK_UI_CORE_NOTE = 'v14.0.0: Design System Premium, tema automático e Relatórios de Bordo restaurados';",
  );

  if (!home.includes("@/components/premium/CabinChiefAssistant")) {
    home = home.replace(
      "import ManualRegulationView from '@/components/v1392/ManualRegulationView';",
      "import ManualRegulationView from '@/components/v1392/ManualRegulationView';\nimport CabinChiefAssistant from '@/components/premium/CabinChiefAssistant';",
    );
  }
  if (!home.includes("@/components/v1400/premium-system.css")) {
    home = home.replace(
      "import '@/components/v1399/premium.css';",
      "import '@/components/v1399/premium.css';\nimport '@/components/v1400/premium-system.css';",
    );
  }

  home = home.replace(
    /\{view === 'crew' && <CrewToolsView bundle=\{bundle\}\/\>\}/,
    "{view === 'crew' && <CabinChiefAssistant bundle={bundle} onBack={() => setView('cockpit')} onOpenRoster={() => setView('roster')}/>}"
  );

  home = home.replace(
    /const mode = storage\.get\('crewcheck_theme_mode',[\s\S]*?document\.documentElement\.style\.colorScheme = effective;/,
    `const mode = storage.get('crewcheck_theme_mode', 'auto');\n    const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;\n    const effective = mode === 'auto' ? (systemDark ? 'dark' : 'light') : mode === 'light' ? 'light' : 'dark';\n    document.documentElement.dataset.crewTheme = effective;\n    document.documentElement.classList.toggle('dark', effective === 'dark');\n    document.documentElement.style.colorScheme = effective;`
  );
  home = home.replace(
    /const syncTheme = \(\) => \{[\s\S]*?document\.documentElement\.style\.colorScheme = next;\n    \};/,
    `const syncTheme = () => {\n      const selected = storage.get('crewcheck_theme_mode', 'auto');\n      const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;\n      const next = selected === 'auto' ? (systemDark ? 'dark' : 'light') : selected === 'light' ? 'light' : 'dark';\n      document.documentElement.dataset.crewTheme = next;\n      document.documentElement.classList.toggle('dark', next === 'dark');\n      document.documentElement.style.colorScheme = next;\n    };`
  );
  if (!home.includes('const crewcheckSystemTheme =')) {
    home = home.replace(
      "window.addEventListener('crewcheck:theme-change', syncTheme);",
      "window.addEventListener('crewcheck:theme-change', syncTheme);\n    const crewcheckSystemTheme = window.matchMedia?.('(prefers-color-scheme: dark)');\n    const crewcheckSystemThemeListener = () => { if (storage.get('crewcheck_theme_mode', 'auto') === 'auto') syncTheme(); };\n    crewcheckSystemTheme?.addEventListener?.('change', crewcheckSystemThemeListener);\n    document.documentElement.dataset.crewcheckSystemThemeListener = 'active';",
    );
    home = home.replace(
      "window.removeEventListener('crewcheck:theme-change', syncTheme); window.removeEventListener('crewcheck:presentation-updated', refreshPresentation);",
      "window.removeEventListener('crewcheck:theme-change', syncTheme); crewcheckSystemTheme?.removeEventListener?.('change', crewcheckSystemThemeListener); window.removeEventListener('crewcheck:presentation-updated', refreshPresentation);",
    );
  }

  write(homePath, home);
}

if (fs.existsSync('server.mjs')) {
  let server = read('server.mjs');
  server = server.replace(/version\s*:\s*'13\.9\.\d+'/g, `version:'${VERSION}'`);
  write('server.mjs', server);
}

if (fs.existsSync('client/public/manifest.json')) {
  const manifest = JSON.parse(read('client/public/manifest.json'));
  manifest.version = VERSION;
  manifest.theme_color = '#071D33';
  manifest.background_color = '#EEF5FB';
  const startUrl = String(manifest.start_url || '/');
  manifest.start_url = /([?&]v=)[^&]+/.test(startUrl)
    ? startUrl.replace(/([?&]v=)[^&]+/, `$1${VERSION}`)
    : `${startUrl}${startUrl.includes('?') ? '&' : '?'}v=${VERSION}`;
  const refresh = (value) => {
    const source = String(value || '');
    return /([?&]v=)\d+/.test(source)
      ? source.replace(/([?&]v=)\d+/, `$1${CACHE_VERSION}`)
      : `${source}${source.includes('?') ? '&' : '?'}v=${CACHE_VERSION}`;
  };
  for (const icon of manifest.icons || []) { icon.src = refresh(icon.src); icon.sizes = '512x512'; }
  for (const shortcut of manifest.shortcuts || []) for (const icon of shortcut.icons || []) { icon.src = refresh(icon.src); icon.sizes = '512x512'; }
  write('client/public/manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
}

if (fs.existsSync('android-wrapper/app/build.gradle')) {
  let android = read('android-wrapper/app/build.gradle');
  android = android.replace(/versionCode\s+\d+\b/, `versionCode ${VERSION_CODE}`);
  android = android.replace(/versionName\s+'[^']+'/, `versionName '${VERSION}'`);
  write('android-wrapper/app/build.gradle', android);
}

const requiredFiles = [
  'client/src/lib/brand.ts',
  'client/src/lib/pdfExport.ts',
  'client/src/lib/emailClient.ts',
  'client/src/lib/sharing.ts',
  'client/src/components/premium/CabinChiefAssistant.tsx',
  'client/src/components/v1400/premium-system.css',
  'client/public/icons/crewcheck-icon-v2.png',
];
for (const path of requiredFiles) if (!fs.existsSync(path)) throw new Error(`v${VERSION}: asset obrigatório ausente: ${path}`);

const icon = fs.readFileSync('client/public/icons/crewcheck-icon-v2.png');
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
if (icon.length < 24 || !icon.subarray(0, 8).equals(pngSignature)) throw new Error(`v${VERSION}: ícone oficial não é um PNG válido`);
if (icon.readUInt32BE(16) !== 512 || icon.readUInt32BE(20) !== 512) throw new Error(`v${VERSION}: ícone oficial precisa ter 512x512`);

const home = read(homePath);
const cabinChief = read('client/src/components/premium/CabinChiefAssistant.tsx');
const premiumCss = read('client/src/components/v1400/premium-system.css');
if (!home.includes('CabinChiefAssistant') || !home.includes("crewcheck_theme_mode', 'auto'")) throw new Error(`v${VERSION}: restauração de relatórios ou tema automático ausente`);
if (!cabinChief.includes('maas') || !cabinChief.includes('wchr') || !cabinChief.includes('WATER_LEVELS')) throw new Error(`v${VERSION}: módulo histórico de cabine incompleto`);
if (!premiumCss.includes('--cc-violet') || !premiumCss.includes('.crewcheck-chief-page')) throw new Error(`v${VERSION}: Design System Premium incompleto`);

console.log(`CrewCheck v${VERSION}: sistema Premium, tema automático e Relatórios de Bordo restaurados.`);
