// Financeiro 2.0 — contractual compensation rules with effective dating (vigência).
//
// The engine holds no knowledge of any employer. Every policy decision — whether the
// profile may sell vacation days, how many fractions are allowed, the constitutional
// third rate, the averages window, what counts as an avo — is data on a rule, selected
// by profile and competence. Swapping the data swaps the behaviour, which is what makes
// "this profile does not offer vacation sale" a contractual fact rather than a constant
// compiled into the calculator.

import { compareCompetence, competenceKey, makeCompetence } from './competence.mjs';

export const VACATION_SALE = Object.freeze({
  NOT_OFFERED: 'not_offered',
  OPTIONAL: 'optional',
});

function requirePositiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new RangeError(`[financial2/rule] ${label} deve ser inteiro positivo; recebido: ${String(value)}`);
  return number;
}

function requireRate(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new RangeError(`[financial2/rule] ${label} deve ser taxa não negativa; recebido: ${String(value)}`);
  return number;
}

function normalizeBoundary(value, label) {
  if (value === null || value === undefined) return null;
  return makeCompetence(value.year, value.month);
}

export function defineCompensationRule(definition = {}) {
  const id = String(definition.id || '').trim();
  if (!id) throw new TypeError('[financial2/rule] regra exige `id` estável.');
  const profile = String(definition.profile || '').trim();
  if (!profile) throw new TypeError(`[financial2/rule] regra ${id} exige \`profile\`.`);

  const effectiveFrom = normalizeBoundary(definition.effectiveFrom, 'effectiveFrom');
  const effectiveTo = normalizeBoundary(definition.effectiveTo, 'effectiveTo');
  if (!effectiveFrom) throw new TypeError(`[financial2/rule] regra ${id} exige \`effectiveFrom\`.`);
  if (effectiveTo && compareCompetence(effectiveFrom, effectiveTo) > 0) {
    throw new RangeError(`[financial2/rule] regra ${id} tem vigência invertida.`);
  }

  const vacation = definition.vacation || {};
  const thirteenth = definition.thirteenth || {};
  const sale = String(vacation.sale || VACATION_SALE.NOT_OFFERED);
  if (!Object.values(VACATION_SALE).includes(sale)) {
    throw new RangeError(`[financial2/rule] regra ${id} tem política de venda desconhecida: ${sale}`);
  }

  return Object.freeze({
    id,
    profile,
    label: String(definition.label || id),
    effectiveFrom,
    effectiveTo,
    vacation: Object.freeze({
      sale,
      maxSaleDays: sale === VACATION_SALE.NOT_OFFERED ? 0 : requirePositiveInteger(vacation.maxSaleDays ?? 10, 'vacation.maxSaleDays'),
      entitlementDays: requirePositiveInteger(vacation.entitlementDays ?? 30, 'vacation.entitlementDays'),
      maxFractions: requirePositiveInteger(vacation.maxFractions ?? 2, 'vacation.maxFractions'),
      minFractionDays: requirePositiveInteger(vacation.minFractionDays ?? 15, 'vacation.minFractionDays'),
      constitutionalThirdRate: requireRate(vacation.constitutionalThirdRate ?? 1 / 3, 'vacation.constitutionalThirdRate'),
      averagesWindowMonths: requirePositiveInteger(vacation.averagesWindowMonths ?? 12, 'vacation.averagesWindowMonths'),
      monthlyDaysBasis: requirePositiveInteger(vacation.monthlyDaysBasis ?? 30, 'vacation.monthlyDaysBasis'),
    }),
    thirteenth: Object.freeze({
      avosDenominator: requirePositiveInteger(thirteenth.avosDenominator ?? 12, 'thirteenth.avosDenominator'),
      minDaysForAvo: requirePositiveInteger(thirteenth.minDaysForAvo ?? 15, 'thirteenth.minDaysForAvo'),
      firstInstallmentRate: requireRate(thirteenth.firstInstallmentRate ?? 0.5, 'thirteenth.firstInstallmentRate'),
      averagesWindowMonths: requirePositiveInteger(thirteenth.averagesWindowMonths ?? 12, 'thirteenth.averagesWindowMonths'),
      deductFirstInstallment: thirteenth.deductFirstInstallment ?? true,
    }),
    rubricOverrides: Object.freeze({ ...(definition.rubricOverrides || {}) }),
  });
}

export function ruleCoversCompetence(rule, competence) {
  const target = makeCompetence(competence?.year, competence?.month);
  if (compareCompetence(target, rule.effectiveFrom) < 0) return false;
  if (rule.effectiveTo && compareCompetence(target, rule.effectiveTo) > 0) return false;
  return true;
}

/**
 * Picks the rule in force for a profile at a competence. Fail-closed on both sides:
 * no rule is an error, and two overlapping rules are an error rather than a silent
 * "most recent wins" that would make payroll depend on insertion order.
 */
export function selectCompensationRule(rules = [], { profile, competence } = {}) {
  const wanted = String(profile || '').trim();
  if (!wanted) throw new TypeError('[financial2/rule] seleção exige `profile`.');
  const target = makeCompetence(competence?.year, competence?.month);
  const matches = (rules || []).filter((rule) => rule.profile === wanted && ruleCoversCompetence(rule, target));
  if (!matches.length) {
    throw new RangeError(`[financial2/rule] nenhuma regra vigente para perfil "${wanted}" na competência ${competenceKey(target)}.`);
  }
  if (matches.length > 1) {
    throw new RangeError(`[financial2/rule] vigências sobrepostas para perfil "${wanted}" em ${competenceKey(target)}: ${matches.map((rule) => rule.id).join(', ')}`);
  }
  return matches[0];
}

/** Effective-dating provenance carried into every explanation. */
export function ruleProvenance(rule) {
  return Object.freeze({
    ruleId: rule.id,
    profile: rule.profile,
    label: rule.label,
    effectiveFrom: competenceKey(rule.effectiveFrom),
    effectiveTo: rule.effectiveTo ? competenceKey(rule.effectiveTo) : null,
  });
}
