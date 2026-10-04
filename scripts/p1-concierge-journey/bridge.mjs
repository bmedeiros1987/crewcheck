import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';

// Compile the existing canonical engine after all source preparation. Generated
// files are disposable outputs, never a second maintained copy of its rules.
export function prepareConciergeCanonicalBridge(root = process.cwd()) {
  const sourceRoot = path.join(root, 'client/src/lib');
  const outputRoot = path.join(root, 'server/concierge/generated');
  const pending = ['canonicalRoster'];
  const outputs = new Map();
  const manifest = {};
  while (pending.length) {
    const name = pending.pop();
    if (outputs.has(name)) continue;
    const filename = `${name}.ts`;
    const source = fs.readFileSync(path.join(sourceRoot, filename), 'utf8');
    let compiled = stripTypeScriptTypes(source, { mode: 'strip' });
    // Only the engine's own relative static runtime dependencies are allowed.
    // Type-only imports have already been removed by Node's TS parser.
    compiled = compiled.replace(/^(\s*(?:import|export)\s[^;]*?\sfrom\s*)(['"])([^'"]+)\2/gm, (all, prefix, quote, specifier) => {
      const match = specifier.match(/^\.\/([A-Za-z0-9_-]+)(?:\.ts)?$/);
      if (!match) throw new Error(`[concierge-journey] unsupported canonical dependency: ${specifier}`);
      pending.push(match[1]);
      return `${prefix}${quote}./${match[1]}.mjs${quote}`;
    });
    if (/\bimport\s*\(/.test(compiled) || /^\s*import\s*['"]/m.test(compiled)) {
      throw new Error(`[concierge-journey] unexpected canonical import in ${filename}`);
    }
    outputs.set(name, compiled);
    manifest[filename] = createHash('sha256').update(source).digest('hex');
  }
  fs.mkdirSync(outputRoot, { recursive: true });
  for (const [name, content] of outputs) fs.writeFileSync(path.join(outputRoot, `${name}.mjs`), content);
  fs.writeFileSync(path.join(outputRoot, 'source-hashes.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}
