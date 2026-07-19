import assert from 'node:assert/strict';
import fs from 'node:fs';

await import('./v1402/apply.mjs');

const read = (path) => fs.readFileSync(path, 'utf8');
const calendar = read('client/src/lib/googleCalendarSync.ts');
const legal = read('client/src/pages/LegalPage.tsx');
const about = read('client/src/pages/OAuthVerificationPage.tsx');
const app = read('client/src/App.tsx');
const auth = read('client/src/pages/AuthPage.tsx');
const migration = read('migrations/20260719_009_google_oauth_legal_utf8.sql');
const kit = read('docs/google-oauth-verification-kit-2026.md');
const android = read('android-wrapper/app/build.gradle');
const metadata = JSON.parse(read('package.json'));

assert.equal(metadata.version, '14.0.2');
assert.match(android, /versionCode 140002\b/);
assert.match(android, /versionName '14\.0\.2'/);

assert.match(calendar, /https:\/\/www\.googleapis\.com\/auth\/calendar\.events\.owned/);
assert.doesNotMatch(calendar, /calendar\.calendarlist\.readonly/);
assert.doesNotMatch(calendar, /https:\/\/www\.googleapis\.com\/auth\/calendar\.events['"\s]/);
assert.match(calendar, /include_granted_scopes: false/);
assert.match(calendar, /return \[\{ id: 'primary'/);
assert.match(calendar, /confirmGoogleCalendarOwnedEventsDisclosure/);
assert.match(calendar, /remove somente eventos identificados como CrewCheck/);
assert.match(calendar, /const calendarId = 'primary'/);

assert.match(legal, /Política de Privacidade/);
assert.match(legal, /Google API Services User Data Policy/);
assert.match(legal, /Limited Use/);
assert.match(legal, /não serão utilizados para desenvolver, melhorar ou treinar modelos gerais/);
assert.match(legal, /Lei Geral de Proteção de Dados Pessoais/);
assert.match(legal, /Código de Defesa do Consumidor/);
assert.match(legal, /Última atualização: \$\{LAST_UPDATED\}/);

assert.match(about, /CrewCheck \+ Google Calendar/);
assert.match(about, /calendar\.events\.owned/);
assert.match(about, /Não lê e-mails, arquivos do Drive, contatos, fotos/);
assert.match(about, /Limited Use/);
assert.match(app, /path="\/about"/);
assert.match(app, /<LegalPage kind="privacy"/);
assert.match(app, /<LegalPage kind="terms"/);
assert.match(auth, /Termos de Uso<\/a> e a <a href="\/privacy"/);

assert.match(migration, /SET NAMES utf8mb4/);
assert.match(migration, /CONVERT TO CHARACTER SET utf8mb4/);
assert.match(migration, /TERMOS DE USO E POLÍTICA DE PRIVACIDADE CREWCHECK/);
assert.match(migration, /calendar\.events\.owned/);
assert.match(migration, /Google API Services User Data Policy/);
assert.match(migration, /não serão utilizados para desenvolver, melhorar ou treinar modelos gerais/);
assert.match(migration, /suporte@crewcheck\.app/);
assert.match(kit, /Scope justification — English/);
assert.match(kit, /Show all services/);
assert.match(kit, /Unlisted/);
assert.match(kit, /source Google Calendar account/);

console.log('CrewCheck v14.0.2 OAuth least privilege, UTF-8 legal terms and verification kit OK.');
