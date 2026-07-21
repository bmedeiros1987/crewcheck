import fs from 'node:fs';

const serverPath = 'server.mjs';
if (!fs.existsSync(serverPath)) process.exit(0);

let source = fs.readFileSync(serverPath, 'utf8');

const broadRoute = `  if (chatId && await handleV139Telegram(update, sendTelegramMessage)) return sendJson(res, 200, { ok: true, handled: true, channel: 'crewcheck-v139', message: 'Solicitação CrewCheck processada.' });`;
const safeRoute = `  // Do not send ordinary text to auxiliary Telegram modules before the Concierge.
  // Emergency live-location updates still keep priority, while normal text always
  // reaches buildTelegramConciergeReply below.
  if (chatId && message?.location && await handleV139Telegram(update, sendTelegramMessage)) return sendJson(res, 200, { ok: true, handled: true, channel: 'crewcheck-v139-location', message: 'Localização operacional processada.' });`;

if (source.includes(broadRoute)) {
  source = source.replace(broadRoute, safeRoute);
}

// Add a diagnostic marker to the Telegram health response when the expected block exists.
source = source.replace(
  `commandsRestored: true,`,
  `commandsRestored: true,\n      conciergeTextRouting: true,`
);

fs.writeFileSync(serverPath, source, 'utf8');
console.log('[v1416] Telegram Concierge restored: ordinary text bypasses auxiliary handlers.');
