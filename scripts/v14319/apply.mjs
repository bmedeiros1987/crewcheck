import fs from 'node:fs';

const VERSION = '14.3.17';

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v14319] Arquivo ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

const themeRuntime = `export type CrewCheckThemePreference = 'system' | 'light' | 'dark';

const KEY = 'crewcheck:appearance:v1';
const ORDER: CrewCheckThemePreference[] = ['system', 'light', 'dark'];

function normalize(value: unknown): CrewCheckThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function getCrewCheckThemePreference(): CrewCheckThemePreference {
  try { return normalize(window.localStorage.getItem(KEY)); } catch { return 'system'; }
}

export function applyCrewCheckTheme(preference: CrewCheckThemePreference = getCrewCheckThemePreference()): CrewCheckThemePreference {
  const html = document.documentElement;
  const normalized = normalize(preference);
  if (normalized === 'system') html.removeAttribute('data-crewcheck-theme');
  else html.setAttribute('data-crewcheck-theme', normalized);
  html.dataset.crewcheckThemePreference = normalized;
  html.style.colorScheme = normalized === 'system' ? 'light dark' : normalized;
  return normalized;
}

export function setCrewCheckThemePreference(preference: CrewCheckThemePreference): CrewCheckThemePreference {
  const normalized = normalize(preference);
  try { window.localStorage.setItem(KEY, normalized); } catch {}
  const applied = applyCrewCheckTheme(normalized);
  window.dispatchEvent(new CustomEvent('crewcheck:theme-change', { detail: { preference: applied } }));
  return applied;
}

export function cycleCrewCheckTheme(): CrewCheckThemePreference {
  const current = getCrewCheckThemePreference();
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
  return setCrewCheckThemePreference(next);
}

function label(preference: CrewCheckThemePreference): string {
  if (preference === 'light') return 'Aparência: Claro';
  if (preference === 'dark') return 'Aparência: Escuro';
  return 'Aparência: Automático';
}

function refreshControls() {
  const preference = getCrewCheckThemePreference();
  document.querySelectorAll<HTMLElement>('.cc-theme-row').forEach((control) => {
    control.dataset.themePreference = preference;
    control.setAttribute('aria-label', label(preference));
    control.setAttribute('title', `${label(preference)}. Toque para alterar.`);
  });
}

applyCrewCheckTheme();

try {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const refresh = () => {
    if (getCrewCheckThemePreference() === 'system') applyCrewCheckTheme('system');
    refreshControls();
  };
  media.addEventListener?.('change', refresh);
} catch {}

if (typeof document !== 'undefined') {
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const control = target?.closest?.('.cc-theme-row');
    if (!control) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    cycleCrewCheckTheme();
    refreshControls();
  }, true);
  const observer = new MutationObserver(refreshControls);
  const start = () => {
    refreshControls();
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
  window.addEventListener('crewcheck:theme-change', refreshControls as EventListener);
}
`;
fs.writeFileSync('client/src/lib/themeRuntime.ts', themeRuntime, 'utf8');

