import fs from 'node:fs';

const VERSION = '14.0.5';
const VERSION_CODE = '140005';
const OWNED_SCOPE = 'https://www.googleapis.com/auth/calendar.events.owned';
const read = (file) => fs.readFileSync(file, 'utf8');
const write = (file, content) => fs.writeFileSync(file, content, 'utf8');

function replaceRequired(source, pattern, replacement, label) {
  pattern.lastIndex = 0;
  if (!pattern.test(source)) throw new Error(`CrewCheck v${VERSION}: ponto não localizado — ${label}.`);
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

function insertAfter(source, anchor, addition, label) {
  if (source.includes(addition.trim())) return source;
  if (!source.includes(anchor)) throw new Error(`CrewCheck v${VERSION}: âncora não localizada — ${label}.`);
  return source.replace(anchor, `${anchor}\n${addition}`);
}

const calendarPath = 'client/src/lib/googleCalendarSync.ts';
let calendar = read(calendarPath);

calendar = insertAfter(
  calendar,
  "import { crewcheckAuthHeader } from './authClient';",
  `import {\n  GoogleCalendarBridgeError,\n  connectGoogleCalendarViaServer,\n  disconnectGoogleCalendarServerBridge,\n  hasServerGoogleCalendarMarker,\n  isEmbeddedCrewCheckWebView,\n  serverGoogleCalendarDiagnosticLabel,\n  serverGoogleCalendarFetch,\n  serverGoogleCalendarHealth,\n  shouldUseServerGoogleCalendarBridge,\n} from './googleCalendarOAuthBridge';`,
  'import da ponte OAuth',
);

calendar = calendar.replace(
  /const GOOGLE_SCOPES = (?:\[[\s\S]*?\]\.join\(' '\)|'https:\/\/www\.googleapis\.com\/auth\/calendar\.events\.owned');/,
  `const GOOGLE_SCOPES = '${OWNED_SCOPE}';`,
);
if (!calendar.includes("const GOOGLE_SCOPE_DISCLOSURE_KEY = 'crewcheck_google_calendar_owned_events_disclosure_v1';")) {
  calendar = calendar.replace(
    `const GOOGLE_SCOPES = '${OWNED_SCOPE}';`,
    `const GOOGLE_SCOPES = '${OWNED_SCOPE}';\nconst GOOGLE_SCOPE_DISCLOSURE_KEY = 'crewcheck_google_calendar_owned_events_disclosure_v1';`,
  );
}
calendar = calendar
  .replace(/const GOOGLE_ANDROID_SHA1_FINGERPRINT = [^;]+;\n?/, '')
  .replace(/const GOOGLE_SERVICE_ACCOUNT_EMAIL = [^;]+;\n?/, '');

calendar = calendar.replace(
  /type GoogleTokenClient = \{[\s\S]*?\n\};/,
  `type GoogleTokenClient = {\n  requestAccessToken: (options?: { prompt?: string }) => void;\n  callback?: (response: GoogleTokenResponse) => void;\n};`,
);

calendar = calendar.replace(
  /let tokenClient: GoogleTokenClient \| null = null;\nlet loadingGoogleIdentity: Promise<void> \| null = null;/,
  `let tokenClient: GoogleTokenClient | null = null;\nlet tokenClientErrorHandler: ((error: any) => void) | null = null;\nlet loadingGoogleIdentity: Promise<void> | null = null;`,
);

calendar = replaceRequired(
  calendar,
  /export function googleCalendarIntegrationDiagnostics\(\): \{ label: string; value: string; tone: 'ok' \| 'warn' \| 'info' \}\[] \{[\s\S]*?\n\}/,
  `export function googleCalendarIntegrationDiagnostics(): { label: string; value: string; tone: 'ok' | 'warn' | 'info' }[] {\n  const origin = typeof window !== 'undefined' ? window.location.origin : 'servidor';\n  return [\n    { label: 'Conexão Google', value: hasGoogleCalendarToken() ? 'Conectada' : isGoogleCalendarConfigured() ? 'Pronta para conectar' : 'Aguardando configuração', tone: hasGoogleCalendarToken() ? 'ok' : isGoogleCalendarConfigured() ? 'info' : 'warn' },\n    { label: 'Autorização', value: serverGoogleCalendarDiagnosticLabel(), tone: 'info' },\n    { label: 'Permissão', value: 'Somente eventos no calendário principal pertencente ao usuário', tone: 'info' },\n    { label: 'Origem', value: origin, tone: 'info' },\n    { label: 'Sincronização', value: 'Reconexão segura e atualização sem duplicar eventos CrewCheck.', tone: 'ok' },\n  ];\n}`,
  'diagnóstico Google Calendar',
);

calendar = replaceRequired(
  calendar,
  /export function getGoogleClientId\(\): string \{[\s\S]*?\n\}\n\nexport function getGoogleClientIdOverride\(\): string \{[\s\S]*?\n\}\n\nexport function saveGoogleClientIdOverride\(value: string\): void \{[\s\S]*?\n\}/,
  `function isProductionGoogleOrigin(): boolean {\n  try {\n    const host = window.location.hostname.toLowerCase();\n    return host === 'crewcheck.online' || host === 'www.crewcheck.online' || host.endsWith('.onrender.com');\n  } catch { return true; }\n}\n\nexport function getGoogleClientId(): string {\n  const env = String((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_GOOGLE_CLIENT_ID || '').trim();\n  const override = getGoogleClientIdOverride();\n  return env || override || GOOGLE_CLIENT_ID_FALLBACK;\n}\n\nexport function getGoogleClientIdOverride(): string {\n  try {\n    if (isProductionGoogleOrigin()) {\n      localStorage.removeItem(CLIENT_ID_OVERRIDE_KEY);\n      return '';\n    }\n    return localStorage.getItem(CLIENT_ID_OVERRIDE_KEY) || '';\n  } catch { return ''; }\n}\n\nexport function saveGoogleClientIdOverride(value: string): void {\n  try {\n    if (isProductionGoogleOrigin()) {\n      localStorage.removeItem(CLIENT_ID_OVERRIDE_KEY);\n      tokenClient = null;\n      return;\n    }\n    const normalized = value.trim();\n    if (normalized) localStorage.setItem(CLIENT_ID_OVERRIDE_KEY, normalized);\n    else localStorage.removeItem(CLIENT_ID_OVERRIDE_KEY);\n    tokenClient = null;\n  } catch {}\n}`,
  'client ID Google',
);

calendar = calendar.replace(
  /export function hasGoogleCalendarToken\(\): boolean \{[\s\S]*?\n\}/,
  `export function hasGoogleCalendarToken(): boolean {\n  const token = readToken();\n  return Boolean(token?.access_token && token.expires_at > Date.now()) || hasServerGoogleCalendarMarker();\n}`,
);

if (!calendar.includes('function googleIdentityErrorMessage(')) {
  calendar = calendar.replace(
    'async function getTokenClient(): Promise<GoogleTokenClient> {',
    `function googleIdentityErrorMessage(error: any): string {\n  const type = String(error?.type || error?.error || error?.code || '').toLowerCase();\n  const origin = typeof window !== 'undefined' ? window.location.origin : '';\n  if (/popup_failed_to_open|popup_blocked/.test(type)) return 'O navegador bloqueou a janela do Google. Permita pop-ups para o CrewCheck e tente novamente.';\n  if (/popup_closed|access_denied|cancel/.test(type)) return 'A autorização do Google Calendar foi cancelada antes da conclusão.';\n  if (/origin_mismatch/.test(type)) return \`A origem \${origin} não está autorizada no OAuth do Google Cloud. Cadastre exatamente essa origem no Client ID Web.\`;\n  if (/invalid_client/.test(type)) return 'O Client ID do Google Calendar não corresponde ao projeto configurado. Revise o Client ID Web no Google Cloud.';\n  if (/disallowed_useragent|webview/.test(type)) return 'O Google não permite concluir esta autorização dentro da WebView. O CrewCheck abrirá o navegador seguro do aparelho.';\n  if (/admin_policy_enforced|org_internal/.test(type)) return 'A política da Conta Google bloqueou esta autorização. Use uma conta de teste autorizada ou ajuste o público do aplicativo no Google Cloud.';\n  return String(error?.message || error?.error_description || error?.type || 'O Google Identity Services não concluiu a autorização.');\n}\n\nasync function getTokenClient(): Promise<GoogleTokenClient> {`,
  );
}

calendar = calendar
  .replace('include_granted_scopes: true,', 'include_granted_scopes: false,')
  .replace(
    /include_granted_scopes: false,\n\s*\}\);/,
    `include_granted_scopes: false,\n      error_callback: (error: any) => { if (tokenClientErrorHandler) tokenClientErrorHandler(error); },\n    });`,
  );

