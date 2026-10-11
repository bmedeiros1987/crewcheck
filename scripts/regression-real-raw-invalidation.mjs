import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createRawLifecycle} from './ci/raw-invalidation-lifecycle.mjs';
import {manifest} from './v139/staged-preparation-prototype.mjs';

const repository = fs.realpathSync('.');
const commit = spawnSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).stdout.trim();
const job = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-real-invalidation-'));
const lifecycle = createRawLifecycle({repository, commit, job});
const policy = {allowVersionedEnvTemplate: true, strictOutputs: true};
// Remove only this test's unused snapshots after completed synchronous calls.
// This is not stale-lease recovery and never touches a live generation.
function discard(target, ownedRoot) {
  assert(target.startsWith(ownedRoot + path.sep));
  function writable(file) {
    const stat = fs.lstatSync(file); assert(!stat.isSymbolicLink());
    fs.chmodSync(file, stat.isDirectory() ? 0o755 : 0o644);
    if (stat.isDirectory()) for (const name of fs.readdirSync(file)) writable(path.join(file, name));
  }
  writable(target); fs.rmSync(target, {recursive: true});
}
function compact(owner, candidate) {
  discard(candidate.validation, owner.root); discard(candidate.scratch, owner.root);
  assert(!fs.existsSync(path.join(candidate.storage, 'writer.lock')));
  const generations = path.join(candidate.storage, 'generations');
  for (const name of fs.readdirSync(generations)) {
    const directory = path.join(generations, name);
    if (directory !== path.dirname(candidate.generation)) discard(directory, owner.root);
  }
}
const cold = lifecycle.prepare(); assert.equal(cold.status, 'prepared');
const coldManifest = manifest(cold.generation, policy);
const repeat = lifecycle.prepare(); assert.equal(repeat.status, 'hit');
compact(lifecycle, repeat);
// Exact root cause: v2 cache miss replays legacy materializers on an already
// transformed tree. Preserve this as a counterexample, never repair its anchors.
const legacy = cold.validation;
const input = 'server/v1396/infobip.mjs';
fs.appendFileSync(path.join(legacy, input), '\n// synthetic invalidation input\n');
const replay = spawnSync(process.execPath, ['scripts/v139/apply.mjs'], {cwd: legacy, encoding: 'utf8', env: {PATH: process.env.PATH, TZ: 'UTC', HOME: job, TMPDIR: job,
  NODE_OPTIONS: `--import=${path.join(legacy, 'scripts/ci/smoke-deny-network.mjs')}`}});
assert.notEqual(replay.status, 0);
assert.match(replay.stderr, /v13\.9\.6: nenhum marcador compatível/);
assert(!fs.existsSync(path.join(legacy, '.crewcheck-source-preparation.json')), 'Failed replay cannot certify the tree');
discard(cold.validation, lifecycle.root); discard(cold.scratch, lifecycle.root);
const original = fs.readFileSync(path.join(lifecycle.raw, input), 'utf8');
lifecycle.revise(input, source => source + '\n// synthetic invalidation input\n');
const invalidated = lifecycle.prepare(); assert.equal(invalidated.status, 'prepared');
assert.notEqual(invalidated.generation, cold.generation);
const invalidatedManifest = manifest(invalidated.generation, policy);
compact(lifecycle, invalidated);
const invalidatedRepeat = lifecycle.prepare(); assert.equal(invalidatedRepeat.status, 'hit'); compact(lifecycle, invalidatedRepeat);
// Independent cold preparation of the changed raw revision must be byte equal.
const changedCommit = spawnSync('git', ['rev-parse', 'HEAD'], {cwd: lifecycle.raw, encoding: 'utf8'}).stdout.trim();
const independentJob = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-independent-invalidation-'));
const independent = createRawLifecycle({repository: lifecycle.raw, commit: changedCommit, job: independentJob});
const independentlyCold = independent.prepare();
assert.deepEqual(invalidatedManifest, manifest(independentlyCold.generation, policy));
compact(independent, independentlyCold);
lifecycle.revise(input, () => original);
const restored = lifecycle.prepare(); assert.equal(restored.status, 'prepared');
assert.deepEqual(manifest(restored.generation, policy), coldManifest); compact(lifecycle, restored);
const restoredRepeat = lifecycle.prepare(); assert.equal(restoredRepeat.status, 'hit'); compact(lifecycle, restoredRepeat);
assert.equal(spawnSync('git', ['status', '--porcelain'], {cwd: lifecycle.raw, encoding: 'utf8'}).stdout, '');
console.log(JSON.stringify({status: 'PASS', commit, root: job, legacyInPlaceCounterexample: 'v1396',
  coldRepeatInvalidationRestore: true, independentColdEqual: true, runtimeChanged: false}));
