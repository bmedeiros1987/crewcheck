import assert from 'node:assert/strict';
import { loadClientModules } from './lib/ts-module-harness.mjs';

const modules = loadClientModules({
  files: ['client/src/lib/financialTaxReferences.ts'],
  prefix: 'synthetic-thirteenth-withholding-',
});

try {
  const { estimateThirteenthSettlementWithholding } = modules.load('financialTaxReferences');
  const scope = Object.freeze({ ownerId: 'synthetic-account', employmentId: 'employment-a', year: 2026, revision: 3 });
  const evidence = Object.freeze({
    ...scope,
    reviewed: true,
    settlement: 'ordinary_annual',
    singleActiveRgpsEmploymentConfirmed: true,
    ordinaryResidentIrrfConfirmed: true,
    annualGrossMinor: 800000,
    contributionBaseMinor: 500000,
    taxableIncomeMinor: 500000,
    otherLegalDeductionsMinor: 0,
    confirmedRetentionMinor: null,
  });
  const estimate = (patch = {}) => estimateThirteenthSettlementWithholding({ scope, evidence: { ...evidence, ...patch } });

  // Portaria MPS/MF 13/2026 and MOS S-5001 §2.13. Truncate each band.
  const contributionLimits = [[162100, 12157], [290284, 23693], [435427, 41110], [847555, 98807]];
  for (const [limit, expected] of contributionLimits) {
    for (const base of [limit - 1, limit, limit + 1]) {
      const result = estimate({ annualGrossMinor: 900000, contributionBaseMinor: base });
      assert.equal(result.inss.amountMinor, expected, `INSS of ${base} cents`);
    }
  }

  const result = estimateThirteenthSettlementWithholding({ scope, evidence });
  assert.equal(result.version, 'BR-employee-thirteenth-settlement:2026:v1');
  assert.equal(result.estimated, true);
  assert.equal(result.inss.rounding, 'truncate_each_bracket');
  assert.match(result.inss.calculationSource, /#page=388$/);
  assert.equal(result.inss.amountMinor, 50150); // Final-only truncation would be 50151.
  assert.equal(result.irrf.rounding, 'estimate_half_up_per_stage');
  assert.equal(result.irrf.amountMinor, 0);
  assert.equal(result.irrf.taxableIncomeMinor, 500000);
  assert.equal(result.irrf.taxableBaseMinor, 439280);
  assert.equal(result.irrf.deductionMode, 'simplified');
  assert.equal(result.irrf.deductionMinor, 60720); // No addition of the employee contribution.
  assert.equal(result.irrf.reductionMinor, 31289);
  assert.equal(estimate({ annualGrossMinor: 0, contributionBaseMinor: 0, taxableIncomeMinor: 0 }).inss.amountMinor, 0);

  // IN RFB 1.500 arts. 13/65-A and Lei 15.270. Fractional cents in this
  // synthetic vector follow the estimator's convention for each IRRF stage.
  for (const [income, tax, reduction] of [
    [499999, 0, 31289], [500000, 0, 31289], [500001, 0, 31289],
    [500003, 1, 31289], [500100, 36, 31276], [500400, 143, 31236],
    [734999, 94553, 1], [735000, 94554, 0], [735001, 94554, 0],
  ]) {
    const { irrf } = estimate({ taxableIncomeMinor: income });
    assert.equal(irrf.amountMinor, tax, `IRRF of ${income} taxable cents`);
    assert.equal(irrf.reductionMinor, reduction);
  }

  const legal = estimate({ taxableIncomeMinor: 600000, otherLegalDeductionsMinor: 14810 });
  assert.equal(legal.inss.amountMinor, 50150);
  assert.equal(legal.irrf.deductionMinor, 64960);
  assert.equal(legal.irrf.deductionMode, 'legal');
  assert.equal(legal.irrf.ordinaryTaxMinor, 56263);
  assert.equal(legal.irrf.reductionMinor, 17975);
  assert.equal(legal.irrf.amountMinor, 38288);
  const cappedReduction = estimate({ taxableIncomeMinor: 600000, otherLegalDeductionsMinor: 199850 }).irrf;
  assert.equal(cappedReduction.ordinaryTaxMinor, 13084);
  assert.equal(cappedReduction.reductionMinor, 13084);
  assert.equal(cappedReduction.amountMinor, 0);
  // The taxable amount decides eligibility even if deductions put the base
  // in the interval shown in the reduction table.
  const aboveLimit = estimate({ taxableIncomeMinor: 800000, otherLegalDeductionsMinor: 49850 }).irrf;
  assert.equal(aboveLimit.taxableBaseMinor, 700000);
  assert.equal(aboveLimit.reductionMinor, 0);
  assert.equal(aboveLimit.amountMinor, 101627);

  for (const patch of [
    { ownerId: 'another-account' }, { employmentId: 'employment-b' },
    { revision: 2 }, { year: 2025 }, { reviewed: false },
    { settlement: 'termination' }, { settlement: 'late_supplement' },
    { singleActiveRgpsEmploymentConfirmed: false }, { ordinaryResidentIrrfConfirmed: false },
    { ordinaryResidentIrrfConfirmed: undefined }, { confirmedRetentionMinor: 0 },
    { confirmedRetentionMinor: 12345 }, { confirmedRetentionMinor: undefined },
    { annualGrossMinor: null }, { contributionBaseMinor: null }, { taxableIncomeMinor: null },
    { otherLegalDeductionsMinor: null }, { otherLegalDeductionsMinor: -1 },
    { contributionBaseMinor: 800001 }, { taxableIncomeMinor: 800001 },
    { contributionBaseMinor: Infinity }, { taxableIncomeMinor: 1000.5 },
  ]) {
    assert.equal(estimate(patch), null, String(Object.keys(patch)));
  }
  for (const patch of [{ year: 2027 }, { ownerId: '' }, { employmentId: ' ' }, { revision: 0 }]) {
    const invalidScope = { ...scope, ...patch };
    assert.equal(estimateThirteenthSettlementWithholding({ scope: invalidScope, evidence: { ...evidence, ...invalidScope } }), null);
  }
  assert.equal(estimateThirteenthSettlementWithholding({ scope, evidence: null }), null);

  console.log('PASS separate 2026 thirteenth withholding: official INSS bands, estimated IRRF stages, independent bases, scope and confirmed values.');
} finally {
  modules.cleanup();
}
