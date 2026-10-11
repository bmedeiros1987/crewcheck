import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

if (process.argv[2] !== '--worker') {
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--worker'], { env: { TZ: 'UTC' }, stdio: 'inherit' });
  process.exit(child.status ?? 1);
}
function run(file, args = [], zone = 'UTC') {
  const child = spawnSync(process.execPath, [file, ...args], { env: { TZ: zone }, encoding: 'utf8' });
  if (child.status !== 0) throw Error(`${file} failed (${child.status}):\n${child.stdout}\n${child.stderr}`);
  return child.stdout;
}
function wiring() {
  for (const zone of ['UTC', 'America/Sao_Paulo', 'Pacific/Auckland']) {
    console.log(run('scripts/regression-cirium-radar-wiring-off.mjs', [], zone).trim());
    run('scripts/regression-cirium-radar-provider-off.mjs', [], zone);
  }
}
const runtimeFile = 'server/cirium-radar-injection.mjs';
const runtimeSource = fs.readFileSync(runtimeFile, 'utf8');
wiring();
fs.rmSync('.crewcheck-source-preparation.json', { force: true });
run('scripts/v139/apply.mjs');
assert.ok(fs.readFileSync('server.mjs', 'utf8').includes('function selectFlightAwareOccurrence('), 'cold preparation preserves v14392');
wiring();
assert.match(run('scripts/v139/apply.mjs'), /unchanged prepared sources; skipping legacy patch replay/);
wiring();
try {
  fs.writeFileSync(runtimeFile, runtimeSource + '\n// offline cache invalidation fixture\n');
  const invalidated = run('scripts/v139/apply.mjs');
  assert.doesNotMatch(invalidated, /unchanged prepared sources; skipping legacy patch replay/);
  wiring();
} finally { fs.writeFileSync(runtimeFile, runtimeSource); }
run('scripts/v139/apply.mjs');
assert.match(run('scripts/v139/apply.mjs'), /unchanged prepared sources; skipping legacy patch replay/);
const order = fs.readFileSync('scripts/v139/apply.mjs', 'utf8').trim();
assert.ok(order.endsWith("await import('../ci/sync-canonical-manual.mjs');"), 'canonical finalizer stays terminal');
for (const script of [
  'check-cirium-offline.mjs', 'regression-radar-occurrence-identity.mjs', 'regression-radar-field-provenance.mjs',
  'regression-v14-3-90-radar-wait-all.mjs', 'regression-v14-3-91-radar-no-latency-bias.mjs',
  'regression-v14-3-92-radar-occurrence-identity.mjs', 'regression-radar-departure-gate-contract.mjs',
  'regression-radar-departure-gate-arrival-fallback.mjs', 'regression-p1-566-navigation-context.mjs',
  'regression-p1-566-flightdeck-radar-briefing-context.mjs', 'regression-p1-566-stay-wakeup-concierge-context.mjs',
  'regression-p0-530-finance-canonical-journey.mjs', 'regression-active-roster-identity.mjs',
  'regression-active-roster-runtime.mjs', 'regression-p0-525-stay-physical-association.mjs',
  'regression-source-preparation-cache.mjs',
]) {
  run(`scripts/${script}`);
  console.log(`PASS gate ${script}`);
}
console.log('PASS Cirium wiring cold/repeated/invalidated preparation; terminal finalizer preserved; child environment contains only TZ');
