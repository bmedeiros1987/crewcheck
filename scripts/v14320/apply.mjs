import fs from 'node:fs';

const VERSION = '14.3.18';
function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) { if (optional) return; throw new Error(`[v14320] Arquivo ausente: ${path}`); }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

const css = `/* CrewCheck v14.3.18 — dois temas projetados separadamente, sem inversão automática de cores. */
:root,
html[data-crewcheck-theme="dark"],
html[data-crew-theme="dark"]{
  color-scheme:dark;
  --cc-page-bg:#07111f;
  --cc-page-bg-elevated:#0b1728;
  --cc-surface:#102238;
  --cc-surface-2:#142b45;
  --cc-surface-3:#1a3552;
  --cc-surface-soft:#0c1d31;
  --cc-text:#f4f8fc;
  --cc-text-strong:#ffffff;
  --cc-muted:#b7c7d6;
  --cc-subtle:#8ea4b8;
  --cc-line:#294763;
  --cc-line-strong:#3a607f;
  --cc-input:#0a1a2d;
  --cc-primary:#19bde3;
  --cc-primary-strong:#0da5d0;
  --cc-primary-contrast:#03131d;
  --cc-success:#37d391;
  --cc-warning:#f5b942;
  --cc-danger:#fb7185;
  --cc-shadow:0 18px 48px rgba(0,0,0,.32);
  --background:#07111f;--foreground:#f4f8fc;--foreground-muted:#b7c7d6;--foreground-subtle:#8ea4b8;
  --surface:#102238;--surface-border:#294763;--sidebar-border:#294763;
}

html[data-crewcheck-theme="light"],
html[data-crew-theme="light"]{
  color-scheme:light;
  --cc-page-bg:#edf4f8;
  --cc-page-bg-elevated:#f6fafc;
  --cc-surface:#ffffff;
  --cc-surface-2:#f5f9fc;
  --cc-surface-3:#e8f1f7;
  --cc-surface-soft:#f8fbfd;
  --cc-text:#13293b;
  --cc-text-strong:#071827;
  --cc-muted:#506a7d;
  --cc-subtle:#71889a;
  --cc-line:#c6d5df;
  --cc-line-strong:#9eb6c6;
  --cc-input:#ffffff;
  --cc-primary:#087fad;
  --cc-primary-strong:#066b94;
  --cc-primary-contrast:#ffffff;
  --cc-success:#087f5b;
  --cc-warning:#a86300;
  --cc-danger:#b4233d;
  --cc-shadow:0 12px 34px rgba(25,62,86,.12);
  --background:#edf4f8;--foreground:#13293b;--foreground-muted:#506a7d;--foreground-subtle:#71889a;
  --surface:#ffffff;--surface-border:#c6d5df;--sidebar-border:#c6d5df;
}

@media(prefers-color-scheme:light){
  html:not([data-crewcheck-theme="dark"]):not([data-crew-theme="dark"]){
    color-scheme:light;
    --cc-page-bg:#edf4f8;--cc-page-bg-elevated:#f6fafc;--cc-surface:#fff;--cc-surface-2:#f5f9fc;--cc-surface-3:#e8f1f7;--cc-surface-soft:#f8fbfd;
    --cc-text:#13293b;--cc-text-strong:#071827;--cc-muted:#506a7d;--cc-subtle:#71889a;--cc-line:#c6d5df;--cc-line-strong:#9eb6c6;
    --cc-input:#fff;--cc-primary:#087fad;--cc-primary-strong:#066b94;--cc-primary-contrast:#fff;--cc-success:#087f5b;--cc-warning:#a86300;--cc-danger:#b4233d;
    --cc-shadow:0 12px 34px rgba(25,62,86,.12);--background:#edf4f8;--foreground:#13293b;--foreground-muted:#506a7d;--foreground-subtle:#71889a;--surface:#fff;--surface-border:#c6d5df;--sidebar-border:#c6d5df;
  }
}

html,body,#root{min-height:100%;background:var(--cc-page-bg)!important;color:var(--cc-text)!important}
body{background-image:linear-gradient(180deg,var(--cc-page-bg-elevated),var(--cc-page-bg))!important}

:is(.cc-card,.cc-control-card,.cc-about-card,.cc-about-founder,.cc-life-day-shell,.cc-routine-daily,.cc-sidebar,.cc-drawer,[class*="premium-card"],[class*="metric-card"],[class*="alert-card"],[class*="roster-card"],[class*="routine-card"],[class*="departure-card"],[class*="radar-card"],[class*="hospital-card"],[class*="gym-card"],[class*="panel"]){
  background:var(--cc-surface)!important;color:var(--cc-text)!important;border-color:var(--cc-line)!important;box-shadow:var(--cc-shadow)!important;
}
:is(.cc-card,.cc-control-card,[class*="card"],[class*="panel"]) :is(h1,h2,h3,h4,strong,[class*="title"],[class*="value"]){color:var(--cc-text-strong)!important}
:is(.cc-card,.cc-control-card,[class*="card"],[class*="panel"]) :is(p,small,[class*="muted"],[class*="subtitle"],[class*="description"]){color:var(--cc-muted)!important}

input:not([type="checkbox"]):not([type="radio"]),select,textarea{
  background:var(--cc-input)!important;color:var(--cc-text)!important;border:1px solid var(--cc-line)!important;box-shadow:none!important;
}
input::placeholder,textarea::placeholder{color:var(--cc-subtle)!important;opacity:1}
input:focus,select:focus,textarea:focus{border-color:var(--cc-primary)!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--cc-primary) 18%,transparent)!important}

button:not(.cc-primary):not([class*="primary"]),a[class*="button"]:not(.cc-primary),a[class*="btn"]:not(.cc-primary){
  background:var(--cc-surface-2)!important;color:var(--cc-text)!important;border-color:var(--cc-line)!important;
}
button:not(.cc-primary):hover,a[class*="button"]:hover,a[class*="btn"]:hover{background:var(--cc-surface-3)!important;border-color:var(--cc-line-strong)!important}
.cc-primary,[class*="primary"]{color:var(--cc-primary-contrast)!important}

.cc-bottom-nav{background:color-mix(in srgb,var(--cc-surface) 94%,transparent)!important;border-color:var(--cc-line)!important;box-shadow:0 -10px 30px color-mix(in srgb,var(--cc-page-bg) 45%,transparent)!important;backdrop-filter:blur(18px)}
.cc-bottom-nav-item{color:var(--cc-muted)!important}.cc-bottom-nav-item.active{background:var(--cc-surface-3)!important;color:var(--cc-primary)!important}
.cc-sidebar-nav-item{color:var(--cc-muted)!important}.cc-sidebar-nav-item.active{background:var(--cc-surface-3)!important;color:var(--cc-primary)!important}

/* Heros possuem composição própria em cada tema, não simples negativo. */
:is(.cc-control-hero,.cc-life-ai-hero,[class*="hero"]){border-color:var(--cc-line)!important}
html[data-crewcheck-theme="dark"] :is(.cc-control-hero,.cc-life-ai-hero,[class*="hero"]),html[data-crew-theme="dark"] :is(.cc-control-hero,.cc-life-ai-hero,[class*="hero"]){background:linear-gradient(135deg,#102b48,#0b1b31 70%,#172745)!important;color:#fff!important}
html[data-crewcheck-theme="light"] :is(.cc-control-hero,.cc-life-ai-hero,[class*="hero"]),html[data-crew-theme="light"] :is(.cc-control-hero,.cc-life-ai-hero,[class*="hero"]){background:linear-gradient(135deg,#ffffff,#edf7fc 68%,#e8eefb)!important;color:var(--cc-text)!important}
html[data-crewcheck-theme="light"] :is(.cc-control-hero,.cc-life-ai-hero,[class*="hero"]) :is(h1,h2,h3,strong){color:var(--cc-text-strong)!important}
html[data-crewcheck-theme="light"] :is(.cc-control-hero,.cc-life-ai-hero,[class*="hero"]) :is(p,small){color:var(--cc-muted)!important}

/* Ritmo visual único. */
:is(.cc-control-shell,.cc-page,.cc-shell,[class*="page-shell"],[class*="view-shell"]){gap:20px!important}
:is(.cc-control-card,[class*="card"],[class*="panel"]){border-radius:22px!important}
:is([class*="actions"],[class*="button-grid"],[class*="action-grid"]){gap:12px!important}
:is([class*="actions"],[class*="button-grid"],[class*="action-grid"])>button,:is([class*="actions"],[class*="button-grid"],[class*="action-grid"])>a{min-height:50px!important}
@media(min-width:700px) and (max-width:1180px){:is([class*="actions"],[class*="button-grid"],[class*="action-grid"]){display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important}}
@media(max-width:699px){:is([class*="actions"],[class*="button-grid"],[class*="action-grid"]){display:grid!important;grid-template-columns:1fr!important}}
`;
fs.writeFileSync('client/src/theme-v14-3-18.css', css, 'utf8');

