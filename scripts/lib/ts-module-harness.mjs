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