calendar = replaceRequired(
  calendar,
  /export async function connectGoogleCalendar\(prompt = 'consent select_account'\): Promise<void> \{[\s\S]*?\n\}\n\nexport function disconnectGoogleCalendar/,
  `export async function connectGoogleCalendar(prompt = 'consent select_account'): Promise<void> {\n  const embedded = isEmbeddedCrewCheckWebView();\n  const bridgeHealth = await serverGoogleCalendarHealth();\n  if (embedded || bridgeHealth.configured || hasServerGoogleCalendarMarker()) {\n    try {\n      await connectGoogleCalendarViaServer();\n      return;\n    } catch (error) {\n      if (embedded || !(error instanceof GoogleCalendarBridgeError) || error.code !== 'GOOGLE_OAUTH_SERVER_NOT_CONFIGURED') throw error;\n    }\n  }\n  if (embedded) throw new Error('Abra a autorização do Google Calendar no navegador seguro do aparelho.');\n  const client = await getTokenClient();\n  await new Promise<void>((resolve, reject) => {\n    let settled = false;\n    const finish = (callback: () => void) => {\n      if (settled) return;\n      settled = true;\n      tokenClientErrorHandler = null;\n      window.clearTimeout(timer);\n      callback();\n    };\n    const timer = window.setTimeout(() => finish(() => reject(new Error(t('googleTimeout') || 'O login do Google Calendar demorou demais ou foi bloqueado. Permita pop-ups e tente novamente.'))), 90_000);\n    tokenClientErrorHandler = (error: any) => finish(() => reject(new Error(googleIdentityErrorMessage(error))));\n    client.callback = (response: GoogleTokenResponse) => {\n      if (response.error) return finish(() => reject(new Error(googleIdentityErrorMessage(response))));\n      finish(() => {\n        try { saveToken(response); resolve(); }\n        catch (error) { reject(error); }\n      });\n    };\n    try { client.requestAccessToken({ prompt }); }\n    catch (error) { finish(() => reject(new Error(googleIdentityErrorMessage(error)))); }\n  });\n}\n\nexport function disconnectGoogleCalendar`,
  'conexão Google Calendar',
);

