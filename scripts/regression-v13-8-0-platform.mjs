import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [home, platform, server, client, android, androidMain, androidGradle, app, visitor, shared, email, rosterParser, packageJson] = await Promise.all([
  read('client/src/pages/Home.tsx'),
  read('server/platform.mjs'),
  read('server.mjs'),
  read('client/src/lib/platformClient.ts'),
  read('android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckBillingBridge.java'),
  read('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java'),
  read('android-wrapper/app/build.gradle'),
  read('client/src/App.tsx'),
  read('client/src/pages/VisitorAccessPage.tsx'),
  read('client/src/pages/SharedRosterPage.tsx'),
  read('client/src/lib/emailClient.ts'),
  read('server/rosterParser.mjs'),
  read('package.json'),
]);

assert.match(platform, /crewcheck_premium_monthly/);
assert.match(platform, /crewcheck_premium_annual/);
assert.match(platform, /google-play\/rtdn/);
assert.match(platform, /ASAAS_WEBHOOK_TOKEN/);
assert.match(platform, /CREATE TABLE IF NOT EXISTS crewcheck_platform_rosters/);
assert.match(platform, /CREATE TABLE IF NOT EXISTS crewcheck_platform_visitors/);
assert.match(platform, /CREATE TABLE IF NOT EXISTS crewcheck_platform_auth_attempts/);
assert.match(platform, /aes-256-gcm/);
assert.match(platform, /wakeup_call/);
assert.match(platform, /sameHotel/);
assert.match(platform, /gym_checkins/);
assert.match(platform, /telegram_token_hash/);
assert.match(platform, /retiredTokenHash/);
assert.match(platform, /PLATFORM_METHOD_POLICIES/);
assert.match(platform, /obfuscatedExternalAccountId/);
assert.match(platform, /handleBillingCancel/);
assert.match(platform, /Evento informativo registrado sem alterar a assinatura/);
assert.doesNotMatch(platform, /function asaasEventStatus[\s\S]*?return 'pending';[\s\S]*?\n\}/);
assert.match(platform, /handleVisitorUpdate/);
assert.match(platform, /handleVisitorChat/);
assert.match(platform, /handleOwnerVisitorChat/);
assert.match(platform, /OWNER_PREMIUM_REQUIRED/);
assert.match(platform, /SHARED_COWORKER_FIELDS/);
assert.match(platform, /'crew', 'crewlist', 'crewmembers', 'ccmlead'/);
assert.match(platform, /SHARED_COWORKER_FIELDS\.has\(key\.toLowerCase\(\)\)/);
assert.match(platform, /stripSharedCoworkerFields\(sanitizeRoster\(roster\)\)/);
assert.match(platform, /roster_key=\$2 AND share_with_visitors=TRUE/);
assert.match(platform, /await client\.query\('BEGIN'\)/);
assert.match(platform, /await client\.query\('ROLLBACK'\)/);
assert.match(client, /queryGooglePlayProducts/);
assert.match(client, /updateVisitorPermissions/);
assert.match(android, /BillingClient/);
assert.match(android, /acknowledgePurchase/);
assert.match(android, /setObfuscatedAccountId/);
assert.match(androidMain, /isCrewCheckWebUrl/);
assert.match(androidMain, /MIXED_CONTENT_NEVER_ALLOW/);
assert.match(androidMain, /ApplicationInfo\.FLAG_DEBUGGABLE/);
assert.match(androidGradle, /kotlin-bom:1\.8\.22/);
assert.match(app, /VisitorAccessPage/);
assert.match(app, /SharedRosterPage/);
assert.match(visitor, /emergency/);
assert.match(visitor, /\/api\/platform\/visitor\/chat/);
assert.match(shared, /permissions/);
assert.match(home, /actionableComplianceAlerts/);
assert.match(home, /conciergeKey/);
assert.match(home, /h \/ \{limit\.toFixed/);
assert.match(home, /Dias mais puxados da escala/);
assert.match(home, /SalaryReliableView/);
assert.match(home, /maps\/api\/staticmap\?size=900x520&scale=2/);
assert.match(home, /images\.kiwi\.com\/airlines/);
assert.match(home, /Atualizar e exportar ao card/);
assert.match(home, /Wellhub é um benefício corporativo que conecta empresas a academias parceiras; não é uma academia/);
assert.doesNotMatch(home, /Bruno Saraiva/);
assert.doesNotMatch(home, /TAF tendência operacional:/);
assert.doesNotMatch(home, /cz-pills.*Premium.*Beta/);
assert.match(email, /actionableAlerts/);
assert.doesNotMatch(email, /CrewCheck Premium/);
assert.match(server, /handlePlatformVisitorTelegram/);
assert.match(rosterParser, /pdfjs-dist\/legacy\/build\/pdf\.mjs/);
assert.match(rosterParser, /isEvalSupported:\s*false/);
assert.match(packageJson, /"pdfjs-dist":\s*"6\.1\.200"/);

const [{ jsPDF }, { parsePdfOnServer }, pdfjs] = await Promise.all([
  import('jspdf'),
  import('../server/rosterParser.mjs'),
  import('pdfjs-dist/legacy/build/pdf.mjs'),
]);
assert.equal(pdfjs.version, '6.1.200');
const smokePdf = new jsPDF();
smokePdf.text('CrewCheck PDF security smoke test 07/2026', 20, 20);
const parsedPdf = await parsePdfOnServer({
  filename: 'crewcheck-security-smoke.pdf',
  dataBase64: Buffer.from(smokePdf.output('arraybuffer')).toString('base64'),
});
assert.equal(typeof parsedPdf, 'object');

console.log('CrewCheck v13.8.0 platform regression OK');
