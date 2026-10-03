import fs from 'node:fs';

const VERSION = '14.0.2';
const VERSION_CODE = '140002';
const OWNED_EVENTS_SCOPE = 'https://www.googleapis.com/auth/calendar.events.owned';
const CALENDARLIST_READONLY_SCOPE = 'https://www.googleapis.com/auth/calendar.calendarlist.readonly';
// Menor privilégio vigente: eventos só em calendários próprios + leitura da lista de calendários
// para o usuário escolher o destino (calendário principal ou secundário próprio).
const CANONICAL_SCOPES = `const GOOGLE_SCOPES = [\n  '${OWNED_EVENTS_SCOPE}',\n  '${CALENDARLIST_READONLY_SCOPE}',\n].join(' ');`;
const DISCLOSURE_KEY_LINE = "const GOOGLE_SCOPE_DISCLOSURE_KEY = 'crewcheck_google_calendar_owned_events_disclosure_v2';";

const read = (path) => fs.readFileSync(path, 'utf8');
const write = (path, content) => fs.writeFileSync(path, content, 'utf8');

const calendarPath = 'client/src/lib/googleCalendarSync.ts';
if (!fs.existsSync(calendarPath)) throw new Error(`CrewCheck v${VERSION}: Google Calendar não localizado.`);
let calendar = read(calendarPath);

const scopesPattern = /const GOOGLE_SCOPES = (?:\[[\s\S]*?\]\.join\(' '\)|'[^']*');/;
if (!scopesPattern.test(calendar)) throw new Error(`CrewCheck v${VERSION}: configuração de escopo Google não reconhecida.`);
calendar = calendar.replace(scopesPattern, CANONICAL_SCOPES);
if (!calendar.includes(DISCLOSURE_KEY_LINE)) {
  calendar = calendar
    .replace(/const GOOGLE_SCOPE_DISCLOSURE_KEY = '[^']*';\n?/g, '')
    .replace(CANONICAL_SCOPES, `${CANONICAL_SCOPES}\n${DISCLOSURE_KEY_LINE}`);
}

calendar = calendar
  .replace('include_granted_scopes: true,', 'include_granted_scopes: false,');

if (!calendar.includes('function confirmGoogleCalendarOwnedEventsDisclosure()')) {
  const connectMarker = 'export async function connectGoogleCalendar(prompt = \'consent select_account\'): Promise<void> {';
  if (!calendar.includes(connectMarker)) throw new Error(`CrewCheck v${VERSION}: entrada de conexão Google não localizada.`);
  calendar = calendar.replace(
    connectMarker,
    `function confirmGoogleCalendarOwnedEventsDisclosure(): void {\n  try {\n    if (localStorage.getItem(GOOGLE_SCOPE_DISCLOSURE_KEY) === 'accepted') return;\n  } catch {}\n  const accepted = window.confirm([\n    'Conectar o Google Calendar?',\n    '',\n    'O CrewCheck usará duas permissões: criar, consultar, atualizar e excluir somente eventos nos calendários Google que pertencem a você, e ver (somente leitura) a lista dos seus calendários para você escolher o destino da escala.',\n    '',\n    'A sincronização usa apenas o período da escala e remove somente eventos identificados como CrewCheck. Seus e-mails, arquivos, contatos e eventos pessoais sem a marca CrewCheck não são acessados para esta funcionalidade.',\n    '',\n    'Você poderá revogar a autorização a qualquer momento.'\n  ].join('\\n'));\n  if (!accepted) throw new Error('Conexão com Google Calendar cancelada pelo usuário.');\n  try { localStorage.setItem(GOOGLE_SCOPE_DISCLOSURE_KEY, 'accepted'); } catch {}\n}\n\nexport async function connectGoogleCalendar(prompt = 'consent select_account'): Promise<void> {\n  if (/consent|select_account/i.test(prompt)) confirmGoogleCalendarOwnedEventsDisclosure();`,
  );
}

