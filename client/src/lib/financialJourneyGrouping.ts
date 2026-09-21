export type FinancialJourneyEventLike = {
  id: string;
  canonical?: { journeyId?: string | null } | null;
};

export type FinancialCompetenceLike = {
  year?: number | string | null;
  month?: number | string | null;
};

export type FinancialRowLike = {
  iso?: string | null;
  convertedBRL?: number | null;
};

export function financialJourneyGroupKey(event: FinancialJourneyEventLike): string {
  const journeyId = String(event?.canonical?.journeyId || '').trim();
  if (journeyId) return `journey:${journeyId}`;
  const eventId = String(event?.id || '').trim();
  if (eventId) return `event:${eventId}`;
  // Fail closed: callers should supply a stable event id. Never synthesize a
  // same-day/dateKey grouping when canonical journey identity is absent.
  return 'event:missing-id';
}

export function nominalFinancialCompetencePrefix(roster: FinancialCompetenceLike): string | null {
  const year = Number(roster?.year);
  const month = Number(roster?.month);
  if (!Number.isInteger(year) || year < 2000 || year > 2200) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function rowsForNominalFinancialCompetence<T extends FinancialRowLike>(
  rows: readonly T[],
  roster: FinancialCompetenceLike,
): T[] {
  const prefix = nominalFinancialCompetencePrefix(roster);
  if (!prefix) return [];
  return rows.filter((row) => String(row?.iso || '').startsWith(`${prefix}-`));
}

export function convertedTotalForNominalFinancialCompetence(
  rows: readonly FinancialRowLike[],
  roster: FinancialCompetenceLike,
): number {
  return rowsForNominalFinancialCompetence(rows, roster)
    .reduce((sum, row) => sum + (Number(row.convertedBRL) || 0), 0);
}
