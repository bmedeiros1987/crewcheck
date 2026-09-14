import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const rosterView = fs.readFileSync('client/src/components/v1391/RosterLaunchView.tsx', 'utf8');
const helperPath = 'client/src/lib/financialCompetence.ts';

assert.ok(fs.existsSync(helperPath), 'P1 #674: helper canônico de competência financeira ainda não existe');
const helper = fs.readFileSync(helperPath, 'utf8');
assert.match(helper, /export function financialCompetenceKey/, 'P1 #674: chave canônica de competência ausente');
assert.match(helper, /export function filterFinancialRowsToCompetence/, 'P1 #674: filtro canônico por competência ausente');
assert.match(home, /filterFinancialRowsToCompetence\(rows, roster\)/, 'P1 #674: Finance não usa o filtro canônico por competência');
assert.match(home, /monthly:\s*competenceConvertedTotalBRL/, 'P1 #674: forecast.monthly ainda não é competência-scoped');
assert.match(rosterView, /scopedFinance\?\.perdiem\?\.monthly/, 'P1 #674: Escala ainda calcula total mensal independente');

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-finance-674-'));
try {
  await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      lib: { entry: path.resolve(helperPath), formats: ['es'], fileName: () => 'financial-competence.mjs' },
      outDir,
      emptyOutDir: true,
      minify: false,
    },
  });
  const mod = await import(`${pathToFileURL(path.join(outDir, 'financial-competence.mjs')).href}?v=${Date.now()}`);
  const roster = { year: 2026, month: 9 };
  const rows = [
    { iso: '2026-08-29', convertedBRL: 525.20 },
    { iso: '2026-09-01', convertedBRL: 800.93 },
    { iso: '2026-09-15', convertedBRL: 800.93 },
    { iso: '2026-10-01', convertedBRL: 100.00 },
  ];
  const scoped = mod.filterFinancialRowsToCompetence(rows, roster);
  assert.deepEqual(scoped.map((row) => row.iso), ['2026-09-01', '2026-09-15']);
  assert.equal(scoped.reduce((sum, row) => sum + row.convertedBRL, 0), 1601.86);
  assert.equal(rows.reduce((sum, row) => sum + row.convertedBRL, 0), 2227.06, 'fixture deve provar que carry rows mudariam o total se não fossem filtradas');
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}

console.log('[p1-674] PASS — Finance e Escala compartilham o total mensal canônico da competência ativa.');
