import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createRawLifecycle } from './ci/raw-invalidation-lifecycle.mjs';
import { manifest } from './v139/staged-preparation-prototype.mjs';
import { runPrototypeNode } from './v139/prototype-processes.mjs';

if (process.argv[2] !== '--worker') {
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--worker'],
    { env: { PATH: process.env.PATH, TZ: 'UTC' }, stdio: 'inherit' });
  process.exit(child.status ?? 1);
}
const repository = fs.realpathSync('.');
const commitResult = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
assert.equal(commitResult.status, 0);
const commit = commitResult.stdout.trim();
const job = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-cirium-raw-lifecycle-'));
const dependencyRoot = fs.realpathSync('node_modules');
const lifecycle = createRawLifecycle({ repository, commit, job, dependencyRoot });
const policy = { allowVersionedEnvTemplate: true, strictOutputs: true };

function run(root, file, args = [], zone = 'UTC') {
  const child = runPrototypeNode([file, ...args], { cwd: root, timeout: 180000,
    env: { TZ: zone, PATH: process.env.PATH,
      NODE_OPTIONS: `--import=${path.join(root, 'scripts/ci/smoke-deny-network.mjs')}` } });
  assert.equal(child.error, undefined, 'Supervisor error must fail before cleanup');
  assert.equal(child.signal, null, 'Signalled execution must fail before cleanup');
  if (child.status !== 0) throw Error(`${file} failed (${child.status}):\n${child.stdout}\n${child.stderr}`);
  return child.stdout;
}
function wiring(root) {
  for (const zone of ['UTC', 'America/Sao_Paulo', 'Pacific/Auckland']) {
    console.log(run(root, 'scripts/regression-cirium-radar-wiring-off.mjs', [], zone).trim());
    run(root, 'scripts/regression-cirium-radar-provider-off.mjs', [], zone);
  }
}
function canonicalGates(root) {
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
    run(root, `scripts/${script}`);
    console.log(`PASS gate ${script}`);
  }
  const order = fs.readFileSync(path.join(root, 'scripts/v139/apply.mjs'), 'utf8').trim();
  assert.ok(order.endsWith("await import('../ci/sync-canonical-manual.mjs');"), 'canonical finalizer stays terminal');
  assert.ok(fs.readFileSync(path.join(root, 'server.mjs'), 'utf8').includes('function selectFlightAwareOccurrence('), 'v14392 stays prepared');
}
// Only retire this job's completed synchronous snapshots; never follow dependency links,
// recover a lease or change runtime/cache-v2 behavior.
function discard(target, root) {
  assert(target.startsWith(root + path.sep));
  function writable(file) {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) { fs.unlinkSync(file); return; }
    fs.chmodSync(file, stat.isDirectory() ? 0o755 : 0o644);
    if (stat.isDirectory()) for (const name of fs.readdirSync(file)) writable(path.join(file, name));
  }
  writable(target); fs.rmSync(target, { recursive: true });
}
function compact(owner, candidate) {
  assert(!fs.existsSync(path.join(candidate.storage, 'writer.lock')));
  discard(candidate.validation, owner.root); discard(candidate.scratch, owner.root);
  for (const name of fs.readdirSync(path.join(candidate.storage, 'generations'))) {
    const directory = path.join(candidate.storage, 'generations', name);
    if (directory !== path.dirname(candidate.generation)) discard(directory, owner.root);
  }
}

wiring(lifecycle.raw);
const cold = lifecycle.prepare(); assert.equal(cold.status, 'prepared');
const coldManifest = manifest(cold.generation, policy);
assert.ok(fs.readFileSync(path.join(cold.validation, 'server.mjs'), 'utf8').includes('function selectFlightAwareOccurrence('));
wiring(cold.validation);
canonicalGates(cold.validation);
const repeat = lifecycle.prepare(); assert.equal(repeat.status, 'hit'); wiring(repeat.validation);
compact(lifecycle, repeat); discard(cold.validation, lifecycle.root); discard(cold.scratch, lifecycle.root);

// Keep the actual legacy prepared-tree replay failure as a counterexample.
// This gate also exercises the helper's independent raw invalidation/restore contract.
console.log(run(repository, 'scripts/regression-real-raw-invalidation.mjs').trim());
const runtimeFile = 'server/cirium-radar-injection.mjs';
const runtimeSource = fs.readFileSync(path.join(lifecycle.raw, runtimeFile), 'utf8');
lifecycle.revise(runtimeFile, source => source + '\n// offline Cirium raw invalidation fixture\n');
wiring(lifecycle.raw);
const invalidated = lifecycle.prepare(); assert.equal(invalidated.status, 'prepared');
assert.notEqual(invalidated.generation, cold.generation);
assert.ok(fs.readFileSync(path.join(invalidated.validation, runtimeFile), 'utf8').endsWith('// offline Cirium raw invalidation fixture\n'));
const invalidatedManifest = manifest(invalidated.generation, policy);
wiring(invalidated.validation); compact(lifecycle, invalidated);
const invalidatedRepeat = lifecycle.prepare(); assert.equal(invalidatedRepeat.status, 'hit');
wiring(invalidatedRepeat.validation); compact(lifecycle, invalidatedRepeat);

const changedCommit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: lifecycle.raw, encoding: 'utf8' });
assert.equal(changedCommit.status, 0);
const independentJob = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-cirium-independent-raw-'));
const independent = createRawLifecycle({ repository: lifecycle.raw, commit: changedCommit.stdout.trim(), job: independentJob, dependencyRoot });
const independentlyCold = independent.prepare(); assert.equal(independentlyCold.status, 'prepared');
assert.deepEqual(invalidatedManifest, manifest(independentlyCold.generation, policy));
wiring(independentlyCold.validation); compact(independent, independentlyCold);

lifecycle.revise(runtimeFile, () => runtimeSource);
const restored = lifecycle.prepare(); assert.equal(restored.status, 'prepared');
assert.deepEqual(manifest(restored.generation, policy), coldManifest);
wiring(restored.validation); compact(lifecycle, restored);
const restoredRepeat = lifecycle.prepare(); assert.equal(restoredRepeat.status, 'hit');
wiring(restoredRepeat.validation); canonicalGates(restoredRepeat.validation); compact(lifecycle, restoredRepeat);
const status = spawnSync('git', ['status', '--porcelain'], { cwd: lifecycle.raw, encoding: 'utf8' });
assert.equal(status.status, 0); assert.equal(status.stdout, '');
console.log('PASS Cirium raw/prepared/OFF gates; real raw invalidation/restoration, hits and independent cold equivalence; legacy in-place failure retained; runtime unchanged');
