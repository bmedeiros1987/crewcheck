import fs from 'node:fs';
import { execSync } from 'node:child_process';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const server = fs.readFileSync('server.mjs', 'utf8');
const css = fs.readFileSync('client/src/index.css', 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`ERRO: ${message}`);
    process.exit(1);
  }
  console.log(`OK: ${message}`);
}

assert(home.includes("const DEFAULT_VERSION = '13.6.5'"), 'versão 13.6.5 aplicada');
assert(home.includes('function WakeupView'), 'WakeupView existe');
assert(home.includes('crewcheck_telegram_chat_id'), 'chat ID Telegram configurável');
assert(home.includes('crewcheck_wakeup_channel'), 'canal do despertador configurável');
assert(home.includes('/api/alarm/test'), 'teste do despertador no frontend');
assert(server.includes('function sendTelegramMessage'), 'envio Telegram no backend');
assert(server.includes('/api/telegram/send'), 'endpoint Telegram send registrado');
assert(server.includes('/api/telegram/setup-webhook'), 'endpoint setup webhook registrado');
assert(server.includes('/api/telegram/webhook'), 'webhook Telegram registrado');
assert(server.includes('/api/alarm/test'), 'endpoint alarm test registrado');
assert(server.includes('/api/alarm/preview'), 'endpoint alarm preview registrado');
assert(server.includes('TELEGRAM_WEBHOOK_SECRET'), 'secret do webhook suportado');
assert(css.includes('CrewCheck v13.6.5 — Telegram Concierge + Smart Wakeup'), 'CSS wakeup aplicado');
assert(!home.includes('ghp_') && !server.includes('ghp_'), 'sem token GitHub hardcoded');
assert(!home.includes('TELEGRAM_BOT_TOKEN'), 'token Telegram não exposto no frontend');

let changed = '';
try { changed = execSync('git diff --name-only main...HEAD', { encoding: 'utf8' }); }
catch { changed = execSync('git diff --name-only', { encoding: 'utf8' }); }

assert(!changed.includes('client/src/lib/pdfParser.ts'), 'pdfParser não foi alterado');
assert(!changed.includes('client/src/lib/canonicalRoster.ts'), 'canonicalRoster não foi alterado');
assert(!changed.includes('client/src/lib/googleCalendarSync.ts'), 'Google Calendar não foi alterado');

console.log('OK: CrewCheck v13.6.5 telegram/wakeup regression OK');