calendar = calendar.replace(
  /export function disconnectGoogleCalendar\(\): void \{[\s\S]*?\n\}/,
  `export function disconnectGoogleCalendar(): void {\n  disconnectGoogleCalendarServerBridge();\n  try {\n    const token = readToken();\n    if (token?.access_token && googleIdentityGlobal()?.accounts?.oauth2?.revoke) {\n      googleIdentityGlobal().accounts.oauth2.revoke(token.access_token, () => undefined);\n    }\n    localStorage.removeItem(TOKEN_KEY);\n    sessionStorage.removeItem(TOKEN_KEY);\n  } catch {}\n}`,
);

calendar = replaceRequired(
  calendar,
  /async function googleFetch<T>\(path: string, init: RequestInit = \{\}, retry = true\): Promise<T> \{[\s\S]*?\n\}\n\nexport function loadGoogleCalendarSettings/,
  `async function googleFetch<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {\n  if (await shouldUseServerGoogleCalendarBridge()) {\n    try { return await serverGoogleCalendarFetch<T>(path, init); }\n    catch (error) {\n      if (retry && error instanceof GoogleCalendarBridgeError && (error.code === 'GOOGLE_RECONNECT_REQUIRED' || error.status === 401)) {\n        await connectGoogleCalendarViaServer();\n        return serverGoogleCalendarFetch<T>(path, init);\n      }\n      throw error;\n    }\n  }\n  const token = await ensureAccessToken();\n  const response = await fetch(\`\${GOOGLE_API}\${path}\`, {\n    ...init,\n    headers: {\n      'Authorization': \`Bearer \${token}\`,\n      'Content-Type': 'application/json',\n      ...(init.headers || {}),\n    },\n  });\n  if ((response.status === 401 || response.status === 403) && retry) {\n    try { localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY); } catch {}\n    await connectGoogleCalendar('consent select_account');\n    return googleFetch<T>(path, init, false);\n  }\n  const text = await response.text();\n  let payload: any = null;\n  try { payload = text ? JSON.parse(text) : null; } catch { payload = { error: { message: text } }; }\n  if (!response.ok) {\n    const message = payload?.error?.message || payload?.error_description || \`Google Calendar retornou erro \${response.status}.\`;\n    throw new Error(\`\${message} Reconecte o Google Calendar no CrewCheck.\`);\n  }\n  return payload as T;\n}\n\nexport function loadGoogleCalendarSettings`,
  'proxy Google Calendar',
);

