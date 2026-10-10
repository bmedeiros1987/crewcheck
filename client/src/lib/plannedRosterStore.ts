import type { CrewRoster } from './pdfParser';
import { rosterFingerprint } from './rosterComparison';
import { financialRateOwner, financialRateSession } from './financialStatementLearning';

export type OwnedPlannedRoster = {
  version: 2;
  owner: string;
  period: { year: number; month: number };
  roster: CrewRoster;
  source: string;
  capturedAt: string;
  fingerprint: string;
};

export const plannedRosterKey = (owner: string) => 'crewcheck_planned_roster_snapshot_v2:' + encodeURIComponent(owner);

export function isCurrentPlannedRoster(value: unknown): value is OwnedPlannedRoster {
  try {
  const owner = financialRateOwner();
  if (!owner || !value || typeof value !== 'object') return false;
  const item = value as OwnedPlannedRoster;
  const year = item.period?.year, month = item.period?.month;
  return item.version === 2 && item.owner === owner
    && Number.isInteger(year) && year >= 2000 && year <= 2200
    && Number.isInteger(month) && month >= 1 && month <= 12
    && item.roster?.year === year && item.roster?.month === month
    && Array.isArray(item.roster?.days) && item.roster.days.length > 0
    && typeof item.source === 'string' && Boolean(item.source.trim())
    && typeof item.capturedAt === 'string' && Number.isFinite(Date.parse(item.capturedAt))
    && typeof item.fingerprint === 'string' && item.fingerprint === rosterFingerprint(item.roster);
  } catch { return false; }
}

export function loadOwnedPlannedRoster(): OwnedPlannedRoster | null {
  try {
    const owner = financialRateOwner();
    if (!owner) return null;
    // The unowned v1 key is deliberately never read or migrated.
    const item: unknown = JSON.parse(localStorage.getItem(plannedRosterKey(owner)) || 'null');
    return isCurrentPlannedRoster(item) ? item : null;
  } catch { return null; }
}

export function saveOwnedPlannedRoster(roster: CrewRoster, source: string, expectedSession = financialRateSession()): OwnedPlannedRoster | null {
  try {
    const owner = financialRateOwner();
    if (!owner || !expectedSession || expectedSession !== financialRateSession()) return null;
    const snapshot: OwnedPlannedRoster = {
      version: 2, owner, period: { year: roster.year, month: roster.month },
      roster: JSON.parse(JSON.stringify(roster)), source: source || 'Escala planejada',
      capturedAt: new Date().toISOString(), fingerprint: rosterFingerprint(roster),
    };
    if (!isCurrentPlannedRoster(snapshot) || expectedSession !== financialRateSession()) return null;
    localStorage.setItem(plannedRosterKey(owner), JSON.stringify(snapshot));
    window.dispatchEvent(new CustomEvent('crewcheck:planned-roster-updated'));
    return snapshot;
  } catch { return null; }
}

export function clearOwnedPlannedRoster(expectedSession = financialRateSession()): boolean {
  try {
    const owner = financialRateOwner();
    if (!owner || !expectedSession || expectedSession !== financialRateSession()) return false;
    localStorage.removeItem(plannedRosterKey(owner));
    window.dispatchEvent(new CustomEvent('crewcheck:planned-roster-updated'));
    return true;
  } catch { return false; }
}

// Capture before any asynchronous import work. An older import or auth lifecycle
// cannot retain permission to publish under the next account or token.
let importRevision = 0;
let importWindow: Window | null = null;
export function beginOwnedPlannedImport(): { session: string; canCommit(): boolean } {
  if (typeof window !== 'undefined' && importWindow !== window) {
    importWindow = window;
    const invalidate = () => { importRevision += 1; };
    window.addEventListener('crewcheck:auth-changed', invalidate);
    window.addEventListener('crewcheck:auth-expired', invalidate);
    window.addEventListener('storage', (event) => {
      if (!(event as StorageEvent).key || ['crewcheck_auth_token', 'crewcheck_auth_user'].includes((event as StorageEvent).key || '')) invalidate();
    });
  }
  const revision = ++importRevision;
  const session = financialRateSession() || '';
  return { session, canCommit: () => Boolean(session) && revision === importRevision && session === financialRateSession() };
}
