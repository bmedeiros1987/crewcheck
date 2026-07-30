import fs from 'node:fs';

const VERSION = '14.3.57';

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v14357] Arquivo ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function write(path, content) {
  const before = fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '';
  if (before !== content) fs.writeFileSync(path, content, 'utf8');
}

function readLocal(name) {
  return fs.readFileSync(new URL(name, import.meta.url), 'utf8');
}

export function patchAuthPageV14357(source) {
  let patched = source;
  if (!patched.includes("import './auth-compact.css';")) {
    patched = patched.replace(
      "import { acceptCurrentTerms, getCurrentTerms, type CrewCheckTerms } from '@/lib/termsClient';",
      "import { acceptCurrentTerms, getCurrentTerms, type CrewCheckTerms } from '@/lib/termsClient';\nimport './auth-compact.css';",
    );
  }
  patched = patched
    .replace("const title = mode === 'login' ? 'Bem-vindo de volta.'", "const title = mode === 'login' ? 'Entrar no CrewCheck'")
    .replace('className="cz-auth" data-version="14.0.6"', `className="cz-auth cc-auth-compact" data-version="${VERSION}"`)
    .replace('>Criar cadastro</button>', '>Criar conta</button>')
    .replace('Entre para carregar sua escala e continuar de onde parou.', 'Use seu e-mail e senha para continuar.')
    .replace('CREWCHECK V14.0.6 • PREMIUM BETA', `CREWCHECK V${VERSION} • ACESSO PROTEGIDO`);
  if (!patched.includes('cc-auth-compact')) throw new Error('[v14357] Login compacto não aplicado.');
  return patched;
}

export function patchIndexCssV14357(source) {
  if (source.includes('@import "./styles/v14357-ui-clarity.css";')) return source;
  const needle = '@import "tailwindcss";';
  if (!source.includes(needle)) throw new Error('[v14357] Import principal do CSS não localizado.');
  return source.replace(needle, `${needle}\n@import "./styles/v14357-ui-clarity.css";`);
}

export function patchLegacyVoiceRegressionV14357(source) {
  let patched = source;
  const readNeedle = "const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');";
  if (!patched.includes('const currentVersion = JSON.parse(read(\'package.json\')).version;')) {
    patched = patched.replace(
      readNeedle,
      `${readNeedle}\nconst currentVersion = JSON.parse(read('package.json')).version;\nconst escapedCurrentVersion = String(currentVersion).replace(/\\./g, '\\\\.');`,
    );
  }
  patched = patched
    .replace(
      "assert.ok(chain.trimEnd().endsWith(\"await import('../v14348/apply.mjs');\"), 'v14.3.48 deve encerrar a preparação canônica');",
      "assert.ok(chain.lastIndexOf(\"await import('../v\") > v14348Index, 'a preparação atual deve suceder e preservar a política da v14.3.48');",
    )
    .replace(
      "assert.match(server, /url\\.pathname === '\\/api\\/release'[^\\r\\n]*version\\s*:\\s*'14\\.3\\.48'/, 'release do servidor deve anunciar v14.3.48');",
      "assert.match(server, new RegExp(`url\\\\.pathname === '/api/release'[^\\\\r\\\\n]*version\\\\s*:\\\\s*'${escapedCurrentVersion}'`), 'release do servidor deve anunciar a versão atual');",
    )
    .replace(
      "assert.match(server, /url\\.pathname === '\\/api\\/health'[^\\r\\n]*version\\s*:\\s*'14\\.3\\.48'/, 'health do servidor deve anunciar v14.3.48');",
      "assert.match(server, new RegExp(`url\\\\.pathname === '/api/health'[^\\\\r\\\\n]*version\\\\s*:\\\\s*'${escapedCurrentVersion}'`), 'health do servidor deve anunciar a versão atual');",
    )
    .replace(
      "assert.ok(read('client/src/pages/Home.tsx').includes(\"const DEFAULT_VERSION = '14.3.48';\"), 'Web/PWA deve anunciar v14.3.48');",
      "assert.ok(read('client/src/pages/Home.tsx').includes(`const DEFAULT_VERSION = '${currentVersion}';`), 'Web/PWA deve anunciar a versão atual');",
    )
    .replace(
      "assert.ok(read('client/public/release.json').includes('14.3.48'), 'release.json deve anunciar v14.3.48');",
      "assert.ok(read('client/public/release.json').includes(currentVersion), 'release.json deve anunciar a versão atual');",
    )
    .replace(
      "const second = spawnSync(process.execPath, [path.join(root, 'scripts/v14348/apply.mjs')], {",
      "const currentApplyPath = path.join(root, 'scripts', `v${currentVersion.replace(/\\./g, '')}`, 'apply.mjs');\nconst second = spawnSync(process.execPath, [currentApplyPath], {",
    )
    .replace(
      "assert.equal(second.status, 0, second.stderr || second.stdout || 'reaplicação final v14.3.48 falhou');",
      "assert.equal(second.status, 0, second.stderr || second.stdout || `reaplicação final v${currentVersion} falhou`);",
    )
    .replace(
      "assert.equal(read(relative), before.get(relative), `v14.3.48 deve ser idempotente em ${relative}`);",
      "assert.equal(read(relative), before.get(relative), `a versão ${currentVersion} deve ser idempotente em ${relative}`);",
    );
  return patched;
}

