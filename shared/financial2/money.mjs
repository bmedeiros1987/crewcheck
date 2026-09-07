// Financeiro 2.0 — monetary primitives.
//
// Every amount in this engine is an integer number of cents. Payroll arithmetic done
// in floating point drifts by fractions of a cent and the drift compounds across
// averages, thirds and installments until a statement no longer reconciles. Cents in,
// cents out, and a single documented rounding rule at the multiplication boundary.

export const CENTS_PER_UNIT = 100;

function assertFiniteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`[financial2/money] ${label} deve ser numérico finito; recebido: ${String(value)}`);
  return number;
}

/** Converts a currency amount (units, e.g. 1234.56) into integer cents. */
export function toCents(value, label = 'valor') {
  const number = assertFiniteNumber(value, label);
  return Math.round(number * CENTS_PER_UNIT);
}

/** Converts integer cents back into a unit amount, for display only. */
export function fromCents(cents, label = 'centavos') {
  return assertFiniteNumber(cents, label) / CENTS_PER_UNIT;
}

export function assertCents(value, label = 'centavos') {
  const number = assertFiniteNumber(value, label);
  if (!Number.isInteger(number)) throw new TypeError(`[financial2/money] ${label} deve estar em centavos inteiros; recebido: ${String(value)}`);
  return number;
}

export function sumCents(values = [], label = 'parcela') {
  return (values || []).reduce((total, value) => total + assertCents(value, label), 0);
}

// Half-up on the absolute value, so -0.5 and +0.5 round away from zero symmetrically.
// Banker's rounding is deliberately not used: Brazilian payroll statements round half up.
function roundHalfUp(value) {
  return value < 0 ? -Math.round(Math.abs(value)) : Math.round(value);
}

/** Multiplies cents by a dimensionless rate, returning cents. */
export function applyRate(cents, rate, label = 'taxa') {
  const base = assertCents(cents, 'base');
  const factor = assertFiniteNumber(rate, label);
  return roundHalfUp(base * factor);
}

/** Applies `numerator / denominator` to cents (e.g. 15/30 days, 7/12 avos). */
export function applyFraction(cents, numerator, denominator, label = 'fração') {
  const base = assertCents(cents, 'base');
  const num = assertFiniteNumber(numerator, `${label}.numerador`);
  const den = assertFiniteNumber(denominator, `${label}.denominador`);
  if (den === 0) throw new RangeError(`[financial2/money] ${label} não pode ter denominador zero.`);
  return roundHalfUp((base * num) / den);
}

/** Arithmetic mean of a cents list, rounded half up. Empty list is zero, not NaN. */
export function averageCents(values = [], label = 'média') {
  const list = (values || []).map((value) => assertCents(value, label));
  if (!list.length) return 0;
  return roundHalfUp(list.reduce((total, value) => total + value, 0) / list.length);
}

/** Formats cents as pt-BR currency. Presentation helper; never an input to arithmetic. */
export function formatCents(cents, { currency = 'BRL', locale = 'pt-BR' } = {}) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(fromCents(cents));
}
