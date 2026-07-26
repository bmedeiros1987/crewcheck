import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const preflightPath = path.join(root, 'scripts/v14323-preflight/apply.mjs');
const chain = fs.readFileSync(path.join(root, 'scripts/v139/apply.mjs'), 'utf8');
assert.ok(chain.includes("await import('../v14323-preflight/apply.mjs');"), 'preflight deve executar antes do patch legado');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-v14323-preflight-'));
const fixture = `function conciergePlaceLines(places = []) {
  return places.map((place, index) => {
    const distance = Number.isFinite(place.distanceKm) ? 'distância' : '';
    return \`${'${index + 1}'}. ${'${place.name}'}${'${distance}'}\`;
  }).join('\\n\\n');
}
function conciergeRoutineReply(snapshot) {
  const next = conciergeNextProgram(snapshot?.roster);
  return next ? 'ok' : 'sem escala';
}
function conciergeRegulationReply() {
  return 'preservada';
}
`;

try {
  fs.writeFileSync(path.join(tempDir, 'server.mjs'), fixture, 'utf8');
  const result = spawnSync(process.execPath, [preflightPath], { cwd: tempDir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout || 'preflight falhou');

  const prepared = fs.readFileSync(path.join(tempDir, 'server.mjs'), 'utf8');
  assert.ok(prepared.includes('function conciergeRoutineReply(snapshot) {'), 'rotina não pode ser removida');
  assert.ok(prepared.includes('function conciergeRegulationReply() {'), 'funções seguintes não podem ser removidas');
  assert.ok(prepared.includes('const distance = Number.isFinite(place.distanceKm)'), 'formatação semântica deve permanecer');
  assert.ok(!prepared.includes("const distance = Number.isFinite(place.distanceKm) ? 'distância' : '';"), 'bloco deve ser normalizado para o formato canônico');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('v14.3.23 structural preflight regression: OK');
