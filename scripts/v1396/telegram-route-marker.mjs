import ts from 'typescript';

// Compare executable syntax, not text that may occur in comments or strings.
// Only a direct statement of the single real dispatcher can satisfy the guard.
const expected = ts.createSourceFile('expected.js', `async function processTelegramUpdate(update = {}) {
  if (chatId && message?.location) {
    const locationDecision = crewcheckLiveLocationDecision(message, Boolean(update?.edited_message));
    if (!locationDecision.process) return true;
    const snapshotHandled = await handleTelegramLocation(message, { silent: !locationDecision.announce });
    const auxiliaryHandled = await handleV139Telegram(update, sendTelegramMessage, { silentLocation: true });
    if (snapshotHandled || auxiliaryHandled) return true;
  }
}`, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const printer = ts.createPrinter({ removeComments: true });
const print = (node, file) => printer.printNode(ts.EmitHint.Unspecified, node, file);
const expectedBlock = print(expected.statements[0].body.statements[0], expected);

export function hasCanonicalTelegramLocationRoute(source) {
  const file = ts.createSourceFile('server.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  if (file.parseDiagnostics.length) return false;
  const functions = file.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === 'processTelegramUpdate');
  if (functions.length !== 1) return false;
  const fn = functions[0];
  if (!fn.body || fn.asteriskToken || !fn.modifiers?.some(node => node.kind === ts.SyntaxKind.AsyncKeyword)) return false;
  const parameter = fn.parameters[0];
  if (fn.parameters.length !== 1 || !ts.isIdentifier(parameter.name) || parameter.name.text !== 'update'
    || !parameter.initializer || !ts.isObjectLiteralExpression(parameter.initializer) || parameter.initializer.properties.length) return false;
  for (const node of fn.body.statements) {
    if (ts.isReturnStatement(node) || ts.isThrowStatement(node)) return false;
    if (ts.isIfStatement(node) && print(node, file) === expectedBlock) return true;
  }
  return false;
}
