import { financialRosterCrewIdentity, listSavedRosters, openSavedRoster } from './databaseClient';
import { latestFinancialPeriods } from './financialHistoryPeriods';
import type { CrewRoster } from './pdfParser';

const periodOf = (roster: {year: number | null; month: number | null}) =>
  `${roster.year}-${String(roster.month).padStart(2, '0')}`;

export async function readAllowanceCycleRosters(
  active: CrewRoster,
  periods: readonly string[],
  isCurrent: () => boolean,
): Promise<CrewRoster[] | null> {
  const crew = financialRosterCrewIdentity(active);
  if (!crew || !isCurrent()) return null;

  const inventory = await listSavedRosters(72, false, { preserveRevisions: true });
  if (!isCurrent()) return null;
  const {items, conflicts} = latestFinancialPeriods(inventory, crew, financialRosterCrewIdentity);
  const byPeriod = new Map(items.map(item => [periodOf(item), item]));
  const resolved = await Promise.allSettled(periods.map(async period => {
    if (conflicts.includes(period) || !isCurrent()) return null;
    const saved = byPeriod.get(period);
    if (!saved) return periodOf(active) === period ? active : null;
    const {roster} = await openSavedRoster(saved.id, saved);
    return roster;
  }));
  if (!isCurrent()) return null;
  return resolved.flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : []);
}
