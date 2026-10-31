import { parse } from '@babel/parser';
import traversal from '@babel/traverse';
import { createHash } from 'node:crypto';

// Positive normalized-AST witnesses, intentionally coupled to cold main 5dd82be0,
// its v1414 output, and the final spoken-program/notification-safety producers.
// Unknown edits require review; comments, locations and literal spelling do not.
const metadata = new Set(['start', 'end', 'loc', 'extra', 'leadingComments', 'innerComments', 'trailingComments']);
const digest = node => createHash('sha256').update(JSON.stringify(node, (key, value) => metadata.has(key) ? undefined : value)).digest('hex');
const coldDelivery = 'bef638cee0df4aa7739b39b798bd61a19d42bb9d65335bc33c27b24992f9fe19';
const legacyDelivery = '5f07ac69c7bd8e9a62ce81b295fb4c8ed676aeb550c505a56e410131ac80417a';
const modernDelivery = 'b7557f349975dadb48e78121c3188f71cb2564913469cd36908d97670eb4b241';
const safeSchedule = '60e0715d077c5b113207d32df16764d1c9c89bfcaadae5890b89be40b48c0fb4';
const legacySchedule = '735a0f78942e690efcb62707d2bbd6fb9d9c16d4af7232736ce382eea654a818';
const modernLabel = '5924e605b0c43b7a73065c565317cac59c96a7c0f1a372f99261527bfada2ec0';
const modernView = '1f8bfd25ca2dddee2726cc4c95e236536c08cf4fd3762df51bd4a644a8f93a2f';
const coldLabels = new Set(['4a8eca24852104eb4be3e838772456a6742389071c9dc2b6ca4f42ce218c2104', '492b145fd77e5934ede1eddaf1f9d55c45a72d0851f06309fe10c06376481b4d', modernLabel]);
const coldViews = new Set(['70547dface99d23652f6aedf0945fb16e760e13349453952d6a589002417ffc2', '2fe3d3e1e6090a4ba67276d5fde6b45c38f0ea34389596336a9728fca17eeac0', 'be7ff656d3e5535f5902ac675fb0a6ea7e99692236e35a87658d983d7ebb8fa6']);
const fail = label => { throw new Error('[v1414] Unknown or incomplete delivery preparation: ' + label); };
function inspect(source, typescript = false) {
  const file = parse(source, { sourceType: 'module', plugins: typescript ? ['typescript', 'jsx'] : [] });
  const functions = file.program.body.filter(node => node.type === 'FunctionDeclaration');
  const get = name => {
    const found = functions.filter(node => node.id?.name === name);
    if (found.length !== 1) fail(name + ' declaration');
    return found[0];
  };
  const references = new WeakMap();
  let globals;
  traversal.default(file, {
    Program(path) { globals = path.scope.bindings; },
    ReferencedIdentifier(path) { references.set(path.node, path.scope.getBinding(path.node.name)); },
  });
  const imported = (name, module) => {
    const binding = globals[name], node = binding?.path.node;
    if (!binding?.constant || node?.type !== 'ImportSpecifier' || node.imported.name !== name || node.importKind === 'type' || binding.path.parent.importKind === 'type' || binding.path.parent.source?.value !== module) fail(name + ' import');
    return binding;
  };
  const direct = name => {
    const binding = globals[name];
    if (!binding?.constant || binding.path.node !== get(name)) fail(name + ' binding');
    return binding;
  };
  // The complete function witnesses exclude nested/dead/shadowed substitutes.
  // Check external critical names too: an unchanged callee spelling alone is not binding proof.
  const bound = (node, names) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'Identifier' && names.has(node.name) && references.has(node) && references.get(node) !== names.get(node.name)) fail(node.name + ' reference');
    for (const [key, value] of Object.entries(node)) if (!metadata.has(key)) {
      if (Array.isArray(value)) value.forEach(child => bound(child, names));
      else bound(value, names);
    }
  };
  for (const name of ['String', 'Set', 'Boolean', 'Date', 'Number', 'JSON']) if (globals[name]) fail(name + ' ambient binding');
  return { get, imported, direct, bound };
}
export function runtimeContract(source) {
  const ast = inspect(source), delivery = ast.get('deliverJob'), schedule = ast.get('scheduleJob');
  const jobHash = digest(delivery), scheduleHash = digest(schedule);
  let modern = false;
  if (jobHash === modernDelivery && scheduleHash === safeSchedule) modern = true;
  else if (!((jobHash === coldDelivery && scheduleHash === safeSchedule) || (jobHash === legacyDelivery && scheduleHash === legacySchedule))) fail('delivery/schedule pair');
  const names = new Map([
    ['sendTelegram', ast.imported('sendTelegram', './v139/delivery.mjs')],
    ['callTelegram', ast.imported('callTelegram', './v139/delivery.mjs')],
    ['dbPool', ast.imported('dbPool', './v139/common.mjs')],
    ['sendInfobipPhone', ast.direct('sendInfobipPhone')],
  ]);
  if (jobHash !== legacyDelivery) names.set('prepareScheduledWakeup', ast.imported('prepareScheduledWakeup', './wakeup-spoken-program.mjs'));
  if (scheduleHash === safeSchedule) names.set('safeScheduleJob', ast.imported('safeScheduleJob', './notification-job-safety.mjs'));
  for (const name of ['identity', 'readJson', 'ensureNotificationTable', 'linkedTelegramRecord', 'sendJson']) names.set(name, ast.direct(name));
  ast.bound(delivery, names); ast.bound(schedule, names);
  for (const name of ['commuteRouteKey', 'parsedJson', 'linkedTelegramRecord', 'linkedTelegramChatId', 'commuteTimeBucket', 'learnedCommuteBaseline', 'fetchLiveCommuteRoute', 'incidentFingerprint', 'nextCommuteCheckMinutes', 'clockLabel', 'commuteAlertMessage', 'runCommuteMonitorCycle']) ast.direct(name);
  ast.bound(ast.get('runSchedulerCycle'), new Map([['runCommuteMonitorCycle', ast.direct('runCommuteMonitorCycle')]]));
  // Replacements never include adjacent declarations, regardless of blank lines.
  return { modern, delivery, schedule };
}
export function homeContract(source) {
  const ast = inspect(source, true), view = ast.get('WakeupView'), label = ast.get('wakeupChannelLabel');
  const viewHash = digest(view), labelHash = digest(label);
  if (viewHash === modernView && labelHash === modernLabel) {
    const names = new Map();
    for (const [module, imports] of [
      ['react', ['useState', 'useRef', 'useEffect']],
      ['@/lib/authClient', ['getToken', 'getStoredUser', 'authFetch']],
      ['@shared/wakeupPlan.mjs', ['wakeDateFields', 'wakeCivilDate', 'wakeNextConfirmed', 'wakePlanConflict', 'wakeReceiptConfirmed', 'wakeReceiptState']],
      ['@/components/notifications/useWakeupSpokenConsent', ['useWakeupSpokenConsent']],
      ['@/components/notifications/WakeupSimpleCard', ['WakeupSimpleCard']],
      ['@/components/notifications/WakeupChannelSelection', ['WakeupChannelSelection']],
      ['@/components/notifications/WakeClockOptions', ['WakeClockOptions']],
      ['@/lib/scheduleActivityClassification', ['publishedPresentationOf']],
    ]) for (const name of imports) names.set(name, ast.imported(name, module));
    ast.bound(view, names);
    return { modern: true };
  }
  if (!coldViews.has(viewHash) || !coldLabels.has(labelHash)) fail('WakeupView/label pair');
  return { modern: false };
}
export function replaceFunction(source, node, replacement, consumeBlankLine = false) {
  if (node === null) return source;
  const end = node.end + (consumeBlankLine && source.slice(node.end).startsWith('\n\n') ? 1 : 0);
  return source.slice(0, node.start) + replacement.trimEnd() + source.slice(end);
}

