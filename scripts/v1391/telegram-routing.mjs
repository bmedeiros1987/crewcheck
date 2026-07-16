import fs from 'node:fs';

const path = 'server.mjs';
let source = fs.readFileSync(path, 'utf8');
const anchor = "  const message = update.message || update.edited_message || {};";
const marker = "v1391TelegramHandled";

if (!source.includes(marker)) {
  if (!source.includes(anchor)) throw new Error('v13.9.1: Telegram webhook anchor not found.');
  source = source.replace(
    anchor,
    `${anchor}\n  const v1391TelegramHandled = await handleV139Telegram(update, sendTelegramMessage);\n  if (v1391TelegramHandled) return sendJson(res, 200, { ok: true, handled: true });`,
  );
}

source = source
  .split('\n')
  .filter((line) => !line.includes('message?.document && await handleV139Telegram('))
  .join('\n');

fs.writeFileSync(path, source, 'utf8');
