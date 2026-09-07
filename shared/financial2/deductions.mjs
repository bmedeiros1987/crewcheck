// Financeiro 2.0 — configurable deductions.
//
// A deduction is either a fixed amount or a rate over one declared basis. The basis is
// named by the caller so a rate can never quietly change meaning when the engine is
// refactored: 'gross' is the whole gross, 'proportional' is the pre-third proportional
// pay, 'installment' is the installment being paid.

import { applyRate, assertCents, sumCents } from './money.mjs';

export function applyDeductions(deductions = [], bases = {}) {
  const applied = (deductions || []).map((deduction) => {
    const basisCents = assertCents(bases?.[deduction.basis] ?? 0, `base.${deduction.basis}`);
    const amountCents = deduction.amountCents !== null && deduction.amountCents !== undefined
      ? deduction.amountCents
      : applyRate(basisCents, deduction.rate, `desconto.${deduction.code}`);
    return {
      code: deduction.code,
      name: deduction.name,
      basis: deduction.basis,
      basisCents,
      rate: deduction.rate,
      amountCents,
      formula: deduction.amountCents !== null && deduction.amountCents !== undefined
        ? 'valor fixo'
        : `${deduction.basis} × ${deduction.rate}`,
    };
  });
  return Object.freeze({ applied, totalCents: sumCents(applied.map((item) => item.amountCents)) });
}
