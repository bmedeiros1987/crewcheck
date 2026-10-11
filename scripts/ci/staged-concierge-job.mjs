// One trusted disposable CI consumer. Production package commands remain unchanged.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {prepareCiValidation, checkAndBuildCiValidation} from './staged-build-adapter.mjs';
import {runPrototypeCommand} from '../v139/prototype-processes.mjs';
import {manifest, resolvePreparedGeneration} from '../v139/staged-preparation-prototype.mjs';

const [repositoryArg, jobArg, inputKind, commit, label] = process.argv.slice(2);
assert.equal(inputKind, 'raw', 'Explicit raw inputKind required');
assert.match(commit ?? '', /^[a-f0-9]{40}$/);
assert.match(label ?? '', /^[a-z0-9-]+$/);
const repository = fs.realpathSync(repositoryArg), job = fs.realpathSync(jobArg);
assert(!job.startsWith(repository + path.sep) && !repository.startsWith(job + path.sep));
const dependencies = fs.realpathSync(path.join(job, 'dependencies/node_modules'));
assert(dependencies.startsWith(job + path.sep), 'Job-exclusive dependencies required');
const policy = {allowVersionedEnvTemplate: true};
const checkout = () => {
  const files = manifest(repository, policy);
  return {files, modes: Object.fromEntries(Object.keys(files).map(file => [file, fs.statSync(path.join(repository, file)).mode]))};
};
const checkoutBefore = checkout(), root = fs.mkdtempSync(path.join(job, 'concierge-'));
const raw = path.join(root, 'raw'), rawValidation = path.join(root, 'raw-validation');
fs.mkdirSync(raw);
const archive = spawnSync('git', ['archive', commit], {cwd: repository, maxBuffer: 256 * 1024 * 1024});
assert.equal(archive.status, 0);
assert.equal(spawnSync('tar', ['-x', '-C', raw], {input: archive.stdout}).status, 0);
fs.symlinkSync(dependencies, path.join(raw, 'node_modules'));
// The raw Concierge gate compiles disposable bridge outputs. Keep it off the attested input.
fs.cpSync(raw, rawValidation, {recursive: true, dereference: false, verbatimSymlinks: true});
const rawGates = ['scripts/regression-concierge-journey-programs.mjs', 'scripts/regression-p0-canonical-midnight-presentation.mjs'];
const preparedGates = [...rawGates, 'scripts/regression-p0-530-journey-rest-cleanroom.mjs', 'scripts/regression-concierge-clock-format.mjs', 'scripts/regression-concierge-natural-language.mjs'];
const results = {commit, label, inputKind, node: process.version, status: 'FAILED', phases: [], rawGates, preparedGates, trustedDisposableOnly: true, productionConsumersChanged: false};
const run = (args, cwd) => {
  const result = runPrototypeCommand(process.execPath, args, {cwd, timeout: 180000, env: {PATH: process.env.PATH, HOME: root, TMPDIR: root, NODE_DISABLE_COMPILE_CACHE: '1', CREWCHECK_CANONICAL_PARITY: '1', NODE_OPTIONS: `--import=${path.join(cwd, 'scripts/ci/smoke-deny-network.mjs')}`}});
  if (result.status !== 0) throw Error(`Required gate failed (${result.status}): ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
};
try {
  for (const file of rawGates) run([file], rawValidation);
  results.phases.push('raw-consumer-and-canonical-midnight');
  const candidate = prepareCiValidation({repository, commit, inputRoot: raw, inputKind, storage: path.join(root, 'store'), validationParent: job, dependencyRoot: dependencies, policy});
  results.buildCommands = checkAndBuildCiValidation(candidate);
  results.phases.push('direct-typecheck-compile-vite-native');
  run(['--check', 'server.mjs'], candidate.validation);
  for (const file of preparedGates) run([file], candidate.validation);
  results.phases.push('prepared-callsites-and-canonical-parity');
  const preparedServer = fs.readFileSync(path.join(candidate.validation, 'server.mjs'));
  run(['scripts/p1-concierge-journey/apply.mjs'], candidate.validation);
  assert.deepEqual(fs.readFileSync(path.join(candidate.validation, 'server.mjs')), preparedServer, 'Idempotent consumer preparation must preserve server.mjs');
  results.phases.push('idempotent-consumer-preparation');
  run(['node_modules/typescript/bin/tsc', '--noEmit'], candidate.validation);
  results.phases.push('final-prepared-typecheck');
  assert.equal(resolvePreparedGeneration(path.join(root, 'store')), candidate.generation);
  assert.deepEqual(checkout(), checkoutBefore, 'Checkout bytes and modes must remain intact');
  results.checkoutUnchanged = true; results.status = 'PASS';
} catch (error) {results.failure = error.message; process.exitCode = 1;}
finally {fs.writeFileSync(path.join(job, `concierge-${label}-results.json`), JSON.stringify(results, null, 2) + '\n'); console.log(JSON.stringify(results));}