const themeCss = `/* CrewCheck v14.3.17 — tema e layout globais, carregado por último. */
:root{
  --cc-gap-1:4px;--cc-gap-2:8px;--cc-gap-3:12px;--cc-gap-4:16px;--cc-gap-5:20px;--cc-gap-6:24px;
  --cc-radius-input:14px;--cc-radius-button:16px;--cc-radius-card:22px;
  --cc-control-height:50px;--cc-bottom-safe:calc(112px + env(safe-area-inset-bottom,0px));
  --cc-page-bg:#061426;--cc-surface:#0b2038;--cc-surface-2:#102a46;--cc-surface-3:#153451;
  --cc-text:#f8fafc;--cc-muted:#c6d4e1;--cc-line:#31506e;--cc-input:#071a2e;--cc-shadow:0 18px 44px rgba(0,0,0,.25);
}
html{color-scheme:light dark;background:var(--cc-page-bg)}body{overflow-x:hidden;background:var(--cc-page-bg);color:var(--cc-text)}
button,input,select,textarea{font:inherit}button,a,[role="button"]{min-width:0}button svg,a svg{flex:none}
.cc-page,.cc-shell,main,[class*="page-shell"],[class*="view-shell"]{padding-bottom:max(var(--cc-bottom-safe),env(safe-area-inset-bottom,0px))}
button:not(.cc-icon-only):not([aria-label="Fechar"]),a[class*="button"],a[class*="btn"],input:not([type="checkbox"]):not([type="radio"]),select{min-height:var(--cc-control-height);border-radius:var(--cc-radius-button);box-sizing:border-box}
button,a[class*="button"],a[class*="btn"]{align-items:center;justify-content:center;gap:var(--cc-gap-2);line-height:1.2;text-align:center;white-space:normal}
input:not([type="checkbox"]):not([type="radio"]),select,textarea{padding:12px 14px;line-height:1.35}textarea{min-height:96px;border-radius:var(--cc-radius-input)}
form,.cc-form,[class*="form-grid"],[class*="action-grid"],[class*="button-grid"],[class*="actions"]{gap:var(--cc-gap-3)}
[class*="card"],[class*="panel"],[class*="section"]{scroll-margin-top:84px}
nav[class*="bottom"],[class*="bottom-nav"],[class*="mobile-nav"]{padding-bottom:max(10px,env(safe-area-inset-bottom,0px));box-sizing:border-box}
[data-crewcheck-theme="light"]{color-scheme:light;--cc-page-bg:#eef5fa;--cc-surface:#fff;--cc-surface-2:#f7fbfe;--cc-surface-3:#eaf3f9;--cc-text:#10283c;--cc-muted:#50697d;--cc-line:#bfd0dc;--cc-input:#fff;--cc-shadow:0 14px 36px rgba(31,62,84,.12)}
@media(prefers-color-scheme:light){html:not([data-crewcheck-theme="dark"]){color-scheme:light;--cc-page-bg:#eef5fa;--cc-surface:#fff;--cc-surface-2:#f7fbfe;--cc-surface-3:#eaf3f9;--cc-text:#10283c;--cc-muted:#50697d;--cc-line:#bfd0dc;--cc-input:#fff;--cc-shadow:0 14px 36px rgba(31,62,84,.12)}}
[data-crewcheck-theme="light"] body{background:var(--cc-page-bg)!important;color:var(--cc-text)!important}
@media(prefers-color-scheme:light){html:not([data-crewcheck-theme="dark"]) body{background:var(--cc-page-bg)!important;color:var(--cc-text)!important}}
[data-crewcheck-theme="light"] :is(.cc-control-card,.cc-life-ai-hero,.cc-life-ai-recommendation,.cc-life-ai-actions,.cc-life-gym-checkin,.cc-life-ai-collapsible,.cc-life-ai-privacy,.cc-life-ai-dashboard article,.cc-life-day-shell,.cc-routine-daily,.cc-about-card,.cc-about-founder,[class*="premium-card"],[class*="metric-card"],[class*="alert-card"],[class*="roster-card"],[class*="routine-card"],[class*="departure-card"],[class*="radar-card"],[class*="hospital-card"],[class*="gym-card"]){background:var(--cc-surface)!important;color:var(--cc-text)!important;border-color:var(--cc-line)!important;box-shadow:var(--cc-shadow)!important}
@media(prefers-color-scheme:light){html:not([data-crewcheck-theme="dark"]) :is(.cc-control-card,.cc-life-ai-hero,.cc-life-ai-recommendation,.cc-life-ai-actions,.cc-life-gym-checkin,.cc-life-ai-collapsible,.cc-life-ai-privacy,.cc-life-ai-dashboard article,.cc-life-day-shell,.cc-routine-daily,.cc-about-card,.cc-about-founder,[class*="premium-card"],[class*="metric-card"],[class*="alert-card"],[class*="roster-card"],[class*="routine-card"],[class*="departure-card"],[class*="radar-card"],[class*="hospital-card"],[class*="gym-card"]){background:var(--cc-surface)!important;color:var(--cc-text)!important;border-color:var(--cc-line)!important;box-shadow:var(--cc-shadow)!important}}
[data-crewcheck-theme="light"] :is(h1,h2,h3,h4,strong,label,[class*="title"],[class*="value"]){color:var(--cc-text)!important}
[data-crewcheck-theme="light"] :is(p,small,[class*="subtitle"],[class*="muted"],[class*="description"]){color:var(--cc-muted)!important}
[data-crewcheck-theme="light"] :is(input,select,textarea){background:var(--cc-input)!important;color:var(--cc-text)!important;border-color:var(--cc-line)!important}
[data-crewcheck-theme="light"] :is(button:not(.cc-primary),a[class*="button"]:not(.cc-primary),a[class*="btn"]:not(.cc-primary)){background:var(--cc-surface-2)!important;color:var(--cc-text)!important;border-color:var(--cc-line)!important}
@media(prefers-color-scheme:light){html:not([data-crewcheck-theme="dark"]) :is(h1,h2,h3,h4,strong,label,[class*="title"],[class*="value"]){color:var(--cc-text)!important}html:not([data-crewcheck-theme="dark"]) :is(p,small,[class*="subtitle"],[class*="muted"],[class*="description"]){color:var(--cc-muted)!important}html:not([data-crewcheck-theme="dark"]) :is(input,select,textarea){background:var(--cc-input)!important;color:var(--cc-text)!important;border-color:var(--cc-line)!important}html:not([data-crewcheck-theme="dark"]) :is(button:not(.cc-primary),a[class*="button"]:not(.cc-primary),a[class*="btn"]:not(.cc-primary)){background:var(--cc-surface-2)!important;color:var(--cc-text)!important;border-color:var(--cc-line)!important}}
:is(.cc-control-hero,[class*="hero"][class*="dark"],[class*="banner"][class*="dark"]){color:#f8fafc}:is(.cc-control-hero,[class*="hero"][class*="dark"],[class*="banner"][class*="dark"]) :is(h1,h2,h3,strong){color:#fff!important}:is(.cc-control-hero,[class*="hero"][class*="dark"],[class*="banner"][class*="dark"]) :is(p,small){color:#d8e5ef!important}
.cc-theme-row{position:relative}.cc-theme-row>span{font-size:0!important}.cc-theme-row>span::after{font-size:.75rem;font-weight:700;color:var(--foreground-muted,var(--cc-muted));content:'Aparência: Automático'}
html[data-crewcheck-theme-preference="light"] .cc-theme-row>span::after{content:'Aparência: Claro'}html[data-crewcheck-theme-preference="dark"] .cc-theme-row>span::after{content:'Aparência: Escuro'}
html[data-crewcheck-theme-preference="system"] .cc-theme-row>div>div{left:.69rem!important;background:#8b5cf6!important}html[data-crewcheck-theme-preference="light"] .cc-theme-row>div>div{left:1rem!important;background:#f59e0b!important}html[data-crewcheck-theme-preference="dark"] .cc-theme-row>div>div{left:.125rem!important;background:#22d3ee!important}
@media(min-width:700px) and (max-width:1180px){[class*="action-grid"],[class*="button-grid"],[class*="form-grid"]{grid-template-columns:repeat(2,minmax(0,1fr))!important}[class*="actions"]>button,[class*="actions"]>a{min-width:160px}}
@media(max-width:699px){[class*="action-grid"],[class*="button-grid"],[class*="form-grid"]{grid-template-columns:1fr!important}[class*="actions"]{display:grid!important;grid-template-columns:1fr!important}[class*="actions"]>button,[class*="actions"]>a{width:100%}}
:is(button,a,input,select,textarea):focus-visible{outline:3px solid rgba(14,165,233,.45)!important;outline-offset:2px!important}
`;
fs.writeFileSync('client/src/theme-v14-3-17.css', themeCss, 'utf8');

