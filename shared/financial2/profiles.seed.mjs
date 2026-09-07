// Financeiro 2.0 — seed configuration (DATA, not engine logic).
//
// Nothing in the calculators imports this file. It is a starting catalogue that an
// operator or a future admin surface can replace wholesale: profiles, rubrics and their
// effective dating are inputs to the engine, which is why a policy such as "this profile
// does not offer vacation sale" lives here as a field rather than inside a formula.
//
// The rubric codes below are generic contract vocabulary; no employer-specific behaviour
// is encoded in the engine itself.

import { buildRubricCatalog } from './rubricTaxonomy.mjs';
import { VACATION_SALE, defineCompensationRule } from './compensationRules.mjs';

export const SEED_RUBRIC_DEFINITIONS = Object.freeze([
  { code: 'SALARIO_BASE', name: 'Salário base', nature: 'fixed_remuneration' },
  { code: 'HORA_VOO', name: 'Hora de voo', nature: 'variable_remuneration' },
  { code: 'ADICIONAL_NOTURNO', name: 'Adicional noturno', nature: 'additional' },
  { code: 'PERICULOSIDADE', name: 'Periculosidade', nature: 'additional' },
  { code: 'DIARIA_ALIMENTACAO', name: 'Diária de alimentação', nature: 'per_diem' },
  { code: 'INDENIZACAO_FOLGA', name: 'Indenização de folga suprimida', nature: 'indemnity' },
  { code: 'INSS', name: 'INSS', nature: 'deduction' },
  { code: 'IRRF', name: 'IRRF', nature: 'deduction' },
]);

export function seedRubricCatalog() {
  return buildRubricCatalog(SEED_RUBRIC_DEFINITIONS);
}

/**
 * Current profile in use by CrewCheck. Vacation sale is not offered — expressed as the
 * rule's `sale` field, bounded by `effectiveFrom`, so a later rule can offer it without
 * touching a line of engine code.
 */
export const SEED_COMPENSATION_RULES = Object.freeze([
  defineCompensationRule({
    id: 'latam-tripulante-v1',
    profile: 'latam-tripulante',
    label: 'Tripulante LATAM — política vigente',
    effectiveFrom: { year: 2024, month: 1 },
    effectiveTo: null,
    vacation: {
      sale: VACATION_SALE.NOT_OFFERED,
      entitlementDays: 30,
      maxFractions: 2,
      minFractionDays: 15,
      constitutionalThirdRate: 1 / 3,
      averagesWindowMonths: 12,
    },
    thirteenth: {
      avosDenominator: 12,
      minDaysForAvo: 15,
      firstInstallmentRate: 0.5,
      averagesWindowMonths: 12,
      deductFirstInstallment: false,
    },
  }),
]);
