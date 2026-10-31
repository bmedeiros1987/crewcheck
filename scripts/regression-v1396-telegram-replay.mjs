import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { replaceTelegramLocationDispatch } from './v14346/telegram-dispatch.mjs';

const raw = fs.readFileSync('server.mjs', 'utf8');
const prepared = replaceTelegramLocationDispatch(raw);
const start = prepared.indexOf('  if (chatId && message?.location) {', prepared.indexOf('async function processTelegramUpdate'));
const end = prepared.indexOf('\n  if (chatId && telegramMessagePdfDocument', start);
assert.ok(start > 0 && end > start);
const canonical = prepared.slice(start, end);
const wrap = body => `import { phoneProviderStatus } from './server/v1396/infobip.mjs';\nasync function processTelegramUpdate(update = {}) {\n${body}\n}\n`;
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'v1396-replay-'));
try {
  for (const dir of ['client/src/pages', 'server/v1396', 'scripts/v1396']) fs.mkdirSync(path.join(temp, dir), { recursive: true });
  for (const name of fs.readdirSync('scripts/v1396').filter(name => name.endsWith('.mjs'))) fs.copyFileSync(`scripts/v1396/${name}`, path.join(temp, 'scripts/v1396', name));
  fs.symlinkSync(path.resolve('node_modules'), path.join(temp, 'node_modules'), 'dir');
  fs.writeFileSync(path.join(temp, 'server/v1396/infobip.mjs'), 'const INFOBIP_PHONE_FROM = "synthetic";');
  fs.writeFileSync(path.join(temp, 'render.yaml'), 'value: infobip');
  fs.writeFileSync(path.join(temp, 'client/src/pages/Home.tsx'), "const DEFAULT_VERSION = '13.9.5';");
  function run(server) {
    fs.writeFileSync(path.join(temp, 'server.mjs'), server);
    return spawnSync(process.execPath, ['scripts/v1396/apply.mjs'], { cwd: temp, encoding: 'utf8' });
  }
  for (const [name, server] of [
    ['raw', raw], ['prepared', prepared], ['minimal canonical', wrap(canonical)],
    ['canonical formatting/comments', wrap(canonical.replace(/^ +/gm, '').replace('const snapshotHandled', '// synthetic comment\nconst snapshotHandled'))],
    ['legacy broad route', wrap('  if (chatId && await handleV139Telegram(update, sendTelegramMessage)) return true;')],
    ['direct terminator after route', wrap(canonical + '\n  return false;')],
    ['conditional return before route', wrap('  if (syntheticFlag) return true;\n' + canonical)],
  ]) {
    const first = run(server);
    assert.equal(first.status, 0, `${name}: ${first.stderr}`);
    const bytes = fs.readFileSync(path.join(temp, 'server.mjs'), 'utf8');
    assert.equal(run(bytes).status, 0, `${name}: repeated safeguard`);
    assert.equal(fs.readFileSync(path.join(temp, 'server.mjs'), 'utf8'), bytes, 'safeguard must not change server routing');
  }
  const negatives = [
    ['absent', wrap('')],
    ['callback only', wrap('  if (update?.callback_query && await handleV139Telegram(update, sendTelegramMessage)) return true;')],
    ['call only', wrap('  const auxiliaryHandled = await handleV139Telegram(update, sendTelegramMessage, { silentLocation: true });')],
    ['missing guard', wrap(canonical.replace('  if (chatId && message?.location) {', '  if (chatId) {'))],
    ['missing decision', wrap(canonical.replace('    if (!locationDecision.process) return true;\n', ''))],
    ['missing snapshot', wrap(canonical.replace(/^.*const snapshotHandled.*\n/m, ''))],
    ['not silent', wrap(canonical.replace('silentLocation: true', 'silentLocation: false'))],
    ['wrong order', wrap(canonical.replace(/(    const snapshotHandled[^\n]+\n)(    const auxiliaryHandled[^\n]+\n)/, '$2$1'))],
    ['missing return', wrap(canonical.replace('    if (snapshotHandled || auxiliaryHandled) return true;\n', ''))],
    ['outside dispatcher', wrap('') + canonical],
    ['comment only', wrap('/*\n' + canonical + '\n*/')],
    ['template only', wrap('  const unused = `\n' + canonical + '\n`;')],
    ['uncalled nested function', wrap('  function unused() {\n' + canonical + '\n  }')],
    ['dead branch', wrap('  if (false) {\n' + canonical + '\n  }')],
    ['duplicate dispatcher', wrap(canonical) + wrap('')],
    ['non async dispatcher', wrap(canonical).replace('async function', 'function')],
    ['wrong parameter', wrap(canonical).replace('update = {}', 'other = {}')],
    ['invalid syntax', wrap(canonical) + '\nfunction {'],
    ['direct return before route', wrap('  return true;\n' + canonical)],
    ['direct throw before route', wrap('  throw new Error("synthetic");\n' + canonical)],
    ['generator dispatcher', wrap(canonical).replace('async function ', 'async function* ')],
  ];
  const acceptedNegatives = [];
  for (const [name, server] of negatives) {
    const result = run(server);
    if (result.status === 0) acceptedNegatives.push(name);
    else assert.match(result.stderr, /nenhum marcador compatível/, name);
  }
  assert.deepEqual(acceptedNegatives, [], 'non-executable/incomplete routes must be rejected');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
console.log('PASS real v1396 apply: raw/prepared canonical route, repeat stability and missing/incomplete/callback-only negatives');
