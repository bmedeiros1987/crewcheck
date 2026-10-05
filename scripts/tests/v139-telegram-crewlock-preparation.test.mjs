import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { prepareTelegramCrewLock } from '../v139/telegram-crewlock-patch.mjs';

const anchor = "  if (chatId && text && await telegramTryBindFromWebhook(message, text)) return sendJson(res, 200, { ok: true, linked: true, message: 'Telegram vinculado.' });";
const route = "  if (chatId && message?.document && await handleV139Telegram(message, sendTelegramMessage)) return sendJson(res, 200, { ok: true, crewlock: true, message: 'Solicitação CrewLock processada.' });";
const assignment = '  const v1391TelegramHandled = await handleV139Telegram(update, sendTelegramMessage);';
const handledReturn = '  if (v1391TelegramHandled) return sendJson(res, 200, { ok: true, handled: true });';
const prepared = [
  'async function handleTelegramWebhook(req, res) {',
  "  const secret = envAny(['TELEGRAM_WEBHOOK_SECRET']);",
  '  if (secret) {',
  "    const received = String(req.headers['x-telegram-bot-api-secret-token'] || '');",
  "    if (received !== secret) return sendJson(res, 403, { ok: false, message: 'Webhook não autorizado.' });",
  '  }',
  "  if (req.method !== 'POST') return sendJson(res, 200, { ok: true, message: 'Concierge pronto para receber eventos.' });",
  '  const update = await readJsonBody(req);',
  assignment,
  handledReturn,
  '  return processTelegramUpdate(update);',
  '}',
].join('\n');
const raw = `async function processTelegramUpdate() {\n${anchor}\n}\n`;
const fails = source => assert.throws(() => prepareTelegramCrewLock(source), /âncora não encontrada em Telegram CrewLock/);

test('legacy source receives the original exact route once and stays byte-identical on rerun', () => {
  const once = prepareTelegramCrewLock(raw);
  assert.equal(once, raw.replace(anchor, `${anchor}\n${route}`));
  assert.equal(prepareTelegramCrewLock(once), once);
});

test('known prepared webhook stays byte-identical on repeated preparation', () => {
  assert.equal(prepareTelegramCrewLock(prepared), prepared);
  assert.equal(prepareTelegramCrewLock(prepareTelegramCrewLock(prepared)), prepared);
});

test('actual tracked or prepared server is untouched by the Telegram-only patch', () => {
  const source = readFileSync(new URL('../../server.mjs', import.meta.url), 'utf8');
  assert.equal(prepareTelegramCrewLock(source), source);
});

test('existing v1391 Telegram producer output is accepted without rewriting any byte', () => {
  const dir = mkdtempSync(join(tmpdir(), 'crewcheck-telegram-prepare-'));
  try {
    const source = prepared.replace(`${assignment}\n${handledReturn}\n`, '');
    writeFileSync(join(dir, 'server.mjs'), source);
    const script = fileURLToPath(new URL('../v1391/telegram-routing.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const generated = readFileSync(join(dir, 'server.mjs'), 'utf8');
    assert.equal(generated, prepared);
    assert.equal(prepareTelegramCrewLock(generated), generated);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('assignment without the exact handled return fails closed', () => {
  fails(prepared.replace(`${handledReturn}\n`, ''));
  fails(prepared.replace(handledReturn, handledReturn.replace('if (v1391TelegramHandled)', 'if (otherHandled)')));
  fails(prepared.replace('handled: true', 'handled: false'));
  fails(prepared.replace('sendJson(res, 200, { ok: true, handled: true })', 'sendJson(res, 403, { ok: true, handled: true })'));
});

test('return without the exact assignment and mismatched invocation fail closed', () => {
  fails(prepared.replace(`${assignment}\n`, ''));
  fails(prepared.replace('handleV139Telegram(update, sendTelegramMessage)', 'handleV139Telegram(message, anotherSender)'));
  fails(prepared.replace('const v1391TelegramHandled', 'const anotherHandled'));
});

test('changed webhook security or POST gates fail closed', () => {
  fails(prepared.replace("if (received !== secret)", 'if (false)'));
  fails(prepared.replace("req.method !== 'POST'", "req.method !== 'GET'"));
  fails(prepared.replace('await readJsonBody(req)', 'unverifiedBody'));
});

test('whole prepared prefix inside block comments is not executable evidence', () => {
  fails(`/*\n${prepared}\n*/\n`);
  fails(`/*\n${prepared}\n*/\nasync function handleTelegramWebhook(req, res) { return false; }`);
});

test('line comments and standalone marker strings are not executable evidence', () => {
  fails(prepared.split('\n').map(line => `// ${line}`).join('\n'));
  fails(`const decoy = ${JSON.stringify(prepared)};`);
  fails(`// await handleV139Telegram(message, sendTelegramMessage)\n`);
});

test('whole prepared prefix in a template literal cannot bypass the anchor', () => {
  fails('const decoy = `\n' + prepared + '\n`;');
  fails('const decoy = `\n' + prepared + '\n`;\nasync function handleTelegramWebhook(req, res) { return false; }');
});

test('nested or unrelated handlers cannot prove the top-level webhook route', () => {
  fails(`function unrelated() {\n${prepared}\n}`);
  fails(`if (false) {\n${prepared}\n}`);
  fails(prepared.replace('handleTelegramWebhook(req, res)', 'unrelatedHandler(req, res)'));
  fails('const decoy = `${(' + prepared + ')}`;');
});

test('dispatch hidden in a template or nested condition is rejected', () => {
  fails(prepared.replace(assignment, '  const decoy = `\n' + assignment).replace(handledReturn, handledReturn + '\n`;'));
  fails(prepared.replace(assignment, '  if (false) {\n' + assignment).replace(handledReturn, handledReturn + '\n  }'));
});

test('duplicate full prepared declarations fail closed', () => {
  fails(`${prepared}\n${prepared}`);
});

test('a commented legacy anchor cannot receive a fake successful patch', () => {
  fails(`/*\n${raw}\n*/`);
});

test('malformed source cannot use an unrelated syntax error as evidence', () => {
  assert.throws(() => prepareTelegramCrewLock(`${prepared}\nconst =;`), { code: 'ERR_INVALID_TYPESCRIPT_SYNTAX' });
});