if (process.env.CREWCHECK_V14357_SKIP_APPLY !== '1') {
  const timelineSource = readLocal('./OperationalDayTimeline.tsx');
  const timelineCss = readLocal('./operational-day-timeline.css');
  const authCss = readLocal('./auth-compact.css');
  const clarityCss = readLocal('./ui-clarity.css');

  update('client/src/pages/AuthPage.tsx', patchAuthPageV14357);
  update('client/src/components/v14349/OperationalDayTimeline.tsx', () => timelineSource);
  update('client/src/components/v14349/operational-day-timeline.css', () => timelineCss);
  write('client/src/pages/auth-compact.css', authCss);
  write('client/src/styles/v14357-ui-clarity.css', clarityCss);
  update('client/src/index.css', patchIndexCssV14357);

  update('client/src/pages/Home.tsx', (source) => source
    .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
    .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: Linha do Dia, login e padrão visual mais claros';`));
  update('client/src/App.tsx', (source) => source
    .replace(/crewcheck_last_loaded_version',\s*'[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`)
    .replace(/crewcheck-client-cleanup:[^']+/g, `crewcheck-client-cleanup:${VERSION}`), { optional: true });
  update('client/public/release.json', () => `${JSON.stringify({
    version: VERSION,
    channel: 'web',
    updatePolicy: 'automatic-safe',
    notes: 'Linha do Dia mais intuitiva, login compacto e padrão visual consistente.',
  }, null, 2)}\n`, { optional: true });
  update('package.json', (source) => {
    const data = JSON.parse(source);
    data.version = VERSION;
    data.description = `CrewCheck v${VERSION} - operational clarity and compact login`;
    data.scripts ||= {};
    data.scripts['regression:v14.3.57:ui-clarity'] = 'node scripts/v139/apply.mjs && node scripts/regression-v14-3-57-ui-clarity.mjs';
    return `${JSON.stringify(data, null, 2)}\n`;
  });
  update('android-wrapper/app/build.gradle', (source) => source
    .replace(/versionCode\s+\d+/, 'versionCode 140357')
    .replace(/versionName\s+["'][^"']+["']/, `versionName "${VERSION}"`), { optional: true });
  update('server.mjs', (source) => source.replace(/(app\s*:\s*'CrewCheck',\s*version\s*:\s*)'[^']+'/g, `$1'${VERSION}'`), { optional: true });
  update('server/platform.mjs', (source) => source.replace(/(app\s*:\s*'CrewCheck',\s*version\s*:\s*)'[^']+'/g, `$1'${VERSION}'`), { optional: true });
  update('scripts/regression-v14-3-48-elevenlabs-dual-voice.mjs', patchLegacyVoiceRegressionV14357, { optional: true });

  console.log(`[v14357] CrewCheck ${VERSION}: clareza operacional, login compacto e padrão visual aplicados.`);
}
