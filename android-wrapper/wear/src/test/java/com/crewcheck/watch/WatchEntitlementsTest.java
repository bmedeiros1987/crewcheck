package com.crewcheck.watch;

import org.json.JSONObject;
import org.junit.Test;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public final class WatchEntitlementsTest {
    private static final long NOW = 1_800_000_000_000L;

    @Test
    public void freshPremiumSnapshotUnlocksAdvancedCapabilities() throws Exception {
        WatchContextSnapshot snapshot = WatchContextSnapshot.fromJson(new JSONObject()
                .put("schemaVersion", 1)
                .put("generatedAtEpochMs", NOW - 60_000L)
                .put("validUntilEpochMs", NOW + 60_000L)
                .put("premiumAccess", true));

        assertTrue(WatchEntitlements.premiumFromSnapshot(snapshot, NOW));
    }

    @Test
    public void expiredPremiumSnapshotFailsClosedWithoutAffectingBasicRosterPolicy() throws Exception {
        WatchContextSnapshot snapshot = WatchContextSnapshot.fromJson(new JSONObject()
                .put("schemaVersion", 1)
                .put("generatedAtEpochMs", NOW - 120_000L)
                .put("validUntilEpochMs", NOW - 1L)
                .put("premiumAccess", true));

        assertFalse(WatchEntitlements.premiumFromSnapshot(snapshot, NOW));
    }

    @Test
    public void freeOrMissingSnapshotNeverUnlocksPremium() throws Exception {
        WatchContextSnapshot free = WatchContextSnapshot.fromJson(new JSONObject()
                .put("schemaVersion", 1)
                .put("generatedAtEpochMs", NOW - 60_000L)
                .put("validUntilEpochMs", NOW + 60_000L)
                .put("premiumAccess", false));

        assertFalse(WatchEntitlements.premiumFromSnapshot(free, NOW));
        assertFalse(WatchEntitlements.premiumFromSnapshot(null, NOW));
    }
}
