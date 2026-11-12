// QA helper: evaluate the real top-level functions of a server module (and only what they
// reference) so a test can run production code against disposable resources. Named overrides
// replace the few gates a test must not reach (database pool, session verification); every
// other function and SQL statement is the module's own text, never a copy.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

export async function moduleClosure(file, roots, overrides = {}) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  const declarations = new Map(), imports = new Map();
  source.statements.forEach((statement, index) => {
    if (ts.isImportDeclaration(statement)) {
      const specifier = statement.moduleSpecifier.text, clause = statement.importClause;
      if (clause?.name) imports.set(clause.name.text, { specifier, binding: 'default' });
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) imports.set(bindings.name.text, { specifier, binding: '*' });
      if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) imports.set(element.name.text, { specifier, binding: (element.propertyName || element.name).text });
    } else if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) {
      declarations.set(statement.name.text, { statement, index });
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) if (ts.isIdentifier(declaration.name)) declarations.set(declaration.name.text, { statement, index });
    }
  });
  const references = node => {
    const found = new Set();
    const visit = current => {
      if (ts.isIdentifier(current)) {
        const parent = current.parent;
        const isMemberName = parent && ((ts.isPropertyAccessExpression(parent) && parent.name === current) || ((ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent)) && parent.name === current));
        if (!isMemberName) found.add(current.text);
      }
      ts.forEachChild(current, visit);
    };
    visit(node);
    return found;
  };
  const statements = new Map(), usedImports = new Set(), seen = new Set(), queue = [...roots];
  while (queue.length) {
    const name = queue.pop();
    if (seen.has(name)) continue;
    seen.add(name);
    if (Object.prototype.hasOwnProperty.call(overrides, name)) continue;
    if (imports.has(name)) { usedImports.add(name); continue; }
    const declaration = declarations.get(name);
    if (!declaration) continue;
    statements.set(declaration.statement, declaration);
    for (const reference of references(declaration.statement)) queue.push(reference);
  }
  const injected = { ...overrides };
  for (const name of usedImports) {
    const { specifier, binding } = imports.get(name);
    const target = specifier.startsWith('.') ? pathToFileURL(path.resolve(path.dirname(file), specifier)).href : specifier;
    const namespace = await import(target);
    injected[name] = binding === '*' ? namespace : namespace[binding];
  }
  const code = [...statements.values()].sort((a, b) => a.index - b.index)
    .map(({ statement }) => statement.getText(source).replace(/^export\s+(default\s+)?/, '')).join('\n');
  const names = Object.keys(injected);
  return new Function(...names, `${code}\nreturn { ${roots.join(', ')} };`)(...names.map(name => injected[name]));
}
