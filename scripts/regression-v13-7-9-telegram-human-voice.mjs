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

assert(server.includes('CrewCheck v13.7.9 — Telegram Human Voice Reply'), 'helpers humanos inseridos');
assert(server.includes('sendTelegramChatAction'), 'sendChatAction existe');
assert(server.includes("record_voice"), 'ação record_voice configurada');
assert(server.includes('sendHumanTelegramVoiceReply'), 'envio humanizado existe');
assert(server.includes('humanizeTelegramVoiceText'), 'humanizador de texto existe');
assert(server.includes('TELEGRAM_CONCIERGE_ECHO_TRANSCRIPT'), 'eco de transcript controlável por env');
assert(!server.includes('Áudio recebido. Estou transcrevendo'), 'não escreve transcrevendo');
assert(!server.includes('Resposta enviada em áudio pelo CrewCheck'), 'não escreve confirmação técnica de áudio');
assert(!server.includes('CrewCheck Concierge · resposta em áudio'), 'caption técnico removido');
assert(server.includes("version:'13.7.9'") || server.includes("version: '13.7.9'"), 'server versionado 13.7.9');
if (home) assert(home.includes("const DEFAULT_VERSION = '13.7.9'"), 'Home versionado 13.7.9');

let changed = '';
try { changed = execSync('git diff --name-only main...HEAD', { encoding: 'utf8' }); }
catch { changed = execSync('git diff --name-only', { encoding: 'utf8' }); }

assert(!changed.includes('client/src/lib/pdfParser.ts'), 'pdfParser não alterado');
assert(!changed.includes('client/src/lib/canonicalRoster.ts'), 'canonicalRoster não alterado');
assert(!changed.includes('client/src/lib/googleCalendarSync.ts'), 'Google Calendar não alterado');

const secretPatterns = [/sk-[A-Za-z0-9_-]{20,}/, /ghp_[A-Za-z0-9_]{20,}/, /xoxb-[A-Za-z0-9-]{20,}/, /JBFqnCBsd6RMkjVDRZzb/];
for (const pattern of secretPatterns) {
  assert(!pattern.test(server + home), `sem segredo hardcoded: ${pattern}`);
}

console.log('OK: CrewCheck v13.7.9 Telegram Human Voice regression OK');
