import { parse } from '@babel/parser';
import traversal from '@babel/traverse';
// Existing production parser; the dedicated gate installs with --omit=dev.
const options = { sourceType: 'module', plugins: ['typescript', 'jsx'] };
const metadata = new Set(['start', 'end', 'loc', 'extra', 'leadingComments', 'innerComments', 'trailingComments']);
const shape = node => JSON.stringify(node, (key, value) => metadata.has(key) ? undefined : value);
const expected = parse(`useEffect(() => {
  applyCrewCheckTheme();
  const syncTheme = () => applyCrewCheckTheme();
  window.addEventListener('crewcheck:theme-change', syncTheme);
  const crewcheckSystemTheme = window.matchMedia?.('(prefers-color-scheme: dark)');
  const crewcheckSystemThemeListener = () => { if (getCrewCheckThemePreference() === 'system') syncTheme(); };
  crewcheckSystemTheme?.addEventListener?.('change', crewcheckSystemThemeListener);
  return () => {
    window.removeEventListener('crewcheck:theme-change', syncTheme);
    crewcheckSystemTheme?.removeEventListener?.('change', crewcheckSystemThemeListener);
  };
}, []);`, options).program.body[0].expression.arguments[0].body.body;
const setup = expected.slice(0, -1).map(shape);
const cleanup = expected.at(-1).argument.body.body.map(shape);
const cabin = shape(parse(`const cabin = view === 'crew' && <CabinChiefAssistant bundle={bundle} onBack={() => setView('cockpit')} onOpenRoster={() => setView('roster')}/>;`, options).program.body[0].declarations[0].init);

function ordered(statements, required) {
  let index = 0;
  for (const statement of statements) {
    if (statement.type === 'ReturnStatement' || statement.type === 'ThrowStatement') return false;
    if (shape(statement) === required[index] && ++index === required.length) return true;
  }
  return false;
}
function containsCabin(node, bound) {
  if (node?.type === 'JSXExpressionContainer') return shape(node.expression) === cabin && bound(node.expression);
  if (node?.type === 'JSXElement' || node?.type === 'JSXFragment') return node.children.some(child => containsCabin(child, bound));
  return false;
}
export function hasModernHomeTheme(source) {
  // Syntax/import failures propagate; there is no text/regex fallback.
  const file = parse(source, options);
  const body = file.program.body;
  const imports = body.filter(node => node.type === 'ImportDeclaration' && node.importKind !== 'type');
  const expectedBindings = new Map([['window', null]]);
  const named = (from, names) => {
    const declaration = imports.find(node => node.source.value === from && names.every(name => node.specifiers.some(specifier => specifier.type === 'ImportSpecifier' && specifier.importKind !== 'type' && specifier.imported.name === name && specifier.local.name === name)));
    if (!declaration) return false;
    for (const name of names) expectedBindings.set(name, declaration.specifiers.find(specifier => specifier.local.name === name));
    return true;
  };
  if (!named('../lib/themeRuntime', ['applyCrewCheckTheme', 'getCrewCheckThemePreference', 'getEffectiveCrewCheckTheme', 'setCrewCheckThemePreference']) || !named('react', ['useEffect'])) return false;
  const cabinImport = imports.find(node => node.source.value === '@/components/premium/CabinChiefAssistant')?.specifiers.find(specifier => specifier.type === 'ImportDefaultSpecifier' && specifier.local.name === 'CabinChiefAssistant');
  if (!cabinImport) return false;
  expectedBindings.set('CabinChiefAssistant', cabinImport);
  const homes = body.filter(node => node.type === 'ExportDefaultDeclaration' && node.declaration.type === 'FunctionDeclaration' && node.declaration.id?.name === 'Home');
  if (homes.length !== 1) return false;
  const home = homes[0].declaration;
  if (home.async || home.generator || home.params.length) return false;
  // Resolve actual reference bindings, including JSX; names alone do not prove
  // an imported function or the setup listener is used by the effect/cleanup.
  const references = new WeakMap();
  const remember = path => { references.set(path.node, path.scope.getBinding(path.node.name) || null); };
  traversal.default(file, {
    ReferencedIdentifier: remember,
    JSXIdentifier(path) { if (path.parentPath.isJSXOpeningElement() && path.key === 'name') remember(path); },
  });
  const bound = (node, bindings = expectedBindings) => {
    if (!node || typeof node !== 'object') return true;
    if (references.has(node) && bindings.has(node.name)) {
      const actual = references.get(node), expected = bindings.get(node.name);
      if (expected === null ? actual !== null : !actual || actual.path.node !== expected || !actual.constant) return false;
    }
    return Object.entries(node).every(([key, value]) => metadata.has(key)
      || (Array.isArray(value) ? value.every(child => bound(child, bindings)) : bound(value, bindings)));
  };
  const returnedHome = home.body.body.find(node => node.type === 'ReturnStatement' || node.type === 'ThrowStatement');
  if (returnedHome?.type !== 'ReturnStatement' || !containsCabin(returnedHome.argument, node => bound(node))) return false;
  for (const statement of home.body.body) {
    if (statement.type === 'ReturnStatement' || statement.type === 'ThrowStatement') return false;
    const call = statement.type === 'ExpressionStatement' ? statement.expression : null;
    if (call?.type !== 'CallExpression' || call.callee.type !== 'Identifier' || call.callee.name !== 'useEffect' || call.arguments.length !== 2) continue;
    if (!bound(call.callee)) continue;
    const [effect, dependencies] = call.arguments;
    if (effect.type !== 'ArrowFunctionExpression' || effect.async || effect.params.length || effect.body.type !== 'BlockStatement' || dependencies.type !== 'ArrayExpression' || dependencies.elements.length) continue;
    const statements = effect.body.body;
    if (!ordered(statements, setup)) continue;
    const matched = setup.map(required => statements.find(node => shape(node) === required));
    const effectBindings = new Map(expectedBindings);
    for (const index of [1, 3, 4]) {
      const declaration = matched[index].declarations[0];
      effectBindings.set(declaration.id.name, declaration);
    }
    if (!matched.every(node => bound(node, effectBindings))) continue;
    const returned = statements.find(node => node.type === 'ReturnStatement');
    if (statements.slice(0, statements.indexOf(returned)).some(node => node.type === 'ThrowStatement')) continue;
    if (returned?.argument?.type !== 'ArrowFunctionExpression' || returned.argument.async || returned.argument.params.length || returned.argument.body.type !== 'BlockStatement') continue;
    const cleanupStatements = returned.argument.body.body;
    if (ordered(cleanupStatements, cleanup) && cleanup.every(required => bound(cleanupStatements.find(node => shape(node) === required), effectBindings))) return true;
  }
  return false;
}
