package com.crewcheck.watch;

import android.content.Context;

/**
 * Feature-level entitlement boundary for CrewWatch.
 *
 * The canonical roster is always available. Premium unlocks only advanced/costly surfaces.
 * Keep this contract renderer-agnostic so watchOS/Garmin adapters can mirror the same policy.
 */
final class WatchEntitlements {
    private WatchEntitlements() {}

    static boolean basicRoster(Context context) {
        return true;
    }

    static boolean premium(Context context) {
        WatchContextSnapshot snapshot = new SecureSnapshotStore(context).load();
        return premiumFromSnapshot(snapshot, System.currentTimeMillis());
    }

    /**
     * Premium is fail-closed when entitlement freshness can no longer be proven.
     *
     * The operational roster remains available through {@link #basicRoster(Context)} even when
     * stale/offline, but costly/advanced capabilities must not remain unlocked indefinitely from
     * an expired cached snapshot after a downgrade or a long period without sync.
     */
    static boolean premiumFromSnapshot(WatchContextSnapshot snapshot, long nowEpochMs) {
        return snapshot != null
                && snapshot.premiumAccess
                && !snapshot.isStale(nowEpochMs);
    }

    static boolean crewLife(Context context) {
        return premium(context);
    }

    static boolean concierge(Context context) {
        return premium(context);
    }

    static boolean smartDeparture(Context context) {
        return premium(context);
    }

    static boolean liveOps(Context context) {
        return premium(context);
    }
}
