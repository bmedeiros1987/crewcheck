import fs from 'node:fs';

const VERSION = '14.3.51';
const VERSION_DIGITS = VERSION.replace(/\./g, '');
const APP_SHELL_CSS_MARKER = '/* CrewCheck v14.3.51 — P0 app shell, menu legível e identidade autenticada */';
const appShellCss = fs.readFileSync(new URL('./app-shell.css', import.meta.url), 'utf8').trim();

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v14351] Arquivo ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function variants(value) {
  return [...new Set([value, value.replace(/\n/g, '\r\n')])];
}

function withEol(value, eol) {
  return value.trimEnd().replace(/\n/g, eol);
}

function replaceRequired(source, before, after, label) {
  if (variants(after.trim()).some((candidate) => source.includes(candidate))) return source;
  const matched = variants(before).find((candidate) => source.includes(candidate));
  if (!matched) throw new Error(`[v14351] Bloco ausente: ${label}`);
  const eol = matched.includes('\r\n') ? '\r\n' : '\n';
  return source.replace(matched, withEol(after, eol));
}

export function patchMenuIdentity(source) {
  let next = source;

  next = replaceRequired(
    next,
    `  const storedUser = getStoredUser();
  const admin = isAdmin();
  const [profileName] = useState(() => storage.get('crewcheck_profile_display_name', String(storedUser?.name || storedUser?.email || 'Tripulante CrewCheck')));
  const [profileAvatar] = useState(() => storage.get('crewcheck_profile_avatar', ''));
  const initials = profileName.split(/\\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'CC';`,
    `  const storedUser = getStoredUser();
  const admin = isAdmin();
  const authenticatedName = String(storedUser?.name || '').trim();
  const [profileName] = useState(() => authenticatedName || storage.get('crewcheck_profile_display_name', String(storedUser?.email || 'Tripulante CrewCheck')));
  const [profileAvatar] = useState(() => storage.get('crewcheck_profile_avatar', ''));
  const profileEmail = String(storedUser?.email || '').trim();
  const roleSource = String(storedUser?.rank || storedUser?.role || '').trim();
  const profileRole = admin ? 'Administrador' : (/^(user|member)$/i.test(roleSource) ? 'Tripulante' : roleSource || 'Tripulante');
  const profileBase = String(storedUser?.virtualBase || storedUser?.base || '').trim().toUpperCase();
  const profilePlan = admin ? 'Premium Unlimited' : (storedUser?.premiumAccess ? 'Premium' : '');
  const profileMeta = [profileRole, profileBase ? \`Base \${profileBase}\` : '', profilePlan].filter(Boolean).join(' · ');
  const initials = profileName.split(/\\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'CC';`,
    'identidade autenticada do menu',
  );

  next = replaceRequired(
    next,
    `          <button className="cz-menu-profile" onClick={openProfile} type="button" aria-label="Abrir perfil">
            <span className="cz-menu-avatar">{profileAvatar ? <img src={profileAvatar} alt="" /> : initials}</span>
            <span><strong>{profileName}</strong><small>{admin ? 'Administrador · Premium Unlimited' : 'Abrir perfil'}</small></span>
          </button>`,
    `          <button className="cz-menu-profile" onClick={openProfile} type="button" aria-label={profileEmail ? \`Abrir perfil de \${profileName}, \${profileEmail}\` : \`Abrir perfil de \${profileName}\`}>
            <span className="cz-menu-avatar">{profileAvatar ? <img src={profileAvatar} alt="" /> : initials}</span>
            <span className="cz-menu-profile-copy">
              <strong>{profileName}</strong>
              {profileEmail ? <small className="cz-menu-profile-email" data-menu-profile-email="true">{profileEmail}</small> : null}
              <small className="cz-menu-profile-meta">{profileMeta || 'Abrir perfil'}</small>
            </span>
          </button>`,
    'nome, e-mail e contexto da conta no menu',
  );

  return next;
}

export function markStableAppShell(source) {
  if (source.includes('data-layout-v14351="p0-stable-shell"')) return source;
  const preferredAnchor = 'data-layout-v14344="web-icon-menu"';
  if (source.includes(preferredAnchor)) {
    return source.replace(
      preferredAnchor,
      `${preferredAnchor} data-layout-v14351="p0-stable-shell"`,
    );
  }
  const fallbackAnchor = 'data-view={view}';
  if (!source.includes(fallbackAnchor)) throw new Error('[v14351] App Shell principal não localizado.');
  return source.replace(
    fallbackAnchor,
    `${fallbackAnchor} data-layout-v14351="p0-stable-shell"`,
  );
}

