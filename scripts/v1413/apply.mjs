import fs from 'node:fs';

const serverPath = 'server.mjs';
if (!fs.existsSync(serverPath)) process.exit(0);

let source = fs.readFileSync(serverPath, 'utf8');

// All asynchronous webhook handlers may finish after the HTTP response has already
// been acknowledged. Prevent a second response from throwing ERR_HTTP_HEADERS_SENT.
source = source.replace(
  `function sendJson(res, status, payload) {\n  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });\n  res.end(JSON.stringify(payload));\n}`,
  `function sendJson(res, status, payload) {\n  if (res.headersSent || res.writableEnded) return;\n  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });\n  res.end(JSON.stringify(payload));\n}`
);

const webhookRead = `  const update = await readJsonBody(req);\n  if (await handleTelegramWeatherCallback(update))`;
const webhookFastAck = `  const update = await readJsonBody(req);\n  // Telegram requires a fast 2xx response. Acknowledge immediately, then keep\n  // processing the already-buffered update in this same invocation. Later\n  // sendJson calls become harmless no-ops through the response guard above.\n  sendJson(res, 200, { ok: true, accepted: true });\n  if (await handleTelegramWeatherCallback(update))`;
if (source.includes(webhookRead) && !source.includes('accepted: true')) {
  source = source.replace(webhookRead, webhookFastAck);
}

fs.writeFileSync(serverPath, source, 'utf8');
console.log('[v1413] Telegram webhook fast acknowledgement enabled without discarding the update body.');
