import fs from 'node:fs';
import { execSync } from 'node:child_process';

const css = fs.readFileSync('client/src/index.css', 'utf8');
const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const server = fs.readFileSync('server.mjs', 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`ERRO: ${message}`);
    process.exit(1);
  }
  console.log(`OK: ${message}`);
}

assert(home.includes("const DEFAULT_VERSION = '13.7.5'"), 'Home versionado 13.7.5');
assert(home.includes('openTelegramBinding'), 'frontend possui vínculo Telegram');
assert(home.includes('Vincular Telegram'), 'menu não usa Telegram como simples compartilhar');
assert(home.includes('cz-menu-scroll'), 'menu possui corpo rolável dedicado');
assert(home.includes('data-crew-menu-panel="true"'), 'painel real marcado');
assert(home.includes('email: getStoredUser()?.email'), 'despertador envia email para chat vinculado');

assert(css.includes('CrewCheck v13.7.5 — Layout Polish + Telegram Link'), 'CSS 13.7.5 aplicado');
assert(css.includes('.cz-menu-scroll'), 'CSS do corpo rolável aplicado');
assert(css.includes('button.cz-setting > span:last-child::after'), 'correção do toggle duplicado aplicada');
assert(css.includes('.cz-bottom-nav'), 'bottom nav coberta pelo CSS');

assert(server.includes('CrewCheck v13.7.5 — Telegram Link backend'), 'backend Telegram link inserido');
assert(server.includes('/api/telegram/link/start'), 'endpoint start registrado');
assert(server.includes('/api/telegram/link/status'), 'endpoint status registrado');
assert(server.includes('telegramTryBindFromWebhook'), 'webhook vincula start code');
assert(server.includes('telegramLinkedChatIdForEmail'), 'chat vinculado usado por email');
assert(server.includes('13.7.5'), 'server/shell contém versão 13.7.5');

let changed = '';
try { changed = execSync('git diff --name-only main...HEAD', { encoding: 'utf8' }); }
catch { changed = execSync('git diff --name-only', { encoding: 'utf8' }); }

assert(!changed.includes('client/src/lib/pdfParser.ts'), 'pdfParser não alterado');
assert(!changed.includes('client/src/lib/canonicalRoster.ts'), 'canonicalRoster não alterado');
assert(!changed.includes('client/src/lib/googleCalendarSync.ts'), 'Google Calendar não alterado');

const forbidden = ['xoxb-', 'PRIVATE KEY'];
for (const token of forbidden) {
  assert(!server.includes(token) && !home.includes(token) && !css.includes(token), `sem segredo hardcoded: ${token}`);
}

console.log('OK: CrewCheck v13.7.5 layout + Telegram link regression OK');