export function functionSpan(source, name) { return inspect(source).get(name); }

export function homeFunctionSpan(source, name) {
  const ast = inspect(source, true);
  if (name === 'wakeupChannelLabel') return ast.get(name);
  const matches = ast.get('WakeupView').body.body.filter(node => node.type === 'FunctionDeclaration' && node.id.name === name);
  if (matches.length > 1) fail(name + ' nested declaration');
  return matches[0] || null;
}
export function replaceHomeLiteral(source, before, after) {
  const file = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'], tokens: true });
  const view = file.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'WakeupView');
  const tokens = file.tokens.filter(token => typeof token.type !== 'string' && !['template', 'string', 'regexp'].includes(token.type.label));
  const starts = new Set(tokens.map(token => token.start)), ends = new Set(tokens.map(token => token.end));
  // Keep historical exact spelling, but never match text inside comments/templates/strings
  // or another function. Both boundaries must be executable/JSX token boundaries.
  let start = source.indexOf(before, view.start);
  while (start >= 0 && start + before.length <= view.end) {
    if (starts.has(start) && ends.has(start + before.length)) return source.slice(0, start) + after + source.slice(start + before.length);
    start = source.indexOf(before, start + 1);
  }
  return source;
}
export function replaceVersion(source) {
  const file = parse(source, { sourceType: 'module' });
  const matches = file.program.body.filter(node => node.type === 'VariableDeclaration' && node.kind === 'const')
    .flatMap(node => node.declarations).filter(node => node.id.name === 'RUNTIME_VERSION' && node.init?.type === 'StringLiteral');
  if (matches.length !== 1) fail('RUNTIME_VERSION declaration');
  return replaceFunction(source, matches[0].init, "'14.1.4-telegram-alarm-hardening'");
}
export function ensureTelegramLink(source) {
  const file = parse(source, { sourceType: 'module' });
  const matches = file.program.body.filter(node => node.type === 'ImportDeclaration' && node.source.value === './v139/delivery.mjs');
  if (matches.length !== 1) fail('delivery import declaration');
  const node = matches[0];
  if (node.specifiers.some(specifier => specifier.type === 'ImportSpecifier' && specifier.imported.name === 'telegramLink' && specifier.local.name === 'telegramLink')) return source;
  const old = "import { sendTelegram, callTelegram } from './v139/delivery.mjs';";
  if (source.slice(node.start, node.end) !== old) fail('legacy delivery import');
  return replaceFunction(source, node, "import { sendTelegram, callTelegram, telegramLink } from './v139/delivery.mjs';");
}