// A seleção de calendário (principal ou secundário próprio) é feita pela lista somente leitura;
// o proxy do servidor valida o calendarId e exige accessRole=owner.
if (!calendar.includes("'/users/me/calendarList?minAccessRole=owner")) throw new Error(`CrewCheck v${VERSION}: lista de calendários próprios não localizada.`);
if (!calendar.includes(OWNED_EVENTS_SCOPE)) throw new Error(`CrewCheck v${VERSION}: escopo mínimo Google ausente.`);
if (!calendar.includes(CALENDARLIST_READONLY_SCOPE)) throw new Error(`CrewCheck v${VERSION}: escopo somente leitura da lista de calendários ausente.`);
if (/https:\/\/www\.googleapis\.com\/auth\/calendar(?:\.events|\.calendarlist)?['"\s]/.test(calendar)) throw new Error(`CrewCheck v${VERSION}: escopo Google Calendar amplo ainda está ativo.`);
write(calendarPath, calendar);

for (const metadataPath of ['package.json', 'package-lock.json']) {
  if (!fs.existsSync(metadataPath)) continue;
  const metadata = JSON.parse(read(metadataPath));
  metadata.version = VERSION;
  if (metadataPath === 'package.json') {
    metadata.description = 'CrewCheck v14.0.2 - Google Calendar com menor privilégio, termos UTF-8 e pacote de verificação OAuth';
    metadata.scripts = metadata.scripts || {};
    metadata.scripts['db:migrate:v14.0.2'] = 'node scripts/apply-v14-0-2-migration.mjs';
    metadata.scripts['regression:v14.0.2:oauth-legal'] = 'node scripts/regression-v14-0-2-google-oauth-legal.mjs';
  }
  if (metadata.packages?.['']) metadata.packages[''].version = VERSION;
  write(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
}

const homePath = 'client/src/pages/Home.tsx';
if (fs.existsSync(homePath)) {
  let home = read(homePath);
  home = home.replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`);
  home = home.replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, "const CREWCHECK_UI_CORE_NOTE = 'v14.0.2: Google Calendar com menor privilégio, contrato UTF-8 e verificação OAuth';");
  write(homePath, home);
}

const manifestPath = 'client/public/manifest.json';
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(read(manifestPath));
  manifest.version = VERSION;
  const startUrl = String(manifest.start_url || '/');
  manifest.start_url = /([?&]v=)[^&]+/.test(startUrl) ? startUrl.replace(/([?&]v=)[^&]+/, `$1${VERSION}`) : `${startUrl}${startUrl.includes('?') ? '&' : '?'}v=${VERSION}`;
  write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

const androidPath = 'android-wrapper/app/build.gradle';
if (fs.existsSync(androidPath)) {
  let android = read(androidPath);
  android = android.replace(/versionCode\s+\d+\b/, `versionCode ${VERSION_CODE}`);
  android = android.replace(/versionName\s+'[^']+'/, `versionName '${VERSION}'`);
  write(androidPath, android);
}

if (fs.existsSync('server.mjs')) {
  let server = read('server.mjs');
  server = server.replace(/version\s*:\s*'(?:13\.9\.\d+|14\.0\.\d+)'/g, `version:'${VERSION}'`);
  write('server.mjs', server);
}

for (const required of [
  'client/src/pages/LegalPage.tsx',
  'client/src/pages/OAuthVerificationPage.tsx',
  'docs/google-oauth-verification-kit-2026.md',
  'migrations/20260719_009_google_oauth_legal_utf8.sql',
  'scripts/apply-v14-0-2-migration.mjs',
]) {
  if (!fs.existsSync(required)) throw new Error(`CrewCheck v${VERSION}: arquivo obrigatório ausente: ${required}`);
}

console.log(`CrewCheck v${VERSION}: OAuth Google Calendar mínimo, contrato UTF-8 e documentos de verificação aplicados.`);
