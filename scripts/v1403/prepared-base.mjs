import { parse } from '@babel/parser';
import traversal from '@babel/traverse';
import { createHash } from 'node:crypto';

const options = { sourceType: 'module' };
const metadata = new Set(['start', 'end', 'loc', 'extra', 'leadingComments', 'innerComments', 'trailingComments']);
const shape = node => JSON.stringify(node, (key, value) => metadata.has(key) ? undefined : value);
const nodes = source => parse(source, options).program.body;
const fragment = source => nodes(`async function fragment() { ${source} }`)[0].body.body;
const stay = fragment(`const stayMenu = await stayMenuReply(text, profile);
  if (stayMenu.handled) return stayMenu.reply;
  if (stayMenu.text) text = stayMenu.text;`);
const semantic = fragment(`const resolved = await conciergeSemanticResolveV14338(semantic, profile, currentSnapshot, inputContext);
  const rawReply = resolved.handled ? resolved.reply : await buildTelegramConciergeReplyCore(resolved.rewrite || semantic.rewrite || text, profile, currentSnapshot);`);
const finalize = fragment(`const finalized = conciergeFinalizeReplyV14354(decorated.reply, text);
  return conciergeHumanizeReplyV14408(finalized, text);`);
const callbacks = fragment(`if (await crewcheckMenu.callback(update)) return true;
  if (await crewcheckMenu.text(update.message || {})) return true;`);
const coreTargets = new Set(['conciergePremiumScheduleReply', 'conciergeRadarReply', 'conciergeWeatherAlertsReply', 'conciergeAtisReply', 'conciergeWeatherReply', 'conciergePremiumDepartureReply', 'conciergePerDiemReply']);
const ambient = new Set(['String', 'Number', 'Boolean', 'Object', 'Array', 'Math', 'Date', 'RegExp', 'JSON', 'Intl', 'fetch']);
// Positive AST witnesses for the committed cold base at main 5dd82be0. Comments,
// positions and original spelling are excluded by shape(); unknown states fail.
const coldShapes = [
  ['conciergeKeyboard', 'b90d8f4a2d71798e7da395f8dd0cbbf5223b9b4980e06cc37628d6c7c8d5cc27'],
  ['normalizeConciergeButtonText', '45f3ad97659d2511a200d1285e39c53551a803ed97facc8a5572b3d7107f291c'],
  ['buildTelegramConciergeReply', '81d80f63abf7f4d846ec2d2fb6e53b58177e56f0c1775ea5fcd0bd77a451c2fb'],
];

