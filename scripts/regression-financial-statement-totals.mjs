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
  const reportedHeader = 'DEMONSTRATIVO DE DIARIAS\nDe 2026-02-01 até 2026-02-28\nPagamento em 2026-03-05\n';
  for (const token of ['1.2,34', '1.23,45', '25,001', '25,00x', '-25,00']) {
    const invalid = learnPerDiemStatement(reportedHeader + `CAFE R$ ${token}\nTotal depositado R$ 25,00`, 'synthetic-reported-money.pdf');
    assert.equal(invalid.rates.length, 0, token + ' cannot become a high-confidence tariff');
    assert.ok(invalid.warnings.some(w => w.includes('Tarifa') && w.includes('obrigatória')));
  }
  for (const [token, value] of [['0,00', 0], ['25,00', 25], ['1.234,56', 1234.56], ['1234,56', 1234.56]]) {
    const valid = learnPerDiemStatement(reportedHeader + `CAFE R$ ${token}\nTotal depositado R$ ${token}`, 'synthetic-valid-money.pdf');
    assert.equal(valid.rates[0].value, value);assert.equal(valid.totals.deposited, value);assert.deepEqual(valid.warnings, []);assert.equal(valid.rates[0].confirmed, false);
  }
  const invalidPayment = learnPerDiemStatement(reportedHeader.replace('2026-03-05', '2026-02-31') + 'CAFE R$ 25,00\nTotal depositado R$ 25,00', 'synthetic-reported-date.pdf');
  assert.equal(invalidPayment.paymentDate, undefined);assert.deepEqual(invalidPayment.totals, {});assert.ok(invalidPayment.warnings.some(w => w.includes('pagamento') && w.includes('obrigatória')));
  const invalidPeriod = learnPerDiemStatement(reportedHeader.replace('2026-02-01', '2026-02-31').replace('2026-02-28', '2026-03-04') + 'CAFE R$ 25,00\nTotal depositado R$ 25,00', 'synthetic-calendar-period.pdf');
  assert.ok(invalidPeriod.warnings.some(w => w.includes('Período') && w.includes('obrigatória')));
  const leap = learnPerDiemStatement(reportedHeader.replaceAll('2026-02', '2028-02').replace('2028-02-28', '2028-02-29').replace('2026-03', '2028-03') + 'CAFE R$ 25,00\nTotal depositado R$ 25,00', 'synthetic-leap.pdf');
  assert.deepEqual(leap.warnings, []);assert.equal(leap.rates[0].effectiveTo, '2028-02-29');
  assert.deepEqual(learnPerDiemStatement(header, 'synthetic.pdf').totals, {});
  const repeated = learnPerDiemStatement(header + 'Total depositado R$ 825,00\nTotal depositado R$ 825,00', 'synthetic.pdf');
  assert.equal(repeated.totals.deposited, 825);
  assert.equal(repeated.paymentDate, '2032-04-15');
  assert.equal(repeated.rates[0].confirmed, false);
  const conflict = learnPerDiemStatement(header + 'Total depositado R$ 825,00\nTotal depositado R$ 826,00', 'synthetic.pdf');
  assert.deepEqual(conflict.totals, {});
  assert.ok(conflict.warnings.some(warning => warning.includes('divergentes')));
  assert.equal(learnPerDiemStatement(header + 'Total depositado R$ 0,00', 'synthetic.pdf').totals.deposited, 0);
  const largeConflict = learnPerDiemStatement(header + 'Total depositado R$ 90071992547408,93\nTotal depositado R$ 90071992547408,94', 'synthetic.pdf');
  assert.deepEqual(largeConflict.totals, {});
  assert.ok(largeConflict.warnings.some(warning => warning.includes('divergentes')), 'compare integer cents before lossy major-unit conversion');
  const dated = learnPerDiemStatement(header + 'Total depositado na data 2032-04-15 R$ 825,00\nTotal depositado na data 2032-04-15 R$ 825,00', 'synthetic-dated.pdf');
  assert.equal(dated.totals.deposited, 825);
  assert.deepEqual(dated.warnings, []);
  assert.equal(dated.rates.every(rate => !rate.confirmed), true);
  const historical = learnPerDiemStatement(header + 'Adiantamento de despesas de viagem em 2032-04-08 R$ 200,00\nAdiantamento de despesas de viagem em 2032-04-09 R$ 125,00\nTotal R$ 325,00\nTotal depositado na data 2032-04-08 R$ 325,00\nTotal depositado na data 2032-04-15 R$ 825,00\nTotal depositado na data 2032-04-15 R$ 825,00', 'synthetic-historical.pdf');
  assert.equal(historical.totals.deposited, 825, 'current deposit only; repeated pages and historical advances never added');
  assert.deepEqual(historical.warnings, []);
  for (const tail of [
    'Total depositado na data 2032-04-15 R$ 825,00\nTotal depositado na data 2032-04-15 R$ 826,00',
    'Total depositado na data 2032-04-31 R$ 825,00',
    'Total depositado na data 2032-04-16 R$ 825,00',
    'Total depositado na data 2032-04-15 R$ 825,001',
    'Total depositado na data 2032-04-15 R$ -825,00',
    'Total depositado na data 2032-04-15 R$ 1.2.3,45',
    'Total depositado na data 2032-04-15 R$ 825,00x',
  ]) {
    const pending = learnPerDiemStatement(header + tail, 'synthetic-pending.pdf');
    assert.deepEqual(pending.totals, {});
    assert.ok(pending.warnings.some(w => w.includes('obrigatória')));
  }
  const repeatedPayment = learnPerDiemStatement(header + 'Pagamento em 2032-04-15\nTotal depositado na data 2032-04-15 R$ 825,00', 'synthetic-repeated-payment.pdf');
  assert.equal(repeatedPayment.totals.deposited,825);assert.deepEqual(repeatedPayment.warnings,[]);
  for(const payment of ['2032-04-16','2032-04-31','2032-04-15x','ontem']) {
    for(const body of [header+'Pagamento em '+payment+'\n', 'Pagamento em '+payment+'\n'+header]) {
      const ambiguous = learnPerDiemStatement(body+'Total depositado na data 2032-04-15 R$ 825,00','synthetic-payment-conflict.pdf');
      assert.deepEqual(ambiguous.totals,{});assert.equal(ambiguous.paymentDate,undefined);assert.ok(ambiguous.warnings.some(w=>w.includes('pagamento')&&w.includes('obrigatória')));
    }
  }
  const pastOnly = learnPerDiemStatement(header + 'Total depositado na data 2032-04-08 R$ 325,00', 'synthetic-past.pdf');
  assert.deepEqual(pastOnly.totals, {}, 'historical amount never substitutes missing current total');
  const noPayment = learnPerDiemStatement(header.replace('Pagamento em 2032-04-15\n','') + 'Total depositado na data 2032-04-15 R$ 825,00', 'synthetic-unbound.pdf');
  assert.deepEqual(noPayment.totals, {});assert.ok(noPayment.warnings.some(w=>w.includes('obrigatória')));
  console.log('PASS synthetic statement totals: current dated deposit, historical advances, repeated pages, strict money/date/payment, conflict, zero and no payment confirmation');
} finally { rmSync(outDir, { recursive: true, force: true }); }
