import fs from 'node:fs';

const serverPath = 'server.mjs';
if (!fs.existsSync(serverPath)) throw new Error('[mobile-google-identity] server.mjs não localizado.');
let server = fs.readFileSync(serverPath, 'utf8');
const importLine = "import { handleGoogleIdentityRoute } from './server/mobile/google-identity-oidc.mjs';";
if (!server.includes(importLine)) {
  const anchor = "import { handleGoogleCalendarOAuthRoute, googleCalendarOAuthReliability } from './server/v1405/google-calendar-oauth.mjs';";
  if (!server.includes(anchor)) throw new Error('[mobile-google-identity] import Calendar canônico não localizado após preparação v14.0.5.');
  server = server.replace(anchor, `${anchor}\n${importLine}`);
}
if (!server.includes('handleGoogleIdentityRoute(req, res, url, {')) {
  const routeAnchor = '  if (await handleGoogleCalendarOAuthRoute(req, res, url, { identity: cc1371Verify(cc1371RequestToken(req)), authRequired: cc1371AuthRequired() })) return;';
  if (!server.includes(routeAnchor)) throw new Error('[mobile-google-identity] rota Calendar canônica não localizada.');
  server = server.replace(routeAnchor, `${routeAnchor}\n  if (await handleGoogleIdentityRoute(req, res, url, { identity: cc1371Verify(cc1371RequestToken(req)), issueSession: (response, user, message) => cc1371Issue(response, user, message) })) return;`);
}
fs.writeFileSync(serverPath, server, 'utf8');

const authClientPath = 'client/src/lib/authClient.ts';
let authClient = fs.readFileSync(authClientPath, 'utf8');
if (!authClient.includes('export function persistExternalAuthSession(')) {
  const anchor = 'export function expireSession() {';
  if (!authClient.includes(anchor)) throw new Error('[mobile-google-identity] persistência de sessão canônica não localizada.');
  authClient = authClient.replace(anchor, `export function persistExternalAuthSession(session: AuthSession) {\n  persistSession(session);\n}\n\n${anchor}`);
  fs.writeFileSync(authClientPath, authClient, 'utf8');
}

const authPagePath = 'client/src/pages/AuthPage.tsx';
let authPage = fs.readFileSync(authPagePath, 'utf8');
const googleImport = "import { loginWithGoogle } from '@/lib/googleIdentityAuth';";
if (!authPage.includes(googleImport)) {
  const importAnchor = "import { confirmPasswordReset, login, register, requestPasswordReset } from '@/lib/authClient';";
  if (!authPage.includes(importAnchor)) throw new Error('[mobile-google-identity] import de autenticação não localizado.');
  authPage = authPage.replace(importAnchor, `${importAnchor}\n${googleImport}`);
}
if (!authPage.includes('async function submitGoogle()')) {
  const functionAnchor = '  function demo() {';
  if (!authPage.includes(functionAnchor)) throw new Error('[mobile-google-identity] ação demo não localizada.');
  const handler = `  async function submitGoogle() {\n    setBusy(true);\n    try {\n      const session = await loginWithGoogle();\n      if (isCrewFunction(session.user.rank)) saveProfileRank(session.user.email, session.user.rank);\n      else activateStoredProfileRank(session.user.email);\n      toast.success('Bem-vindo ao CrewCheck.');\n      setLocation('/');\n    } catch (error) {\n      toast.error(error instanceof Error ? error.message : 'Falha no login Google.');\n    } finally { setBusy(false); }\n  }\n\n`;
  authPage = authPage.replace(functionAnchor, `${handler}${functionAnchor}`);
}
if (!authPage.includes('Entrar com Google</button>')) {
  const buttonAnchor = "      {mode === 'login' && <button type=\"button\" className=\"cz-secondary\" onClick={demo}><Sparkles/> Ver modo demonstração</button>}";
  if (!authPage.includes(buttonAnchor)) throw new Error('[mobile-google-identity] botão demo não localizado.');
  authPage = authPage.replace(buttonAnchor, `      {mode === 'login' && <button type="button" className="cz-secondary" onClick={submitGoogle} disabled={busy}><ShieldCheck/> {busy ? 'Aguardando Google…' : 'Entrar com Google'}</button>}\n${buttonAnchor}`);
}
fs.writeFileSync(authPagePath, authPage, 'utf8');

const homePath = 'client/src/pages/Home.tsx';
let home = fs.readFileSync(homePath, 'utf8');
const cardImport = "import GoogleIdentityLinkCard from '@/components/GoogleIdentityLinkCard';";
if (!home.includes(cardImport)) home = `${cardImport}\n${home}`;
if (!home.includes('<GoogleIdentityLinkCard/>')) {
  const preferencesAnchor = '    <PlatformPreferences/>';
  if (!home.includes(preferencesAnchor)) throw new Error('[mobile-google-identity] Configurações canônicas não localizadas.');
  home = home.replace(preferencesAnchor, `${preferencesAnchor}\n    <GoogleIdentityLinkCard/>`);
}
fs.writeFileSync(homePath, home, 'utf8');

for (const path of ['package.json', 'package-lock.json']) {
  if (!fs.existsSync(path)) continue;
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  if (path === 'package.json') {
    data.scripts ||= {};
    data.scripts['regression:mobile:google-identity'] = 'node scripts/v139/apply.mjs && node scripts/regression-mobile-google-identity.mjs';
  }
  fs.writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

console.log('[mobile-google-identity] contrato OIDC Google separado do Calendar aplicado.');
