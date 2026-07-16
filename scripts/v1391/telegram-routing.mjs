import fs from 'node:fs';

const path = 'server.mjs';
let source = fs.readFileSync(path, 'utf8');
const marker = 'v1391TelegramHandled';

if (!source.includes(marker)) {
  const functionStart = source.indexOf('async function handleTelegramWebhook');
  if (functionStart < 0) throw new Error('v13.9.1: Telegram webhook function not found.');
  const searchArea = source.slice(functionStart, functionStart + 5000);
  const updateMatch = searchArea.match(/const\s+update\s*=\s*await\s+readJsonBody\([^;]+;/);
  if (!updateMatch) throw new Error('v13.9.1: Telegram update reader not found.');
  const absoluteEnd = functionStart + Number(updateMatch.index || 0) + updateMatch[0].length;
  const injection = "\n  const v1391TelegramHandled = await handleV139Telegram(update, sendTelegramMessage);\n  if (v1391TelegramHandled) return sendJson(res, 200, { ok: true, handled: true });";
  source = `${source.slice(0, absoluteEnd)}${injection}${source.slice(absoluteEnd)}`;
}

source = source
  .split('\n')
  .filter((line) => !line.includes('message?.document && await handleV139Telegram('))
  .join('\n');

fs.writeFileSync(path, source, 'utf8');
