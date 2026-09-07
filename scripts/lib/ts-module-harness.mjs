import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Compiles a set of client TypeScript modules to CommonJS in a temp dir so that
 * regressions can exercise the real production logic instead of a copy of it.
 *
 * `stubs` maps a module basename to raw JS source, used for modules that only
 * provide types (e.g. pdfParser, whose runtime pulls in Vite-only imports).
 */
export function loadClientModules({ files, stubs = {}, prefix = 'crewcheck-harness-' }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));

  for (const [name, source] of Object.entries(stubs)) {
    fs.writeFileSync(path.join(dir, `${name}.js`), source);
  }

  for (const relative of files) {
    // A preparação canônica (scripts/v139/apply.mjs) materializa módulos extras.
    // Ausentes no estado base, presentes no preparado: os dois estados precisam
    // rodar, então um arquivo que não existe é apenas ignorado.
    if (!fs.existsSync(path.join(ROOT, relative))) continue;
    const source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    fs.writeFileSync(path.join(dir, `${path.basename(relative, '.ts')}.js`), compiled);
  }

  // #526: o motor de compliance passou a depender de `rollingFlightHours`. Em vez
  // de repetir esse arquivo na lista de ~24 regressões (e quebrar todas de novo na
  // próxima dependência), o harness fecha o grafo sozinho: compila também os
  // imports relativos locais dos módulos já emitidos.
  //
  // Só entra o que ainda NÃO foi emitido — stubs são escritos antes e continuam
  // vencendo — e só o que existe em `client/src/lib`. Import de tipo é apagado
  // pelo transpile, então não vira dependência de runtime.
  const emitted = new Set(fs.readdirSync(dir).map((file) => path.basename(file, '.js')));
  const pending = [...emitted];
  while (pending.length) {
    const name = pending.pop();
    const compiledPath = path.join(dir, `${name}.js`);
    if (!fs.existsSync(compiledPath)) continue;
    const body = fs.readFileSync(compiledPath, 'utf8');
    for (const match of body.matchAll(/require\("\.\/([A-Za-z0-9_.-]+)"\)/g)) {
      const dependency = match[1];
      if (emitted.has(dependency)) continue;
      const sourcePath = path.join(ROOT, 'client', 'src', 'lib', `${dependency}.ts`);
      if (!fs.existsSync(sourcePath)) continue;
      const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      }).outputText;
      fs.writeFileSync(path.join(dir, `${dependency}.js`), compiled);
      emitted.add(dependency);
      pending.push(dependency);
    }
  }

  const require = createRequire(import.meta.url);
  const load = (name) => require(path.join(dir, `${name}.js`));
  return { dir, load, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

export const TYPE_ONLY_PDF_PARSER_STUB = { pdfParser: 'module.exports = {};' };

export function readRepoFile(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

/** Collects failures so one run reports the whole picture instead of stopping at the first. */
export function createChecker(label) {
  const failures = [];
  const passes = [];
  const check = (name, condition, detail = '') => {
    if (condition) passes.push(name);
    else failures.push(detail ? `${name}\n      ${detail}` : name);
    return Boolean(condition);
  };
  const report = () => {
    console.log(`\n${label}`);
    for (const name of passes) console.log(`  PASS  ${name}`);
    for (const name of failures) console.log(`  FAIL  ${name}`);
    console.log(`  ---> ${passes.length} passed, ${failures.length} failed`);
    return failures.length;
  };
  return { check, report, get failures() { return failures.length; } };
}
