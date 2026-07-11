import fs from 'node:fs';
function assert(condition, message) { if (!condition) throw new Error(message); }
const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const client = fs.readFileSync('client/src/lib/telegramConciergeClient.ts', 'utf8');
const css = fs.readFileSync('client/src/index.css', 'utf8');
assert(home.includes("| 'concierge'"), 'ZeroView precisa incluir concierge');
assert(home.includes('TelegramConciergeView'), 'Tela TelegramConciergeView ausente');
assert(home.includes('Telegram e Concierge'), 'Entrada Telegram e Concierge ausente');
assert(home.includes('syncRosterWithTelegramConcierge'), 'Sincronismo de escala com Concierge ausente');
assert(home.includes('sendTelegramConciergeTest'), 'Teste de Telegram ausente');
assert(home.includes('askTelegramConcierge'), 'Perguntas do Concierge no app ausentes');
assert(home.includes('Ativar webhook'), 'Ação de webhook ausente');
for (const endpoint of ['/api/telegram/status', '/api/telegram/connect', '/api/telegram/preferences', '/api/telegram/test', '/api/telegram/share', '/api/telegram/roster-sync', '/api/telegram/concierge/ask', '/api/admin/telegram-health', '/api/admin/telegram-setup-webhook']) assert(client.includes(endpoint), `Cliente sem ${endpoint}`);
assert(!client.includes('password') && !client.includes('cookie') && !client.includes('sessionToken'), 'Cliente não deve manipular credenciais sensíveis');
assert(css.includes('Telegram notifications + Concierge restore') && css.includes('.cz-telegram-hero') && css.includes('.cz-concierge-switches') && css.includes('.cz-concierge-chat'), 'CSS premium do Telegram/Concierge ausente');
console.log('CrewCheck v13.5.0 Telegram notifications + Concierge regression OK');
