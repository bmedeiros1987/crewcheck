import fs from 'node:fs';
import { execSync } from 'node:child_process';

const server = fs.readFileSync('server.mjs', 'utf8');
const home = fs.existsSync('client/src/pages/Home.tsx') ? fs.readFileSync('client/src/pages/Home.tsx', 'utf8') : '';

function assert(condition, message) {
  if (!condition) {
    console.error(`ERRO: ${message}`);
    process.exit(1);
  }
  console.log(`OK: ${message}`);
}

assert(!server.includes("url.pathname === '/api/telegram/stt-health','/api/tts/health'"), 'bug do operador vírgula removido');
assert(!/url\.pathname\s*===\s*['\"][^'\"]+['\"]\s*,\s*['\"][^'\"]+['\"]/.test(server), 'nenhuma rota pathname usa operador vírgula');
assert(server.includes("if (url.pathname === '/api/telegram/stt-health') return handleTelegramSttHealth(req, res, url);"), 'rota STT estrita');
assert(server.includes("if (url.pathname === '/api/tts/health') return handleTtsHealth(req, res);"), 'rota TTS separada');
assert(server.includes('return serveStatic(req, res, url);'), 'fallback SPA preservado');
assert(server.includes("version:'13.7.10'") || server.includes("version: '13.7.10'"), 'server versionado 13.7.10');
if (home) assert(home.includes("const DEFAULT_VERSION = '13.7.10'"), 'Home versionado 13.7.10');

let changed = '';
try { changed = execSync('git diff --name-only main...HEAD', { encoding: 'utf8' }); }
catch { changed = execSync('git diff --name-only', { encoding: 'utf8' }); }
assert(!changed.includes('client/src/lib/pdfParser.ts'), 'pdfParser não alterado');
assert(!changed.includes('client/src/lib/canonicalRoster.ts'), 'canonicalRoster não alterado');
assert(!changed.includes('client/src/lib/googleCalendarSync.ts'), 'Google Calendar não alterado');

const secretPatterns = [/sk-[A-Za-z0-9_-]{20,}/, /ghp_[A-Za-z0-9_]{20,}/, /xoxb-[A-Za-z0-9-]{20,}/, /JBFqnCBsd6RMkjVDRZzb/];
for (const pattern of secretPatterns) assert(!pattern.test(server + home), `sem segredo hardcoded: ${pattern}`);

console.log('OK: CrewCheck v13.7.10 App Route Guard regression OK');
