// Trusted disposable CI only. Runtime and existing CI jobs do not call this adapter.
import fs from 'node:fs';
import path from 'node:path';
import {attestGitRaw, preparePrototype, resolvePreparedGeneration} from '../v139/staged-preparation-prototype.mjs';
import {runPrototypeCommand} from '../v139/prototype-processes.mjs';

export const directBuildCommands = Object.freeze([
  Object.freeze(['node_modules/typescript/bin/tsc', '--noEmit']),
  Object.freeze(['scripts/p1-concierge-journey/compile.mjs']),
  Object.freeze(['node_modules/vite/bin/vite.js', 'build', '--configLoader', 'native']),
]);
const fail = code => { throw Object.assign(new Error(code), {code}); };
const thaw = directory => {
  fs.chmodSync(directory, 0o755);
  for (const name of fs.readdirSync(directory)) {
    const file = path.join(directory, name), stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) continue; // Owned generation dependencies stay read-only.
    if (stat.isDirectory()) thaw(file);
    else if (stat.isFile()) fs.chmodSync(file, stat.mode & 0o111 ? 0o755 : 0o644);
    else fail('VALIDATION_SPECIAL_FILE');
  }
};

// Always re-attest the exact raw Git input, including cache hits. No legacy adoption.
export function prepareCiValidation({repository, commit, inputRoot, inputKind, storage,
  validationParent, dependencyRoot, policy = {}, worker, finalizer, gates = [], commandTimeout}) {
  if (inputKind !== 'raw') fail('CI_ATTESTED_RAW_REQUIRED');
  const raw = fs.realpathSync(inputRoot), parent = fs.realpathSync(validationParent);
  if (parent === raw || parent.startsWith(raw + path.sep)) fail('CI_VALIDATION_MUST_BE_OUTSIDE_RAW');
  // A preparation stamp is output provenance, never evidence of a raw Git checkout.
  if (fs.existsSync(path.join(raw, '.crewcheck-source-preparation.json'))) fail('CI_PREPARED_OR_LEGACY_INPUT_FORBIDDEN');
  const proof = attestGitRaw({repository, commit, rawRoot: raw, policy});
  const prepared = preparePrototype({inputRoot: raw, inputKind: 'raw', storage, proof,
    dependencyRoot, policy, worker, finalizer, gates, commandTimeout});
  const generation = resolvePreparedGeneration(storage);
  const store = fs.realpathSync(storage);
  if (parent === store || parent.startsWith(store + path.sep)) fail('CI_VALIDATION_MUST_BE_OUTSIDE_STORAGE'); // Verify typed snapshots, not current.json path arithmetic.
  if (prepared.root !== generation) fail('CI_GENERATION_CHANGED');
  const validation = fs.mkdtempSync(path.join(parent, 'build-validation-'));
  fs.cpSync(generation, validation, {recursive: true, dereference: false, verbatimSymlinks: true});
  thaw(validation);
  const scratch = fs.mkdtempSync(path.join(parent, 'build-scratch-'));
  return {status: prepared.status, generation, validation, scratch, storage, commit};
}

export function checkAndBuildCiValidation(candidate, {timeout = 180000, gates = []} = {}) {
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 180000) fail('CI_TIMEOUT_INVALID');
  if (resolvePreparedGeneration(candidate.storage) !== candidate.generation) fail('CI_GENERATION_CHANGED');
  const root = fs.realpathSync(candidate.validation), scratch = fs.realpathSync(candidate.scratch);
  const env = {PATH: process.env.PATH, HOME: scratch, TMPDIR: scratch, NODE_DISABLE_COMPILE_CACHE: '1',
    NODE_OPTIONS: `--import=${path.join(root, 'scripts/ci/smoke-deny-network.mjs')}`};
  const completed = [];
  for (const args of [...gates, ...directBuildCommands]) {
    if (!Array.isArray(args) || !args.length || args.some(arg => typeof arg !== 'string' || path.isAbsolute(arg) || arg.includes('npm') || arg.includes('apply.mjs'))) fail('CI_RECURSIVE_COMMAND_FORBIDDEN');
    const result = runPrototypeCommand(process.execPath, args, {cwd: root, env, timeout});
    if (result.status !== 0) throw Object.assign(new Error(`CI command failed (${result.status}): ${args.join(' ')}\n${result.stdout}\n${result.stderr}`), {code: 'CI_COMMAND_FAILED'});
    completed.push([...args]);
  }
  if (resolvePreparedGeneration(candidate.storage) !== candidate.generation) fail('CI_GENERATION_CHANGED');
  return completed;
}
