import { useEffect, useState } from 'react';
import { manualGateNoticeIdentity, manualGateNoticeScope } from '@/lib/manualGateNotices';
import { reconcileCrewCheckPulse } from '@/components/pulse/pulseRuntime';
import { getStoredUser } from '@/lib/authClient';
import {
  MANUAL_GATE_EVENT,
  manualGateAccountKey,
  readCachedRadarForFlight,
  readManualGate,
  resolveNextFlightGate,
  type NextFlightGateInfo,
  type NextFlightLike,
} from '@/lib/nextFlightGate';

function safeStorage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

export function currentManualGateAccount(): string {
  try { return manualGateAccountKey(getStoredUser()); } catch { return 'local'; }
}

export function computeNextFlightGate(event: NextFlightLike | null, now = Date.now()): NextFlightGateInfo | null {
  if (!event) return null;
  const storage = safeStorage();
  return resolveNextFlightGate({
    event,
    radar: storage ? readCachedRadarForFlight(storage, event, now) : null,
    manual: storage ? readManualGate(storage, currentManualGateAccount(), event) : null,
    now,
  });
}

/** Recalcula com o cache Radar, o portão manual e a conta atual. Nunca consulta a rede. */
export function useNextFlightGate(event: NextFlightLike | null): NextFlightGateInfo | null {
  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((value) => value + 1);
    const events = ['crewcheck:radar-updated', MANUAL_GATE_EVENT, 'storage', 'crewcheck:auth-changed', 'crewcheck:personalization'];
    events.forEach((name) => window.addEventListener(name, bump));
    const timer = window.setInterval(bump, 30_000);
    return () => {
      events.forEach((name) => window.removeEventListener(name, bump));
      window.clearInterval(timer);
    };
  }, []);
  const info = computeNextFlightGate(event), owner = currentManualGateAccount();
  const active = event && info?.manual && info.manualReview.state === 'newer' && info.manualReview.candidate
    ? manualGateNoticeIdentity(event, info.manual, info.manualReview.candidate, owner) : null;
  useEffect(() => {
    if (!event || owner !== currentManualGateAccount()) return;
    // Effects may run after a newer cache render; reconcile from current storage.
    const current = computeNextFlightGate(event);
    const identity = current?.manual && current.manualReview.state === 'newer' && current.manualReview.candidate
      ? manualGateNoticeIdentity(event, current.manual, current.manualReview.candidate, owner) : null;
    reconcileCrewCheckPulse(manualGateNoticeScope(event, owner), identity ? [identity] : []);
  }, [event?.id, owner, active?.occurrence, active?.version]);
  return info;
}

export type WatchSyncState = { ok: boolean; at: number; message: string } | null;

/** Último resultado da ponte nativa do relógio (Android), quando existir. */
export function useWatchSyncState(): WatchSyncState {
  const read = (): WatchSyncState => {
    try {
      const native = (window as any).CrewCheckNative;
      if (!native?.watchSyncAvailable || !native.watchSyncAvailable()) return null;
      const last = (window as any).__crewcheckLastWatchSync;
      if (!last || !Number(last.at)) return { ok: false, at: 0, message: 'Aguardando a primeira sincronização com o relógio.' };
      return { ok: Boolean(last.ok), at: Number(last.at), message: String(last.message || '') };
    } catch {
      return null;
    }
  };
  const [state, setState] = useState<WatchSyncState>(read);
  useEffect(() => {
    const refresh = () => setState(read());
    window.addEventListener('crewcheck:watch-sync-result', refresh);
    return () => window.removeEventListener('crewcheck:watch-sync-result', refresh);
  }, []);
  return state;
}
