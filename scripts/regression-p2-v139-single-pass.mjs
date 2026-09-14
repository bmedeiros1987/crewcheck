import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const node = process.execPath;
const apply = 'scripts/v139/apply.mjs';
const statePath = 'node_modules/.cache/crewcheck-v139-preparation-state.json';

function trackedDiffHash() {
  const diff = execFileSync('git', ['diff', '--no-ext-diff', '--binary'], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  return createHash('sha256').update(diff).digest('hex');
}

fs.rmSync(statePath, { force: true });
execFileSync(node, [apply], { stdio: 'inherit' });

const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
assert.equal(state.status, 'complete', 'primeira preparação deve concluir e persistir estado completo');
const beforeSecondRun = trackedDiffHash();

const second = spawnSync(node, [apply], { encoding: 'utf8' });
assert.notEqual(second.status, 0, 'segunda preparação deve falhar antes de qualquer mutação');
assert.equal(second.status, 73, 'segunda preparação deve usar exit code classificado 73');
assert.match(`${second.stdout}\n${second.stderr}`, /PREPARATION_COMPLETE/);
assert.equal(trackedDiffHash(), beforeSecondRun, 'segunda tentativa não pode alterar a árvore preparada');
assert.equal(JSON.parse(fs.readFileSync(statePath, 'utf8')).status, 'complete', 'rejeição não pode corromper o estado completo');

console.log('[p2-v139-single-pass] PASS — segunda execução falha antes de mutar a árvore e preserva o estado preparado.');
