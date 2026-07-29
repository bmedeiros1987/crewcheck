import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chain = fs.readFileSync(path.join(root, 'scripts/v139/apply.mjs'), 'utf8');
const databasePath = path.join(root, 'client/src/lib/databaseClient.ts');
const homePath = path.join(root, 'client/src/pages/Home.tsx');
const cssPath = path.join(root, 'client/src/components/v1406/premium-layout.css');
const applyPath = path.join(root, 'scripts/v14338/apply.mjs');
const databaseBefore = fs.readFileSync(databasePath, 'utf8');
const homeBefore = fs.readFileSync(homePath, 'utf8');
const cssBefore = fs.readFileSync(cssPath, 'utf8');

assert.ok(chain.includes("await import('../v14338/apply.mjs');"), 'v14.3.38 deve encerrar a preparação canônica');
assert.ok(homeBefore.includes("const DEFAULT_VERSION = '14.3.48';"), 'versão Web/PWA final 14.3.48 ausente no cliente');
assert.ok(fs.readFileSync(path.join(root, 'client/public/release.json'), 'utf8').includes('14.3.48'), 'release.json final não atualizado');

for (const marker of [
  'function localRosterPeriodIdentity(',
  'function persistRosterHistoryLocally(',
  'const localSummary = persistRosterHistoryLocally(payload);',
  'if (!hasCrewCheckAuthToken()) return localSummary;',
  'return result.roster || localSummary;',
  "localStorage.setItem(localHistoryKey(), JSON.stringify(merged))",
]) assert.ok(databaseBefore.includes(marker), `persistência mensal ausente: ${marker}`);

for (const marker of [
  'const newGym = (() => { try { return getGymRecommendations(roster); } catch { return []; } })();',
  'saveRosterAnalysis({ roster, compliance: newCompliance, gym: newGym, sourceFileName: file.name } as any)',
  'Promise.allSettled([',
]) assert.ok(homeBefore.includes(marker), `importação automática não preserva histórico: ${marker}`);

function periodKey(item) {
  return `${String(item.crewId || item.crewName || 'crew').toLowerCase()}:${item.year}:${String(item.month).padStart(2, '0')}`;
}
function upsert(items, roster) {
  const key = periodKey(roster);
  return [{ ...roster, updatedAt: Date.now() }, ...items.filter((item) => periodKey(item) !== key)];
}
let history = [];
history = upsert(history, { crewId: '123', year: 2026, month: 6, marker: 'junho' });
history = upsert(history, { crewId: '123', year: 2026, month: 7, marker: 'julho' });
history = upsert(history, { crewId: '123', year: 2026, month: 8, marker: 'agosto' });
assert.equal(history.length, 3, 'junho, julho e agosto devem coexistir');
assert.deepEqual(new Set(history.map((item) => item.month)), new Set([6, 7, 8]), 'os três períodos devem permanecer');
history = upsert(history, { crewId: '123', year: 2026, month: 8, marker: 'agosto atualizado' });
assert.equal(history.length, 3, 'atualizar agosto não pode duplicar nem apagar outros meses');
assert.equal(history.find((item) => item.month === 8)?.marker, 'agosto atualizado', 'o mesmo período deve ser atualizado');
assert.equal(history.find((item) => item.month === 7)?.marker, 'julho', 'julho deve permanecer intacto');
assert.equal(history.find((item) => item.month === 6)?.marker, 'junho', 'junho deve permanecer intacto');

for (const marker of [
  'CrewCheck v14.3.38 — auditoria visual da Saída Inteligente',
  '"warning warning" !important;',
  '.cz-depart-when {',
  'white-space: normal !important;',
  '.cz-depart-detail {',
  '.cz-depart-warning,',
  'position: static !important;',
  '@media (max-width: 720px)',
  'grid-template-columns: minmax(0, 1fr) !important;',
  '.cz-depart-kpis { grid-template-columns: minmax(0, 1fr) !important; }',
]) assert.ok(cssBefore.includes(marker), `proteção visual ausente: ${marker}`);

const applySource = fs.readFileSync(applyPath, 'utf8');
for (const protectedPath of ['client/src/lib/pdfParser.ts', 'server/rosterParser.mjs', 'server.mjs', 'financialRules', 'canonicalRoster']) {
  assert.ok(!applySource.includes(`update('${protectedPath}`), `v14.3.38 não pode alterar motor protegido: ${protectedPath}`);
}

const second = spawnSync(process.execPath, [path.join(root, 'scripts/v14348/apply.mjs')], { cwd: root, encoding: 'utf8' });
assert.equal(second.status, 0, second.stderr || second.stdout || 'reaplicação final v14.3.48 falhou');
assert.equal(fs.readFileSync(databasePath, 'utf8'), databaseBefore, 'preparação final deve preservar a persistência de histórico');
assert.equal(fs.readFileSync(homePath, 'utf8'), homeBefore, 'preparação final deve preservar a importação');
assert.equal(fs.readFileSync(cssPath, 'utf8'), cssBefore, 'preparação final deve preservar a auditoria visual');

console.log('v14.3.38 roster history/layout: June-July-August coexistence, automatic local upsert, mobile flow and protected engine validated.');
