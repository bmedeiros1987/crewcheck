import fs from 'node:fs';

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`[v14.3.51] Arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
}

function expect(condition, message) {
  if (!condition) throw new Error(`[v14.3.51] ${message}`);
}

process.env.CREWCHECK_V14351_SKIP_APPLY = '1';
const transforms = await import('./v14351/apply.mjs');

const identityFixture = `function MenuDrawer() {
  const storedUser = getStoredUser();
  const admin = isAdmin();
  const [profileName] = useState(() => storage.get('crewcheck_profile_display_name', String(storedUser?.name || storedUser?.email || 'Tripulante CrewCheck')));
  const [profileAvatar] = useState(() => storage.get('crewcheck_profile_avatar', ''));
  const initials = profileName.split(/\\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'CC';
  return <div>
          <button className="cz-menu-profile" onClick={openProfile} type="button" aria-label="Abrir perfil">
            <span className="cz-menu-avatar">{profileAvatar ? <img src={profileAvatar} alt="" /> : initials}</span>
            <span><strong>{profileName}</strong><small>{admin ? 'Administrador · Premium Unlimited' : 'Abrir perfil'}</small></span>
          </button>
  </div>;
}`;
const identityOnce = transforms.patchMenuIdentity(identityFixture);
const identityTwice = transforms.patchMenuIdentity(identityOnce);
expect(identityOnce === identityTwice, 'Transformação da identidade não é idempotente.');
expect(identityOnce.includes("authenticatedName || storage.get("), 'Conta autenticada não tem prioridade sobre nome local.');
expect(identityOnce.includes('data-menu-profile-email="true"'), 'E-mail autenticado não foi incluído.');
expect(identityOnce.includes('profileBase ? `Base ${profileBase}`'), 'Base do tripulante não foi incluída no contexto.');

const shellFixture = '<main className="cz-app" data-view={view} data-layout-v14344="web-icon-menu">';
const markedOnce = transforms.markStableAppShell(shellFixture);
const markedTwice = transforms.markStableAppShell(markedOnce);
expect(markedOnce === markedTwice, 'Identificador do App Shell não é idempotente.');

const cssOnce = transforms.installAppShellCss('body { color: inherit; }\n');
const cssTwice = transforms.installAppShellCss(cssOnce);
expect(cssOnce === cssTwice, 'Instalação do CSS do App Shell não é idempotente.');

const home = read('client/src/pages/Home.tsx');
const indexCss = read('client/src/index.css');
const appShellCss = read('scripts/v14351/app-shell.css');
const applyChain = read('scripts/v139/apply.mjs');
const patch = read('scripts/v14351/apply.mjs');
const packageJson = JSON.parse(read('package.json'));

expect(
  home.includes('data-layout-v14351="p0-stable-shell"'),
  'App Shell final não recebeu o identificador P0.',
);
expect(
  home.includes('data-menu-profile-email="true"'),
  'Menu final não mostra o e-mail da conta autenticada.',
);
expect(
  home.includes("authenticatedName || storage.get('crewcheck_profile_display_name'"),
  'Nome local ainda pode se sobrepor à conta autenticada.',
);
expect(
  home.includes("storedUser?.virtualBase || storedUser?.base"),
  'Menu final não identifica a base disponível da conta.',
);
expect(
  !home.includes("storage.get('crewcheck_profile_display_name', String(storedUser?.name"),
  'Precedência antiga do nome local ainda está presente.',
);

expect(
  indexCss.lastIndexOf('CrewCheck v14.3.51 — P0 app shell') > indexCss.lastIndexOf('CrewCheck v14.3.44 — menu Web icon-first'),
  'Overrides P0 precisam ser aplicados depois do menu icon-only.',
);
expect(
  appShellCss.includes('max-width: 1180px !important;'),
  'Largura máxima contida do App Shell não foi definida.',
);
expect(
  appShellCss.includes('width: min(94vw, 440px) !important;'),
  'Largura previsível do menu não foi definida.',
);
expect(
  appShellCss.includes('overflow-y: auto !important;'),
  'Menu não possui um único contêiner de rolagem vertical.',
);
expect(
  appShellCss.includes('grid-template-columns: minmax(0, 1fr) !important;'),
  'Menu Web não usa a mesma lista de uma coluna do mobile.',
);
expect(
  appShellCss.includes('visibility: visible !important;'),
  'Rótulos do menu continuam dependentes de hover.',
);

expect(
  applyChain.includes("await import('../v14351/apply.mjs');"),
  'v14.3.51 não está na preparação canônica.',
);
expect(packageJson.version === '14.3.51', `Versão esperada 14.3.51; recebida ${packageJson.version}.`);
expect(
  Boolean(packageJson.scripts?.['regression:v14.3.51:p0-app-shell']),
  'Script de regressão v14.3.51 não registrado.',
);

for (const protectedPath of [
  'client/src/lib/pdfParser.ts',
  'client/src/lib/canonicalRoster.ts',
  'client/src/lib/rosterContinuity.ts',
  'client/src/lib/financialRules.ts',
  'client/src/lib/complianceEngine.ts',
]) {
  expect(
    !patch.includes(`update('${protectedPath}'`),
    `Patch não deve alterar motor protegido: ${protectedPath}.`,
  );
}

console.log('[v14.3.51] OK — menu legível em uma coluna, scroll único, largura contida e identidade autenticada.');
