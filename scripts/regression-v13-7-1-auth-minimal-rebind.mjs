import fs from 'node:fs';

const server = fs.readFileSync('server.mjs', 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`ERRO: ${message}`);
    process.exit(1);
  }
  console.log(`OK: ${message}`);
}

assert(server.includes('handleAuthConfig1371'), 'handleAuthConfig1371 definido');
assert(server.includes('handleAuthLogin1371'), 'handleAuthLogin1371 definido');
assert(server.includes('/api/auth/diagnostic'), 'diagnóstico de auth existe');
assert(server.includes("version: '13.7.1'") || server.includes("version:'13.7.1'"), 'server versionado em 13.7.1');
assert(server.includes('CREWCHECK_AUTH_SECRET'), 'usa segredo de auth por variável');
assert(server.includes('CREWCHECK_BLOCKED_EMAIL_DOMAINS'), 'bloqueio de domínio corporativo preservado');
assert(server.includes('CREWCHECK_TEST_ACCOUNT_EMAIL'), 'conta de teste por variável preservada');
assert(!server.includes('return handleAuthConfig(req, res);'), 'rota antiga handleAuthConfig removida');
assert(!server.includes('return handleCrewCheckRepairPage(req, res);'), 'rota antiga de reparo inexistente removida');

const forbidden = ['ghp_', 'sk-proj-', 'TELEGRAM_BOT_TOKEN=', 'INFOBIP_API_KEY=', 'DATABASE_URL=', 'OPENAI_API_KEY='];
for (const token of forbidden) {
  assert(!server.includes(token), `sem segredo hardcoded: ${token}`);
}

console.log('OK: CrewCheck v13.7.1 auth minimal rebind regression OK');
