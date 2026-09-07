// Financeiro 2.0 — vacation compensation engine (pure).
//
// Each period is computed independently. That independence is the whole point of the
// fractioning support: 15 days in March and 15 days in October are two results with two
// competences, two averages windows and two deduction sets — not one number split in
// half after the fact.

import { applyFraction, applyRate, sumCents } from './money.mjs';
import { competenceKey } from './competence.mjs';
import { RUBRIC_INTEGRATION } from './rubricTaxonomy.mjs';
import { computeEligibleAverages } from './averages.mjs';
import { applyDeductions } from './deductions.mjs';
import { VACATION_SALE, ruleProvenance, selectCompensationRule } from './compensationRules.mjs';

function assertPlanAgainstRule(periods, rule) {
  const violations = [];
  if (periods.length > rule.vacation.maxFractions) {
    violations.push(`plano tem ${periods.length} períodos; a regra ${rule.id} permite no máximo ${rule.vacation.maxFractions}`);
  }
  for (const period of periods) {
    if (period.days < rule.vacation.minFractionDays) {
      violations.push(`período ${period.id} tem ${period.days} dias; mínimo da regra ${rule.id} é ${rule.vacation.minFractionDays}`);
    }
    if (period.soldDays > 0 && rule.vacation.sale === VACATION_SALE.NOT_OFFERED) {
      violations.push(`período ${period.id} pede ${period.soldDays} dias de abono, mas a regra ${rule.id} não oferece venda de férias`);
    }
    if (period.soldDays > rule.vacation.maxSaleDays) {
      violations.push(`período ${period.id} pede ${period.soldDays} dias de abono; máximo da regra ${rule.id} é ${rule.vacation.maxSaleDays}`);
    }
  }
  const totalDays = sumDays(periods);
  if (totalDays > rule.vacation.entitlementDays) {
    violations.push(`plano soma ${totalDays} dias; direito da regra ${rule.id} é ${rule.vacation.entitlementDays}`);
  }
  return violations;
}

function sumDays(periods) {
  return (periods || []).reduce((total, period) => total + period.days + period.soldDays, 0);
}

/** Computes one independent vacation period. */
export function computeVacationPeriod({ input, period, catalog, rule }) {
  const averages = computeEligibleAverages({
    earnings: input.earnings,
    catalog,
    rule,
    referenceCompetence: period.competence,
    windowMonths: rule.vacation.averagesWindowMonths,
    target: RUBRIC_INTEGRATION.VACATION,
  });

  const baseCents = input.monthlyFixedCents;
  const vacationBaseCents = baseCents + averages.averageCents;
  const proportionalCents = applyFraction(vacationBaseCents, period.days, rule.vacation.monthlyDaysBasis, 'dias de férias');

  // Venda de férias é fail-closed no valor, não apenas na validação. Se a regra vigente
  // não oferece abono, nenhum centavo de abono é produzido — sinalizar a violação e
  // ainda assim devolver o número deixaria uma UI que ignora `valid` exibindo (ou
  // pagando) uma verba que o contrato não prevê.
  const saleOffered = rule.vacation.sale !== VACATION_SALE.NOT_OFFERED;
  const payableSoldDays = saleOffered ? Math.min(period.soldDays, rule.vacation.maxSaleDays) : 0;
  const soldCents = payableSoldDays > 0
    ? applyFraction(vacationBaseCents, payableSoldDays, rule.vacation.monthlyDaysBasis, 'abono pecuniário')
    : 0;
  const saleNote = !saleOffered && period.soldDays > 0
    ? `abono recusado: regra ${rule.id} não oferece venda de férias`
    : payableSoldDays < period.soldDays
      ? `abono limitado a ${payableSoldDays} dia(s) pela regra ${rule.id}`
      : '';
  const thirdBaseCents = proportionalCents + soldCents;
  const constitutionalThirdCents = applyRate(thirdBaseCents, rule.vacation.constitutionalThirdRate, 'adicional constitucional');
  const grossCents = thirdBaseCents + constitutionalThirdCents;

  const deductions = applyDeductions([...(input.deductions || []), ...(period.deductions || [])], {
    gross: grossCents,
    proportional: proportionalCents,
    installment: grossCents,
  });
  const netCents = grossCents - deductions.totalCents;

  return Object.freeze({
    kind: 'vacation_period',
    periodId: period.id,
    competence: period.competence,
    competenceKey: competenceKey(period.competence),
    days: period.days,
    requestedSoldDays: period.soldDays,
    soldDays: payableSoldDays,
    baseCents,
    averagesCents: averages.averageCents,
    vacationBaseCents,
    proportionalCents,
    soldCents,
    constitutionalThirdCents,
    grossCents,
    deductionsCents: deductions.totalCents,
    netCents,
    explanation: Object.freeze({
      rule: ruleProvenance(rule),
      formula: [
        `base férias = fixo (${baseCents}) + médias (${averages.averageCents}) = ${vacationBaseCents}`,
        `proporcional = base férias × ${period.days}/${rule.vacation.monthlyDaysBasis} = ${proportionalCents}`,
        payableSoldDays > 0
          ? `abono = base férias × ${payableSoldDays}/${rule.vacation.monthlyDaysBasis} = ${soldCents}`
          : `abono = 0${saleNote ? ` (${saleNote})` : ' (não solicitado)'}`,
        `adicional constitucional = (proporcional + abono) × ${rule.vacation.constitutionalThirdRate} = ${constitutionalThirdCents}`,
        `bruto = ${grossCents}`,
        `líquido estimado = bruto − descontos (${deductions.totalCents}) = ${netCents}`,
      ],
      averagesWindow: averages.windowMonths,
      monthlyTotalsCents: averages.monthlyTotalsCents,
      includedItems: averages.includedItems,
      excludedItems: averages.excludedItems,
      deductions: deductions.applied,
      saleNote,
    }),
  });
}

/**
 * Computes a whole vacation plan. Rule selection is per period competence, so a plan
 * that straddles a rule change is evaluated by the rule in force for each period.
 */
export function computeVacationPlan({ input, catalog, rules }) {
  const periods = input.vacationPeriods || [];
  if (!periods.length) throw new RangeError('[financial2/vacation] plano de férias sem períodos.');

  const planRule = selectCompensationRule(rules, { profile: input.profile, competence: periods[0].competence });
  const violations = assertPlanAgainstRule(periods, planRule);

  const results = periods.map((period) => {
    const rule = selectCompensationRule(rules, { profile: input.profile, competence: period.competence });
    return computeVacationPeriod({ input, period, catalog, rule });
  });

  return Object.freeze({
    kind: 'vacation_plan',
    profile: input.profile,
    totalDays: sumDays(periods),
    periods: results,
    grossCents: sumCents(results.map((item) => item.grossCents)),
    deductionsCents: sumCents(results.map((item) => item.deductionsCents)),
    netCents: sumCents(results.map((item) => item.netCents)),
    saleOffered: planRule.vacation.sale !== VACATION_SALE.NOT_OFFERED,
    violations,
    valid: violations.length === 0,
    explanation: Object.freeze({
      rule: ruleProvenance(planRule),
      competences: results.map((item) => item.competenceKey),
    }),
  });
}
