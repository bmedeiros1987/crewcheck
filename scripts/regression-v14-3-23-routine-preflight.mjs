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
const serverPath = path.join(tempDir, 'server.mjs');
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

const expectedPlaceLines = [
  'function conciergePlaceLines(places = []) {',
  '  return places.map((place, index) => {',
  "    const distance = Number.isFinite(place.distanceKm) ? ` · ${place.distanceKm < 1 ? `${Math.round(place.distanceKm * 1000)} m` : `${place.distanceKm.toFixed(1).replace(`.`, `,`)} km`}` : '';",
  "    return `${index + 1}. ${place.name}${distance}${place.rating ? ` · nota ${place.rating}` : ``}${place.openNow === true ? ` · aberto agora` : place.openNow === false ? ` · fechado agora` : ``}\\n${place.address || place.mapsUrl || ``}`;",
  "  }).join('\\n\\n');",
  '}',
].join('\n');

try {
  fs.writeFileSync(serverPath, fixture, 'utf8');

  const first = spawnSync(process.execPath, [preflightPath], { cwd: tempDir, encoding: 'utf8' });
  assert.equal(first.status, 0, first.stderr || first.stdout || 'preflight falhou');

  const prepared = fs.readFileSync(serverPath, 'utf8');
  assert.ok(prepared.includes(expectedPlaceLines), 'bloco normalizado deve coincidir com o formato esperado pelo patch v14.3.23');
  assert.ok(prepared.includes('function conciergeRoutineReply(snapshot) {'), 'rotina não pode ser removida');
  assert.ok(prepared.includes('function conciergeRegulationReply() {'), 'funções seguintes não podem ser removidas');
  assert.ok(!prepared.includes(".join('\n\n');"), 'o código gerado não pode conter quebras reais dentro da string de join');

  const syntax = spawnSync(process.execPath, ['--check', serverPath], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout || 'server.mjs gerado é sintaticamente inválido');

  const second = spawnSync(process.execPath, [preflightPath], { cwd: tempDir, encoding: 'utf8' });
  assert.equal(second.status, 0, second.stderr || second.stdout || 'segunda execução do preflight falhou');
  assert.equal(fs.readFileSync(serverPath, 'utf8'), prepared, 'preflight deve ser idempotente');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('v14.3.23 escaped-newline structural preflight regression: OK');
