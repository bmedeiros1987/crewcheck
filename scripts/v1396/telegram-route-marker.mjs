import { parse } from '@babel/parser';
// Already locked through production @vitejs/plugin-react; gate omits dev deps.

// Compare executable syntax, not text that may occur in comments or strings.
// Only a direct statement of the single real dispatcher can satisfy the guard.
const expected = parse(`async function processTelegramUpdate(update = {}) {
  if (chatId && message?.location) {
    const locationDecision = crewcheckLiveLocationDecision(message, Boolean(update?.edited_message));
    if (!locationDecision.process) return true;
    const snapshotHandled = await handleTelegramLocation(message, { silent: !locationDecision.announce });
    const auxiliaryHandled = await handleV139Telegram(update, sendTelegramMessage, { silentLocation: true });
    if (snapshotHandled || auxiliaryHandled) return true;
  }
}`, { sourceType: 'module' });
// Ignore source positions, comments and original spelling; retain AST structure.
const metadata = new Set(['start', 'end', 'loc', 'extra', 'leadingComments', 'innerComments', 'trailingComments']);
const shape = node => JSON.stringify(node, (key, value) => metadata.has(key) ? undefined : value);
const expectedBlock = shape(expected.program.body[0].body.body[0]);

export function hasCanonicalTelegramLocationRoute(source) {
  // Parse/load errors propagate and fail preparation; no fallback recognizer.
  const file = parse(source, { sourceType: 'module' });
  const functions = file.program.body.filter(node => node.type === 'FunctionDeclaration' && node.id?.name === 'processTelegramUpdate');
  if (functions.length !== 1) return false;
  const fn = functions[0];
  if (!fn.body || fn.generator || !fn.async) return false;
  const parameter = fn.params[0];
  if (fn.params.length !== 1 || parameter.type !== 'AssignmentPattern' || parameter.left.type !== 'Identifier' || parameter.left.name !== 'update'
    || parameter.right.type !== 'ObjectExpression' || parameter.right.properties.length) return false;
  for (const node of fn.body.body) {
    if (node.type === 'ReturnStatement' || node.type === 'ThrowStatement') return false;
    if (node.type === 'IfStatement' && shape(node) === expectedBlock) return true;
  }
  return false;
}
