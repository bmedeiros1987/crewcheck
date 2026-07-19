import fs from 'node:fs';

const VERSION = '14.0.2';
const VERSION_CODE = '140002';
const OWNED_EVENTS_SCOPE = 'https://www.googleapis.com/auth/calendar.events.owned';

const read = (path) => fs.readFileSync(path, 'utf8');
const write = (path, content) => fs.writeFileSync(path, content, 'utf8');

const calendarPath = 'client/src/lib/googleCalendarSync.ts';
if (!fs.existsSync(calendarPath)) throw new Error(`CrewCheck v${VERSION}: Google Calendar não localizado.`);
let calendar = read(calendarPath);

const legacyScopesPattern = /const GOOGLE_SCOPES = \[[\s\S]*?\]\.join\(' '\);/;
if (legacyScopesPattern.test(calendar)) {
  calendar = calendar.replace(
    legacyScopesPattern,
    `const GOOGLE_SCOPES = '${OWNED_EVENTS_SCOPE}';\nconst GOOGLE_SCOPE_DISCLOSURE_KEY = 'crewcheck_google_calendar_owned_events_disclosure_v1';`,
  );
} else if (!calendar.includes(`const GOOGLE_SCOPES = '${OWNED_EVENTS_SCOPE}';`)) {
  throw new Error(`CrewCheck v${VERSION}: configuração de escopo Google não reconhecida.`);
}

calendar = calendar
  .replace("{ label: 'Permissões', value: 'Eventos e lista de calendários autorizados pelo usuário', tone: 'info' },", "{ label: 'Permissão', value: 'Somente eventos no calendário Google pertencente ao usuário', tone: 'info' },")
  .replace('include_granted_scopes: true,', 'include_granted_scopes: false,')
  .replace("const calendarId = settings.selectedCalendarId || 'primary';", "const calendarId = 'primary';")
  .replace(
    "const saved: GoogleCalendarSettings = { ...defaultGoogleCalendarSettings(), ...settings };",
    "const saved: GoogleCalendarSettings = { ...defaultGoogleCalendarSettings(), ...settings, selectedCalendarId: 'primary', selectedCalendarName: 'Calendário principal' };",
  );

if (!calendar.includes('function confirmGoogleCalendarOwnedEventsDisclosure()')) {
  const connectMarker = 'export async function connectGoogleCalendar(prompt = \'consent select_account\'): Promise<void> {';
  if (!calendar.includes(connectMarker)) throw new Error(`CrewCheck v${VERSION}: entrada de conexão Google não localizada.`);
  calendar = calendar.replace(
    connectMarker,
    `function confirmGoogleCalendarOwnedEventsDisclosure(): void {\n  try {\n    if (localStorage.getItem(GOOGLE_SCOPE_DISCLOSURE_KEY) === 'accepted') return;\n  } catch {}\n  const accepted = window.confirm([\n    'Conectar o Google Calendar?',\n    '',\n    'O CrewCheck usará uma única permissão para criar, consultar, atualizar e excluir somente eventos nos calendários Google que pertencem a você.',\n    '',\n    'A sincronização usa apenas o período da escala e remove somente eventos identificados como CrewCheck. Seus e-mails, arquivos, contatos e eventos pessoais sem a marca CrewCheck não são acessados para esta funcionalidade.',\n    '',\n    'Você poderá revogar a autorização a qualquer momento.'\n  ].join('\\n'));\n  if (!accepted) throw new Error('Conexão com Google Calendar cancelada pelo usuário.');\n  try { localStorage.setItem(GOOGLE_SCOPE_DISCLOSURE_KEY, 'accepted'); } catch {}\n}\n\nexport async function connectGoogleCalendar(prompt = 'consent select_account'): Promise<void> {\n  if (/consent|select_account/i.test(prompt)) confirmGoogleCalendarOwnedEventsDisclosure();`,
  );
}

const listCalendarsPattern = /export async function listGoogleCalendars\(\): Promise<GoogleCalendarOption\[]> \{[\s\S]*?\n\}\n\nexport async function getCalendarFeedInfo/;
if (!listCalendarsPattern.test(calendar)) throw new Error(`CrewCheck v${VERSION}: função de calendário principal não localizada.`);
calendar = calendar.replace(
  listCalendarsPattern,
  `export async function listGoogleCalendars(): Promise<GoogleCalendarOption[]> {\n  // Menor privilégio: o CrewCheck não solicita CalendarList. A sincronização fica no calendário principal pertencente ao usuário.\n  return [{ id: 'primary', summary: 'Calendário principal', primary: true, accessRole: 'owner' }];\n}\n\nexport async function getCalendarFeedInfo`,
);

if (!calendar.includes(OWNED_EVENTS_SCOPE)) throw new Error(`CrewCheck v${VERSION}: escopo mínimo Google ausente.`);
if (calendar.includes('calendar.calendarlist.readonly')) throw new Error(`CrewCheck v${VERSION}: escopo CalendarList não pode permanecer.`);
if (/https:\/\/www\.googleapis\.com\/auth\/calendar\.events['"\s]/.test(calendar)) throw new Error(`CrewCheck v${VERSION}: escopo calendar.events amplo ainda está ativo.`);
write(calendarPath, calendar);

for (const metadataPath of ['package.json', 'package-lock.json']) {
  if (!fs.existsSync(metadataPath)) continue;
  const metadata = JSON.parse(read(metadataPath));
  metadata.version = VERSION;
  if (metadataPath === 'package.json') metadata.description = 'CrewCheck v14.0.2 - Google Calendar com menor privilégio, termos UTF-8 e pacote de verificação OAuth';
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
]) {
  if (!fs.existsSync(required)) throw new Error(`CrewCheck v${VERSION}: arquivo obrigatório ausente: ${required}`);
}

console.log(`CrewCheck v${VERSION}: OAuth Google Calendar mínimo, contrato UTF-8 e documentos de verificação aplicados.`);