export function installAppShellCss(source) {
  const markerIndex = source.indexOf(APP_SHELL_CSS_MARKER);
  if (markerIndex < 0) return `${source.trimEnd()}\n\n${appShellCss}\n`;
  const nextCrewCheckMarker = source.indexOf('/* CrewCheck v', markerIndex + APP_SHELL_CSS_MARKER.length);
  const prefix = source.slice(0, markerIndex).trimEnd();
  const suffix = nextCrewCheckMarker >= 0 ? source.slice(nextCrewCheckMarker).trimStart() : '';
  return `${prefix}${prefix ? '\n\n' : ''}${appShellCss}${suffix ? `\n\n${suffix}` : '\n'}`;
}

if (process.env.CREWCHECK_V14351_SKIP_APPLY !== '1') {
  update('client/src/pages/Home.tsx', (source) => {
    let next = source
      .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
      .replace(
        /const CREWCHECK_UI_CORE_NOTE = '[^']+';/,
        `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: App Shell contido, menu sempre legível e conta autenticada identificada';`,
      );
    next = patchMenuIdentity(next);
    next = markStableAppShell(next);
    return next;
  });

  update('client/src/index.css', installAppShellCss);
  update('client/src/App.tsx', (source) => source
    .replace(/crewcheck_last_loaded_version',\s*'[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`)
    .replace(/crewcheck-client-cleanup:[^']+/g, `crewcheck-client-cleanup:${VERSION}`), { optional: true });
  update('client/src/pages/AuthPage.tsx', (source) => source.replace(/14\.3\.\d+/g, VERSION), { optional: true });
  update('client/src/lib/crewcheckPremiumRuntime.ts', (source) => source.replace(/version:\s*'14\.3\.\d+'/, `version: '${VERSION}'`), { optional: true });
  update('client/index.html', (source) => source
    .replace(/data-crewcheck-release="[^"]+"/g, `data-crewcheck-release="${VERSION}"`)
    .replace(/name="crewcheck-release" content="[^"]+"/g, `name="crewcheck-release" content="${VERSION}"`)
    .replace(/var currentRelease = '[^']+';/g, `var currentRelease = '${VERSION}';`)
    .replace(/manifest\.json\?v=\d+/g, `manifest.json?v=${VERSION_DIGITS}`)
    .replace(/sw\.js\?v=\d+/g, `sw.js?v=${VERSION_DIGITS}`), { optional: true });
  update('client/public/sw.js', (source) => source
    .replace(/crewcheck-v[0-9.]+-shell/g, `crewcheck-v${VERSION}-shell`)
    .replace(/crewcheck-v[0-9.]+-runtime/g, `crewcheck-v${VERSION}-runtime`), { optional: true });
  update('client/public/release.json', () => `${JSON.stringify({
    version: VERSION,
    channel: 'web',
    updatePolicy: 'automatic-safe',
    notes: 'Menu Web e mobile usam a mesma navegação legível, com largura e rolagem estáveis e identificação completa da conta.',
  }, null, 2)}\n`, { optional: true });
  update('server/platform.mjs', (source) => source.replace(/const APP_VERSION = '\d+\.\d+\.\d+';/, `const APP_VERSION = '${VERSION}';`), { optional: true });
  update('server.mjs', (source) => source
    .replace(/(url\.pathname === '\/api\/(?:release|health)'[^\r\n]*\bversion\s*:\s*)'\d+\.\d+\.\d+'/g, `$1'${VERSION}'`), { optional: true });
  update('package.json', (source) => {
    const data = JSON.parse(source);
    data.version = VERSION;
    data.description = `CrewCheck v${VERSION} - stable P0 app shell, readable menu and authenticated identity`;
    data.scripts ||= {};
    data.scripts['regression:v14.3.51:p0-app-shell'] = 'node scripts/v139/apply.mjs && node scripts/regression-v14-3-51-p0-app-shell.mjs';
    return `${JSON.stringify(data, null, 2)}\n`;
  });
  update('android-wrapper/app/build.gradle', (source) => source
    .replace(/versionCode\s+\d+/, 'versionCode 140351')
    .replace(/versionName\s+["'][^"']+["']/, `versionName "${VERSION}"`), { optional: true });

  console.log(`[v14351] CrewCheck ${VERSION}: App Shell P0, menu legível e identidade autenticada.`);
}
