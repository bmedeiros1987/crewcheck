import { alertDigest, type AlertIdentity } from './alertReviewStore';
import { manualGateIdentity, manualGateRevision, type ManualGateEntry, type ManualGateReviewInfo, type NextFlightLike } from './nextFlightGate';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
type Candidate = NonNullable<ManualGateReviewInfo['candidate']>;
type Seen = { revision: string; fingerprint: string; at: number };
const prefix = 'crewcheck:gate-notice:v1:';

export function manualGateNoticeIdentity(event: NextFlightLike, manual: ManualGateEntry, candidate: Candidate, account: string): AlertIdentity {
  return { occurrence: alertDigest(['manual-gate', manualGateIdentity(event)]), version: alertDigest([manualGateRevision(manual, account), candidate.fingerprint]) };
}

export function manualGateNoticeScope(event: NextFlightLike, account: string): string {
  return 'gate-manual-review:' + alertDigest([account, manualGateIdentity(event)]);
}

/** A presentation receipt, NOT a disposition: an unhandled Pulse can still be
 * reconstructed, but identical source evidence must not ring again on refresh. */
export function claimManualGateNotice(storage: StorageLike, account: string, event: NextFlightLike, manual: ManualGateEntry, candidate: Candidate, now = Date.now()): boolean {
  if (!account || account === 'local' || !Number.isFinite(now)) return false;
  try {
    const raw = JSON.parse(storage.getItem(prefix + account) || '{}');
    const rows: Record<string, Seen> = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    for (const [key, row] of Object.entries(rows)) if (typeof row?.at !== 'number' || !Number.isFinite(row.at) || row.at > now || now - row.at > 6 * 60 * 60 * 1000) delete rows[key];
    const identity = manualGateIdentity(event), revision = manualGateRevision(manual, account), previous = rows[identity];
    if (previous?.revision === revision && previous.fingerprint === candidate.fingerprint) return false;
    rows[identity] = { revision, fingerprint: candidate.fingerprint, at: now };
    storage.setItem(prefix + account, JSON.stringify(rows));
    return true;
  } catch { return false; }
}
