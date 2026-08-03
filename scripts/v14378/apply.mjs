import fs from 'node:fs';
import path from 'node:path';

const VERSION = '14.3.78';

function update(filePath, transform, { optional = false } = {}) {
  if (!fs.existsSync(filePath)) {
    if (optional) return;
    throw new Error(`[v14378] Arquivo ausente: ${filePath}`);
  }
  const before = fs.readFileSync(filePath, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(filePath, after, 'utf8');
}

function write(filePath, content) {
  const before = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  if (before === content) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function readLocal(name) {
  return fs.readFileSync(new URL(name, import.meta.url), 'utf8');
}

export function patchAuthPageV14378(source) {
  let patched = source;

  if (!patched.includes("import './auth-premium.css';")) {
    const needle = "import './auth-compact.css';";
    if (!patched.includes(needle)) throw new Error('[v14378] Import auth-compact não localizado.');
    patched = patched.replace(needle, `${needle}\nimport './auth-premium.css';`);
  }

  patched = patched.replace(
    'Eye, EyeOff, Lock, Mail, Plane, Send, ShieldCheck, Sparkles',
    'Eye, EyeOff, Lock, Mail, Monitor, Moon, Plane, Send, ShieldCheck, Sparkles, Sun',
  );

  if (!patched.includes("const [themeMode, setThemeMode]")) {
    const stateNeedle = "  const [termsAccepted, setTermsAccepted] = useState(false);";
    if (!patched.includes(stateNeedle)) throw new Error('[v14378] Estado base da autenticação não localizado.');
    patched = patched.replace(
      stateNeedle,
      `${stateNeedle}\n  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>(() => {\n    const saved = localStorage.getItem('crewcheck_theme_mode');\n    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';\n  });`,
    );
  }

  const oldEffect = `  useEffect(() => {\n    const saved = localStorage.getItem('crewcheck_theme_mode');\n    const themeMode = saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';\n    const light = themeMode === 'light' || (themeMode === 'system' && !window.matchMedia?.('(prefers-color-scheme: dark)').matches);\n    document.documentElement.dataset.crewThemeMode = themeMode;\n    document.documentElement.dataset.crewTheme = light ? 'light' : 'dark';\n    document.documentElement.classList.toggle('dark', !light);\n    document.documentElement.style.colorScheme = light ? 'light' : 'dark';\n    localStorage.setItem('crewcheck_theme_mode', themeMode);\n    localStorage.setItem('crewcheck_last_loaded_version', '14.0.6');\n  }, []);`;
  const newEffect = `  useEffect(() => {\n    const media = window.matchMedia?.('(prefers-color-scheme: dark)');\n    const applyTheme = () => {\n      const light = themeMode === 'light' || (themeMode === 'system' && !media?.matches);\n      document.documentElement.dataset.crewThemeMode = themeMode;\n      document.documentElement.dataset.crewTheme = light ? 'light' : 'dark';\n      document.documentElement.classList.toggle('dark', !light);\n      document.documentElement.style.colorScheme = light ? 'light' : 'dark';\n      localStorage.setItem('crewcheck_theme_mode', themeMode);\n      localStorage.setItem('crewcheck_last_loaded_version', '${VERSION}');\n    };\n    applyTheme();\n    if (themeMode !== 'system' || !media) return undefined;\n    media.addEventListener?.('change', applyTheme);\n    return () => media.removeEventListener?.('change', applyTheme);\n  }, [themeMode]);`;
  if (patched.includes(oldEffect)) patched = patched.replace(oldEffect, newEffect);

  patched = patched
    .replace(/className="cz-auth cc-auth-compact" data-version="[^"]+"/, `className="cz-auth cc-auth-compact cc-auth-premium" data-version="${VERSION}"`)
    .replace(/CREWCHECK V[^<•]+•\s*ACESSO PROTEGIDO/, `CREWCHECK V${VERSION} • ACESSO PROTEGIDO`);

  if (!patched.includes('className="cz-auth-theme-switch"')) {
    const brandNeedle = '<section className="cz-auth-brand"><span><Plane/></span><div><strong>CrewCheck</strong><small>ROSTER INTELLIGENCE</small></div><p><em>Premium</em><b>Beta</b></p></section>';
    if (!patched.includes(brandNeedle)) throw new Error('[v14378] Cabeçalho da autenticação não localizado.');
    patched = patched.replace(
      brandNeedle,
      `<section className="cz-auth-brand"><span><Plane/></span><div><strong>CrewCheck</strong><small>ROSTER INTELLIGENCE</small></div><p><em>Premium</em><b>Beta</b></p><div className="cz-auth-theme-switch" role="group" aria-label="Aparência"><button type="button" className={themeMode === 'light' ? 'active' : ''} onClick={() => setThemeMode('light')} aria-label="Usar modo claro" aria-pressed={themeMode === 'light'}><Sun/></button><button type="button" className={themeMode === 'dark' ? 'active' : ''} onClick={() => setThemeMode('dark')} aria-label="Usar modo escuro" aria-pressed={themeMode === 'dark'}><Moon/></button><button type="button" className={themeMode === 'system' ? 'active' : ''} onClick={() => setThemeMode('system')} aria-label="Seguir aparência do dispositivo" aria-pressed={themeMode === 'system'}><Monitor/></button></div></section>`,
    );
  }

  if (!patched.includes('cc-auth-premium')) throw new Error('[v14378] Classe premium da autenticação não aplicada.');
  return patched;
}

if (process.env.CREWCHECK_V14378_SKIP_APPLY !== '1') {
  write('client/src/pages/auth-premium.css', readLocal('./auth-premium.css'));
  update('client/src/pages/AuthPage.tsx', patchAuthPageV14378);
  update('client/src/pages/Home.tsx', (source) => source.replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`), { optional: true });
  update('client/public/release.json', () => `${JSON.stringify({
    version: VERSION,
    channel: 'web',
    updatePolicy: 'automatic-safe',
    notes: 'Primeiro slice da auditoria visual: autenticação premium, clara/escura e responsiva.',
  }, null, 2)}\n`, { optional: true });
  update('package.json', (source) => {
    const data = JSON.parse(source);
    data.version = VERSION;
    data.description = `CrewCheck v${VERSION} - premium authentication visual audit`;
    data.scripts ||= {};
    data.scripts['regression:v14.3.78:auth-visual'] = 'node scripts/v139/apply.mjs && node scripts/regression-v14-3-78-auth-visual.mjs';
    return `${JSON.stringify(data, null, 2)}\n`;
  });
  update('android-wrapper/app/build.gradle', (source) => source
    .replace(/versionCode\s+\d+/, 'versionCode 140378')
    .replace(/versionName\s+["'][^"']+["']/, `versionName "${VERSION}"`), { optional: true });

  console.log(`[v14378] CrewCheck ${VERSION}: autenticação premium e responsiva aplicada.`);
}