update('client/src/main.tsx', (source) => source.includes('theme-v14-3-18.css') ? source : source.replace('import "./theme-v14-3-17.css";', 'import "./theme-v14-3-17.css";\nimport "./theme-v14-3-18.css";'));

update('client/src/components/premium/SideDrawer.tsx', (source) => {
  let next = source;
  if (!next.includes('Building2,')) next = next.replace('  ShieldCheck,\n', '  ShieldCheck,\n  Building2,\n');
  if (!next.includes("view: 'company'")) next = next.replace("      { view: 'support',  label: 'Ajuda',         icon: Mail,     home: true },", "      { view: 'support',  label: 'Ajuda',         icon: Mail,     home: true },\n      { view: 'company',  label: 'CrewCheck',     icon: Building2, href: '/sobre' },");
  next = next.replace("onClick={() => onNavigate(item.view, !!item.home)}", "onClick={() => ('href' in item && item.href) ? window.location.assign(item.href) : onNavigate(item.view, !!item.home)}");
  return next;
});

update('client/src/pages/AboutUsPage.tsx', (source) => source
  .replace(/Sobre nós/gi, 'CrewCheck')
  .replace(/Nossa história/g, 'Nossa origem'));

update('client/src/pages/Home.tsx', (source) => source.replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`).replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: temas independentes, identidade institucional visível e auditoria visual reforçada';`), { optional: true });
update('client/src/App.tsx', (source) => source.replace(/crewcheck_last_loaded_version', '[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`), { optional: true });
update('client/src/pages/AuthPage.tsx', (source) => source.replace(/crewcheck_last_loaded_version', '[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`).replace(/data-version="[^"]+"/g, `data-version="${VERSION}"`), { optional: true });
update('server/platform.mjs', (source) => source.replace(/const APP_VERSION = '\d+\.\d+\.\d+';/, `const APP_VERSION = '${VERSION}';`), { optional: true });
update('server.mjs', (source) => source.replace(/version\s*:\s*'\d+\.\d+\.\d+'/g, `version: '${VERSION}'`).replace(/v=\d+\.\d+\.\d+/g, `v=${VERSION}`).replace(/static-shell-\d+\.\d+\.\d+/g, `static-shell-${VERSION}`), { optional: true });
update('android-wrapper/app/build.gradle', (source) => source.replace(/versionCode\s+\d+/, 'versionCode 140318').replace(/versionName\s+["'][^"']+["']/, `versionName "${VERSION}"`), { optional: true });
update('package.json', (source) => { const data = JSON.parse(source); data.version = VERSION; data.description = `CrewCheck v${VERSION} - independent light and dark themes, institutional identity and visual audit`; return `${JSON.stringify(data, null, 2)}\n`; });

console.log(`[v14320] CrewCheck ${VERSION}: temas claro/escuro independentes e menu institucional CrewCheck.`);
