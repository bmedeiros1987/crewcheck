import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { parse } from '@babel/parser';

const current = fs.readFileSync('server.mjs', 'utf8');
const ast = parse(current, { sourceType: 'module' });
assert.ok(ast.program.body.some(node => node.type === 'VariableDeclaration' && node.declarations.some(declaration => declaration.id.name === 'conciergeKeyboard' && declaration.init?.type === 'CallExpression')), 'run canonical preparation before this test');
const committed = spawnSync('git', ['show', 'HEAD:server.mjs'], { encoding: 'utf8' });
assert.equal(committed.status, 0);
const raw = committed.stdout;
const stage = fs.readFileSync('scripts/v1403/apply-base.mjs', 'utf8');
// Execute the actual legacy writer with an in-memory filesystem. No server code
// is executed; no Telegram/API request is made, and this writes no real files.
let expectedRaw;
vm.runInNewContext(stage.replace(/^import .*;\r?\n/gm, ''), {
  fs: { existsSync: fs.existsSync, readFileSync: file => file === 'server.mjs' ? raw : fs.readFileSync(file, 'utf8'), writeFileSync: (_file, value) => { expectedRaw = value; } },
  preparedTelegramBase: () => false, console: { log() {} },
});
assert.ok(expectedRaw);
parse(expectedRaw, { sourceType: 'module' });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'v1403-base-'));
try {
  const files = ['scripts/v1403/apply-base.mjs', 'server/v1403/keyboards.snippet', 'server/v1403/request-user.snippet', 'server/v1403/premium-helpers.snippet', 'server/v1403/build-reply.snippet', 'server/v1404/telegram-language.mjs', 'scripts/telegram-concierge-menu/apply.mjs', 'scripts/v14338/reply-wrapper.snippet', 'scripts/v14323/apply.mjs', 'scripts/v14408/reply-wrapper.snippet'];
  if (fs.existsSync('scripts/v1403/prepared-base.mjs')) files.push('scripts/v1403/prepared-base.mjs');
  for (const file of files) { fs.mkdirSync(path.dirname(path.join(temp, file)), { recursive: true }); fs.copyFileSync(file, path.join(temp, file)); }
  fs.symlinkSync(path.resolve('node_modules'), path.join(temp, 'node_modules'), 'dir');
  const target = path.join(temp, 'server.mjs');
  function run(source) { fs.writeFileSync(target, source); return spawnSync(process.execPath, ['scripts/v1403/apply-base.mjs'], { cwd: temp, encoding: 'utf8' }); }
  const cold = run(raw);
  assert.equal(cold.status, 0, cold.stderr);
  assert.equal(fs.readFileSync(target, 'utf8'), expectedRaw, 'cold legacy writer output must remain unchanged');
  const formattedCold = run('/* synthetic formatting */\n' + raw);
  assert.equal(formattedCold.status, 0, formattedCold.stderr);
  assert.equal(fs.readFileSync(target, 'utf8'), '/* synthetic formatting */\n' + expectedRaw, 'cold AST witness ignores comments, not executable structure');
  for (const [name, source] of [['prepared', current], ['unrelated nested binding', current.replace("async function buildTelegramConciergeReply(text = '', profile = {}, snapshot = null) {", "async function buildTelegramConciergeReply(text = '', profile = {}, snapshot = null) {\n  function unused() { const stayMenuReply = () => {}; stayMenuReply(); }")]]) {
    for (let repeat = 0; repeat < 2; repeat++) {
      const result = run(source);
      assert.equal(result.status, 0, name + ': ' + result.stderr);
      const output = fs.readFileSync(target, 'utf8');
      assert.equal(output, source, name + ' must be byte-identical, including menu/core/stay/semantic/helper sections');
      parse(output, { sourceType: 'module' });
    }
  }
  const fn = name => ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === name);
  const replaceNode = (node, replacement) => current.slice(0, node.start) + replacement + current.slice(node.end);
  const stub = name => replaceNode(fn(name).body, '{}');
  const shadow = (fnName, declaration) => { const node = fn(fnName).body; return current.slice(0, node.start + 1) + '\n' + declaration + current.slice(node.start + 1); };
  const wrapper = fn('buildTelegramConciergeReply');
  const producer = name => wrapper.body.body.find(node => node.type === 'VariableDeclaration' && node.declarations[0].id.name === name);
  const fakeProducer = (name, expression) => replaceNode(producer(name).declarations[0].init, expression);
  const stayStart = wrapper.body.body[0].start, stayEnd = wrapper.body.body[2].end, semanticEnd = producer('rawReply').end;
  const movedStay = current.slice(0, stayStart) + current.slice(stayEnd, semanticEnd) + '\n' + current.slice(stayStart, stayEnd) + current.slice(semanticEnd);
  const menuImport = ast.program.body.find(node => node.type === 'ImportDeclaration' && node.source.value === './server/concierge/telegram-menu.mjs');
  const keyboard = ast.program.body.find(node => node.type === 'VariableDeclaration' && node.declarations.some(declaration => declaration.id.name === 'conciergeKeyboard'));
  const edits = [[menuImport.start, menuImport.end, ''], [fn('buildTelegramConciergeReplyCore').start, fn('buildTelegramConciergeReplyCore').end, ''], [keyboard.start, keyboard.end, 'const conciergeKeyboard = {};']];
  let strippedModern = current;
  for (const [start, end, replacement] of edits.sort((a, b) => b[0] - a[0])) strippedModern = strippedModern.slice(0, start) + replacement + strippedModern.slice(end);
  strippedModern = strippedModern.replace(/\n(?:[ \t]*\n)+(?=async function handleParsePdfApi)/g, '\n');
  const rawBody = parse(raw, { sourceType: 'module' }).program.body;
  const rawKeyboard = rawBody.filter(node => node.type === 'VariableDeclaration').flatMap(node => node.declarations).find(node => node.id.name === 'conciergeKeyboard').init;
  const rawWrapper = rawBody.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'buildTelegramConciergeReply').body;
  const negatives = [
    ['legacy keyboard mixed with modern router', current.replace('const conciergeKeyboard = menuTemplate();', 'const conciergeKeyboard = {};')],
    ['missing menu binding', current.replace(/^import .*from '\.\/server\/concierge\/telegram-menu.mjs';/m, '/* $& */')],
    ['wrong menu module', current.replace("from './server/concierge/telegram-menu.mjs'", "from './server/concierge/not-the-menu.mjs'")],
    ['partial transport wiring', current.replace('reply: buildTelegramConciergeReply,', 'reply: syntheticReply,')],
    ['missing core', replaceNode(fn('buildTelegramConciergeReplyCore'), '/* omitted core */')],
    ['stub core', stub('buildTelegramConciergeReplyCore')],
    ['stub wrapper', stub('buildTelegramConciergeReply')],
    ['stub semantic resolver', stub('conciergeSemanticResolveV14338')],
    ['stub request identity', stub('telegramRequestUser')],
    ['commented helper', replaceNode(fn('conciergeEasterEggNormalize'), '/* helper omitted */')],
    ['stub helper', stub('conciergeEasterEggReply')],
    ['duplicate helper', current + '\n' + current.slice(fn('conciergeEasterEggNormalize').start, fn('conciergeEasterEggNormalize').end)],
    ['missing stay priority', current.replace('if (stayMenu.handled) return stayMenu.reply;', '')],
    ['missing stay text continuation', current.replace('if (stayMenu.text) text = stayMenu.text;', '')],
    ['commented stay call', current.replace('const stayMenu = await stayMenuReply(text, profile);', 'const stayMenu = {}; /* await stayMenuReply(text, profile); */')],
    ['shadowed stay import', shadow('buildTelegramConciergeReply', 'const stayMenuReply = () => ({});')],
    ['shadowed core', shadow('buildTelegramConciergeReply', 'const buildTelegramConciergeReplyCore = () => "synthetic";')],
    ['shadowed resolver', shadow('buildTelegramConciergeReply', 'const conciergeSemanticResolveV14338 = () => ({});')],
    ['shadowed normalization', shadow('buildTelegramConciergeReplyCore', 'const normalizeConciergeButtonText = value => value;')],
    ['shadowed core helper', shadow('buildTelegramConciergeReplyCore', 'const conciergeEasterEggReply = () => "synthetic";')],
    ['shadowed voice policy', shadow('sendHumanTelegramVoiceReply', 'const premiumVoicePolicy = () => ({allowed:true});')],
    ['shadowed voice Math', shadow('sendHumanTelegramVoiceReply', 'const Math = syntheticMath;')],
    ['shadowed normalizer String', shadow('normalizeConciergeButtonText', 'const String = value => value;')],
    ['shadowed menu instance', shadow('processTelegramUpdate', 'const crewcheckMenu = syntheticMenu;')],
    ['missing semantic fallback', current.replace('const rawReply = resolved.handled', 'const rawReply = false')],
    ['missing callback priority', current.replace('if (await crewcheckMenu.callback(update)) return true;', '')],
    ['missing command passthrough', current.replace("  if (/^\\/[\\p{L}\\w]+(?:@\\w+)?(?:\\s|$)/u.test(text)) return text;", '')],
    ['missing voice policy', current.replace('if (!policy.allowed) return false;', '')],
    ['stay after semantic/core', movedStay],
    ['early core before stay', shadow('buildTelegramConciergeReply', 'await buildTelegramConciergeReplyCore(text, profile, snapshot);')],
    ['synthetic command producer', fakeProducer('command', '({snapshot:{}})')],
    ['synthetic snapshot producer', fakeProducer('currentSnapshot', '({})')],
    ['synthetic input context producer', fakeProducer('inputContext', '({})')],
    ['synthetic semantic producer', fakeProducer('semantic', '({intent:"unknown"})')],
    ['synthetic decoration producer', fakeProducer('decorated', '({reply:"synthetic"})')],
    ['stripped three modern markers', strippedModern],
    ['unknown cold keyboard', raw.slice(0, rawKeyboard.start) + '{}' + raw.slice(rawKeyboard.end)],
    ['unknown cold wrapper', raw.slice(0, rawWrapper.start) + '{}' + raw.slice(rawWrapper.end)],
    ['cold witnesses with modern residue', raw + '\n' + current.slice(fn('conciergeSemanticResolveV14338').start, fn('conciergeSemanticResolveV14338').end)],
  ];
  const accepted = [];
  for (const [name, source] of negatives) {
    assert.ok(source !== current, name + ' fixture must change');
    const result = run(source);
    if (result.status === 0) accepted.push(name);
    else {
      assert.match(result.stderr, /Incomplete prepared Telegram base|BABEL_PARSER_SYNTAX_ERROR|ponto não localizado/, name);
      assert.equal(fs.readFileSync(target, 'utf8'), source, name + ': failed stage must not write server');
    }
  }
  assert.deepEqual(accepted, [], 'partial/commented/shadowed bases must be rejected');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
console.log('PASS actual v1403 base: legacy output parity, prepared byte stability/syntax, and partial/commented/shadowed contracts rejected');
