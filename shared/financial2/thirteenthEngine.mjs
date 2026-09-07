// Financeiro 2.0 — thirteenth salary engine (pure).
//
// Avos are counted from the worked-months list the adapter declares, never inferred from
// duty data here. A month qualifies when it reaches the rule's minimum day count, and the
// count is capped by the rule's denominator so a data glitch cannot mint a 13/12.

import { applyFraction, sumCents } from './money.mjs';
import { competenceKey } from './competence.mjs';
import { RUBRIC_INTEGRATION } from './rubricTaxonomy.mjs';
import { computeEligibleAverages } from './averages.mjs';
import { applyDeductions } from './deductions.mjs';
import { ruleProvenance, selectCompensationRule } from './compensationRules.mjs';

export function countAvos({ workedMonths = [], rule, year }) {
  const qualifying = [];
  const rejected = [];
  for (const month of workedMonths) {
    if (Number.isInteger(year) && month.competence.year !== year) {
      rejected.push({ competenceKey: month.competenceKey, daysWorked: month.daysWorked, reason: `fora do ano-base ${year}` });
      continue;
    }
    if (month.daysWorked >= rule.thirteenth.minDaysForAvo) qualifying.push(month);
    else rejected.push({ competenceKey: month.competenceKey, daysWorked: month.daysWorked, reason: `menos de ${rule.thirteenth.minDaysForAvo} dias trabalhados` });
  }
  const avos = Math.min(qualifying.length, rule.thirteenth.avosDenominator);
  return Object.freeze({
    avos,
    denominator: rule.thirteenth.avosDenominator,
    qualifyingMonths: qualifying.map((month) => month.competenceKey),
    rejectedMonths: rejected,
    capped: qualifying.length > rule.thirteenth.avosDenominator,
  });
}

/**
 * Computes the thirteenth for a reference competence. `installment` selects which figure
 * is being paid: 'first', 'second' or 'full'.
 */
export function computeThirteenth({ input, catalog, rules, installment = 'full', year = null }) {
  if (!['first', 'second', 'full'].includes(installment)) {
    throw new RangeError(`[financial2/thirteenth] parcela desconhecida: ${String(installment)}`);
  }
  const rule = selectCompensationRule(rules, { profile: input.profile, competence: input.referenceCompetence });
  const baseYear = Number.isInteger(year) ? year : input.referenceCompetence.year;

  const averages = computeEligibleAverages({
    earnings: input.earnings,
    catalog,
    rule,
    referenceCompetence: input.referenceCompetence,
    windowMonths: rule.thirteenth.averagesWindowMonths,
    target: RUBRIC_INTEGRATION.THIRTEENTH,
  });

  const avosResult = countAvos({ workedMonths: input.workedMonths, rule, year: baseYear });
  const baseCents = input.monthlyFixedCents;
  const thirteenthBaseCents = baseCents + averages.averageCents;
  const grossCents = applyFraction(thirteenthBaseCents, avosResult.avos, avosResult.denominator, 'avos');
  const firstInstallmentCents = applyFraction(grossCents, rule.thirteenth.firstInstallmentRate, 1, 'primeira parcela');

  // The first installment is customarily paid without deductions; the second absorbs
  // them and discounts the advance. Both behaviours are rule-configurable.
  const deductionBasisCents = installment === 'first' ? firstInstallmentCents
    : installment === 'second' ? grossCents - firstInstallmentCents
      : grossCents;
  const applicable = installment === 'first' && rule.thirteenth.deductFirstInstallment === false ? [] : (input.deductions || []);
  const deductions = applyDeductions(applicable, {
    gross: grossCents,
    proportional: grossCents,
    installment: deductionBasisCents,
  });

  const payableGrossCents = installment === 'first' ? firstInstallmentCents
    : installment === 'second' ? grossCents - firstInstallmentCents
      : grossCents;
  const netCents = payableGrossCents - deductions.totalCents;

  return Object.freeze({
    kind: 'thirteenth',
    installment,
    profile: input.profile,
    competence: input.referenceCompetence,
    competenceKey: competenceKey(input.referenceCompetence),
    year: baseYear,
    avos: avosResult.avos,
    avosDenominator: avosResult.denominator,
    baseCents,
    averagesCents: averages.averageCents,
    thirteenthBaseCents,
    fullGrossCents: grossCents,
    firstInstallmentCents,
    secondInstallmentCents: grossCents - firstInstallmentCents,
    payableGrossCents,
    deductionsCents: deductions.totalCents,
    netCents,
    explanation: Object.freeze({
      rule: ruleProvenance(rule),
      formula: [
        `base 13º = fixo (${baseCents}) + médias (${averages.averageCents}) = ${thirteenthBaseCents}`,
        `avos = ${avosResult.avos}/${avosResult.denominator}`,
        `bruto integral = base 13º × ${avosResult.avos}/${avosResult.denominator} = ${grossCents}`,
        `1ª parcela = bruto × ${rule.thirteenth.firstInstallmentRate} = ${firstInstallmentCents}`,
        `2ª parcela = bruto − 1ª = ${grossCents - firstInstallmentCents}`,
        `parcela apurada (${installment}) = ${payableGrossCents}`,
        `líquido estimado = parcela − descontos (${deductions.totalCents}) = ${netCents}`,
      ],
      avosDetail: avosResult,
      averagesWindow: averages.windowMonths,
      monthlyTotalsCents: averages.monthlyTotalsCents,
      includedItems: averages.includedItems,
      excludedItems: averages.excludedItems,
      deductions: deductions.applied,
    }),
  });
}

export function computeThirteenthInstallments({ input, catalog, rules, year = null }) {
  const first = computeThirteenth({ input, catalog, rules, installment: 'first', year });
  const second = computeThirteenth({ input, catalog, rules, installment: 'second', year });
  return Object.freeze({
    kind: 'thirteenth_installments',
    first,
    second,
    fullGrossCents: first.fullGrossCents,
    totalNetCents: sumCents([first.netCents, second.netCents]),
  });
}
