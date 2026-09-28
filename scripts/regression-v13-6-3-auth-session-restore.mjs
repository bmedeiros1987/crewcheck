import fs from 'node:fs';
import { execSync } from 'node:child_process';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const server = fs.readFileSync('server.mjs', 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`ERRO: ${message}`);
    process.exit(1);
  }
  console.log(`OK: ${message}`);
}

assert(home.includes("const DEFAULT_VERSION = '13.6.3'"), 'versão 13.6.3 aplicada');
assert(server.includes("import crypto from 'node:crypto'"), 'crypto importado para sessão assinada');
assert(server.includes('function handleAuthLogin'), 'handler login existe');
assert(server.includes('function handleAuthRegister'), 'handler cadastro existe');
assert(server.includes('function handleAuthMe'), 'handler me existe');
assert(server.includes('/api/auth/config'), 'rota auth config existe');
assert(server.includes('/api/auth/login'), 'rota auth login existe');
assert(server.includes('/api/auth/register'), 'rota auth register existe');
assert(server.includes('/api/auth/me'), 'rota auth me existe');
assert(server.includes('/api/auth/logout'), 'rota auth logout existe');
assert(server.indexOf('/api/auth/login') < server.indexOf("url.pathname.startsWith('/api/')"), 'auth vem antes do fallback /api');
assert(server.includes('CREWCHECK_AUTH_SECRET'), 'segredo de sessão configurável');
assert(server.includes('CREWCHECK_BLOCKED_EMAIL_DOMAINS'), 'bloqueio de domínio corporativo configurável');
assert(!server.includes('ghp_') && !home.includes('ghp_'), 'sem token GitHub hardcoded');
assert(!home.includes('FLIGHTAWARE_AEROAPI_KEY'), 'chave radar não exposta no frontend');

let changed = '';
try { changed = execSync('git diff --name-only main...HEAD', { encoding: 'utf8' }); }
catch { changed = execSync('git diff --name-only', { encoding: 'utf8' }); }

assert(!changed.includes('client/src/lib/pdfParser.ts'), 'pdfParser não foi alterado');
assert(!changed.includes('client/src/lib/canonicalRoster.ts'), 'canonicalRoster não foi alterado');
assert(!changed.includes('client/src/lib/googleCalendarSync.ts'), 'Google Calendar não foi alterado');

console.log('OK: CrewCheck v13.6.3 auth session restore regression OK');
