import assert from 'node:assert/strict';
import { build } from 'vite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const outDir = mkdtempSync(path.join(tmpdir(), 'synthetic-financial-totals-'));
try {
  await build({ configFile: false, logLevel: 'silent', build: {
    lib: { entry: path.resolve('client/src/lib/financialStatementLearning.ts'), formats: ['es'], fileName: () => 'learning.mjs' },
    outDir, emptyOutDir: true, minify: false,
  } });
  const { learnPerDiemStatement } = await import(pathToFileURL(path.join(outDir, 'learning.mjs')).href);
  const header = 'DEMONSTRATIVO DE DIARIAS\nDe 2032-04-07 até 2032-04-13\nPagamento em 2032-04-15\nALMOCO R$ 100,00\n';
  assert.deepEqual(learnPerDiemStatement(header, 'synthetic.pdf').totals, {});
  const repeated = learnPerDiemStatement(header + 'Total depositado R$ 825,00\nTotal depositado R$ 825,00', 'synthetic.pdf');
  assert.equal(repeated.totals.deposited, 825);
  assert.equal(repeated.paymentDate, '2032-04-15');
  assert.equal(repeated.rates[0].confirmed, false);
  const conflict = learnPerDiemStatement(header + 'Total depositado R$ 825,00\nTotal depositado R$ 826,00', 'synthetic.pdf');
  assert.deepEqual(conflict.totals, {});
  assert.ok(conflict.warnings.some(warning => warning.includes('divergentes')));
  assert.equal(learnPerDiemStatement(header + 'Total depositado R$ 0,00', 'synthetic.pdf').totals.deposited, 0);
  console.log('PASS synthetic statement totals: missing, repeated pages, conflict, explicit zero, no payment confirmation');
} finally { rmSync(outDir, { recursive: true, force: true }); }
