export type FinancialCompetenceLike = {
  year?: number | string | null;
  month?: number | string | null;
};

export type FinancialRowLike = {
  iso?: string | null;
};

/**
 * Financial month ownership follows the roster's nominal competence, not every
 * carry-in/carry-out civil date bundled in the publication for continuity.
 */
export function financialCompetenceKey(competence: FinancialCompetenceLike): string | null {
  const year = Number(competence?.year);
  const month = Number(competence?.month);
  if (!Number.isInteger(year) || year < 1900 || year > 3000) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function filterFinancialRowsToCompetence<T extends FinancialRowLike>(
  rows: readonly T[] | null | undefined,
  competence: FinancialCompetenceLike,
): T[] {
  const key = financialCompetenceKey(competence);
  if (!key) return [];
  return (rows || []).filter((row) => String(row?.iso || '').slice(0, 7) === key);
}
