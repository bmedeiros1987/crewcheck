import { listPlatformStays, updatePlatformStay } from './platformClient';
import {
  coalescePendingConciergeStays,
  markPendingConciergeStayAttempt,
  overlayPendingConciergeStays,
  removePendingConciergeStay,
  sanitizeConciergeStayPatch,
  type ConciergePendingStay,
  type ConciergeStayPatch,
} from './conciergeStayQueue';

const PENDING_STAYS_KEY = 'crewcheck_concierge_stays_pending_v1';

function readPending(): ConciergePendingStay[] {
  try {
    const value = JSON.parse(localStorage.getItem(PENDING_STAYS_KEY) || '[]');
    return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object' && item.patch) : [];
  } catch {
    return [];
  }
}

function writePending(queue: ConciergePendingStay[]): void {
  try {
    if (queue.length) localStorage.setItem(PENDING_STAYS_KEY, JSON.stringify(queue));
    else localStorage.removeItem(PENDING_STAYS_KEY);
  } catch {}
}

function queuePending(patch: ConciergeStayPatch): ConciergePendingStay[] {
  const next = coalescePendingConciergeStays(readPending(), patch);
  writePending(next);
  return next;
}

export function getConciergePendingStayCount(): number {
  return readPending().length;
}

export async function flushConciergeStayQueue(): Promise<{ syncedCount: number; pendingCount: number; offline: boolean }> {
  const snapshot = readPending();
  let syncedCount = 0;

  for (const pending of snapshot) {
    const patch = sanitizeConciergeStayPatch(pending.patch);
    const payload = await updatePlatformStay(patch);
    if (payload?.localOnly) {
      const marked = markPendingConciergeStayAttempt(readPending(), pending.key);
      writePending(marked);
      return { syncedCount, pendingCount: marked.length, offline: true };
    }

    const remaining = removePendingConciergeStay(readPending(), patch);
    writePending(remaining);
    syncedCount += 1;
  }

  return { syncedCount, pendingCount: readPending().length, offline: false };
}

export async function listConciergeStays() {
  const flush = await flushConciergeStayQueue();
  const payload = await listPlatformStays();
  const pending = readPending();
  const stays = overlayPendingConciergeStays(payload?.stays || [], pending);
  return {
    ...payload,
    stays,
    pendingSyncCount: pending.length,
    syncedPendingCount: flush.syncedCount,
    localOnly: Boolean(payload?.localOnly || pending.length),
  };
}

export async function saveConciergeStay(patch: ConciergeStayPatch) {
  const cleanPatch = sanitizeConciergeStayPatch(patch);
  const payload = await updatePlatformStay(cleanPatch);

  if (payload?.localOnly) {
    const pending = queuePending(cleanPatch);
    return {
      ...payload,
      stays: overlayPendingConciergeStays(payload?.stays || [], pending),
      queued: true,
      pendingSyncCount: pending.length,
    };
  }

  const pending = removePendingConciergeStay(readPending(), cleanPatch);
  writePending(pending);
  return {
    ...payload,
    stays: overlayPendingConciergeStays(payload?.stays || [], pending),
    queued: false,
    pendingSyncCount: pending.length,
  };
}