calendar = calendar.replace(
  "const saved: GoogleCalendarSettings = { ...defaultGoogleCalendarSettings(), ...settings };",
  "const saved: GoogleCalendarSettings = { ...defaultGoogleCalendarSettings(), ...settings, selectedCalendarId: 'primary', selectedCalendarName: 'Calendário principal' };",
);

calendar = calendar.replace(
  /export async function listGoogleCalendars\(\): Promise<GoogleCalendarOption\[]> \{[\s\S]*?\n\}\n\nexport async function getCalendarFeedInfo/,
  `export async function listGoogleCalendars(): Promise<GoogleCalendarOption[]> {\n  return [{ id: 'primary', summary: 'Calendário principal', primary: true, accessRole: 'owner' }];\n}\n\nexport async function getCalendarFeedInfo`,
);
calendar = calendar.replace("const calendarId = settings.selectedCalendarId || 'primary';", "const calendarId = 'primary';");
calendar = calendar.replace(
  /export function explainCalendarFeed\(\): string \{[\s\S]*?\n\}/,
  `export function explainCalendarFeed(): string {\n  return 'Google Calendar direto e protegido: no Android, a autorização abre no navegador seguro; no web, o CrewCheck usa a conexão disponível e sincroniza somente eventos no calendário principal.';\n}`,
);

