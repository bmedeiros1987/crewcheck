import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
export const readWeatherSource = path => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
export function loadWeatherTs(path, imports = {}, globals = {}) {
  const exports = {}, source = readWeatherSource(path);
  const context = vm.createContext({ exports, module: { exports }, ...globals,
    require(name) { if (Object.hasOwn(imports, name)) return imports[name]; throw new Error(`Unmocked import ${name} from ${path}`); } });
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context, { filename: path });
  return context.module.exports;
}
export function weatherFunction(source, name) {
  const ast = ts.createSourceFile('source.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const nodes = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (nodes.length !== 1) throw new Error(`Expected one function ${name}`);
  return nodes[0].getText(ast);
}
