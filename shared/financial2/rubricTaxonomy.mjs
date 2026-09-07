// Financeiro 2.0 — rubric taxonomy and declarative eligibility.
//
// Two orthogonal axes, deliberately kept apart:
//
//   NATURE      what the money *is*      (fixed, variable, additional, indemnity, per diem, deduction)
//   INTEGRATION what the money *feeds*   (vacation base, thirteenth base, neither)
//
// Collapsing them into one enum is what forces callers to guess, and guessing is done
// by reading the rubric's label. Eligibility here is resolved from declared data only:
// an explicit per-rubric flag when present, otherwise the nature's declared default.
// The rubric's human name is carried for display and never consulted by any decision.

export const RUBRIC_NATURE = Object.freeze({
  FIXED_REMUNERATION: 'fixed_remuneration',
  VARIABLE_REMUNERATION: 'variable_remuneration',
  ADDITIONAL: 'additional',
  INDEMNITY: 'indemnity',
  PER_DIEM: 'per_diem',
  DEDUCTION: 'deduction',
});

export const RUBRIC_INTEGRATION = Object.freeze({
  VACATION: 'integrates_vacation',
  THIRTEENTH: 'integrates_thirteenth',
  NONE: 'non_integrating',
});

export const RUBRIC_NATURES = Object.freeze(Object.values(RUBRIC_NATURE));

// Declared defaults per nature. A profile rule may override any single rubric, but it
// overrides data — never a string match.
const NATURE_DEFAULTS = Object.freeze({
  [RUBRIC_NATURE.FIXED_REMUNERATION]: { integratesVacation: true, integratesThirteenth: true, isDeduction: false, entersAverages: false },
  [RUBRIC_NATURE.VARIABLE_REMUNERATION]: { integratesVacation: true, integratesThirteenth: true, isDeduction: false, entersAverages: true },
  [RUBRIC_NATURE.ADDITIONAL]: { integratesVacation: true, integratesThirteenth: true, isDeduction: false, entersAverages: true },
  // Indemnity repairs a loss; it is not pay for work and feeds no vacation/13th base.
  [RUBRIC_NATURE.INDEMNITY]: { integratesVacation: false, integratesThirteenth: false, isDeduction: false, entersAverages: false },
  // Per diem reimburses expense. Some contracts make part of it salary-like; that is a
  // per-rubric override in the contractual rule, never a default here.
  [RUBRIC_NATURE.PER_DIEM]: { integratesVacation: false, integratesThirteenth: false, isDeduction: false, entersAverages: false },
  [RUBRIC_NATURE.DEDUCTION]: { integratesVacation: false, integratesThirteenth: false, isDeduction: true, entersAverages: false },
});

export function isKnownRubricNature(nature) {
  return RUBRIC_NATURES.includes(String(nature || ''));
}

export function rubricNatureDefaults(nature) {
  if (!isKnownRubricNature(nature)) throw new RangeError(`[financial2/rubric] natureza desconhecida: ${String(nature)}`);
  return { ...NATURE_DEFAULTS[nature] };
}

/**
 * Normalizes a rubric definition. `code` is the identity; `name` is display only.
 * Explicit booleans win over the nature default; absent flags fall back to the default.
 */
export function defineRubric(definition = {}) {
  const code = String(definition.code || '').trim();
  if (!code) throw new TypeError('[financial2/rubric] rubrica exige `code` estável.');
  const nature = String(definition.nature || '').trim();
  const defaults = rubricNatureDefaults(nature);
  return Object.freeze({
    code,
    name: String(definition.name || code),
    nature,
    integratesVacation: definition.integratesVacation ?? defaults.integratesVacation,
    integratesThirteenth: definition.integratesThirteenth ?? defaults.integratesThirteenth,
    entersAverages: definition.entersAverages ?? defaults.entersAverages,
    isDeduction: definition.isDeduction ?? defaults.isDeduction,
  });
}

export function buildRubricCatalog(definitions = []) {
  const catalog = new Map();
  for (const definition of definitions || []) {
    const rubric = defineRubric(definition);
    if (catalog.has(rubric.code)) throw new RangeError(`[financial2/rubric] rubrica duplicada no catálogo: ${rubric.code}`);
    catalog.set(rubric.code, rubric);
  }
  return catalog;
}

/**
 * Resolves the effective rubric for a competence, applying the contractual rule's
 * per-code overrides on top of the catalog entry. Fail-closed: an unknown code is an
 * error, never a silently-integrating amount.
 */
export function resolveRubric(catalog, code, overrides = {}) {
  const key = String(code || '').trim();
  const base = catalog instanceof Map ? catalog.get(key) : null;
  if (!base) throw new RangeError(`[financial2/rubric] rubrica não catalogada: ${key || '(vazio)'}`);
  const override = overrides?.[key];
  if (!override) return base;
  return Object.freeze({
    ...base,
    integratesVacation: override.integratesVacation ?? base.integratesVacation,
    integratesThirteenth: override.integratesThirteenth ?? base.integratesThirteenth,
    entersAverages: override.entersAverages ?? base.entersAverages,
    isDeduction: override.isDeduction ?? base.isDeduction,
    overriddenBy: override.ruleId || 'rule',
  });
}

export function integratesFor(rubric, target) {
  if (target === RUBRIC_INTEGRATION.VACATION) return Boolean(rubric?.integratesVacation);
  if (target === RUBRIC_INTEGRATION.THIRTEENTH) return Boolean(rubric?.integratesThirteenth);
  throw new RangeError(`[financial2/rubric] alvo de integração desconhecido: ${String(target)}`);
}