if (calendar.includes('calendar.calendarlist.readonly')) throw new Error(`CrewCheck v${VERSION}: escopo CalendarList amplo permaneceu no cliente.`);
if (/https:\/\/www\.googleapis\.com\/auth\/calendar\.events['"\s]/.test(calendar)) throw new Error(`CrewCheck v${VERSION}: escopo calendar.events amplo permaneceu no cliente.`);
write(calendarPath, calendar);

const serverPath = 'server.mjs';
let server = read(serverPath);
server = insertAfter(
  server,
  "import { buildInfobipTtsRequest, infobipConfiguration, infobipPublicStatus } from './server/v1396/infobip.mjs';",
  "import { handleGoogleCalendarOAuthRoute, googleCalendarOAuthReliability } from './server/v1405/google-calendar-oauth.mjs';",
  'import do OAuth Google no servidor',
);
if (!server.includes("reliabilityEnvItems().map")) throw new Error(`CrewCheck v${VERSION}: núcleo de confiabilidade não localizado.`);
server = server.replace(
  /function reliabilityEnvItems\(\) \{\n\s*return \[/,
  `function reliabilityEnvItems() {\n  return [\n    googleCalendarOAuthReliability(),`,
);
if (!server.includes('handleGoogleCalendarOAuthRoute(req, res, url')) {
  server = server.replace(
    "  if (url.pathname === '/api/auth/reset-password') return handleAuthResetPassword1371(req, res);",
    "  if (url.pathname === '/api/auth/reset-password') return handleAuthResetPassword1371(req, res);\n  if (await handleGoogleCalendarOAuthRoute(req, res, url, { identity: cc1371Verify(cc1371RequestToken(req)), authRequired: cc1371AuthRequired() })) return;",
  );
}
server = server.replace(/version\s*:\s*'(?:13\.9\.\d+|14\.0\.\d+)'/g, `version:'${VERSION}'`);
write(serverPath, server);

const renderPath = 'render.yaml';
if (fs.existsSync(renderPath)) {
  let render = read(renderPath);
  const marker = '      - key: GOOGLE_OAUTH_WEB_CLIENT_ID';
  if (!render.includes(marker)) {
    const anchor = '      - key: GOOGLE_MAPS_SERVER_KEY\n        sync: false';
    if (!render.includes(anchor)) throw new Error(`CrewCheck v${VERSION}: âncora de ambiente Render não localizada.`);
    render = render.replace(anchor, `${anchor}\n      - key: VITE_GOOGLE_CLIENT_ID\n        sync: false\n      - key: GOOGLE_OAUTH_WEB_CLIENT_ID\n        sync: false\n      - key: GOOGLE_OAUTH_WEB_CLIENT_SECRET\n        sync: false\n      - key: GOOGLE_OAUTH_REDIRECT_URI\n        value: https://crewcheck.online/api/google-calendar/oauth/callback\n      - key: CREWCHECK_PUBLIC_BASE_URL\n        value: https://crewcheck.online\n      - key: CREWCHECK_AUTH_SECRET\n        sync: false\n      - key: CREWCHECK_GOOGLE_TOKEN_ENCRYPTION_KEY\n        sync: false`);
  }
  write(renderPath, render);
}

for (const metadataPath of ['package.json', 'package-lock.json']) {
  if (!fs.existsSync(metadataPath)) continue;
  const metadata = JSON.parse(read(metadataPath));
  metadata.version = VERSION;
  if (metadataPath === 'package.json') {
    metadata.name = 'crewcheck-v14-0-5-google-calendar-secure-oauth';
    metadata.description = 'CrewCheck v14.0.5 - Google Calendar com OAuth seguro fora da WebView, menor privilégio e recuperação Cloud Identity';
    metadata.scripts = metadata.scripts || {};
    metadata.scripts['regression:v14.0.5:google-calendar-oauth'] = 'node scripts/regression-v14-0-5-google-calendar-cloud-identity.mjs';
  }
  if (metadata.packages?.['']) {
    metadata.packages[''].name = 'crewcheck-v14-0-5-google-calendar-secure-oauth';
    metadata.packages[''].version = VERSION;
  }
  write(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
}

const homePath = 'client/src/pages/Home.tsx';
if (fs.existsSync(homePath)) {
  let home = read(homePath);
  home = home.replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`);
  home = home.replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, "const CREWCHECK_UI_CORE_NOTE = 'v14.0.5: Google Calendar com OAuth seguro, navegador externo e recuperação Cloud Identity';");
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

console.log(`CrewCheck v${VERSION}: Google Calendar com OAuth seguro, navegador externo, token criptografado e proxy mínimo aplicado.`);
