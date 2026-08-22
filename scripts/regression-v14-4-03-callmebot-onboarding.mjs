import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync('server.mjs', 'utf8');
const page = fs.readFileSync('client/src/pages/TelegramConnectPage.tsx', 'utf8');

assert.match(server, /CALLMEBOT_TELEGRAM_BOT_URL = 'https:\/\/t\.me\/CallMeBot_txtbot'/);
assert.match(server, /callMeBotOnboardingVersion: 2/);
assert.match(server, /callMeBotLegacyReady/);
assert.match(server, /callMeBotVerifiedAt/);
assert.match(server, /\/api\/telegram\/callmebot\/authorize/);
assert.match(server, /\/api\/telegram\/callmebot\/verify/);
assert.match(server, /callMeBotAuthorizationKeyboard\(\)/);
assert.doesNotMatch(server, /callMeBotReady: Boolean\(telegramUsername\)/);
assert.match(page, /Autorizar CallMeBot/);
assert.match(page, /Testar e concluir/);
assert.match(page, /callMeBotReady \? <span className="cc-callmebot-ready">Ativo<\/span>/);
assert.doesNotMatch(page, /buildCallMeBotUrl/);

console.log('[regression:v14.4.03] onboarding CallMeBot validado.');