// This recognizes the later composed base as a whole. A mixed/partial modern
// tree must fail before the legacy writer can replace any server section.
export function preparedTelegramBase(source, references) {
  const file = parse(source, options), body = file.program.body;
  const functions = body.filter(node => node.type === 'FunctionDeclaration');
  const declarations = body.filter(node => node.type === 'VariableDeclaration').flatMap(node => node.declarations);
  const imports = body.filter(node => node.type === 'ImportDeclaration');
  const named = (module, name) => imports.some(node => node.source.value === module && node.specifiers.some(specifier => specifier.type === 'ImportSpecifier' && specifier.imported.name === name && specifier.local.name === name));
  const get = name => functions.find(node => node.id.name === name);
  const keyboard = declarations.find(node => node.id.type === 'Identifier' && node.id.name === 'conciergeKeyboard');
  const residue = imports.some(node => ['./server/concierge/telegram-menu.mjs', './server/concierge/telegram-menu-transport.mjs', './server/concierge/stay-menu.mjs'].includes(node.source.value))
    || declarations.some(node => node.id.name === 'crewcheckMenu')
    || ['buildTelegramConciergeReplyCore', 'conciergeSemanticResolveV14338', 'conciergeEasterEggNormalize', 'conciergeEasterEggPick', 'conciergeEasterEggReply'].some(get);
  const cold = !residue && body.some(node => node.type === 'VariableDeclaration' && node.kind === 'const' && node.declarations.includes(keyboard))
    && coldShapes.every(([name, expected]) => createHash('sha256').update(shape(name === 'conciergeKeyboard' ? keyboard : get(name)) || '').digest('hex') === expected);
  if (cold) return false;
  const fail = label => { throw new Error('[v1403] Incomplete prepared Telegram base: ' + label); };
  const require = (condition, label) => { if (!condition) fail(label); };
  for (const [module, names] of [
    ['./server/concierge/telegram-menu.mjs', ['createTelegramMenu', 'menuTemplate']],
    ['./server/concierge/telegram-menu-transport.mjs', ['createTelegramMenuTransport']],
    ['./server/concierge/stay-menu.mjs', ['stayMenuReply']],
    ['./server/v1404/telegram-language.mjs', ['premiumVoicePolicy', 'premiumVoiceText']],
  ]) for (const name of names) require(named(module, name), 'import ' + name);
  const refs = new WeakMap();
  let globals;
  traversal.default(file, {
    Program(path) { globals = new Map(Object.entries(path.scope.bindings)); },
    ReferencedIdentifier(path) { refs.set(path.node, path.scope.getBinding(path.node.name) || null); },
  });
  const bound = (node, locals) => {
    if (!node || typeof node !== 'object') return true;
    if (refs.has(node)) {
      const actual = refs.get(node), expected = globals.get(node.name);
      const local = locals?.get(node.name);
      if (local) { if (!actual || actual.path.node !== local.node || (!local.mutable && !actual.constant)) return false; }
      else if (ambient.has(node.name)) { if (actual) return false; }
      else if (expected ? !actual || actual.path.node !== expected.path.node || !actual.constant : !actual && !(node.name in globalThis)) return false;
    }
    return Object.entries(node).every(([key, value]) => metadata.has(key) || (Array.isArray(value) ? value.every(child => bound(child, locals)) : bound(value, locals)));
  };
  const exact = (actual, expected, label) => require(Boolean(actual) && shape(actual) === shape(expected) && bound(actual), label);
  const ordered = (actual, expected, label, from = 0) => {
    const matched = [];
    let index = 0, start;
    for (let position = from; position < actual.length; position++) {
      const statement = actual[position];
      if (shape(statement) === shape(expected[index])) {
        require(bound(statement), label + ' bindings');
        if (index === 0) start = position;
        matched.push(statement);
        if (++index === expected.length) return { start, end: position + 1, matched };
      } else if (statement.type === 'ReturnStatement' || statement.type === 'ThrowStatement') break;
    }
    fail(label);
  };
  const producer = nodes(references.menuProducer);
  const runtime = producer.filter(node => node.type === 'VariableDeclaration').flatMap(node => node.declarations).find(node => node.id.name === 'runtime')?.init;
  require(runtime?.type === 'TemplateLiteral' && runtime.expressions.length === 0, 'menu producer template');
  const expectedRuntime = nodes(runtime.quasis[0].value.cooked)[0].declarations[0];
  exact(declarations.find(node => node.id.name === 'crewcheckMenu'), expectedRuntime, 'menu transport/wrapper wiring');
  exact(keyboard, nodes('const conciergeKeyboard = menuTemplate();')[0].declarations[0], 'shared keyboard');
  const keyboardReference = nodes(references.keyboards);
  for (const name of ['conciergeFunctionKeyboard', 'conciergeSettingsKeyboard']) {
    exact(declarations.find(node => node.id.name === name), keyboardReference.flatMap(node => node.declarations || []).find(node => node.id.name === name), name);
  }
  const request = nodes(references.requestUser)[0];
  exact(get('telegramRequestUser'), request, 'request identity');
  const legacyRouter = nodes(references.buildReply);
  for (const name of ['conciergeEasterEggNormalize', 'conciergeEasterEggPick', 'conciergeEasterEggReply']) exact(get(name), legacyRouter.find(node => node.id?.name === name), 'unique helper ' + name);
  const semanticReference = nodes(references.semantic);
  exact(get('conciergeSemanticResolveV14338'), semanticReference.find(node => node.id?.name === 'conciergeSemanticResolveV14338'), 'semantic resolver');
  const normalizer = get('normalizeConciergeButtonText');
  const normalization = producer.find(node => node.type === 'ExpressionStatement' && node.expression.type === 'CallExpression' && node.expression.callee.name === 'replace' && node.expression.arguments[0]?.value?.startsWith("function normalizeConciergeButtonText(value = '')"));
  require(normalizer && normalization, 'normalizer producer');
  const normalizedPrefix = nodes(normalization.expression.arguments[1].value + '\n}')[0].body.body;
  ordered(normalizer.body.body, normalizedPrefix, 'command normalization');
  const wrapper = get('buildTelegramConciergeReply'), core = get('buildTelegramConciergeReplyCore'), dispatcher = get('processTelegramUpdate');
  require(wrapper?.async && !wrapper.generator && core?.async && !core.generator && dispatcher?.async && !dispatcher.generator, 'wrapper/core/dispatcher');
  const wrapperReference = semanticReference.find(node => node.id?.name === 'buildTelegramConciergeReply');
  const oldCore = legacyRouter.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'buildTelegramConciergeReply');
  require(shape(wrapper.params) === shape(wrapperReference.params) && shape(core.params) === shape(oldCore.params), 'wrapper/core signatures');
  const statements = wrapper.body.body;
  const stayHit = ordered(statements, stay, 'stay priority');
  require(statements.slice(0, stayHit.start).every(node => node.type === 'FunctionDeclaration'), 'stay precedes executable work');
  const modernWrapper = nodes(references.modernWrapper).find(node => node.id?.name === 'buildTelegramConciergeReply');
  const referenceProducer = name => modernWrapper?.body.body.find(node => node.type === 'VariableDeclaration' && node.declarations[0].id.name === name);
  const producerNames = ['command', 'currentSnapshot', 'inputContext', 'semantic'];
  const expectedProducers = producerNames.map(referenceProducer);
  const decoration = referenceProducer('decorated');
  require(expectedProducers.every(Boolean) && decoration, 'canonical producer references');
  const producerHit = ordered(statements, expectedProducers, 'wrapper producers', stayHit.end);
  const semanticHit = ordered(statements, semantic, 'semantic to core fallback', producerHit.end);
  const decorationHit = ordered(statements, [decoration], 'decoration producer', semanticHit.end);
  const finalHit = ordered(statements, finalize, 'wrapper final reply', decorationHit.end);
  const witnesses = [stayHit, producerHit, semanticHit, decorationHit, finalHit].flatMap(hit => hit.matched);
  const locals = new Map(witnesses.filter(node => node.type === 'VariableDeclaration').map(node => [node.declarations[0].id.name, { node: node.declarations[0], mutable: node.declarations[0].id.name === 'currentSnapshot' }]));
  require(witnesses.every(node => bound(node, locals)), 'wrapper producer bindings');
  const routes = oldCore.body.body.filter(node => node.type === 'IfStatement' && node.consequent.type === 'ReturnStatement' && coreTargets.has(node.consequent.argument?.callee?.name));
  require(routes.length === 10, 'canonical route references');
  for (const route of routes) exact(core.body.body.find(node => shape(node) === shape(route)), route, 'core route');
  ordered(core.body.body, fragment('const value = normalizeConciergeButtonText(text);'), 'core normalization');
  ordered(core.body.body, fragment('const easterEgg = conciergeEasterEggReply(value, profile, snapshot);'), 'core helper');
  const fallbacks = [];
  traversal.default(parse(references.routineProducer, options), { VariableDeclarator(path) { if (path.node.id.name === 'fallbackPatched') fallbacks.push(path.node.init); } });
  require(fallbacks.length === 1 && fallbacks[0].type === 'TemplateLiteral' && fallbacks[0].expressions.length === 0, 'routine producer fallback');
  ordered(core.body.body, fragment(fallbacks[0].quasis[0].value.cooked), 'core final reply');
  ordered(dispatcher.body.body, callbacks, 'menu callback/text priority');
  const voice = get('sendHumanTelegramVoiceReply');
  require(voice?.async && !voice.generator, 'voice producer');
  const voicePolicy = fragment("const policy = premiumVoicePolicy(replyText, transcript, Math.max(420, Math.min(700, Number(envAny(['TELEGRAM_CONCIERGE_MAX_VOICE_CHARS', 'CREWCHECK_TELEGRAM_MAX_VOICE_CHARS']) || 650)))); if (!policy.allowed) return false; const finalReply = premiumVoiceText(conciergeVoiceScriptV14408(replyText, transcript));");
  ordered(voice.body.body, voicePolicy, 'voice policy');
  return true;
}
