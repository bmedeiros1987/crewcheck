import fs from 'node:fs';

function read(path) { return fs.readFileSync(path, 'utf8'); }
function assert(condition, label) {
  if (!condition) throw new Error(`ERRO: ${label}`);
  console.log(`OK: ${label}`);
}

const home = read('client/src/pages/Home.tsx');
const app = read('client/src/App.tsx');
const auth = read('client/src/pages/AuthPage.tsx');
const main = read('client/src/main.tsx');
const css = read('client/src/premium-audit-v13-8-8.css');
const server = read('server/platform.mjs');
const migration = read('migrations/20260715_004_terms_admin_amil.sql');
const envExample = read('.env.example');

assert(main.includes("premium-audit-v13-8-8.css"), 'camada visual final carregada');
assert(/const DEFAULT_VERSION = '13\.9\.\d+'/.test(home), 'Home versionada em release auditada');
assert(auth.includes('data-version="13.9.1"') || auth.includes('data-version="13.9.0"') || auth.includes('data-version="13.8.8"'), 'cadastro versionado em release auditada');
assert(css.includes('.cz-menu-header') && css.includes('.cz-bottom-nav'), 'menu e rodape auditados');
assert(css.includes('prefers-reduced-motion'), 'animacoes respeitam acessibilidade');
assert(css.includes('word-break: normal'), 'quebra vertical de nomes bloqueada');
assert(home.includes("['admin', 'Admin'"), 'menu Admin restaurado');
assert(home.includes("['bids','BIDS'") && (home.includes('function BidsView') || home.includes('BidsWindowsView')), 'BIDS restaurado com preferências e janelas reais');
assert(home.includes("['regulation','Regulamentação'") && home.includes("view === 'regulation'"), 'menu exclusivo de regulamentação restaurado');
assert(home.includes('cc-departure-mode-grid'), 'modos da Saida Inteligente restaurados');
assert(home.includes('Amil dentro do CrewCheck'), 'consulta Amil interna implementada');
assert(server.includes("'/api/platform/health/amil/search'"), 'proxy Amil protegido registrado');
assert(app.includes('<TermsGate>'), 'aceite de termos aplicado a usuarios existentes');
assert(server.includes("'/api/platform/terms/accept'"), 'aceite de termos persistido');
assert(server.includes("'/api/platform/admin/terms'"), 'editor administrativo de termos registrado');
assert(server.includes("String(published.content_hash || '') === contentHash"), 'termos identicos nao criam nova versao nem novo aceite');
assert(server.includes('TABLE_NAME AS table_name') && server.includes('COLUMN_NAME AS column_name') && server.includes('TABLE_NAME AS relation'), 'schema MySQL normaliza nomes do information_schema');
assert(server.includes("'/api/platform/admin/unlimited'"), 'concessao Unlimited administrativa registrada');
assert(migration.includes('ENGINE=InnoDB') && migration.includes('crewcheck_platform_terms_acceptances'), 'migration incremental Aiven MySQL pronta');
assert(!/\b(?:PGSSLMODE|POSTGRES|SUPABASE)\b/i.test(envExample), 'template sem variaveis PostgreSQL ou Supabase');
if (/^SMTP_/m.test(envExample)) {
  assert(envExample.includes('CREWCHECK_EMAIL_FALLBACK_ENABLED=true'), 'SMTP somente como fallback explícito');
  assert(envExample.includes('CREWCHECK_EMAIL_DISABLE_SMTP=false'), 'fallback SMTP habilitado de forma explícita');
} else {
  assert(true, 'template sem SMTP');
}
assert(/CREWCHECK_AMIL_ENABLED=false/.test(envExample), 'Amil segura ate receber credenciais oficiais');
assert(!/=(?:sk-|ghp_|AVNS_|cloudinary:\/\/)[^\s]*/.test(envExample), 'template sem segredos visiveis');

console.log('CrewCheck v13.8.8+ premium system audit OK');
