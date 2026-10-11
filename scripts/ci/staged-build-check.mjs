// Opt-in validation entry point; does not replace any existing job or runtime caller.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {prepareCiValidation, checkAndBuildCiValidation} from './staged-build-adapter.mjs';
import {runPrototypeCommand} from '../v139/prototype-processes.mjs';
import {manifest, resolvePreparedGeneration} from '../v139/staged-preparation-prototype.mjs';
const [repositoryArg, jobArg, inputKind, commit] = process.argv.slice(2);
assert.equal(inputKind, 'raw', 'Explicit raw inputKind is required');
assert.match(commit ?? '', /^[a-f0-9]{40}$/);
const repository = fs.realpathSync(repositoryArg), job = fs.realpathSync(jobArg);
assert(!job.startsWith(repository + path.sep) && !repository.startsWith(job + path.sep));
const root = fs.mkdtempSync(path.join(job, 'adapter-')), raw = path.join(root, 'raw');
fs.mkdirSync(raw);
const dependencies = fs.realpathSync(path.join(job, 'dependencies/node_modules'));
assert(dependencies.startsWith(job + path.sep), 'Job-exclusive dependencies are required');
const policy = {allowVersionedEnvTemplate: true}, checkoutBefore = manifest(repository, policy);
const archive = spawnSync('git', ['archive', commit], {cwd: repository, maxBuffer: 256 * 1024 * 1024});
assert.equal(archive.status, 0); assert.equal(spawnSync('tar', ['-x', '-C', raw], {input: archive.stdout}).status, 0);
fs.symlinkSync(dependencies, path.join(raw, 'node_modules'));
const names = ['regression-preparation-crewlock-replay', 'regression-v1392-regulation-replay', 'regression-source-preparation-cache', 'regression-free-day-postponement', 'regression-free-day-held', 'regression-free-day-telegram-preparation', 'regression-financial-read-model', 'regression-financial-review-owner-negative', 'regression-notification-diagnostic'];
const gates = [['--check', 'server.mjs'], ...names.map(name => [`scripts/${name}.mjs`])];
const results = {commit, inputKind, node: process.version, status: 'FAILED', phases: [], trustedDisposableOnly: true, consumersChanged: false};
const run = (args, cwd, extra = {}) => {
  const result = runPrototypeCommand(process.execPath, args, {cwd, timeout: 180000, env: {PATH: process.env.PATH, HOME: root, TMPDIR: root, NODE_DISABLE_COMPILE_CACHE: '1', NODE_OPTIONS: `--import=${path.join(cwd, 'scripts/ci/smoke-deny-network.mjs')}`, ...extra}});
  if (result.status !== 0) throw Error(`Gate failed (${result.status}): ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
};
try {
  for (const args of gates) run(args, raw);
  results.phases.push('raw-gates');
  const candidate = prepareCiValidation({repository, commit, inputRoot: raw, inputKind, storage: path.join(root, 'store'), validationParent: job, dependencyRoot: dependencies, policy, gates: gates.slice(0, 4)});
  results.commands = checkAndBuildCiValidation(candidate, {gates});
  results.phases.push('prepared-gates', 'tsc', 'concierge-compile', 'vite-native');
  // Only synthetic OFF wiring when the exact composition contains the reviewed module.
  if (fs.existsSync(path.join(raw, 'server/cirium-radar-injection.mjs'))) {
    for (const cwd of [raw, candidate.validation]) for (const TZ of ['UTC', 'America/Sao_Paulo', 'Pacific/Auckland']) {
      run(['scripts/regression-cirium-radar-wiring-off.mjs'], cwd, {TZ});
      run(['scripts/regression-cirium-radar-provider-off.mjs'], cwd, {TZ});
    }
    results.phases.push('exact-1016-raw-prepared-off-three-timezones');
  }
  run(['scripts/regression-free-day-physical.mjs'], candidate.validation, {NODE_OPTIONS: `--import=${path.join(candidate.validation, 'scripts/ci/experiment-loopback-only.mjs')}`, PLAYWRIGHT_BROWSERS_PATH: path.join(job, 'browser-cache'), CREWCHECK_EXPERIMENT_VITE_CACHE: path.join(root, 'browser-vite-cache'), ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? {PLAYWRIGHT_CHROMIUM_EXECUTABLE: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE} : {})});
  results.phases.push('synthetic-physical-browser');
  assert.equal(resolvePreparedGeneration(path.join(root, 'store')), candidate.generation);
  assert.deepEqual(manifest(repository, policy), checkoutBefore, 'Checkout must remain intact');
  results.checkoutUnchanged = true; results.status = 'PASS';
} catch (error) {results.failure = error.message; process.exitCode = 1;}
finally {fs.writeFileSync(path.join(job, 'adapter-results.json'), JSON.stringify(results, null, 2) + '\n'); console.log(JSON.stringify(results));}
