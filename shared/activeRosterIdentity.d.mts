export interface ActiveRosterIdentitySummary {
  id?: string | null;
  checksum?: string | null;
  year?: number | string | null;
  month?: number | string | null;
  createdAt?: string | null;
  created_at?: string | null;
  activeAt?: string | null;
  active_at?: string | null;
  sourceFileName?: string | null;
  source_file_name?: string | null;
}

export interface ActiveRosterIdentityComparison {
  status: 'missing-both' | 'remote-only' | 'local-only' | 'match' | 'conflict' | 'ambiguous';
  reason?: string;
  same: boolean;
  left: Record<string, unknown>;
  right: Record<string, unknown>;
}

export interface ActiveRosterIdentityDecision {
  decision: 'use-canonical' | 'use-remote' | 'use-local' | 'missing' | 'confirm';
  source: string;
  comparison: ActiveRosterIdentityComparison;
}

export function normalizeActiveRosterIdentity(summary?: ActiveRosterIdentitySummary | null): Record<string, unknown>;
export function compareActiveRosterIdentity(left?: ActiveRosterIdentitySummary | null, right?: ActiveRosterIdentitySummary | null): ActiveRosterIdentityComparison;
export function reconcileActiveRosterIdentity(input?: { remote?: ActiveRosterIdentitySummary | null; local?: ActiveRosterIdentitySummary | null }): ActiveRosterIdentityDecision;
