// Start the worker with an empty environment: never inspect inherited credentials.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (process.argv[2] !== '--worker') {
  const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--worker'], {
    env: {}, stdio: 'inherit', cwd: fileURLToPath(new URL('../', import.meta.url)),
  });
  process.exit(result.status ?? 1);
}

// Every real fetch is forbidden, including calls accidentally added to regressions.
globalThis.fetch = async () => { throw new Error('Real network forbidden in Cirium offline checks'); };
for (const script of [
  './regression-cirium-disabled.mjs',
  './regression-cirium-evaluation-diagnostic.mjs',
  './regression-cirium-canonical-adapter.mjs',
  './regression-radar-field-provenance.mjs',
]) await import(new URL(script, import.meta.url));

console.log('Offline checks complete; only synthetic credentials and injected mocks used.');
