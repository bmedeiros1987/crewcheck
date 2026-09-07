// Financeiro 2.0 — nominal competence (year/month).
//
// A competence is the payroll month a value belongs to. It is nominal, exactly like the
// roster's published competence: it is not derived from the factual dates inside the
// period. A vacation period spanning two calendar months still belongs to the competence
// the contract assigns it to, and the caller states that competence explicitly.

export function makeCompetence(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || y < 1900 || y > 2999) throw new RangeError(`[financial2/competence] ano inválido: ${String(year)}`);
  if (!Number.isInteger(m) || m < 1 || m > 12) throw new RangeError(`[financial2/competence] mês inválido: ${String(month)}`);
  return Object.freeze({ year: y, month: m });
}

export function competenceKey(competence) {
  const { year, month } = makeCompetence(competence?.year, competence?.month);
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Monotonic ordinal, so comparisons work across the year boundary without date math. */
export function competenceOrdinal(competence) {
  const { year, month } = makeCompetence(competence?.year, competence?.month);
  return year * 12 + (month - 1);
}

export function compareCompetence(left, right) {
  return competenceOrdinal(left) - competenceOrdinal(right);
}

export function competenceFromKey(key) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(key || '').trim());
  if (!match) throw new RangeError(`[financial2/competence] chave inválida: ${String(key)}`);
  return makeCompetence(Number(match[1]), Number(match[2]));
}

export function shiftCompetence(competence, months) {
  const ordinal = competenceOrdinal(competence) + Number(months || 0);
  return makeCompetence(Math.floor(ordinal / 12), (ordinal % 12) + 1);
}

/** Inclusive window of the `count` competences ending at `competence`. */
export function competenceWindow(competence, count) {
  const size = Number(count);
  if (!Number.isInteger(size) || size < 1) throw new RangeError(`[financial2/competence] janela inválida: ${String(count)}`);
  return Array.from({ length: size }, (_, index) => shiftCompetence(competence, index - (size - 1)));
}