update('client/src/main.tsx', (source) => {
  let next = source;
  if (!next.includes("import './lib/themeRuntime';")) next = next.replace("import './lib/crewcheckPremiumRuntime';", "import './lib/crewcheckPremiumRuntime';\nimport './lib/themeRuntime';");
  if (!next.includes('import "./theme-v14-3-17.css";')) next = next.replace('import "./components/v1417/operational-intelligence.css";', 'import "./components/v1417/operational-intelligence.css";\nimport "./theme-v14-3-17.css";');
  return next;
});

update('client/src/pages/Home.tsx', (source) => source
  .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
  .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: auditoria visual global, aparência automática/clara/escura e alinhamento consistente';`), { optional: true });
update('client/src/pages/AuthPage.tsx', (source) => source.replace(/crewcheck_last_loaded_version', '[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`).replace(/data-version="[^"]+"/g, `data-version="${VERSION}"`), { optional: true });
update('client/src/App.tsx', (source) => source.replace(/crewcheck_last_loaded_version', '[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`), { optional: true });
update('server/platform.mjs', (source) => source.replace(/const APP_VERSION = '\d+\.\d+\.\d+';/, `const APP_VERSION = '${VERSION}';`), { optional: true });
update('server.mjs', (source) => source.replace(/version\s*:\s*'\d+\.\d+\.\d+'/g, `version: '${VERSION}'`).replace(/v=\d+\.\d+\.\d+/g, `v=${VERSION}`).replace(/static-shell-\d+\.\d+\.\d+/g, `static-shell-${VERSION}`), { optional: true });
update('android-wrapper/app/build.gradle', (source) => source.replace(/versionCode\s+\d+/, 'versionCode 140317').replace(/versionName\s+["'][^"']+["']/, `versionName "${VERSION}"`), { optional: true });
update('package.json', (source) => { const data = JSON.parse(source); data.version = VERSION; data.description = `CrewCheck v${VERSION} - visual audit and automatic light dark appearance`; data.scripts ||= {}; data.scripts['regression:v14.3.17'] = 'node scripts/v139/apply.mjs && node scripts/regression-v14-3-17-theme-layout.mjs'; return `${JSON.stringify(data, null, 2)}\n`; });

console.log(`[v14319] CrewCheck ${VERSION}: tema triestado e hardening visual aplicados.`);
