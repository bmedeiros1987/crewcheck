export type RegulatoryHistoryAuthority =
  | 'account_verified'
  | 'local_no_session'
  | 'local_after_account_failure';

export interface RegulatoryRosterSummaryLike {
  id: string;
  createdAt?: string | null;
  crewId?: string | null;
  crewName?: string | null;
  year?: number | null;
  month?: number | null;
}

export interface RegulatoryHistoryEvidence<T extends RegulatoryRosterSummaryLike = RegulatoryRosterSummaryLike> {
  summaries: T[];
  authority: RegulatoryHistoryAuthority;
  authenticated: boolean;
  accountQuerySucceeded: boolean;
}

export interface RegulatoryCarryInSelection<T extends RegulatoryRosterSummaryLike = RegulatoryRosterSummaryLike> {
  summary: T | null;
  expectedYear: number;
  expectedMonth: number;
  crewIdentity: string | null;
  historyProven: boolean;
  reason:
    | 'ok'
    | 'active_identity_unverified'
    | 'account_not_verified'
    | 'previous_competence_absent';
}

function normalizeCrewToken(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

/**
 * Regulatory history must never join publications by competence or display
 * name alone. Only a stable crew/account identifier can prove identity for
 * carry-in. Published crew names remain display metadata and are deliberately
 * non-authoritative because names can collide or change over time.
 */
export function regulatoryCrewIdentity(summary: Pick<RegulatoryRosterSummaryLike, 'crewId' | 'crewName'>): string | null {
  const crewId = normalizeCrewToken(summary?.crewId);
  return crewId ? `ID:${crewId}` : null;
}

export function previousCompetence(year: number, month: number): { year: number; month: number } | null {
  if (!Number.isInteger(year) || year < 1900 || year > 3000) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

function newestFirst<T extends RegulatoryRosterSummaryLike>(a: T, b: T): number {
  const created = String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  if (created) return created;
  return String(b.id || '').localeCompare(String(a.id || ''));
}

/**
 * Select the exact preceding nominal competence for the same verified crew.
 * Local data can provide useful observations, but it is not enough to claim
 * complete account history when the account query failed or there is no
 * authenticated account context. That distinction is deliberate: #623 must
 * never turn network/session loss into a false `complete: true`.
 */
export function selectRegulatoryCarryIn<T extends RegulatoryRosterSummaryLike>(
  evidence: RegulatoryHistoryEvidence<T>,
  active: Pick<RegulatoryRosterSummaryLike, 'crewId' | 'crewName' | 'year' | 'month'>,
): RegulatoryCarryInSelection<T> {
  const expected = previousCompetence(Number(active.year), Number(active.month));
  const crewIdentity = regulatoryCrewIdentity(active);
  if (!expected || !crewIdentity) {
    return {
      summary: null,
      expectedYear: expected?.year ?? Number(active.year || 0),
      expectedMonth: expected?.month ?? Number(active.month || 0),
      crewIdentity,
      historyProven: false,
      reason: 'active_identity_unverified',
    };
  }

  const candidates = evidence.summaries
    .filter((item) => Number(item.year) === expected.year && Number(item.month) === expected.month)
    .filter((item) => regulatoryCrewIdentity(item) === crewIdentity)
    .sort(newestFirst);
  const summary = candidates[0] || null;

  if (!evidence.authenticated || !evidence.accountQuerySucceeded || evidence.authority !== 'account_verified') {
    return {
      summary,
      expectedYear: expected.year,
      expectedMonth: expected.month,
      crewIdentity,
      historyProven: false,
      reason: 'account_not_verified',
    };
  }

  if (!summary) {
    return {
      summary: null,
      expectedYear: expected.year,
      expectedMonth: expected.month,
      crewIdentity,
      historyProven: false,
      reason: 'previous_competence_absent',
    };
  }

  return {
    summary,
    expectedYear: expected.year,
    expectedMonth: expected.month,
    crewIdentity,
    historyProven: true,
    reason: 'ok',
  };
}
