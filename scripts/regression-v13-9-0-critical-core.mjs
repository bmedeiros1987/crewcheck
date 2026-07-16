import fs from 'node:fs';

function read(path) { return fs.readFileSync(path, 'utf8'); }
function assert(condition, message) {
  if (!condition) {
    console.error(`ERRO: ${message}`);
    process.exit(1);
  }
  console.log(`OK: ${message}`);
}

const server = read('server.mjs');
const home = read('client/src/pages/Home.tsx');
const auth = read('client/src/pages/AuthPage.tsx');
const authClient = read('client/src/lib/authClient.ts');
const canonical = read('client/src/lib/canonicalRoster.ts');
const continuity = read('client/src/lib/rosterContinuity.ts');
const migration = read('migrations/20260715_005_v139_recovery_bids_crewlock.sql');
const packageJson = JSON.parse(read('package.json'));
const apply = read('scripts/v139/apply.mjs');

assert(packageJson.version === '13.9.0', 'versão do pacote 13.9.0');
assert(server.includes("from './server/v139/index.mjs'"), 'backend v13.9.0 ligado ao servidor');
assert(server.includes('await handleV139Route(req, res, url)'), 'rotas v13.9.0 precedem rotas antigas');
assert(server.includes('handleV139Telegram(message, sendTelegramMessage)'), 'CrewLock orientado pelo Telegram');
assert(auth.includes("type Mode = 'login' | 'register' | 'recover' | 'reset'"), 'tela de recuperação restaurada');
assert(auth.includes('telegram-call'), 'ligação com código disponível na recuperação');
assert(authClient.includes('PasswordResetDelivery'), 'cliente envia o canal de recuperação');
assert(migration.includes('crewcheck_platform_accounts'), 'tabela de contas incluída');
assert(migration.includes('crewcheck_platform_password_resets'), 'tabela de códigos temporários incluída');
assert(migration.includes('crewcheck_platform_bid_windows'), 'tabela BIDS incluída');
assert(migration.includes('crewcheck_platform_documents'), 'tabela CrewLock incluída');
assert(home.includes('BidsWindowsView'), 'BIDS avançado ligado à interface');
assert(home.includes('CrewLockView'), 'CrewLock ligado à interface');
assert(home.includes('RoutineIntelligenceView'), 'rotina inteligente ligada à interface');
assert(canonical.includes('completeContinuityDays'), 'continuidade física ligada ao motor canônico');
assert(continuity.includes('PERNOITE_CONTINUIDADE'), 'pernoite de continuidade implementado');
assert(continuity.includes('gapHours < 12'), 'limite mínimo de 12 horas preservado');
assert(!apply.includes("patch('client/src/lib/pdfParser.ts'"), 'parser PDF protegido contra alteração');
assert(!apply.includes("patch('client/src/lib/googleCalendarSync.ts'"), 'Google Calendar protegido contra alteração');
assert(fs.existsSync('client/src/lib/pdfParser.ts'), 'parser PDF existente');
assert(fs.existsSync('client/src/lib/googleCalendarSync.ts'), 'Google Calendar existente');

for (const file of [server, home, auth, authClient, canonical, continuity, migration]) {
  assert(!/ghp_[A-Za-z0-9_]{20,}/.test(file), 'sem token GitHub hardcoded');
  assert(!/cloudinary:\/\/[^:\s]+:[^@\s]+@/.test(file), 'sem segredo Cloudinary hardcoded');
}

console.log('OK: CrewCheck v13.9.0 critical core regression complete.');
